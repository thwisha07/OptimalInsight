import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

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
    // ask server for presigned url
    const presign = await fetch('/api/uploads/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, systemId: id, size: file.size }) })
    const pjson = await presign.json()
    if (pjson.uploadToS3){
      // upload directly to S3 with PUT
      const put = await fetch(pjson.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok){
        alert('Upload to S3 failed')
        setUploading(false)
        return
      }
      // notify server to create record
      await fetch('/api/uploads/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemId: id, key: pjson.key, filename: file.name, size: file.size, contentType: file.type }) })
    } else {
      // fallback to local upload endpoint
      const fd = new FormData()
      fd.append('file', file)
      fd.append('systemId', id as string)
      await fetch(pjson.uploadUrl || '/api/files/upload', { method: 'POST', body: fd })
    }

    setUploading(false)
    router.replace(router.asPath)
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
          <li key={f.id}><a href={`/api/files/${f.id}/download`}>{f.filename}</a> — {Math.round(f.size/1024)} KB</li>
        ))}
      </ul>
    </div>
  )
}
