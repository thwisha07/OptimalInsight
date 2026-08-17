import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

async function main(){
  const adminPassword = process.env.ADMIN_PASSWORD || ''
  let pwd = adminPassword
  if (!pwd) {
    // generate a random password for seed if not provided
    pwd = Math.random().toString(36).slice(-10)
    console.log('Generated admin password:', pwd)
  }
  const hashed = await bcrypt.hash(pwd, 10)
  const user = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { password: hashed },
    create: { email: 'admin@example.com', name: 'Admin', password: hashed }
  })
  console.log('Seeded user:', user.email)

  // example system
  const sys = await prisma.system.upsert({
    where: { name: '28 East' },
    update: {},
    create: { name: '28 East', description: 'Example system for fiber feasibility reports' }
  })
  console.log('Seeded system:', sys.name)
}

main()
  .catch(e=>{ console.error(e); process.exit(1) })
  .finally(()=>process.exit())
