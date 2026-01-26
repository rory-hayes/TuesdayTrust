export interface FileStorage {
  download(bucket: string, path: string): Promise<Uint8Array>
}
