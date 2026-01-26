"use client"

import React from "react"
import { OrgRole } from "@tuesdaytrust/shared"
import { useMe } from "./use-auth"

function toOrgRole(role?: string | null) {
  const values = Object.values(OrgRole)
  if (role && values.includes(role as OrgRole)) {
    return role as OrgRole
  }
  return OrgRole.VIEWER
}

export function useWorkspace() {
  const { data: me, loading, refresh } = useMe()
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!me || me.workspaces.length === 0) return
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("tt:workspace") : null
    const preferred = me.workspaces.find((workspace) => workspace.id === stored)
    const nextWorkspace = preferred ?? me.workspaces[0]
    setWorkspaceId(nextWorkspace.id)
  }, [me])

  React.useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return
    window.localStorage.setItem("tt:workspace", workspaceId)
  }, [workspaceId])

  const workspace =
    me?.workspaces.find((item) => item.id === workspaceId) ?? me?.workspaces[0] ?? null
  const orgId = workspace?.org_id ?? null
  const role = toOrgRole(
    me?.memberships.find((membership) => membership.org_id === orgId)?.role ?? null
  )
  const features = orgId ? me?.features[orgId] ?? null : null

  return {
    loading,
    me,
    workspace,
    orgId,
    role,
    features,
    workspaceId,
    setWorkspaceId,
    refreshMe: refresh
  }
}
