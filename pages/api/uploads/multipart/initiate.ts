import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3'

function getS3Client(){
  const { AWS_REGION, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) return null
  return new S3Client({ region: AWS_REGION || 'us-east-1', endpoint: S3_ENDPOINT || undefined, forcePathStyle: !!S3_ENDPOINT, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { filename, contentType, systemId } = req.body
  const s3 = getS3Client()
  if (!s3) return res.json({ multipart: false, message: 'S3 not configured' })
  const key = `systems/${systemId}/${Date.now()}-${filename}`
  const cmd = new CreateMultipartUploadCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType })
  const out = await s3.send(cmd)
  const uploadId = out.UploadId
  res.json({ multipart: true, key, uploadId })
}
