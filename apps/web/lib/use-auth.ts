"use client"

import React from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { fetchMe, type MeResponse } from "./api"

const IS_E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true"

const TEST_ME: MeResponse = {
  user: { id: "user-1", email: "user-1@example.com" },
  memberships: [{ org_id: "org-1", role: "ADMIN" }],
  orgs: [{ id: "org-1", name: "Acme" }],
  workspaces: [{ id: "ws-1", org_id: "org-1", name: "Primary", org_name: "Acme" }],
  features: { "org-1": { trust_center_enabled: true, consultant_mode_enabled: true } }
}

function buildTestSession(): Session {
  return {
    access_token: "e2e-token",
    refresh_token: "e2e-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: TEST_ME.user as User
  } as Session
}

export function useSession() {
  const [session, setSession] = React.useState<Session | null>(
    IS_E2E_TEST_MODE ? buildTestSession() : null
  )
  const [loading, setLoading] = React.useState(!IS_E2E_TEST_MODE)

  React.useEffect(() => {
    if (IS_E2E_TEST_MODE) return
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setSession(null)
        setLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}

export function useMe() {
  const { session, user, loading: sessionLoading } = useSession()
  const [data, setData] = React.useState<MeResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (IS_E2E_TEST_MODE) {
      setError(null)
      setData(TEST_ME)
      return
    }
    if (!session) {
      setData(null)
      return
    }
    setLoading(true)
    const result = await fetchMe()
    if (result.error) {
      setError(result.error.message)
      setData(null)
    } else {
      setError(null)
      setData(result.data)
    }
    setLoading(false)
  }, [session])

  React.useEffect(() => {
    if (sessionLoading) return
    void load()
  }, [sessionLoading, load])

  return {
    session,
    user: user as User | null,
    data,
    loading: sessionLoading || loading,
    error,
    refresh: load
  }
}
