import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

// client-side multipart upload helper
async function uploadMultipart(file: File, systemId: string){
  // get initiation
  const initRes = await fetch('/api/uploads/multipart/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId }) })
  const init = await initRes.json()
  if (!init.multipart) return null
  const { key, uploadId } = init

  const chunkSize = 5 * 1024 * 1024 // 5MB
  const parts: Array<{ ETag: string, PartNumber: number }> = []
  const totalParts = Math.ceil(file.size / chunkSize)

  for (let partNumber = 1; partNumber <= totalParts; partNumber++){
    const start = (partNumber-1) * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const chunk = file.slice(start, end)
    // get presigned url for this part
    const presignRes = await fetch('/api/uploads/multipart/presignPart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, uploadId, partNumber }) })
    const presign = await presignRes.json()
    if (!presign.url) throw new Error('no presign url')
    // upload via PUT
    const putRes = await fetch(presign.url, { method: 'PUT', body: chunk, headers: { 'Content-Type': file.type } })
    if (!putRes.ok) throw new Error('upload part failed')
    const etag = putRes.headers.get('etag') || ''
    parts.push({ ETag: etag, PartNumber: partNumber })
  }

  // complete
  const completeRes = await fetch('/api/uploads/multipart/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, uploadId, parts, systemId, filename: file.name, size: file.size, contentType: file.type }) })
  const complete = await completeRes.json()
  return complete
}

export default function SystemPage(){
  const router = useRouter()
  const { id } = router.query
  const { data: system } = useSWR(id ? `/api/systems/${id}` : null, fetcher)
  const { data: systems } = useSWR('/api/systems', fetcher)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')

  async function upload(){
    if (!file || !id) return
    setUploading(true)
    try {
      // if S3 configured and large file, use multipart flow
      const s3Configured = !!process.env.NEXT_PUBLIC_S3_ENABLED
      // We can't read server env directly; attempt multipart and server will respond if configured
      if (file.size > 6 * 1024 * 1024){
        // try multipart
        const res = await uploadMultipart(file, id as string)
        if (!res) {
          // fall back to single presign
          const pres = await fetch('/api/uploads/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId: id }) })
          const pjson = await pres.json()
          if (pjson.uploadToS3){
            const put = await fetch(pjson.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
            if (!put.ok) throw new Error('put failed')
            await fetch('/api/uploads/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemId: id, key: pjson.key, filename: file.name, size: file.size, contentType: file.type }) })
          } else {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('systemId', id as string)
            await fetch('/api/files/upload', { method: 'POST', body: fd })
          }
        }
      } else {
        // small file: use existing presign flow
        const pres = await fetch('/api/uploads/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId: id }) })
        const pjson = await pres.json()
        if (pjson.uploadToS3){
          const put = await fetch(pjson.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
          if (!put.ok) throw new Error('put failed')
          await fetch('/api/uploads/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemId: id, key: pjson.key, filename: file.name, size: file.size, contentType: file.type }) })
        } else {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('systemId', id as string)
          await fetch(pjson.uploadUrl || '/api/files/upload', { method: 'POST', body: fd })
        }
      }
      router.replace(router.asPath)
    } catch (err:any){
      console.error(err)
      alert('Upload failed: ' + (err.message || err))
    } finally { setUploading(false) }
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
        <button onClick={upload} disabled={!file || uploading} style={{ marginLeft: 8 }}>{uploading ? 'Uploading...' : 'Upload'}</button>
        <button onClick={generateReport} style={{ marginLeft: 8 }}>Download PDF Report</button>
      </div>

      <div style={{ marginTop: 20 }}>
        <input placeholder="filter filename" value={filter} onChange={e=>setFilter(e.target.value)} />
      </div>

      <h3 style={{ marginTop: 16 }}>Files</h3>
      <ul>
        {system?.files?.filter((f:any)=> f.filename.includes(filter)).map((f:any)=> (
          <li key={f.id}><a href={`/api/files/${f.id}/download`}>{f.filename}</a> — {Math.round(f.size/1024)} KB — {f.status}</li>
        ))}
      </ul>
    </div>
  )
}
