import { mkdir, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';

import type { PutObjectBody, PutObjectInput, PutObjectResult, StorageAdapter } from '@evidenceq/shared';

function toBuffer(body: PutObjectBody): Buffer {
  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  return Buffer.from(body);
}

function resolveLocalPath(rootPath: string, locator: string): string {
  if (locator.startsWith('file://')) {
    return decodeURIComponent(locator.slice('file://'.length));
  }

  return path.resolve(rootPath, locator);
}

export class LocalDiskStorageAdapter implements StorageAdapter {
  readonly kind = 'local' as const;

  constructor(private readonly rootPath: string) {}

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const fullPath = path.resolve(this.rootPath, input.pathname);
    const folder = path.dirname(fullPath);

    await mkdir(folder, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(fullPath);
      stream.on('error', reject);
      stream.on('finish', () => resolve());
      stream.end(toBuffer(input.body));
    });

    return {
      pathname: input.pathname,
      url: `file://${fullPath}`
    };
  }

  async getObjectStream(locator: string) {
    const filePath = resolveLocalPath(this.rootPath, locator);
    return createReadStream(filePath);
  }

  async deleteObject(locator: string): Promise<void> {
    const filePath = resolveLocalPath(this.rootPath, locator);
    await rm(filePath, {
      force: true
    });
  }
}
