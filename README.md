# OptimalInsight — MVP scaffold

This repository contains a minimal scaffold for the OptimalInsight portal:
- Next.js (React + TypeScript)
- SQLite (Prisma) for metadata (easy local setup, no Docker)
- Local filesystem uploads for development (easy viewing). You can switch to S3 in production.
- Basic auth using NextAuth (Credentials provider) with a seeded admin user
- File upload endpoint that supports large files via streaming (formidable)
- Per-system dashboard and simple PDF report generation (pdfkit)

Quick start (local, no Docker)

1. Install dependencies

   npm install

2. Create .env (see .env.example)

   cp .env.example .env
   # Edit .env as needed. At minimum set NEXTAUTH_SECRET. DATABASE_URL defaults to SQLite.

3. Generate Prisma client & run migrations

   npx prisma generate
   npx prisma migrate dev --name init

4. Seed an admin user (optional)

   npm run seed

   The seed script will create an admin user with the email `admin@example.com` and the password printed in the console.

5. Run dev server

   npm run dev

6. Open http://localhost:3000

Notes & next steps

- This scaffold stores uploaded files in the `uploads/` folder for easy viewing. For production you should use S3 or another object store and presigned multipart uploads.
- The PDF report generator is a simple example using pdfkit; you can replace it with Puppeteer for HTML-based reports if you need precise styling.
- Security: this scaffold includes a simple credentials-based auth. For production, use an enterprise IdP (SAML/OIDC) and enable MFA.

Files of interest

- prisma/schema.prisma — DB models
- prisma/seed.ts — seed script that creates an admin user and one example system
- pages/ — Next.js pages and API routes
  - pages/api/files/upload.ts — file upload handler
  - pages/api/reports/generate.ts — PDF generator
  - pages/api/systems.ts — systems CRUD
  - pages/api/auth/[...nextauth].ts — auth
- lib/prisma.ts — Prisma client

If you want, I can extend the scaffold to add S3 presigned uploads, background workers, or prettier PDF reports. Say which feature to add next and I'll implement it.
