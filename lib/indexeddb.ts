import openDB from 'idb'

// simple IndexedDB wrapper using a light abstraction
export async function getDB(){
  // @ts-ignore
  if (typeof window === 'undefined') throw new Error('IndexedDB not available')
  const db = await openDB('oi-uploads', 1, {
    upgrade(db){
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks')
    }
  })
  return db
}

export async function saveSessionToIDB(session:any){
  const db = await getDB()
  await db.put('sessions', session)
}
export async function loadSessionsFromIDB(){
  const db = await getDB()
  return await db.getAll('sessions')
}
export async function deleteSessionFromIDB(id:string){
  const db = await getDB()
  await db.delete('sessions', id)
}

export async function saveChunk(sessionId:string, partNumber:number, data:ArrayBuffer){
  const db = await getDB()
  const key = `${sessionId}:${partNumber}`
  await db.put('chunks', data, key)
}
export async function getChunk(sessionId:string, partNumber:number){
  const db = await getDB()
  const key = `${sessionId}:${partNumber}`
  return await db.get('chunks', key)
}
export async function deleteChunksForSession(sessionId:string, totalParts:number){
  const db = await getDB()
  for (let i=1;i<=totalParts;i++){
    const key = `${sessionId}:${i}`
    try { await db.delete('chunks', key) } catch(e){ }
  }
}
