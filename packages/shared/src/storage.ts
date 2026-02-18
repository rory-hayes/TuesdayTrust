import type { Readable } from 'node:stream';

export type PutObjectBody = string | Buffer | Uint8Array | ArrayBuffer;

export type PutObjectInput = {
  pathname: string;
  contentType?: string;
  body: PutObjectBody;
};

export type PutObjectResult = {
  url: string;
  pathname: string;
};

export interface StorageAdapter {
  readonly kind: 'blob' | 'local';
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObjectStream(locator: string): Promise<Readable>;
  deleteObject(locator: string): Promise<void>;
}
