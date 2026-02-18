import path from 'node:path';

import type { StorageAdapter } from '@evidenceq/shared';

import { BlobStorageAdapter } from './providers/blob';
import { LocalDiskStorageAdapter } from './providers/local';

export * from './types';

type CreateStorageAdapterOptions = {
  env?: string;
  blobToken?: string;
  localRoot?: string;
};

export function createStorageAdapter(options: CreateStorageAdapterOptions = {}): StorageAdapter {
  const env = options.env ?? process.env.NODE_ENV ?? 'development';
  const blobToken = options.blobToken ?? process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    return new BlobStorageAdapter(blobToken);
  }

  if (env !== 'production') {
    const localRoot =
      options.localRoot ?? process.env.LOCAL_STORAGE_PATH ?? path.resolve(process.cwd(), '.local-storage');

    return new LocalDiskStorageAdapter(localRoot);
  }

  throw new Error(
    'BLOB_READ_WRITE_TOKEN is required in production. Local disk storage fallback is development-only.'
  );
}
