import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'

// Worker that processes uploaded files: virus scan (stub), metadata extraction (stub), mark ready.
// TODO: plug in a real virus scanner (ClamAV or commercial) and implement content extraction.

const worker = new Worker('file-processing', async job => {
  const { fileId } = job.data
  console.log('Processing file', fileId)
  // mark processing
  await prisma.file.update({ where: { id: fileId }, data: { status: 'processing' } })

  // STUB: virus scan simulation
  console.log('Running virus scan (stub)')
  await new Promise(r=>setTimeout(r, 1500))
  // TODO: run actual virus scanner and fail job if infected; quarantine object in S3 if necessary.

  // STUB: metadata extraction (e.g., PDF text, images EXIF)
  console.log('Extracting metadata (stub)')
  await new Promise(r=>setTimeout(r, 1000))
  const metadata = { extractedAt: new Date().toISOString(), notes: 'metadata extraction stub' }

  // update file record
  await prisma.file.update({ where: { id: fileId }, data: { metadata, status: 'ready' } })
  console.log('File processed and marked ready:', fileId)
}, { connection: redis })

worker.on('completed', job => console.log('Job completed', job.id))
worker.on('failed', (job, err) => console.error('Job failed', job?.id, err))

console.log('Worker started, listening to file-processing queue')
