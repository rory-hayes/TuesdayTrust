import { processQuestionnaireJob, processReportExportJob } from "./job-runner"
import { createSupabaseDataStore } from "./datastore/supabase"
import { createSupabaseFileStorage } from "./storage/supabase"

function readPayload() {
  const payloadEnv = process.env.JOB_PAYLOAD
  if (payloadEnv) {
    return JSON.parse(payloadEnv)
  }

  return new Promise((resolve, reject) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      data += chunk
    })
    process.stdin.on("end", () => {
      if (!data) resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function main() {
  const payload = await readPayload()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }

  const dataStore = createSupabaseDataStore({ url, serviceRoleKey: key })
  const fileStorage = createSupabaseFileStorage({ url, serviceRoleKey: key })

  if (payload?.type === "EXPORT_REPORT") {
    await processReportExportJob(payload, { dataStore, fileStorage })
    return
  }

  await processQuestionnaireJob(payload, { dataStore, fileStorage })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
