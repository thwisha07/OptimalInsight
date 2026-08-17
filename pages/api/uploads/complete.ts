import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { systemId, key, filename, size, contentType } = req.body
  if (!systemId || !key || !filename) return res.status(400).json({ error: 'missing fields' })
  // create file record pointing to S3 key
  const rec = await prisma.file.create({ data: {
    systemId,
    filename,
    path: key,
    size: Number(size || 0),
    contentType: contentType || null
  } })
  res.json(rec)
}
