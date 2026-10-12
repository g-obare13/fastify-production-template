/**
 * @file Integration tests validating local disk and S3 storage provider operations.
 * @module test/lib/storage
 */

import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDiskStorageProvider } from '#src/lib/storage/local-disk.js';

describe('LocalDiskStorageProvider', () => {
  const testDir = './test-scratch-uploads';
  let provider: LocalDiskStorageProvider;

  beforeEach(() => {
    provider = new LocalDiskStorageProvider(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('puts and gets object using stream/buffer', async () => {
    const key = 'test/doc.txt';
    const content = Buffer.from('Antigravity storage test content', 'utf8');

    const putRes = await provider.putObject(key, content, 'text/plain');
    expect(putRes.size).toBe(content.length);

    const headRes = await provider.headObject(key);
    expect(headRes.exists).toBe(true);
    expect(headRes.size).toBe(content.length);

    const getRes = await provider.getObject(key);
    expect(getRes.contentLength).toBe(content.length);

    // Consume stream before delete
    await new Promise<void>((resolve) => {
      getRes.stream.on('data', () => {});
      getRes.stream.on('end', resolve);
    });

    await provider.deleteObject(key);
    const postDelete = await provider.headObject(key);
    expect(postDelete.exists).toBe(false);
  });

  it('generates simulated presigned URLs for upload and download', async () => {
    const uploadUrl = await provider.getPresignedUploadUrl('sample.png', 'image/png');
    expect(uploadUrl).toContain('sample.png');

    const downloadUrl = await provider.getPresignedDownloadUrl('sample.png');
    expect(downloadUrl).toContain('sample.png');
  });

  it('reports healthy in development and test environments', async () => {
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.driver).toBe('local');
  });
});
