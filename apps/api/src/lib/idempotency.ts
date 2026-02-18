import type { JobRunStatus } from '@evidenceq/database';

export function buildExportIdempotencyKey(
  projectId: string,
  exportVersion: number,
  kbVersionHash: string
): string {
  return `export-xlsx:${projectId}:v${exportVersion}:${kbVersionHash}`;
}

export function isActiveJobStatus(status: JobRunStatus | null | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}
