'use client';

import { Button, Input, ModalShell, PageShell, StatusPill, Table } from '@evidenceq/ui';
import { useEffect, useMemo, useState } from 'react';

import { appNavigation } from '../../lib/navigation';
import { createClient, listClients, type ClientWorkspace } from '../../lib/api';

export function ClientsView() {
  const [clients, setClients] = useState<ClientWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadClients = async () => {
    setIsLoading(true);

    try {
      const response = await listClients();
      setClients(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  const subtitle = useMemo(() => {
    if (isLoading) {
      return 'Loading client workspaces...';
    }

    return `${clients.length} client workspaces`;
  }, [clients.length, isLoading]);

  const onCreateClient = async () => {
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: { name: string; primaryDomain?: string } = {
        name: name.trim()
      };

      if (primaryDomain.trim()) {
        payload.primaryDomain = primaryDomain.trim();
      }

      await createClient(payload);

      setName('');
      setPrimaryDomain('');
      setIsCreateOpen(false);
      await loadClients();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create client');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell
      activeHref="/clients"
      navItems={appNavigation}
      rightSlot={
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          New Client Workspace
        </Button>
      }
      subtitle={subtitle}
      title="Clients"
    >
      {error ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Table
        columns={[
          {
            header: 'Client',
            key: 'name',
            render: (row) => (
              <a className="font-medium text-[var(--eq-color-accent-strong)]" href={`/clients/${row.id}`}>
                {row.name}
              </a>
            )
          },
          {
            header: 'Domain',
            key: 'primaryDomain',
            render: (row) => row.primaryDomain ?? '—'
          },
          {
            header: 'KB Docs',
            key: 'kbDocs',
            render: (row) => String(row.counts?.kbDocuments ?? 0)
          },
          {
            header: 'Projects',
            key: 'projects',
            render: (row) => String(row.counts?.projects ?? 0)
          },
          {
            header: 'Status',
            key: 'status',
            render: (row) => (
              <StatusPill
                label={(row.counts?.projects ?? 0) > 0 ? 'Active' : 'Setup'}
                tone={(row.counts?.projects ?? 0) > 0 ? 'success' : 'neutral'}
              />
            )
          }
        ]}
        getRowKey={(row) => row.id}
        rows={clients}
      />

      <ModalShell
        description="Create a new client workspace for consultant-managed delivery."
        isOpen={isCreateOpen}
        title="New Client Workspace"
      >
        <div className="space-y-3">
          <Input
            onChange={(event) => setName(event.target.value)}
            placeholder="Client name"
            value={name}
          />
          <Input
            onChange={(event) => setPrimaryDomain(event.target.value)}
            placeholder="Primary domain (optional)"
            value={primaryDomain}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsCreateOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting || !name.trim()} onClick={() => void onCreateClient()}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      </ModalShell>
    </PageShell>
  );
}
