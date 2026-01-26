"use client"

import React from "react"
import { Button, Field, FieldGroup, Fieldset, Heading, Input, Text } from "@tuesdaytrust/ui"
import { acceptOrgInvite } from "../../lib/api"
import { useSession } from "../../lib/use-auth"

export default function AcceptInvitePage() {
  const { session } = useSession()
  const [token, setToken] = React.useState("")
  const [status, setStatus] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    const result = await acceptOrgInvite(token.trim())
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setStatus("Invite accepted. You can switch workspaces from the sidebar.")
    setToken("")
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Accept invite
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Sign in to accept an invite.
        </Text>
        <Button color="dark" href="/sign-in">
          Go to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Heading level={1} className="text-zinc-950 dark:text-white">
        Accept invite
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Paste the invite token you received from an admin.
      </Text>
      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Invite token</label>
              <Input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="invite token"
              />
            </Field>
            <Button color="dark" type="submit" disabled={!token.trim()}>
              Accept invite
            </Button>
          </FieldGroup>
        </form>
        {status ? <Text className="mt-3 text-sm text-amber-600">{status}</Text> : null}
      </Fieldset>
    </div>
  )
}
