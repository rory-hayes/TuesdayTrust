"use client"

import * as Headless from "@headlessui/react"
import React from "react"
import { usePathname } from "next/navigation"
import {
  Heading,
  Navbar,
  NavbarItem,
  NavbarLabel,
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  Select,
  Button,
  Text
} from "@tuesdaytrust/ui"
import { supabase } from "../lib/supabase"
import { useWorkspace } from "../lib/use-workspace"

function OpenMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
    </svg>
  )
}

function CloseMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function MobileSidebar({ open, close, children }: React.PropsWithChildren<{ open: boolean; close: () => void }>) {
  return (
    <Headless.Dialog open={open} onClose={close} className="lg:hidden">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <Headless.DialogPanel
        transition
        className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full"
      >
        <div className="flex h-full flex-col rounded-lg bg-white shadow-xs ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
          <div className="-mb-3 px-4 pt-3">
            <NavbarItem onClick={close} aria-label="Close navigation">
              <CloseMenuIcon />
            </NavbarItem>
          </div>
          {children}
        </div>
      </Headless.DialogPanel>
    </Headless.Dialog>
  )
}

const navItems = [
  { label: "Inbox", href: "/inbox" },
  { label: "Upload", href: "/upload" },
  { label: "Review", href: "/review/sample" },
  { label: "Live Question Mode", href: "/live-question" },
  { label: "Answer Library", href: "/answers" },
  { label: "Evidence", href: "/evidence" },
  { label: "Analytics", href: "/analytics" },
  { label: "Trust Center", href: "/trust-center", requiresFeature: "trust_center_enabled" },
  { label: "Settings", href: "/settings" }
]

function ShellLayout({ children }: React.PropsWithChildren) {
  const pathname = usePathname()
  const [showSidebar, setShowSidebar] = React.useState(false)
  const { me, workspaceId, setWorkspaceId, features } = useWorkspace()

  const sidebar = (
    <Sidebar className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white">
      <SidebarHeader className="border-b border-zinc-950/10 dark:border-white/10">
        <Heading level={3} className="text-zinc-950 dark:text-white">
          TuesdayTrust
        </Heading>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          Governed answers for trust reviews
        </Text>
        <div className="mt-4 space-y-2">
          <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Workspace
          </Text>
          <Select
            value={workspaceId ?? ""}
            onChange={(event) => setWorkspaceId(event.target.value)}
            disabled={!me || me.workspaces.length === 0}
          >
            {(me?.workspaces ?? []).map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.org_name} • {workspace.name}
              </option>
            ))}
          </Select>
          {!me || me.workspaces.length === 0 ? (
            <Text className="text-xs text-amber-600">No workspace yet.</Text>
          ) : null}
        </div>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          {navItems.map((item) => {
            const featureKey = item.requiresFeature as "trust_center_enabled" | undefined
            const isEnabled = !featureKey || Boolean(features?.[featureKey])
            if (!isEnabled) {
              return (
                <SidebarItem
                  key={item.href}
                  disabled
                  className="opacity-60"
                  aria-disabled="true"
                >
                  <SidebarLabel>{item.label}</SidebarLabel>
                </SidebarItem>
              )
            }
            return (
              <SidebarItem
                key={item.href}
                href={item.href}
                current={pathname === item.href}
              >
                <SidebarLabel>{item.label}</SidebarLabel>
              </SidebarItem>
            )
          })}
        </SidebarSection>
      </SidebarBody>
      <SidebarFooter>
        <SidebarSection>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            {me?.user.email ?? "No active session"}
          </Text>
          <Button
            outline
            onClick={() => supabase.auth.signOut()}
            disabled={!me?.user.email}
          >
            Sign out
          </Button>
        </SidebarSection>
      </SidebarFooter>
    </Sidebar>
  )

  const navbar = (
    <Navbar>
      <NavbarLabel className="text-zinc-950 dark:text-white">TuesdayTrust</NavbarLabel>
    </Navbar>
  )

  return (
    <div className="relative isolate flex min-h-svh w-full bg-zinc-100 max-lg:flex-col dark:bg-zinc-950">
      <div className="fixed inset-y-0 left-0 w-64 max-lg:hidden">{sidebar}</div>
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      <header className="flex items-center px-4 lg:hidden">
        <div className="py-2.5">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div className="min-w-0 flex-1">{navbar}</div>
      </header>

      <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pt-2 lg:pr-2 lg:pl-64">
        <div className="grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/10 dark:lg:bg-zinc-900 dark:lg:ring-white/10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  )
}

export function AppShell({ children }: React.PropsWithChildren) {
  const pathname = usePathname()
  const isAuthRoute = pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/accept-invite") ||
    pathname?.startsWith("/trust-center/public")

  if (isAuthRoute) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
        <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xs ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
          {children}
        </div>
      </div>
    )
  }

  return <ShellLayout>{children}</ShellLayout>
}
