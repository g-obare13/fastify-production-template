/**
 * @file Zod validation schemas and DTOs for presigned file uploads and downloads.
 * @module modules/files/schemas
 */

import { z } from 'zod';

/** Schema for presigned upload allocation requests. Enforces max filename length and positive size. */
export const presignedUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(128),
  size: z.number().positive(),
  visibility: z.enum(['private', 'public']).default('private'),
});

/** Schema for presigned S3 upload response containing expiring direct PUT URL. */
export const presignedUploadResponseSchema = z.object({
  fileId: z.string(),
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number(),
});

/** Schema for upload completion confirmation payload. */
export const confirmUploadRequestSchema = z.object({
  fileId: z.string(),
  checksum: z.string().default('sha256-verified'),
});

/** File metadata descriptor response schema. */
export const fileResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  status: z.string(),
  visibility: z.string(),
  downloadUrl: z.string().url().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Schema validating file download URL response containing presigned URL and expiration. */
export const downloadUrlResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresIn: z.number(),
});

/** Presigned upload allocation request body type. */
export type PresignedUploadRequest = z.infer<typeof presignedUploadRequestSchema>;
/** Upload confirmation request body type. */
export type ConfirmUploadRequest = z.infer<typeof confirmUploadRequestSchema>;
/** File record descriptor response type. */
export type FileResponse = z.infer<typeof fileResponseSchema>;
/** Presigned download URL response type. */
export type DownloadUrlResponse = z.infer<typeof downloadUrlResponseSchema>;
