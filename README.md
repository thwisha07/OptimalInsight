# OptimalInsight — MVP scaffold

This repository contains a minimal scaffold for the OptimalInsight portal:
- Next.js (React + TypeScript)
- SQLite (Prisma) for metadata (easy local setup, no Docker)
- Local filesystem uploads for development (easy viewing). You can switch to S3 in production.
- Basic auth using NextAuth (Credentials provider) with a seeded admin user
- File upload endpoint that supports large files via streaming (formidable)
- Per-system dashboard and simple PDF report generation (pdfkit)

New: Resumable parallel multipart uploads

This update adds resumable, parallel multipart uploads in the browser using S3-compatible multipart upload APIs.
- Files are split into 5MB parts and uploaded in parallel (4 concurrent parts).
- Upload state (uploadId, key, uploaded parts and ETags) is persisted to localStorage so uploads can be resumed after a page reload or tab close—users must re-select the same file to resume.
- Server endpoints included:
  - POST /api/uploads/multipart/initiate — starts multipart upload and returns key + uploadId
  - POST /api/uploads/multipart/presignPart — returns a presigned PUT URL for a part
  - POST /api/uploads/multipart/complete — completes multipart upload; creates File record and enqueues background processing job
  - POST /api/uploads/multipart/abort — aborts multipart upload and removes server-side state

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

5. Start Redis (for worker queue)

   Ensure Redis is running locally or available via REDIS_URL. Example (macOS Homebrew):

     brew install redis
     redis-server

6. Start the background worker (in a separate terminal)

   npm run worker

7. Start dev server

   npm run dev

8. Open http://localhost:3000 and go to a system page. Use the file input to upload a large file and see resumable, parallel multipart uploads with progress.

Notes & next steps

- This scaffold stores upload session state in localStorage for resumability. To resume an upload you must re-select the exact same file in the file input; the client will detect the existing session and continue uploading remaining parts.
- For full robustness you can enhance this to persist sessions in IndexedDB and implement automatic resume without user re-select.
- The worker pipeline is stubbed for virus scanning and metadata extraction. For production integrate ClamAV or a commercial scanner and real metadata extraction tools.
- Security: ensure S3 bucket policies and presigned URL expirations are configured correctly in production.

Files of interest

- pages/api/uploads/multipart/* — multipart endpoints
- pages/systems/[id].tsx — client upload UI with resumable, parallel multipart upload logic
- workers/fileProcessor.ts — background processing worker (BullMQ + Redis)

If you want, I can implement parallel upload resume without having users re-select the file by using the File System Access API (limited browser support) or IndexedDB-based persistence. Let me know which you'd prefer next.
