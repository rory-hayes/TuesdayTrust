"use client"

import React from "react"
import {
  Button,
  Field,
  FieldGroup,
  Fieldset,
  Heading,
  Input,
  Text
} from "@tuesdaytrust/ui"
import { createQuestionnaire, createSignedUploadUrl } from "../lib/api"
import { DOCX_MIME_TYPE, PDF_MIME_TYPE, XLSX_MIME_TYPE } from "@tuesdaytrust/shared"

type UploadStatus = "idle" | "signing" | "uploading" | "creating" | "done" | "error"

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function getRandomId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `q_${Math.random().toString(16).slice(2)}`
}

function inferMimeType(file: File) {
  if (file.type) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith(".xlsx")) return XLSX_MIME_TYPE
  if (name.endsWith(".docx")) return DOCX_MIME_TYPE
  if (name.endsWith(".pdf")) return PDF_MIME_TYPE
  return "application/octet-stream"
}

export function UploadForm({
  disabled = false,
  workspaceId: initialWorkspaceId = ""
}: {
  disabled?: boolean
  workspaceId?: string
}) {
  const [title, setTitle] = React.useState("")
  const [workspaceId, setWorkspaceId] = React.useState(initialWorkspaceId)
  const [file, setFile] = React.useState<File | null>(null)
  const [status, setStatus] = React.useState<UploadStatus>("idle")
  const [message, setMessage] = React.useState<string | null>(null)
  const [jobId, setJobId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (initialWorkspaceId) {
      setWorkspaceId(initialWorkspaceId)
    }
  }, [initialWorkspaceId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setJobId(null)

    if (disabled) {
      setStatus("error")
      setMessage("Your role does not permit uploads.")
      return
    }

    if (!file || !workspaceId.trim() || !title.trim()) {
      setStatus("error")
      setMessage("Title, workspace ID, and XLSX, DOCX, or PDF file are required.")
      return
    }

    try {
      setStatus("signing")
      const questionnaireId = getRandomId()
      const signed = await createSignedUploadUrl({
        workspace_id: workspaceId.trim(),
        questionnaire_id: questionnaireId,
        input_file: {
          file_name: file.name,
          mime_type: inferMimeType(file),
          size_bytes: file.size
        }
      })

      if (signed.error || !signed.data) {
        throw new Error(signed.error?.message ?? "Failed to sign upload URL")
      }

      setStatus("uploading")
      const uploadResponse = await fetch(signed.data.input_file.signed_url, {
        method: "PUT",
        headers: {
          "Content-Type": signed.data.input_file.mime_type
        },
        body: file
      })

      if (!uploadResponse.ok) {
        throw new Error("Upload failed")
      }

      setStatus("creating")
      const checksum = await sha256Hex(file)
      const created = await createQuestionnaire({
        questionnaire_id: signed.data.questionnaire_id,
        workspace_id: workspaceId.trim(),
        title: title.trim(),
        input_file: {
          bucket: signed.data.input_file.bucket,
          path: signed.data.input_file.path,
          file_name: signed.data.input_file.file_name,
          mime_type: signed.data.input_file.mime_type,
          size_bytes: signed.data.input_file.size_bytes,
          checksum_sha256: checksum
        }
      })

      if (created.error || !created.data) {
        throw new Error(created.error?.message ?? "Failed to create questionnaire")
      }

      setStatus("done")
      setJobId(created.data.job_id)
      setMessage("Upload complete. Processing has started.")
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Upload failed")
    }
  }

  return (
    <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Heading level={3} className="text-zinc-950 dark:text-white">
        Step 1 — Upload XLSX, DOCX, or PDF
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Files are uploaded via short-lived signed URLs. Nothing is public.
      </Text>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Workspace ID</label>
            <Input
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder="Workspace UUID"
              disabled={disabled || Boolean(initialWorkspaceId)}
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Questionnaire title</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Acme Security Questionnaire"
              disabled={disabled}
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Questionnaire file</label>
            <Input
              type="file"
              accept=".xlsx,.docx,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              disabled={disabled}
            />
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Max 500 questions. XLSX, DOCX, and PDF supported.
            </Text>
          </Field>
          <Button
            color="dark"
            type="submit"
            disabled={disabled || status === "signing" || status === "uploading" || status === "creating"}
          >
            {status === "signing" && "Signing upload URL..."}
            {status === "uploading" && "Uploading file..."}
            {status === "creating" && "Starting job..."}
            {status === "idle" && "Generate upload URL"}
            {status === "done" && "Upload complete"}
            {status === "error" && "Retry upload"}
          </Button>
          {message && (
            <Text className={status === "error" ? "text-red-600" : "text-zinc-500 dark:text-zinc-400"}>
              {message}
              {jobId ? ` Job ID: ${jobId}` : ""}
            </Text>
          )}
        </FieldGroup>
      </form>
    </Fieldset>
  )
}
