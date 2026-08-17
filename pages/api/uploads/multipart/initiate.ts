import { NextApiRequest, NextApiResponse } from 'next'
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { prisma } from '../../../../lib/prisma'

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

  // create server-side session if user authenticated
  let sessionRecord = null
  try {
    const session = await getServerSession(req, res, authOptions)
    const userId = session?.user?.id || null
    sessionRecord = await prisma.uploadSession.create({ data: { userId, systemId, filename, key, uploadId: uploadId as string, size: Number(req.body.size || 0), contentType: contentType || null } })
  } catch (err) {
    // ignore prisma errors, session optional
    console.warn('could not create upload session', err)
  }

  res.json({ multipart: true, key, uploadId, sessionId: sessionRecord?.id || null })
}
