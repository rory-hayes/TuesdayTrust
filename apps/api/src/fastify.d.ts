import type { PrismaClient } from '@evidenceq/database';
import type {
  AnswerGenerateJobPayload,
  ExportXlsxJobPayload,
  KBIndexJobPayload,
  ProjectParseJobPayload,
  RetentionPurgeJobPayload,
  StorageAdapter
} from '@evidenceq/shared';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';

type AuthContext = {
  orgId: string;
  userId: string;
  email?: string;
  authMode: 'clerk' | 'dev';
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }

  interface FastifyInstance {
    services: {
      prisma: PrismaClient;
      redis: Redis;
      storage: StorageAdapter;
      queues: {
        kbIndex: Queue<KBIndexJobPayload>;
        projectParse: Queue<ProjectParseJobPayload>;
        answerGenerate: Queue<AnswerGenerateJobPayload>;
        exportXlsx: Queue<ExportXlsxJobPayload>;
        retentionPurge: Queue<RetentionPurgeJobPayload>;
      };
    };
  }
}
