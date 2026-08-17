import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { prisma } from '../../../../../lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]'

function getS3Client(){
  const { AWS_REGION, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) return null
  return new S3Client({ region: AWS_REGION || 'us-east-1', endpoint: S3_ENDPOINT || undefined, forcePathStyle: !!S3_ENDPOINT, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { key, uploadId } = req.body
  if (!key || !uploadId) return res.status(400).json({ error: 'missing fields' })
  const s3 = getS3Client()
  if (!s3) return res.status(500).json({ error: 'S3 not configured' })
  try {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId }))
    // if session exists, delete
    if (req.body.sessionId){
      try { await prisma.uploadSession.delete({ where: { id: req.body.sessionId } }) } catch(e){ /* ignore */ }
    }
    res.json({ aborted: true })
  } catch (err) {
    console.error('abort error', err)
    res.status(500).json({ error: 'abort failed' })
  }
}
