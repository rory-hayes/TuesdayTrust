"use client"

import React from "react"
import {
  Button,
  Divider,
  Field,
  FieldGroup,
  Fieldset,
  Heading,
  Input,
  Select,
  Switch,
  SwitchField,
  SwitchGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text
} from "@tuesdaytrust/ui"
import { OrgRole } from "@tuesdaytrust/shared"
import {
  acceptOrgInvite,
  createOrgInvite,
  createWorkspace,
  fetchOrgUsage,
  fetchOrgInvites,
  fetchOrgMembers,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  fetchOrgSettings,
  updateOrgSettings,
  updateOrgMemberRole,
  removeOrgMember,
  type OrgInvite,
  type OrgMember,
  type OrgSettingsResponse,
  type OrgUsageResponse,
  type WorkspaceMember
} from "../../lib/api"
import { canAccessSettings } from "../../lib/permissions"
import { useWorkspace } from "../../lib/use-workspace"

export default function SettingsPage() {
  const { orgId, workspace, role, me } = useWorkspace()
  const canManage = canAccessSettings(role)
  const workspaceRoleOptions = Object.values(OrgRole)

  const [members, setMembers] = React.useState<OrgMember[]>([])
  const [invites, setInvites] = React.useState<OrgInvite[]>([])
  const [settings, setSettings] = React.useState<OrgSettingsResponse | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState("EDITOR")
  const [inviteToken, setInviteToken] = React.useState("")

  const [newWorkspaceName, setNewWorkspaceName] = React.useState("")

  const [limitForm, setLimitForm] = React.useState({
    max_upload_bytes: "",
    max_questions: "",
    max_active_jobs: "",
    monthly_token_budget: ""
  })

  const [ssoForm, setSsoForm] = React.useState({
    enabled: false,
    provider: "",
    domain: "",
    metadata_url: ""
  })

  const [featureForm, setFeatureForm] = React.useState({
    trust_center_enabled: false,
    consultant_mode_enabled: false
  })
  const [usage, setUsage] = React.useState<OrgUsageResponse | null>(null)
  const [memberRoles, setMemberRoles] = React.useState<Record<string, string>>({})
  const [workspaceMembers, setWorkspaceMembers] = React.useState<WorkspaceMember[]>([])
  const [managedWorkspaceId, setManagedWorkspaceId] = React.useState<string>("")
  const [workspaceMemberToAdd, setWorkspaceMemberToAdd] = React.useState<string>("")
  const [workspaceRoleToAdd, setWorkspaceRoleToAdd] = React.useState<string>(OrgRole.VIEWER)
  const [workspaceStatus, setWorkspaceStatus] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!orgId) return
    if (!canManage) return
    void (async () => {
      const [membersRes, invitesRes, settingsRes, usageRes] = await Promise.all([
        fetchOrgMembers(orgId),
        fetchOrgInvites(orgId),
        fetchOrgSettings(orgId),
        fetchOrgUsage(orgId)
      ])
      if (!membersRes.error && membersRes.data) setMembers(membersRes.data.members)
      if (!invitesRes.error && invitesRes.data) setInvites(invitesRes.data.invites)
      if (!settingsRes.error && settingsRes.data) {
        setSettings(settingsRes.data)
      }
      if (!usageRes.error && usageRes.data) {
        setUsage(usageRes.data)
      }
    })()
  }, [orgId, canManage])

  React.useEffect(() => {
    const nextRoles: Record<string, string> = {}
    for (const member of members) {
      nextRoles[member.user_id] = member.role
    }
    setMemberRoles(nextRoles)
  }, [members])

  React.useEffect(() => {
    if (workspace?.id) {
      setManagedWorkspaceId(workspace.id)
    }
  }, [workspace?.id])

  React.useEffect(() => {
    if (!workspaceMemberToAdd) return
    const defaultRole = memberRoles[workspaceMemberToAdd] ?? OrgRole.VIEWER
    setWorkspaceRoleToAdd(defaultRole)
  }, [workspaceMemberToAdd, memberRoles])

  React.useEffect(() => {
    if (!orgId || !managedWorkspaceId || !canManage) return
    if (!featureForm.consultant_mode_enabled) {
      setWorkspaceMembers([])
      return
    }
    void (async () => {
      const membersRes = await fetchWorkspaceMembers(managedWorkspaceId)
      if (membersRes.error) {
        setWorkspaceStatus(membersRes.error.message)
        return
      }
      setWorkspaceStatus(null)
      setWorkspaceMembers(membersRes.data?.members ?? [])
    })()
  }, [orgId, managedWorkspaceId, canManage, featureForm.consultant_mode_enabled])

  React.useEffect(() => {
    if (!settings?.limits) return
    setLimitForm({
      max_upload_bytes: settings.limits.max_upload_bytes?.toString() ?? "",
      max_questions: settings.limits.max_questions?.toString() ?? "",
      max_active_jobs: settings.limits.max_active_jobs?.toString() ?? "",
      monthly_token_budget: settings.limits.monthly_token_budget?.toString() ?? ""
    })
  }, [settings?.limits])

  React.useEffect(() => {
    if (!settings?.sso) return
    setSsoForm({
      enabled: settings.sso.enabled ?? false,
      provider: settings.sso.provider ?? "",
      domain: settings.sso.domain ?? "",
      metadata_url: settings.sso.metadata_url ?? ""
    })
  }, [settings?.sso])

  React.useEffect(() => {
    if (!settings?.features) return
    setFeatureForm({
      trust_center_enabled: settings.features.trust_center_enabled ?? false,
      consultant_mode_enabled: settings.features.consultant_mode_enabled ?? false
    })
  }, [settings?.features])

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orgId) return
    setStatus(null)
    const result = await createOrgInvite(orgId, inviteEmail, inviteRole)
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setInviteToken(result.data?.invite.token ?? "")
    setInviteEmail("")
    if (result.data?.invite) {
      setInvites((prev) => [result.data!.invite, ...prev])
    }
  }

  async function handleAcceptInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus(null)
    const result = await acceptOrgInvite(inviteToken.trim())
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setStatus("Invite accepted.")
    setInviteToken("")
  }

  async function handleWorkspaceCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orgId || !newWorkspaceName.trim()) return
    setStatus(null)
    const result = await createWorkspace(orgId, newWorkspaceName.trim())
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setStatus("Workspace created.")
    setNewWorkspaceName("")
  }

  async function handleMemberRoleUpdate(userId: string) {
    if (!orgId) return
    const nextRole = memberRoles[userId]
    if (!nextRole) return
    setStatus(null)
    const result = await updateOrgMemberRole(orgId, userId, nextRole)
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    if (result.data?.member) {
      setMembers((prev) =>
        prev.map((member) =>
          member.user_id === userId ? { ...member, role: result.data!.member.role } : member
        )
      )
      setWorkspaceMembers((prev) =>
        prev.map((member) =>
          member.user_id === userId ? { ...member, role: result.data!.member.role } : member
        )
      )
    }
    setStatus("Member role updated.")
  }

  async function handleMemberRemove(userId: string) {
    if (!orgId) return
    setStatus(null)
    const result = await removeOrgMember(orgId, userId)
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setMembers((prev) => prev.filter((member) => member.user_id !== userId))
    setWorkspaceMembers((prev) => prev.filter((member) => member.user_id !== userId))
    setStatus("Member removed.")
  }

  async function handleWorkspaceMemberAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!managedWorkspaceId || !workspaceMemberToAdd.trim()) return
    setWorkspaceStatus(null)
    const result = await addWorkspaceMember(
      managedWorkspaceId,
      workspaceMemberToAdd.trim(),
      workspaceRoleToAdd
    )
    if (result.error) {
      setWorkspaceStatus(result.error.message)
      return
    }
    if (result.data?.member) {
      setWorkspaceMembers((prev) => [...prev, result.data!.member])
    }
    setWorkspaceMemberToAdd("")
    setWorkspaceRoleToAdd(OrgRole.VIEWER)
  }

  async function handleWorkspaceMemberRoleUpdate(userId: string, nextRole: string) {
    if (!managedWorkspaceId) return
    setWorkspaceStatus(null)
    const result = await updateWorkspaceMemberRole(managedWorkspaceId, userId, nextRole)
    if (result.error) {
      setWorkspaceStatus(result.error.message)
      return
    }
    if (result.data?.member) {
      setWorkspaceMembers((prev) =>
        prev.map((member) =>
          member.user_id === userId ? { ...member, role: result.data!.member.role } : member
        )
      )
    }
    setWorkspaceStatus("Workspace member role updated.")
  }

  async function handleWorkspaceMemberRemove(userId: string) {
    if (!managedWorkspaceId) return
    setWorkspaceStatus(null)
    const result = await removeWorkspaceMember(managedWorkspaceId, userId)
    if (result.error) {
      setWorkspaceStatus(result.error.message)
      return
    }
    setWorkspaceMembers((prev) => prev.filter((member) => member.user_id !== userId))
  }

  async function handleSaveSettings() {
    if (!orgId) return
    setStatus(null)
    const payload = {
      limits: {
        max_upload_bytes: limitForm.max_upload_bytes ? Number(limitForm.max_upload_bytes) : null,
        max_questions: limitForm.max_questions ? Number(limitForm.max_questions) : null,
        max_active_jobs: limitForm.max_active_jobs ? Number(limitForm.max_active_jobs) : null,
        monthly_token_budget: limitForm.monthly_token_budget ? Number(limitForm.monthly_token_budget) : null
      },
      sso: {
        enabled: ssoForm.enabled,
        provider: ssoForm.provider,
        domain: ssoForm.domain,
        metadata_url: ssoForm.metadata_url
      },
      features: {
        trust_center_enabled: featureForm.trust_center_enabled,
        consultant_mode_enabled: featureForm.consultant_mode_enabled
      }
    }
    const result = await updateOrgSettings(orgId, payload)
    if (result.error) {
      setStatus(result.error.message)
      return
    }
    setStatus("Settings saved.")
  }

  const orgWorkspaces = React.useMemo(
    () => (me?.workspaces ?? []).filter((item) => item.org_id === orgId),
    [me?.workspaces, orgId]
  )
  const availableWorkspaceMembers = members.filter(
    (member) => !workspaceMembers.some((wm) => wm.user_id === member.user_id)
  )

  if (!canManage) {
    return (
      <div className="space-y-4">
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Settings
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Admin role required to update settings.
        </Text>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div>
        <Heading level={1} className="text-zinc-950 dark:text-white">
          Settings
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Manage workspace identity, access roles, and cost controls.
        </Text>
      </div>

      {status ? (
        <Text className="text-sm text-amber-600">{status}</Text>
      ) : null}

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">
          Workspace
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Current workspace: {workspace?.name ?? "None"}
        </Text>
        <form className="mt-4" onSubmit={handleWorkspaceCreate}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">New workspace name</label>
              <Input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Client Workspace"
              />
            </Field>
            <Button color="dark" type="submit" disabled={!orgId}>
              Create workspace
            </Button>
          </FieldGroup>
        </form>
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">
          Members
        </Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Invite teammates and assign roles.
        </Text>
        <Divider className="my-4 border-zinc-950/10 dark:border-white/10" />
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>User ID</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.user_id}>
                <TableCell>{member.user_id}</TableCell>
                <TableCell>
                  <Select
                    value={memberRoles[member.user_id] ?? member.role}
                    onChange={(event) =>
                      setMemberRoles((prev) => ({ ...prev, [member.user_id]: event.target.value }))
                    }
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="EDITOR">Editor</option>
                    <option value="REVIEWER">Reviewer</option>
                    <option value="VIEWER">Viewer</option>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button outline onClick={() => handleMemberRoleUpdate(member.user_id)}>
                      Update role
                    </Button>
                    <Button outline onClick={() => handleMemberRemove(member.user_id)}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form className="mt-4" onSubmit={handleInviteSubmit}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Invite email</label>
              <Input
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Role</label>
              <Select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                <option value="ADMIN">Admin</option>
                <option value="EDITOR">Editor</option>
                <option value="REVIEWER">Reviewer</option>
                <option value="VIEWER">Viewer</option>
              </Select>
            </Field>
            <Button color="dark" type="submit" disabled={!inviteEmail.trim()}>
              Create invite
            </Button>
          </FieldGroup>
        </form>
        {invites.length > 0 ? (
          <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {invites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-1 rounded-lg border border-zinc-950/10 p-3 dark:border-white/10">
                <Text className="text-sm font-medium text-zinc-950 dark:text-white">{invite.email}</Text>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Role: {invite.role} • Token: {invite.token}
                </Text>
              </div>
            ))}
          </div>
        ) : null}
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">Accept invite</Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Paste an invite token to join a new org.
        </Text>
        <form className="mt-4" onSubmit={handleAcceptInvite}>
          <FieldGroup>
            <Field>
              <label className="text-sm font-medium text-zinc-950 dark:text-white">Invite token</label>
              <Input
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
                placeholder="invite token"
              />
            </Field>
            <Button outline type="submit" disabled={!inviteToken.trim()}>
              Accept invite
            </Button>
          </FieldGroup>
        </form>
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">Workspace access</Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Manage which org members can access each workspace (consultant mode).
        </Text>
        {!featureForm.consultant_mode_enabled ? (
          <Text className="mt-3 text-sm text-amber-600">
            Enable consultant mode to manage workspace access.
          </Text>
        ) : (
          <>
            {workspaceStatus ? (
              <Text className="mt-3 text-sm text-amber-600">{workspaceStatus}</Text>
            ) : null}
            <FieldGroup className="mt-4">
              <Field>
                <label className="text-sm font-medium text-zinc-950 dark:text-white">Workspace</label>
                <Select
                  value={managedWorkspaceId}
                  onChange={(event) => setManagedWorkspaceId(event.target.value)}
                  disabled={orgWorkspaces.length === 0}
                >
                  {orgWorkspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGroup>

            <Table className="mt-4">
              <TableHead>
                <TableRow>
                  <TableHeader>User ID</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {workspaceMembers.map((member) => (
                  <TableRow key={`${managedWorkspaceId}-${member.user_id}`}>
                    <TableCell>{member.user_id}</TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onChange={(event) =>
                          handleWorkspaceMemberRoleUpdate(member.user_id, event.target.value)
                        }
                        disabled={!canManage}
                      >
                        {workspaceRoleOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button outline onClick={() => handleWorkspaceMemberRemove(member.user_id)}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <form className="mt-4" onSubmit={handleWorkspaceMemberAdd}>
              <FieldGroup>
                <Field>
                  <label className="text-sm font-medium text-zinc-950 dark:text-white">Add member</label>
                  <Select
                    value={workspaceMemberToAdd}
                    onChange={(event) => setWorkspaceMemberToAdd(event.target.value)}
                    disabled={availableWorkspaceMembers.length === 0}
                  >
                    <option value="">Select a member</option>
                    {availableWorkspaceMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.user_id}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <label className="text-sm font-medium text-zinc-950 dark:text-white">Role</label>
                  <Select
                    value={workspaceRoleToAdd}
                    onChange={(event) => setWorkspaceRoleToAdd(event.target.value)}
                    disabled={!workspaceMemberToAdd}
                  >
                    {workspaceRoleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button outline type="submit" disabled={!workspaceMemberToAdd.trim()}>
                  Grant access
                </Button>
              </FieldGroup>
            </form>
          </>
        )}
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">Limits and budgets</Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Configure org-wide limits and monthly token budget. Empty fields use defaults.
        </Text>
        {usage ? (
          <div className="mt-4 rounded-lg border border-zinc-950/10 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-400">
            <div className="flex flex-wrap gap-6">
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Period start</Text>
                <Text className="text-sm text-zinc-950 dark:text-white">{usage.period_start}</Text>
              </div>
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tokens used</Text>
                <Text className="text-sm text-zinc-950 dark:text-white">{usage.tokens_used}</Text>
              </div>
              <div>
                <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Budget remaining</Text>
                <Text className="text-sm text-zinc-950 dark:text-white">
                  {usage.budget_remaining ?? "No budget set"}
                </Text>
              </div>
            </div>
          </div>
        ) : null}
        <FieldGroup>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Max upload bytes</label>
            <Input
              value={limitForm.max_upload_bytes}
              onChange={(event) => setLimitForm((prev) => ({ ...prev, max_upload_bytes: event.target.value }))}
              placeholder="10485760"
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Max questions</label>
            <Input
              value={limitForm.max_questions}
              onChange={(event) => setLimitForm((prev) => ({ ...prev, max_questions: event.target.value }))}
              placeholder="500"
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Max active jobs</label>
            <Input
              value={limitForm.max_active_jobs}
              onChange={(event) => setLimitForm((prev) => ({ ...prev, max_active_jobs: event.target.value }))}
              placeholder="3"
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Monthly token budget</label>
            <Input
              value={limitForm.monthly_token_budget}
              onChange={(event) => setLimitForm((prev) => ({ ...prev, monthly_token_budget: event.target.value }))}
              placeholder="500000"
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">Single Sign-On (SSO)</Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Store SSO settings (scaffold only; enforcement not active).
        </Text>
        <SwitchGroup className="mt-4">
          <SwitchField>
            <Text data-slot="label" className="text-sm text-zinc-950 dark:text-white">Enable SSO</Text>
            <Switch checked={ssoForm.enabled} onChange={(value) => setSsoForm((prev) => ({ ...prev, enabled: value }))} />
          </SwitchField>
        </SwitchGroup>
        <FieldGroup className="mt-4">
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Provider</label>
            <Input
              value={ssoForm.provider}
              onChange={(event) => setSsoForm((prev) => ({ ...prev, provider: event.target.value }))}
              placeholder="SAML"
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Domain</label>
            <Input
              value={ssoForm.domain}
              onChange={(event) => setSsoForm((prev) => ({ ...prev, domain: event.target.value }))}
              placeholder="acme.com"
            />
          </Field>
          <Field>
            <label className="text-sm font-medium text-zinc-950 dark:text-white">Metadata URL</label>
            <Input
              value={ssoForm.metadata_url}
              onChange={(event) => setSsoForm((prev) => ({ ...prev, metadata_url: event.target.value }))}
              placeholder="https://idp.example.com/metadata"
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Fieldset className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Heading level={3} className="text-zinc-950 dark:text-white">Trust Center</Heading>
        <Text className="text-zinc-500 dark:text-zinc-400">
          Gate access to the Trust Center module.
        </Text>
        <SwitchGroup className="mt-4">
          <SwitchField>
            <Text data-slot="label" className="text-sm text-zinc-950 dark:text-white">Enable Trust Center</Text>
            <Switch
              checked={featureForm.trust_center_enabled}
              onChange={(value) => setFeatureForm((prev) => ({ ...prev, trust_center_enabled: value }))}
            />
          </SwitchField>
          <SwitchField>
            <Text data-slot="label" className="text-sm text-zinc-950 dark:text-white">Consultant mode</Text>
            <Switch
              checked={featureForm.consultant_mode_enabled}
              onChange={(value) => setFeatureForm((prev) => ({ ...prev, consultant_mode_enabled: value }))}
            />
          </SwitchField>
        </SwitchGroup>
      </Fieldset>

      <Button color="dark" onClick={handleSaveSettings} disabled={!orgId}>
        Save settings
      </Button>
    </div>
  )
}
