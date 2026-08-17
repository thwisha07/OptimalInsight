import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { prisma } from '../../../../../lib/prisma'
import { fileQueue } from '../../../../../lib/queue'

function getS3Client(){
  const { AWS_REGION, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) return null
  return new S3Client({ region: AWS_REGION || 'us-east-1', endpoint: S3_ENDPOINT || undefined, forcePathStyle: !!S3_ENDPOINT, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { key, uploadId, parts, systemId, filename, size, contentType } = req.body
  if (!key || !uploadId || !parts || !systemId || !filename) return res.status(400).json({ error: 'missing fields' })
  const s3 = getS3Client()
  if (!s3) return res.status(500).json({ error: 'S3 not configured' })

  // parts: [{ ETag, PartNumber }]
  try {
    const cmd = new CompleteMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.map((p:any)=> ({ ETag: p.ETag, PartNumber: Number(p.PartNumber) })) } })
    const out = await s3.send(cmd)
    // create DB record and enqueue processing job
    const rec = await prisma.file.create({ data: { systemId, filename, path: key, size: Number(size || 0), contentType: contentType || null, status: 'processing' } })
    await fileQueue.add('process-file', { fileId: rec.id })
    res.json({ success: true, location: out.Location })
  } catch (err) {
    // if complete fails, attempt to abort
    try { await s3.send(new AbortMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId })) } catch(e){ /* ignore */ }
    console.error('complete multipart error', err)
    res.status(500).json({ error: 'complete failed' })
  }
}
