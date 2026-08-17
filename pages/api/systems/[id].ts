import fs from 'fs'
import path from 'path'
import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  const { id } = req.query
  if (!id || typeof id !== 'string') return res.status(400).end()
  if (req.method === 'GET'){
    const sys = await prisma.system.findUnique({ where: { id }, include: { files: { orderBy: { uploadedAt: 'desc' } } } })
    if (!sys) return res.status(404).end()
    res.json(sys)
    return
  }
  res.setHeader('Allow', 'GET')
  res.status(405).end()
}
