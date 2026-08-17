import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  if (req.method === 'GET'){
    const systems = await prisma.system.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(systems)
    return
  }
  if (req.method === 'POST'){
    const { name, description } = req.body
    const sys = await prisma.system.create({ data: { name, description } })
    res.status(201).json(sys)
    return
  }
  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
