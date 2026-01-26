"use client"

import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
  Heading,
  Text
} from "@tuesdaytrust/ui"
import { UploadForm } from "../../components/upload-form"
import { canUploadQuestionnaires } from "../../lib/permissions"
import { useWorkspace } from "../../lib/use-workspace"

export default function UploadPage() {
  const { role, workspaceId } = useWorkspace()
  const canUpload = canUploadQuestionnaires(role)

  return (
    <div className="space-y-10">
      <div>
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Upload Wizard
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Start with a questionnaire upload. TuesdayTrust processes asynchronously and
          keeps you in control of every answer.
        </Text>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <UploadForm disabled={!canUpload || !workspaceId} workspaceId={workspaceId ?? ""} />
          {!workspaceId ? (
            <Text className="text-sm text-amber-600">
              Select a workspace before uploading.
            </Text>
          ) : null}
          {!canUpload ? (
            <Text className="text-sm text-amber-600">
              Your role does not permit questionnaire uploads.
            </Text>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <Heading level={4} className="text-zinc-950 dark:text-white">
              Processing Status
            </Heading>
            <DescriptionList>
              <DescriptionTerm>Status</DescriptionTerm>
              <DescriptionDetails>Queued</DescriptionDetails>
              <DescriptionTerm>Next action</DescriptionTerm>
              <DescriptionDetails>Upload file via signed URL</DescriptionDetails>
              <DescriptionTerm>System state</DescriptionTerm>
              <DescriptionDetails>No automation without review</DescriptionDetails>
            </DescriptionList>
          </div>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <Heading level={4} className="text-zinc-950 dark:text-white">
              Review Readiness
            </Heading>
            <DescriptionList>
              <DescriptionTerm>Auto-fill</DescriptionTerm>
              <DescriptionDetails>0</DescriptionDetails>
              <DescriptionTerm>Needs review</DescriptionTerm>
              <DescriptionDetails>0</DescriptionDetails>
              <DescriptionTerm>Manual</DescriptionTerm>
              <DescriptionDetails>0</DescriptionDetails>
            </DescriptionList>
          </div>
        </div>
      </div>
    </div>
  )
}
