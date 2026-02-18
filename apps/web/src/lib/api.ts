const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
const API_URL =
  process.env.NODE_ENV === 'development' ? CONFIGURED_API_URL || 'http://localhost:4000' : CONFIGURED_API_URL;
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN ?? 'dev';
const DEV_ORG_ID = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? 'org_dev';
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID ?? 'user_dev';
const DEV_USER_EMAIL = process.env.NEXT_PUBLIC_DEV_USER_EMAIL ?? 'dev-consultant@example.com';

type RequestOptions = {
  method?: string;
  body?: unknown;
};

function requireApiUrl(): string {
  if (!API_URL) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not configured. Set it to the deployed API base URL (for example https://<render-api>.onrender.com).'
    );
  }

  return API_URL.replace(/\/$/, '');
}

function buildAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  if (process.env.NODE_ENV === 'development') {
    headers.authorization = `Bearer ${DEV_TOKEN}`;
    headers['x-org-id'] = DEV_ORG_ID;
    headers['x-user-id'] = DEV_USER_ID;
    headers['x-user-email'] = DEV_USER_EMAIL;
  }

  return headers;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestInit: RequestInit = {
    method: options.method ?? 'GET',
    headers: buildAuthHeaders(),
    cache: 'no-store'
  };

  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...requestInit
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export type ClientWorkspace = {
  id: string;
  name: string;
  slug: string;
  primaryDomain: string | null;
  createdAt: string;
  updatedAt: string;
  counts?: {
    kbDocuments: number;
    projects: number;
  };
};

export type KBDocument = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'UPLOADED' | 'INDEXING' | 'READY' | 'FAILED';
  failureReason: string | null;
  chunkCount: number;
  indexProgress: number | null;
  indexJobStatus: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | null;
  createdAt: string;
};

export type QuestionnaireProject = {
  id: string;
  clientWorkspaceId: string;
  name: string;
  status: 'DRAFT' | 'MAPPED' | 'PARSED' | 'READY';
  filename: string;
  sheetName: string | null;
  mappings: Record<string, unknown> | null;
  parseError: string | null;
  parseProgress: number;
  parseJobStatus: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  generationProgress: number;
  generationJobStatus: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  exportProgress: number;
  exportJobStatus: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  exportVersion: number;
  errorJson: Record<string, unknown> | null;
  questionCount?: number;
  answerCount?: number;
  gapCount?: number;
  createdAt: string;
};

export type AnswerDraftStatus =
  | 'DRAFT'
  | 'READY'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INSUFFICIENT_EVIDENCE';

export type CitationRecord = {
  kbChunkId: string;
  docName: string;
  locator: string;
  quote: string;
  sourceFileId?: string;
};

export type AnswerDraft = {
  id: string;
  status: AnswerDraftStatus;
  answerText: string | null;
  citationsJson: CitationRecord[];
  confidence: number | null;
  generatedAt: string | null;
  updatedAt?: string;
};

export type ProjectQuestion = {
  id: string;
  rowIndex: number;
  questionText: string;
  answerCellRef: string | null;
  evidenceCellRef: string | null;
  status: 'NEW' | 'READY_FOR_ANSWER';
  answerDraft: AnswerDraft | null;
};

export type ProjectQuestionCounts = {
  total: number;
  unanswered: number;
  byAnswerStatus: Record<AnswerDraftStatus, number>;
};

export type JobRun = {
  id: string;
  jobType: 'KB_INDEX' | 'PROJECT_PARSE' | 'ANSWER_GENERATE' | 'EXPORT_XLSX' | 'RETENTION_PURGE';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  idempotencyKey: string;
  progress: number;
  attempts: number;
  errorJson: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
};

export type ProjectDetailResponse = {
  project: QuestionnaireProject;
  preview: {
    sheetNames: string[];
    selectedSheetName: string;
    previewRows: string[][];
  } | null;
  previewError: string | null;
  questionPreview: Array<ProjectQuestion & { answerDraft?: { status: AnswerDraftStatus } | null }>;
  answerCounts: Record<string, number>;
  jobs: JobRun[];
};

export type QuestionDetailResponse = {
  question: {
    id: string;
    orgId: string;
    clientWorkspaceId: string;
    projectId: string;
    rowIndex: number;
    questionText: string;
    answerCellRef: string | null;
    evidenceCellRef: string | null;
    status: 'NEW' | 'READY_FOR_ANSWER';
  };
  answerDraft: AnswerDraft | null;
};

export type GapItem = {
  id: string;
  reason: string;
  suggestedMissingArtifact: string | null;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
  questionItem: {
    rowIndex: number;
    questionText: string;
  };
};

export type ExportFile = {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  generatedAt: string | null;
  sizeBytes: number | null;
  exportVersion: number | null;
  sourceKbVersionHash: string | null;
};

export type AccountSummary = {
  org: {
    id: string;
    name: string;
    slug: string;
    retentionDays: number;
    createdAt: string;
    updatedAt: string;
  };
  member: {
    id: string;
    orgId: string;
    role: 'OWNER' | 'CONSULTANT' | 'REVIEWER';
    email: string;
  };
};

export function listClients() {
  return apiRequest<ClientWorkspace[]>('/v1/clients');
}

export function createClient(payload: { name: string; primaryDomain?: string }) {
  return apiRequest<ClientWorkspace>('/v1/clients', {
    method: 'POST',
    body: payload
  });
}

