'use client';

import { Button, EmptyState, Input, ModalShell, PageShell, StatusPill, Table } from '@evidenceq/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createProject,
  deleteClient,
  getClient,
  listKBDocuments,
  listProjects,
  registerKBDocument,
  type ClientWorkspace,
  type KBDocument,
  type QuestionnaireProject
} from '../../../lib/api';
import { uploadFileToBlob } from '../../../lib/blob-upload';
import { appNavigation } from '../../../lib/navigation';

type ClientWorkspaceViewProps = {
  clientId: string;
};

type WorkspaceTab = 'kb' | 'projects';

export function ClientWorkspaceView({ clientId }: ClientWorkspaceViewProps) {
  const [client, setClient] = useState<ClientWorkspace | null>(null);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [projects, setProjects] = useState<QuestionnaireProject[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('kb');

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingKb, setIsUploadingKb] = useState(false);
  const [isUploadingProject, setIsUploadingProject] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [showDeleteClient, setShowDeleteClient] = useState(false);
  const [projectName, setProjectName] = useState('');

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const [clientResult, kbDocumentsResult, projectsResult] = await Promise.all([
        getClient(clientId),
        listKBDocuments(clientId),
        listProjects(clientId)
      ]);

      setClient(clientResult);
      setDocuments(kbDocumentsResult);
      setProjects(projectsResult);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load client workspace');
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const hasActiveJobs = documents.some((document) =>
      document.status === 'UPLOADED' || document.status === 'INDEXING'
    );

    if (!hasActiveJobs) {
      return;
    }

    const timer = setInterval(() => {
      void loadWorkspace();
    }, 4000);

    return () => clearInterval(timer);
  }, [documents, loadWorkspace]);

  const subtitle = useMemo(() => {
    if (isLoading) {
      return 'Loading workspace...';
    }

    return `KB docs: ${documents.length} • Questionnaires: ${projects.length}`;
  }, [documents.length, isLoading, projects.length]);

  const onUploadKb = async (file: File) => {
    setIsUploadingKb(true);

    try {
      const pathname = `kb/${clientId}/${Date.now()}-${file.name}`;
      const blobResult = await uploadFileToBlob(pathname, file);

      await registerKBDocument(clientId, {
        blobPathname: blobResult.pathname,
        blobUrl: blobResult.url,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size
      });

      await loadWorkspace();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'KB upload failed');
    } finally {
      setIsUploadingKb(false);
    }
  };

  const onUploadProject = async (file: File) => {
    setIsUploadingProject(true);

    try {
      const pathname = `projects/${clientId}/${Date.now()}-${file.name}`;
      const blobResult = await uploadFileToBlob(pathname, file);
      const fallbackName = file.name.replace(/\.xlsx$/i, '');

      await createProject(clientId, {
        name: projectName.trim() || fallbackName,
        blobPathname: blobResult.pathname,
        blobUrl: blobResult.url,
        filename: file.name,
        mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: file.size
      });

      setProjectName('');
      await loadWorkspace();
      setActiveTab('projects');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Project upload failed');
    } finally {
      setIsUploadingProject(false);
    }
  };

  return (
    <PageShell
      activeHref="/clients"
      navItems={appNavigation}
      rightSlot={
        <Button onClick={() => setShowDeleteClient(true)} size="sm" variant="ghost">
          Delete Client
        </Button>
      }
      subtitle={subtitle}
      title={client ? `Client Workspace: ${client.name}` : `Client Workspace: ${clientId}`}
    >
      {error ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex gap-2">
        <Button onClick={() => setActiveTab('kb')} variant={activeTab === 'kb' ? 'secondary' : 'ghost'}>
          KB Vault
        </Button>
        <Button
          onClick={() => setActiveTab('projects')}
          variant={activeTab === 'projects' ? 'secondary' : 'ghost'}
        >
          Questionnaires
        </Button>
      </div>

      {activeTab === 'kb' ? (
        <div className="space-y-4">
          <div className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-4">
            <h2 className="text-sm font-semibold">Upload KB Document</h2>
            <p className="mt-1 text-sm text-[var(--eq-color-fg-muted)]">
              Supported: PDF, DOCX, TXT, MD. Uploaded to Vercel Blob and indexed by background worker.
            </p>
            <div className="mt-3">
              <input
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="block w-full text-sm"
                disabled={isUploadingKb}
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];

                  if (selectedFile) {
                    void onUploadKb(selectedFile);
                  }

                  event.currentTarget.value = '';
                }}
                type="file"
              />
              {isUploadingKb ? (
                <p className="mt-2 text-xs text-[var(--eq-color-fg-muted)]">Uploading KB file...</p>
              ) : null}
            </div>
          </div>

          {documents.length === 0 ? (
            <EmptyState
              description="No knowledge-base documents uploaded yet."
              title="KB Vault empty"
            />
          ) : (
            <Table
              columns={[
                { header: 'Filename', key: 'filename' },
                {
                  header: 'Status',
                  key: 'status',
                  render: (row) => (
                    <StatusPill
                      label={row.status}
                      tone={
                        row.status === 'READY'
                          ? 'success'
                          : row.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    />
                  )
                },
                {
                  header: 'Chunks',
                  key: 'chunkCount',
                  render: (row) => String(row.chunkCount)
                },
                {
                  header: 'Progress',
                  key: 'progress',
                  render: (row) => {
                    if (row.status === 'READY') {
                      return 'Indexed';
                    }

                    if (row.status === 'FAILED') {
                      return row.failureReason ?? 'Failed';
                    }

                    const status = row.indexJobStatus ?? row.status;
                    const progress = row.indexProgress ?? 0;
                    return `${status} (${progress}%)`;
                  }
                }
              ]}
              getRowKey={(row) => row.id}
              rows={documents}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-4">
            <h2 className="text-sm font-semibold">Upload Questionnaire (XLSX)</h2>
            <p className="mt-1 text-sm text-[var(--eq-color-fg-muted)]">
              MVP supports XLSX only. After upload, open the project to map question/answer/evidence
              columns.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
              <Input
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Project name (optional, defaults to file name)"
                value={projectName}
              />
              <input
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block text-sm"
                disabled={isUploadingProject}
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];

                  if (selectedFile) {
                    void onUploadProject(selectedFile);
                  }

                  event.currentTarget.value = '';
                }}
                type="file"
              />
            </div>
            {isUploadingProject ? (
              <p className="mt-2 text-xs text-[var(--eq-color-fg-muted)]">Uploading XLSX...</p>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <EmptyState
              description="No questionnaire projects uploaded yet."
              title="Questionnaires empty"
            />
          ) : (
            <Table
              columns={[
                {
                  header: 'Project',
                  key: 'name',
                  render: (row) => (
                    <a className="font-medium text-[var(--eq-color-accent-strong)]" href={`/projects/${row.id}`}>
                      {row.name}
                    </a>
                  )
                },
                { header: 'File', key: 'filename' },
                {
                  header: 'Status',
                  key: 'status',
                  render: (row) => (
                    <StatusPill
                      label={row.status}
                      tone={row.status === 'PARSED' || row.status === 'READY' ? 'success' : 'warning'}
                    />
                  )
                },
                {
                  header: 'Questions',
                  key: 'questionCount',
                  render: (row) => String(row.questionCount ?? 0)
                }
              ]}
              getRowKey={(row) => row.id}
              rows={projects}
            />
          )}
        </div>
      )}

      <ModalShell
        description="This deletes all client KB docs, projects, exports, and related records. This action cannot be undone."
        isOpen={showDeleteClient}
        title="Delete Client Workspace"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--eq-color-fg-muted)]">
            Only org admins can perform this action.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowDeleteClient(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={isDeletingClient}
              onClick={() => {
                setIsDeletingClient(true);
                setError(null);
                void deleteClient(clientId)
                  .then(() => {
                    window.location.href = '/clients';
                  })
                  .catch((deleteError) => {
                    setError(
                      deleteError instanceof Error
                        ? deleteError.message
                        : 'Failed to delete client workspace'
                    );
                  })
                  .finally(() => {
                    setIsDeletingClient(false);
                    setShowDeleteClient(false);
                  });
              }}
              variant="secondary"
            >
              {isDeletingClient ? 'Deleting...' : 'Delete Client'}
            </Button>
          </div>
        </div>
      </ModalShell>
    </PageShell>
  );
}
