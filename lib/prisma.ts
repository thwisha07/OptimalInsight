import { PrismaClient } from '@prisma/client'

declare global {
  // allow global prisma during dev to avoid hot reload issues
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma
