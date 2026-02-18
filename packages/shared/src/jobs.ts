export const queueNames = [
  'kb-index',
  'project-parse',
  'answer-generate',
  'export-xlsx',
  'retention-purge'
] as const;

export type QueueName = (typeof queueNames)[number];

export type KBIndexJobPayload = {
  orgId: string;
  clientId: string;
  kbDocumentId: string;
  indexVersion?: number;
};

export type ProjectParseJobPayload = {
  orgId: string;
  projectId: string;
  parseVersion?: number;
};

export type GenerateAnswersMode = 'ALL' | 'UNANSWERED';

export type AnswerGenerateJobPayload = {
  orgId: string;
  clientId: string;
  projectId: string;
  questionId?: string;
  questionIds?: string[];
  kbVersionHash?: string;
  force?: boolean;
  mode?: GenerateAnswersMode;
};

export type ExportXlsxJobPayload = {
  orgId: string;
  projectId: string;
  exportVersion?: number;
  kbVersionHash?: string;
};

export type RetentionPurgeJobPayload = {
  orgId?: string;
  dryRun?: boolean;
};
