import { createClient } from "@supabase/supabase-js"

const isE2e = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true"
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

const supabaseUrl = rawUrl || (isE2e ? "http://localhost:54321" : "")
const supabaseAnonKey = rawKey || (isE2e ? "anon-key" : "")

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("supabaseUrl is required.")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
