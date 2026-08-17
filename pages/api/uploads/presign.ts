import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { filename, contentType, systemId, size } = req.body
  // If S3 is not configured, return a fallback so the client can use local upload endpoint
  const { S3_BUCKET, AWS_REGION, S3_ENDPOINT } = process.env
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !S3_BUCKET){
    return res.json({ uploadToS3: false, uploadUrl: '/api/files/upload' })
  }

  const region = AWS_REGION || 'us-east-1'
  const endpoint = S3_ENDPOINT || undefined
  const s3 = new S3Client({ region, endpoint })
  const key = `systems/${systemId}/${Date.now()}-${filename}`
  const cmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType })
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 60 }) // 1 hour
  res.json({ uploadToS3: true, uploadUrl: url, key })
}
