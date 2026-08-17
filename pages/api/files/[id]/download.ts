import { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).end()
  const file = await prisma.file.findUnique({ where: { id } })
  if (!file) return res.status(404).end()
  const full = path.join(process.cwd(), file.path)
  if (!fs.existsSync(full)) return res.status(404).end()
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
  const stream = fs.createReadStream(full)
  stream.pipe(res)
}
