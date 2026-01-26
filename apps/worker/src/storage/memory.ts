import type { FileStorage } from "./types"

export class MemoryFileStorage implements FileStorage {
  constructor(private getFile: (path: string) => Uint8Array | null) {}

  async download(_bucket: string, path: string) {
    const content = this.getFile(path)
    if (!content) {
      throw new Error(`file not found at ${path}`)
    }
    return content
  }
}
