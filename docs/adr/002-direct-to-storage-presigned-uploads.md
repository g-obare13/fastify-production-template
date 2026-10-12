# ADR 002: Direct-to-Storage Presigned Uploads with Server-Side MIME Sniffing

## Status
Accepted

## Context
Handling large multipart file uploads directly through Node.js application servers leads to high memory utilization, event loop blocking, and network bottlenecks. Furthermore, relying on client-supplied `content-type` headers opens security vulnerabilities where malicious executables or scripts are uploaded as harmless images.

## Decision
We adopted a two-step direct-to-storage upload pattern paired with server-side MIME verification:
1. **Presigned Upload Request (`POST /v1/files/upload/request`)**:
   - Client specifies expected file name, declared MIME type, and size.
   - Server validates file size within limits and checks the declared MIME type against an allow-list.
   - Server creates a database record in `pending` status and returns an expiring presigned PUT URL directly to S3 / MinIO (or an upload endpoint for local development).
2. **Direct Upload**:
   - Client performs a direct HTTP PUT to the presigned storage URL.
3. **Upload Confirmation (`POST /v1/files/upload/confirm`)**:
   - Client invokes confirm with the file ID.
   - Server performs an S3 `HeadObject` call to verify that the object exists and matches the expected byte size.
   - **MIME Sniffing**: The server fetches the first 4KB chunk of the uploaded file and uses `file-type` (`fileTypeFromBuffer`) to inspect the binary magic numbers. If the true magic number conflicts with the declared MIME type (e.g. an ELF executable masquerading as `image/png`), the object is purged immediately and the request is rejected with `VALIDATION_FAILED`.
4. **Lifecycle Maintenance**:
   - A BullMQ background worker scans for uploads that remain in `pending` status past their expiration window and deletes the corresponding orphaned storage objects and database records.

## Consequences
- **Positive**:
  - Application servers handle near-zero I/O bandwidth during large file uploads.
  - Complete protection against MIME spoofing attacks without buffering entire large files in memory.
  - Seamless support for Amazon S3, Cloudflare R2, MinIO, or local disk development.
- **Negative**:
  - Clients require a two-step flow (request URL -> upload -> confirm) instead of a single multipart request.