export function getClient(clientId: string) {
  return apiRequest<ClientWorkspace>(`/v1/clients/${clientId}`);
}

export function deleteClient(clientId: string) {
  return apiRequest<{ ok: boolean; deletedBlobCount: number }>(`/v1/clients/${clientId}`, {
    method: 'DELETE'
  });
}

export function listKBDocuments(clientId: string) {
  return apiRequest<KBDocument[]>(`/v1/clients/${clientId}/kb/documents`);
}

export function registerKBDocument(
  clientId: string,
  payload: { blobPathname: string; blobUrl?: string; filename: string; mimeType: string; sizeBytes: number }
) {
  return apiRequest<KBDocument>(`/v1/clients/${clientId}/kb/documents`, {
    method: 'POST',
    body: payload
  });
}

export function listProjects(clientId: string) {
  return apiRequest<QuestionnaireProject[]>(`/v1/clients/${clientId}/projects`);
}

export function createProject(
  clientId: string,
  payload: {
    name: string;
    blobPathname: string;
    blobUrl?: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }
) {
  return apiRequest<QuestionnaireProject>(`/v1/clients/${clientId}/projects`, {
    method: 'POST',
    body: payload
  });
}

export function getProject(projectId: string, sheetName?: string) {
  const query = sheetName ? `?sheetName=${encodeURIComponent(sheetName)}` : '';
  return apiRequest<ProjectDetailResponse>(`/v1/projects/${projectId}${query}`);
}

export function mapProjectColumns(
  projectId: string,
  payload: {
    sheetName: string;
    headerRowIndex: number;
    questionCol: string;
    answerCol: string;
    evidenceCol: string;
  }
) {
  return apiRequest<{ queued: boolean; parsedInApi: boolean; questionCount: number; status: string }>(
    `/v1/projects/${projectId}/map-columns`,
    {
      method: 'POST',
      body: payload
    }
  );
}

export function listProjectQuestions(projectId: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';

  return apiRequest<{
    projectStatus: string;
    counts: ProjectQuestionCounts;
    total: number;
    questions: ProjectQuestion[];
  }>(`/v1/projects/${projectId}/questions${query}`);
}

export function getQuestion(questionId: string) {
  return apiRequest<QuestionDetailResponse>(`/v1/questions/${questionId}`);
}

export function generateProjectAnswers(
  projectId: string,
  payload: {
    questionIds?: string[];
    mode?: 'ALL' | 'UNANSWERED';
  }
) {
  return apiRequest<{
    queued: boolean;
    mode: 'ALL' | 'UNANSWERED';
    questionCount: number;
    jobCount?: number;
    kbVersionHash?: string;
  }>(`/v1/projects/${projectId}/generate-answers`, {
    method: 'POST',
    body: payload
  });
}

export function approveQuestion(questionId: string) {
  return apiRequest<{ questionId: string; answerDraft: AnswerDraft }>(`/v1/questions/${questionId}/approve`, {
    method: 'POST'
  });
}

export function rejectQuestion(questionId: string) {
  return apiRequest<{ questionId: string; answerDraft: AnswerDraft }>(`/v1/questions/${questionId}/reject`, {
    method: 'POST'
  });
}

export function editQuestion(
  questionId: string,
  payload: {
    answerText: string;
    citationsJson: CitationRecord[];
  }
) {
  return apiRequest<{ questionId: string; answerDraft: AnswerDraft }>(`/v1/questions/${questionId}/edit`, {
    method: 'POST',
    body: payload
  });
}

export function approveAllReady(projectId: string) {
  return apiRequest<{ approved: number; skipped: number }>(`/v1/projects/${projectId}/approve-all-ready`, {
    method: 'POST'
  });
}

export function queueProjectExport(projectId: string) {
  return apiRequest<{ queued: boolean; jobId: string; exportVersion: number }>(`/v1/projects/${projectId}/export-xlsx`, {
    method: 'POST'
  });
}

export function listProjectExports(projectId: string) {
  return apiRequest<{ total: number; exports: ExportFile[] }>(`/v1/projects/${projectId}/exports`);
}

export function listProjectGaps(projectId: string) {
  return apiRequest<{ total: number; gaps: GapItem[] }>(`/v1/projects/${projectId}/gaps`);
}

export function listProjectJobs(projectId: string) {
  return apiRequest<{
    projectId: string;
    projectProgress: {
      parseJobStatus: string;
      parseProgress: number;
      generationJobStatus: string;
      generationProgress: number;
      exportJobStatus: string;
      exportProgress: number;
    };
    jobs: JobRun[];
  }>(`/v1/projects/${projectId}/jobs`);
}

export function getAccountSummary() {
  return apiRequest<AccountSummary>('/v1/account');
}

export function updateRetentionDays(retentionDays: number) {
  return apiRequest<{ org: AccountSummary['org'] }>('/v1/account/retention', {
    method: 'PATCH',
    body: { retentionDays }
  });
}

export function runRetentionPurge(dryRun = false) {
  return apiRequest<{ queued: boolean; jobId: string }>('/v1/account/run-retention-purge', {
    method: 'POST',
    body: { dryRun }
  });
}

export async function downloadFile(fileId: string, filename?: string) {
  const response = await fetch(`${requireApiUrl()}/v1/files/${fileId}/download`, {
    method: 'GET',
    headers: buildAuthHeaders(),
    cache: 'no-store'
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
