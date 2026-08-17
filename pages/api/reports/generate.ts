import { NextApiRequest, NextApiResponse } from 'next'
import PDFDocument from 'pdfkit'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method !== 'POST') return res.status(405).end()
  const { systemId } = req.body
  if (!systemId) return res.status(400).json({ error: 'systemId required' })
  const sys = await prisma.system.findUnique({ where: { id: systemId }, include: { files: true } })
  if (!sys) return res.status(404).json({ error: 'system not found' })

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="report-${sys.name}.pdf"`)
  doc.pipe(res)

  // simple professional header
  doc.fontSize(20).text(`Report — ${sys.name}`, { align: 'left' })
  doc.moveDown()
  doc.fontSize(12).fillColor('gray').text(`Generated: ${new Date().toLocaleString()}`)
  doc.moveDown()

  // summary
  doc.fontSize(14).fillColor('black').text('Summary')
  doc.moveDown(0.5)
  doc.fontSize(11).text(`Total files: ${sys.files.length}`)
  const totalSize = sys.files.reduce((s, f) => s + (f.size || 0), 0)
  doc.text(`Total size: ${Math.round(totalSize/1024/1024)} MB`)
  doc.moveDown()

  // file list
  doc.fontSize(14).text('Files')
  doc.moveDown(0.5)
  sys.files.forEach(f => {
    doc.fontSize(11).text(`${f.filename} — ${Math.round((f.size||0)/1024)} KB`)
  })

  doc.end()
}
