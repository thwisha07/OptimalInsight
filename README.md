# Redis and worker setup

This project now includes a background worker (BullMQ + Redis) that processes files after upload (virus scanning stub, metadata extraction stub, then marks the file ready).

Prerequisites
- Redis: install locally or use a managed Redis service.
  - Local quick start (macOS with Homebrew): brew install redis && redis-server
  - Docker (if you change your mind): docker run -p 6379:6379 redis
- Ensure REDIS_URL is set if not running on localhost:6379. Example: REDIS_URL=redis://localhost:6379

How it works
- After a successful multipart upload completes, the server creates a File record with status `processing` and enqueues a job on the `file-processing` queue.
- The worker (workers/fileProcessor.ts) consumes jobs from that queue, performs a stub virus scan and metadata extraction, and updates the file record to status `ready` with some example metadata.

Run the worker

1. Ensure Redis is running and available at REDIS_URL (or default redis://localhost:6379).
2. From the project root run:

   npm run worker

3. The worker logs will show processing progress.

TODOs for production
- Replace the virus-scan stub with a real scanner (ClamAV or a commercial scanning service). If infected files are found, mark the DB record as `quarantined` and move the S3 object to a quarantine bucket or delete it.
- Implement metadata extraction (PDF text extraction, image thumbnails, geospatial indexing) and persist useful searchable fields to `metadata`.
- Add retry and backoff policies for job failures and monitor job queue health.
