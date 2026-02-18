'use client';

import { Button, EmptyState, Input, PageShell, StatusPill } from '@evidenceq/ui';
import { useEffect, useMemo, useState } from 'react';

import {
  getAccountSummary,
  runRetentionPurge,
  updateRetentionDays,
  type AccountSummary
} from '../../lib/api';
import { integrationStatus } from '../../lib/integrations';
import { appNavigation } from '../../lib/navigation';

export function AccountView() {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [retentionDaysInput, setRetentionDaysInput] = useState('90');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningPurge, setIsRunningPurge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = summary?.member.role === 'OWNER';

  const loadSummary = async () => {
    setIsLoading(true);
    try {
      const accountSummary = await getAccountSummary();
      setSummary(accountSummary);
      setRetentionDaysInput(String(accountSummary.org.retentionDays));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load account settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const subtitle = useMemo(() => {
    if (isLoading) {
      return 'Loading account settings...';
    }

    if (!summary) {
      return 'Account settings unavailable';
    }

    return `Org: ${summary.org.name} • Role: ${summary.member.role}`;
  }, [isLoading, summary]);

  const saveRetention = async () => {
    const nextValue = Number(retentionDaysInput);
    if (!Number.isFinite(nextValue)) {
      setError('Retention days must be a number');
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const response = await updateRetentionDays(nextValue);
      setSummary((current) =>
        current
          ? {
              ...current,
              org: response.org
            }
          : current
      );
      setNotice(`Retention updated to ${response.org.retentionDays} days.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update retention');
    } finally {
      setIsSaving(false);
    }
  };

  const triggerPurge = async () => {
    setIsRunningPurge(true);
    setNotice(null);
    setError(null);

    try {
      const response = await runRetentionPurge(false);
      setNotice(`Retention purge queued (job ${response.jobId}).`);
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : 'Failed to queue retention purge');
    } finally {
      setIsRunningPurge(false);
    }
  };

  return (
    <PageShell
      activeHref="/account"
      navItems={appNavigation}
      subtitle={subtitle}
      title="Account"
    >
      {error ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Team</h2>
            <StatusPill label={summary?.member.role ?? 'Loading'} tone="neutral" />
          </div>
          <p className="mt-2 text-sm text-[var(--eq-color-fg-muted)]">
            Team management remains minimal in MVP. Org role controls destructive actions.
          </p>
          {summary ? (
            <p className="mt-4 text-sm text-[var(--eq-color-fg-muted)]">
              Signed in as <span className="font-medium">{summary.member.email}</span>
            </p>
          ) : null}
        </section>

        <section className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Data Retention / Purge</h2>
            <StatusPill label="Baseline" tone="warning" />
          </div>
          <p className="mt-2 text-sm text-[var(--eq-color-fg-muted)]">
            Retention defaults to 90 days. Purge removes expired Blob objects and DB references.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Retention Days</span>
              <Input
                disabled={!isAdmin}
                onChange={(event) => setRetentionDaysInput(event.target.value)}
                type="number"
                value={retentionDaysInput}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!isAdmin || isSaving} onClick={() => void saveRetention()} size="sm" variant="secondary">
                {isSaving ? 'Saving...' : 'Save Retention'}
              </Button>
              <Button disabled={!isAdmin || isRunningPurge} onClick={() => void triggerPurge()} size="sm" variant="ghost">
                {isRunningPurge ? 'Queueing...' : 'Run Purge Now'}
              </Button>
            </div>
            {!isAdmin ? (
              <p className="text-xs text-[var(--eq-color-fg-muted)]">
                Admin role required for retention updates and purge actions.
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-4 rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-5">
        <h2 className="text-base font-semibold">Optional Integrations (Scaffolded)</h2>
        <p className="mt-2 text-sm text-[var(--eq-color-fg-muted)]">
          Enabled only when matching environment variables are configured.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {integrationStatus.map((integration) => (
            <StatusPill
              key={integration.name}
              label={`${integration.name}: ${integration.enabled ? 'On' : 'Off'}`}
              tone={integration.enabled ? 'success' : 'neutral'}
            />
          ))}
        </div>
      </div>

      <div className="mt-4">
        <EmptyState
          description="Billing is intentionally out of MVP scope and will be added later."
          title="Billing not in MVP"
        />
      </div>
    </PageShell>
  );
}
