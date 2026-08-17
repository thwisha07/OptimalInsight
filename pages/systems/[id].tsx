import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useEffect, useState, useRef } from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

// utility to read/write upload sessions to localStorage for resumability
const SESSIONS_KEY = 'oi_upload_sessions_v1'
function loadSessions(){
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]') } catch(e){ return [] }
}
function saveSessions(sessions:any[]){ localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) }

function makeSessionId(){ return `${Date.now()}-${Math.random().toString(36).slice(2,9)}` }

// uploadMultipart with parallel parts, retries, and resumability
async function uploadMultipartWithResume(file: File, systemId: string, onProgress: (progress:number)=>void, onStatus: (s:string)=>void){
  // check if there's an existing session for this filename+size
  let sessions = loadSessions()
  let session = sessions.find(s=> s.filename === file.name && s.size === file.size && s.systemId === systemId)
  if (!session){
    // initiate
    const initRes = await fetch('/api/uploads/multipart/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId }) })
    const init = await initRes.json()
    if (!init.multipart) return null
    session = {
      id: makeSessionId(),
      key: init.key,
      uploadId: init.uploadId,
      filename: file.name,
      size: file.size,
      contentType: file.type,
      systemId,
      createdAt: Date.now(),
      parts: {} // map partNumber -> { uploaded: boolean, etag }
    }
    sessions.push(session)
    saveSessions(sessions)
  }

  const chunkSize = 5 * 1024 * 1024 // 5MB
  const totalParts = Math.ceil(file.size / chunkSize)
  const concurrency = 4
  let uploadedBytes = 0
  // calculate already uploaded bytes from session.parts
  for (let i=1;i<=totalParts;i++){
    if (session.parts[i] && session.parts[i].uploaded) uploadedBytes += Math.min(chunkSize, file.size - (i-1)*chunkSize)
  }
  onProgress(Math.round((uploadedBytes / file.size) * 100))

  // prepare queue of parts to upload
  const partNumbers = []
  for (let i=1;i<=totalParts;i++) partNumbers.push(i)

  // concurrency pool
  let active = 0
  let index = 0
  let errorOccured = false

  return new Promise(async (resolve, reject) => {
    async function uploadPart(partNumber:number){
      if (errorOccured) return
      const start = (partNumber-1)*chunkSize
      const end = Math.min(file.size, start + chunkSize)
      const chunk = file.slice(start, end)

      // if already uploaded, skip
      if (session.parts[partNumber] && session.parts[partNumber].uploaded) return

      // try with retries
      const maxRetries = 3
      for (let attempt=1; attempt<=maxRetries; attempt++){
        try {
          // get presigned url
          const presignRes = await fetch('/api/uploads/multipart/presignPart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, partNumber }) })
          const presign = await presignRes.json()
          if (!presign.url) throw new Error('no presign url')

          const putRes = await fetch(presign.url, { method: 'PUT', body: chunk, headers: { 'Content-Type': file.type } })
          if (!putRes.ok) throw new Error('put failed')
          // ETag
          const etag = putRes.headers.get('etag') || ''
          session.parts[partNumber] = { uploaded: true, etag }
          // persist
          sessions = loadSessions()
          const idx = sessions.findIndex((s:any)=> s.id === session.id)
          if (idx !== -1) sessions[idx] = session
          else sessions.push(session)
          saveSessions(sessions)

          uploadedBytes += (end - start)
          onProgress(Math.round((uploadedBytes / file.size) * 100))
          return
        } catch (err:any){
          console.warn(`part ${partNumber} attempt ${attempt} failed`, err)
          if (attempt === maxRetries){
            errorOccured = true
            onStatus('error')
            reject(err)
            return
          }
          // exponential backoff
          await new Promise(r=>setTimeout(r, 500 * Math.pow(2, attempt)))
        }
      }
    }

    // worker runner
    async function runner(){
      while (index < partNumbers.length && !errorOccured){
        const partNumber = partNumbers[index++] as number
        if (session.parts[partNumber] && session.parts[partNumber].uploaded) {
          continue
        }
        active++
        uploadPart(partNumber).then(()=>{
          active--
          if (active === 0 && index >= partNumbers.length) {
            // all parts attempted; check if any missing
            const missing = []
            for (let i=1;i<=totalParts;i++) if (!(session.parts[i] && session.parts[i].uploaded)) missing.push(i)
            if (missing.length === 0){
              // complete
              completeMultipart()
            } else {
              // resume by starting more runners
              if (!errorOccured) setTimeout(() => { if (active < concurrency) runner() }, 100)
            }
          }
        }).catch((e)=>{
          console.error('uploadPart failed', e)
        })
        if (active >= concurrency) {
          // wait a bit
          await new Promise(r=>setTimeout(r, 200))
        }
      }
    }

    async function completeMultipart(){
      try {
        onStatus('completing')
        const partsArray = []
        for (let i=1;i<=totalParts;i++){
          const p = session.parts[i]
          if (!p) throw new Error('missing part ' + i)
          partsArray.push({ ETag: p.etag, PartNumber: i })
        }
        const completeRes = await fetch('/api/uploads/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: session.key, uploadId: session.uploadId, parts: partsArray, systemId: systemId, filename: file.name, size: file.size, contentType: file.type }) })
        const complete = await completeRes.json()
        if (!complete.success) throw new Error('complete failed')
        // remove session
        sessions = loadSessions().filter((s:any)=> s.id !== session.id)
        saveSessions(sessions)
        onStatus('done')
        resolve(complete)
      } catch (err){
        errorOccured = true
        onStatus('error')
        reject(err)
      }
    }

    // start up to concurrency runners
    for (let i=0;i<concurrency;i++) runner()
  })
}

export default function SystemPage(){
  const router = useRouter()
  const { id } = router.query
  const { data: system, mutate } = useSWR(id ? `/api/systems/${id}` : null, fetcher)
  useSWR('/api/systems', fetcher)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')
  const [sessions, setSessions] = useState<any[]>([]) // active/resumable sessions
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(()=>{
    // load persisted sessions
    if (typeof window === 'undefined') return
    const s = loadSessions()
    setSessions(s)
  }, [])

  // listen for storage events (multi-tab resume)
  useEffect(()=>{
    function onStorage(e: StorageEvent){
      if (e.key === SESSIONS_KEY) setSessions(loadSessions())
    }
    window.addEventListener('storage', onStorage)
    return ()=> window.removeEventListener('storage', onStorage)
  }, [])

  async function startUpload(){
    if (!file || !id) return
    setUploading(true)
    const sessionId = makeSessionId()
    // add a temporary UI session
    const uiSession = { id: sessionId, filename: file.name, size: file.size, progress: 0, status: 'starting' }
    setSessions(prev=> { const next=[...prev.filter(p=>p.id !== sessionId), uiSession]; saveSessions(prev); return next })

    try {
      await uploadMultipartWithResume(file, id as string, (progress)=>{
        // update UI
        setSessions(prev=> prev.map(s=> s.id === sessionId ? { ...s, progress } : s))
      }, (status)=>{
        setSessions(prev=> prev.map(s=> s.id === sessionId ? { ...s, status } : s))
      })
      // refresh server data
      mutate()
    } catch (err:any){
      alert('Upload failed: ' + (err.message || err))
    } finally {
      setUploading(false)
      // reload persisted sessions
      setSessions(loadSessions())
    }
  }

  async function resumeSession(sess:any){
    // attempt to resume using session data
    const fakeFile = null
    // we can't rehydrate the File object; instead tell user to re-select the same file to resume.
    alert('To resume an upload you must re-select the same file from disk and click Upload. The app will detect the existing session and resume it.')
  }

  async function abortSession(sess:any){
    if (!confirm('Abort this upload? This will attempt to abort the multipart upload on the server and remove stored state.')) return
    try {
      await fetch('/api/uploads/multipart/abort', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: sess.key, uploadId: sess.uploadId }) })
    } catch (e){ console.warn('abort error', e) }
    // remove local session
    const next = loadSessions().filter((s:any)=> s.id !== sess.id)
    saveSessions(next)
    setSessions(next)
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
        <button onClick={startUpload} disabled={!file || uploading} style={{ marginLeft: 8 }}>{uploading ? 'Uploading...' : 'Upload'}</button>
        <button onClick={generateReport} style={{ marginLeft: 8 }}>Download PDF Report</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <input placeholder="filter filename" value={filter} onChange={e=>setFilter(e.target.value)} />
      </div>

      <h3 style={{ marginTop: 16 }}>Active uploads / resumable sessions</h3>
      <ul>
        {sessions.map((s:any)=> (
          <li key={s.id} style={{ marginBottom: 8 }}>
            <strong>{s.filename}</strong> — {Math.round((s.size||0)/1024)} KB — {s.status || 'pending'}
            <div style={{ width: 400, height: 8, background: '#eee', borderRadius: 4, marginTop: 6 }}>
              <div style={{ width: `${s.progress||0}%`, height: '100%', background: '#2563eb', borderRadius: 4 }} />
            </div>
            <div style={{ marginTop: 6 }}>
              <button onClick={()=>resumeSession(s)} style={{ marginRight: 8 }}>Resume (select same file)</button>
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
