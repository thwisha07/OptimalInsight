import Link from 'next/link'
import useSWR from 'swr'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r=>r.json())

export default function Home(){
  const { data: systems } = useSWR('/api/systems', fetcher)
  const [name, setName] = useState('')

  async function create(){
    if (!name) return
    await fetch('/api/systems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    location.reload()
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>OptimalInsight — Systems</h1>
      <div style={{ marginBottom: 20 }}>
        <input placeholder="New system name" value={name} onChange={e=>setName(e.target.value)} />
        <button onClick={create} style={{ marginLeft: 8 }}>Create</button>
      </div>
      <ul>
        {systems?.map((s:any)=> (
          <li key={s.id}><Link href={`/systems/${s.id}`}>{s.name}</Link></li>
        ))}
      </ul>
    </div>
  )
}
