import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { FileStorage } from "./types"

interface SupabaseStorageConfig {
  url: string
  serviceRoleKey: string
}

export function createSupabaseFileStorage(config: SupabaseStorageConfig) {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false }
  })
  return new SupabaseFileStorage(client)
}

export class SupabaseFileStorage implements FileStorage {
  constructor(private client: SupabaseClient) {}

  async download(bucket: string, path: string) {
    const { data, error } = await this.client.storage.from(bucket).download(path)
    if (error) {
      throw new Error(`storage download failed: ${error.message}`)
    }
    const arrayBuffer = await data.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }
}
