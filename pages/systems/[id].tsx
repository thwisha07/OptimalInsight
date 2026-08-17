import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useEffect, useState, useRef } from 'react'
import { saveSessionToIDB, loadSessionsFromIDB, deleteSessionFromIDB, saveChunk, getChunk, deleteChunksForSession } from '../../lib/indexeddb'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

function makeSessionId(){ return `${Date.now()}-${Math.random().toString(36).slice(2,9)}` }

export default function SystemPage(){
  const router = useRouter()
  const { id } = router.query
  const { data: system, mutate } = useSWR(id ? `/api/systems/${id}` : null, fetcher)
  useSWR('/api/systems', fetcher)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')
  const [sessions, setSessions] = useState<any[]>([])

  useEffect(()=>{ (async ()=>{ const s = await loadSessionsFromIDB(); setSessions(s) })() }, [])

  // per-part upload using XMLHttpRequest for progress
  async function uploadPartWithXHR(url:string, data: ArrayBuffer, onProgress:(n:number)=>void){
    return new Promise<{ etag:string }>((resolve, reject)=>{
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = (e)=>{ if (e.lengthComputable) onProgress(e.loaded) }
      xhr.onload = ()=>{
        if (xhr.status >=200 && xhr.status <300){
          const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || ''
          resolve({ etag })
        } else reject(new Error('upload failed ' + xhr.status))
      }
      xhr.onerror = ()=> reject(new Error('xhr error'))
      xhr.send(data)
    })
  }

  async function startUpload(){
    if (!id) return
    let session = null
    if (file){
      // initiate new session
      const initRes = await fetch('/api/uploads/multipart/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId: id, size: file.size }) })
      const init = await initRes.json()
      if (!init.multipart) { alert('S3 not configured; use local upload fallback'); return }
      const sessionId = init.sessionId || makeSessionId()
      session = { id: sessionId, key: init.key, uploadId: init.uploadId, filename: file.name, size: file.size, contentType: file.type, systemId: id, parts: {}, status: 'uploading', createdAt: Date.now() }
      await saveSessionToIDB(session)
      setSessions(await loadSessionsFromIDB())

      const chunkSize = 5 * 1024 * 1024
      const totalParts = Math.ceil(file.size / chunkSize)
      const concurrency = 4
      let uploadedBytes = 0
      const startedAt = Date.now()

      // function to process a part: save chunk to IDB, presign, upload via XHR with progress, save etag
      async function processPart(partNumber:number){
        const start = (partNumber-1)*chunkSize
        const end = Math.min(file.size, start + chunkSize)
        const blob = file.slice(start, end)
        const arrayBuffer = await blob.arrayBuffer()
        // store chunk
        await saveChunk(session.id, partNumber, arrayBuffer)
        // get presigned url
        const presignRes = await fetch('/api/uploads/multipart/presignPart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, partNumber }) })
        const presign = await presignRes.json()
        if (!presign.url) throw new Error('presign failed')
        // upload with XHR for progress
        let uploadedForPart = 0
        const { etag } = await uploadPartWithXHR(presign.url, arrayBuffer, (n)=>{
          uploadedForPart = n
          const percent = Math.round(((uploadedBytes + uploadedForPart) / file.size) * 100)
          // update session progress in IDB
          session.progress = percent
          saveSessionToIDB(session)
          setSessions(s=> s.map(ss=> ss.id === session.id ? { ...ss, progress: percent } : ss))
        })
        // mark part uploaded
        session.parts[partNumber] = { uploaded: true, etag }
        await saveSessionToIDB(session)
        uploadedBytes += (end - start)
        setSessions(s=> s.map(ss=> ss.id === session.id ? { ...ss, progress: Math.round((uploadedBytes/file.size)*100) } : ss))
      }

      // parallel queue
      const totalPartsArr = Array.from({ length: totalParts }, (_,i)=>i+1)
      let idx = 0
      let active = 0
      async function runner(){
        while (idx < totalPartsArr.length){
          if (active >= concurrency) { await new Promise(r=>setTimeout(r, 100)); continue }
          const partNumber = totalPartsArr[idx++]
          active++
          processPart(partNumber).then(()=>{ active-- }).catch(err=>{ console.error('part error', err); active-- })
        }
        // wait for all active
        while (active > 0) await new Promise(r=>setTimeout(r, 200))
      }

      await runner()

      // all parts uploaded: build parts array
      const partsArray = []
      for (let i=1;i<=totalParts;i++){
        const p = session.parts[i]
        if (!p || !p.uploaded) throw new Error('missing part ' + i)
        partsArray.push({ ETag: p.etag, PartNumber: i })
      }

      // call complete
      const completeRes = await fetch('/api/uploads/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, parts: partsArray, systemId: id, filename: file.name, size: file.size, contentType: file.type, sessionId: session.id }) })
      const complete = await completeRes.json()
      if (!complete.success) throw new Error('complete failed')
      // cleanup IDB chunks/session
      await deleteChunksForSession(session.id, totalParts)
      try { await deleteSessionFromIDB(session.id) } catch(e){}
      setSessions(await loadSessionsFromIDB())
      setUploading(false)
      mutate()

    } else {
      alert('Please select a file to upload (the app supports resuming after selecting the same file or automatic resume if chunks are in IndexedDB).')
    }
  }

  async function resumeFromIDB(sess:any){
    // resume without re-select: read chunks from IDB and upload remaining parts
    // For simplicity, we'll attempt to upload any parts that are missing by reading stored chunks
    if (!sess) return
    setUploading(true)
    try {
      const session = sess
      const chunkSize = 5 * 1024 * 1024
      const totalParts = Math.ceil(session.size / chunkSize)
      const partsArray = []
      const concurrency = 4
      let uploadedBytes = 0
      // upload parts that are missing
      const partNumbers = []
      for (let i=1;i<=totalParts;i++) partNumbers.push(i)

      let idx = 0; let active = 0
      async function processPartNum(partNumber:number){
        const stored = await getChunk(session.id, partNumber)
        if (!stored){
          throw new Error('missing chunk in IndexedDB for part ' + partNumber)
        }
        // presign
        const presignRes = await fetch('/api/uploads/multipart/presignPart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, partNumber }) })
        const presign = await presignRes.json()
        if (!presign.url) throw new Error('presign failed')
        // upload with XHR
        const { etag } = await uploadPartWithXHR(presign.url, stored, (n)=>{})
        session.parts = session.parts || {}
        session.parts[partNumber] = { uploaded: true, etag }
        await saveSessionToIDB(session)
        uploadedBytes += stored.byteLength || 0
      }

      async function runner(){
        while (idx < partNumbers.length){
          if (active >= concurrency) { await new Promise(r=>setTimeout(r, 100)); continue }
          const pn = partNumbers[idx++]
          if (session.parts && session.parts[pn] && session.parts[pn].uploaded) continue
          active++
          processPartNum(pn).then(()=>{ active-- }).catch(err=>{ console.error('resume part err', err); active-- })
        }
        while (active > 0) await new Promise(r=>setTimeout(r, 200))
      }

      await runner()
      // complete
      for (let i=1;i<=totalParts;i++) partsArray.push({ ETag: session.parts[i].etag, PartNumber: i })
      const completeRes = await fetch('/api/uploads/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, parts: partsArray, systemId: session.systemId, filename: session.filename, size: session.size, contentType: session.contentType, sessionId: session.id }) })
      const complete = await completeRes.json()
      if (!complete.success) throw new Error('complete failed')
      await deleteChunksForSession(session.id, Math.ceil(session.size / (5*1024*1024)))
      await deleteSessionFromIDB(session.id)
      setSessions(await loadSessionsFromIDB())
      mutate()
    } catch (err:any){
      alert('Resume failed: ' + (err.message || err))
    } finally { setUploading(false) }
  }

  async function abortSession(sess:any){
    if (!confirm('Abort this upload?')) return
    try {
      await fetch('/api/uploads/multipart/abort', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: sess.key, uploadId: sess.uploadId, sessionId: sess.id }) })
    } catch(e){ console.warn('abort error', e) }
    try { await deleteSessionFromIDB(sess.id) } catch(e){}
    setSessions(await loadSessionsFromIDB())
  }

  async function generateReport(){
    if (!id) return
    const res = await fetch('/api/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemId: id }) })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${system.name}.pdf`
    a.click()
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>{system?.name}</h1>
      <p>{system?.description}</p>

      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <input type="file" onChange={(e)=> setFile(e.target.files?.[0]||null)} />
        <button onClick={startUpload} disabled={uploading} style={{ marginLeft: 8 }}>{uploading ? 'Uploading...' : 'Upload'}</button>
        <button onClick={generateReport} style={{ marginLeft: 8 }}>Download PDF Report</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <input placeholder="filter filename" value={filter} onChange={e=>setFilter(e.target.value)} />
      </div>

      <h3 style={{ marginTop: 16 }}>Active resumable sessions (IndexedDB)</h3>
      <ul>
        {sessions.map((s:any)=> (
          <li key={s.id} style={{ marginBottom: 8 }}>
            <strong>{s.filename}</strong> — {Math.round((s.size||0)/1024)} KB — {s.status || 'pending'}
            <div style={{ width: 400, height: 8, background: '#eee', borderRadius: 4, marginTop: 6 }}>
              <div style={{ width: `${s.progress||0}%`, height: '100%', background: '#2563eb', borderRadius: 4 }} />
            </div>
            <div style={{ marginTop: 6 }}>
              <button onClick={()=>resumeFromIDB(s)} style={{ marginRight: 8 }}>Resume now</button>
              <button onClick={()=>abortSession(s)}>Abort</button>
            </div>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 16 }}>Files</h3>
      <ul>
        {system?.files?.filter((f:any)=> f.filename.includes(filter)).map((f:any)=> (
          <li key={f.id}><a href={`/api/files/${f.id}/download`}>{f.filename}</a> — {Math.round(f.size/1024)} KB — {f.status}</li>
        ))}
      </ul>
    </div>
  )
}
