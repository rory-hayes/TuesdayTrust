import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function run() {
  const now = new Date().toISOString()
  const { data: files, error } = await supabase
    .from("questionnaire_files")
    .select("id, storage_bucket, storage_path")
    .lt("expires_at", now)

  if (error) {
    throw new Error(`failed to list expired files: ${error.message}`)
  }

  if (!files || files.length === 0) {
    console.log("No expired files to purge.")
    return
  }

  for (const file of files) {
    const { error: storageError } = await supabase.storage
      .from(file.storage_bucket)
      .remove([file.storage_path])

    if (storageError) {
      console.warn(
        `failed to remove storage object ${file.storage_bucket}/${file.storage_path}: ${storageError.message}`
      )
      continue
    }

    const { error: deleteError } = await supabase
      .from("questionnaire_files")
      .delete()
      .eq("id", file.id)

    if (deleteError) {
      console.warn(`failed to delete questionnaire_files row ${file.id}: ${deleteError.message}`)
      continue
    }

    console.log(`purged ${file.storage_bucket}/${file.storage_path}`)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
