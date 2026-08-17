import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import { prisma } from '../../../lib/prisma'

export const config = {
  api: {
    bodyParser: false
  }
}

const uploadDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()

  const form = formidable({ multiples: true, uploadDir, keepExtensions: true, maxFileSize: 1024 * 1024 * 1024 * 10 }) // 10GB limit for dev

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Upload error', err)
      return res.status(500).json({ error: 'upload error' })
    }
    const systemId = fields.systemId as string
    const fileList = Array.isArray(files.file) ? files.file : [files.file]
    const created: any[] = []
    for (const f of fileList){
      if (!f) continue
      const filepath = Array.isArray(f.filepath) ? f.filepath[0] : (f.filepath as string)
      const stat = fs.statSync(filepath)
      const rec = await prisma.file.create({ data: {
        systemId,
        filename: f.originalFilename || 'upload',
        path: path.relative(process.cwd(), filepath),
        size: stat.size,
        contentType: (f.mimetype as string) || null
      }})
      created.push(rec)
    }
    res.json({ created })
  })
}
