# IndexedDB and server-side session persistence

This update implements automatic resume without the user re-selecting the file by:

1. Persisting file upload chunks to IndexedDB as they are uploaded. This allows the browser to resume an interrupted upload and upload remaining parts without access to the original File object.
2. Persisting a server-side UploadSession (optional when the user is authenticated) so uploads can be resumed from a different device or browser if the user is signed in.

How it works

- When a multipart upload is initiated, the server starts the S3 multipart upload and (if the user is authenticated) creates an UploadSession record in the database and returns sessionId.
- The client uploads parts in parallel and stores each part's ArrayBuffer in IndexedDB under key `${sessionId}:${partNumber}`. The session metadata is also stored in the `sessions` object store.
- If the upload is interrupted, the client can resume by reading chunks from IndexedDB and uploading missing parts without the user re-selecting the file.
- If the user is signed in and the session was created server-side, you can resume uploads from another browser by calling the server-side session endpoints (TODO: implement cross-device resume UI). The server-side session persists the S3 uploadId/key and part metadata.

Security & storage notes

- Storing file chunks in IndexedDB duplicates the file on the client device. This uses disk space and may be heavy for large files — ensure users understand storage implications.
- IndexedDB-only resume works per-browser/device. Server-side session persistence enables cross-device resume but requires authentication and additional UI to surface sessions.

Next steps (I can implement)

- UI for cross-device resume: list server-side sessions for the authenticated user and allow resuming from another browser (would need endpoints to stream or fetch missing chunks from the original device — or require the original device to remain online to serve chunks).
- Remove stored chunks automatically after successful completion or abort (currently implemented cleanup after completion).
- Add quotas and user warnings when local storage usage is high.
