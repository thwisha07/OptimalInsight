import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function getS3Client(){
  const { AWS_REGION, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET) return null
  return new S3Client({ region: AWS_REGION || 'us-east-1', endpoint: S3_ENDPOINT || undefined, forcePathStyle: !!S3_ENDPOINT, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { key, uploadId, partNumber } = req.body
  if (!key || !uploadId || !partNumber) return res.status(400).json({ error: 'missing fields' })
  const s3 = getS3Client()
  if (!s3) return res.status(500).json({ error: 'S3 not configured' })
  const cmd = new UploadPartCommand({ Bucket: process.env.S3_BUCKET, Key: key, UploadId: uploadId, PartNumber: Number(partNumber) })
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 60 })
  res.json({ url })
}
