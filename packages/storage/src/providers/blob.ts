import { del, put } from '@vercel/blob';

import type { PutObjectInput, PutObjectResult, StorageAdapter } from '@evidenceq/shared';
import { Readable } from 'node:stream';

function toPutBody(body: PutObjectInput['body']): string | Buffer {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  return Buffer.from(body);
}

function toLocatorUrl(locator: string): string {
  if (locator.startsWith('http://') || locator.startsWith('https://')) {
    return locator;
  }

  return `https://${locator.replace(/^\/+/, '')}`;
}

function blobUrlToLocator(blobUrl: string): string {
  const parsed = new URL(blobUrl);
  return `${parsed.hostname}${parsed.pathname}`;
}

export class BlobStorageAdapter implements StorageAdapter {
  readonly kind = 'blob' as const;

  constructor(private readonly token: string) {}

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const options: Parameters<typeof put>[2] = {
      token: this.token,
      access: 'public',
      addRandomSuffix: true
    };

    if (input.contentType) {
      options.contentType = input.contentType;
    }

    const blob = await put(input.pathname, toPutBody(input.body), options);

    return {
      pathname: blobUrlToLocator(blob.url),
      url: blob.url
    };
  }

  async getObjectStream(locator: string): Promise<Readable> {
    const response = await fetch(toLocatorUrl(locator));

    if (!response.ok || !response.body) {
      throw new Error(`Failed to read blob object: ${response.status} ${response.statusText}`);
    }

    return Readable.fromWeb(response.body as never);
  }

  async deleteObject(locator: string): Promise<void> {
    await del(toLocatorUrl(locator), { token: this.token });
  }
}
