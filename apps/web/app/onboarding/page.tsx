"use client"

import React from "react"
import { Button, Field, FieldGroup, Fieldset, Heading, Input, Text } from "@tuesdaytrust/ui"
import { createOnboarding } from "../../lib/api"
import { useMe } from "../../lib/use-auth"

export default function OnboardingPage() {
  const { session, data: me } = useMe()
  const [orgName, setOrgName] = React.useState("")
  const [workspaceName, setWorkspaceName] = React.useState("")
  const [status, setStatus] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    const result = await createOnboarding(orgName.trim(), workspaceName.trim())
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setStatus("Workspace created. You can start uploading questionnaires.")
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Onboarding
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Sign in to create your org and workspace.
        </Text>
        <Button color="dark" href="/sign-in">
          Go to sign in
        </Button>
      </div>
    )
  }

  if (me && me.orgs.length > 0) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Onboarding complete
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          You already belong to an organization.
        </Text>
        <Button color="dark" href="/inbox">
          Go to inbox
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Heading level={1} className="text-zinc-950 dark:text-white">
        Create your workspace
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Start with a workspace and invite your team.
      </Text>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Organization name</label>
              <Input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Security"
              />
            </Field>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Workspace name</label>
              <Input
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Primary workspace"
              />
            </Field>
            <Button color="dark" type="submit" disabled={!orgName.trim() || !workspaceName.trim()}>
              Create workspace
            </Button>
          </FieldGroup>
        </form>
        {status ? <Text className="mt-3 text-sm text-amber-600">{status}</Text> : null}
      </Fieldset>
    </div>
  )
}
