"use client"

import React from "react"
import { Button, Field, FieldGroup, Fieldset, Heading, Input, Text } from "@tuesdaytrust/ui"
import { supabase } from "../../lib/supabase"
import { useSession } from "../../lib/use-auth"

export default function SignInPage() {
  const { session } = useSession()
  const [email, setEmail] = React.useState("")
  const [status, setStatus] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    if (!email.trim()) return

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin
      }
    })

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus("Check your email for a sign-in link.")
  }

  return (
    <div className="space-y-6">
      <Heading level={1} className="text-zinc-950 dark:text-white">
        Sign in
      </Heading>
      <Text className="text-zinc-500 dark:text-zinc-400">
        Use your work email to access TuesdayTrust.
      </Text>

      {session ? (
        <Text className="text-sm text-emerald-600">You are already signed in.</Text>
      ) : null}

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Button color="dark" type="submit" disabled={!email.trim()}>
              Send magic link
            </Button>
          </FieldGroup>
        </form>
        {status ? (
          <Text className="mt-3 text-sm text-amber-600">{status}</Text>
        ) : null}
      </Fieldset>
    </div>
  )
}
