import { createPrismaClient } from '@evidenceq/database';
import {
  queueNames,
  type AnswerGenerateJobPayload,
  type ExportXlsxJobPayload,
  type KBIndexJobPayload,
  type ProjectParseJobPayload,
  type RetentionPurgeJobPayload
} from '@evidenceq/shared';
import { createStorageAdapter } from '@evidenceq/storage';
import cors from '@fastify/cors';
import { Queue } from 'bullmq';
import Fastify from 'fastify';
import Redis from 'ioredis';

import authPlugin from './plugins/auth';
import { captureApiException, closeApiTelemetry, initApiTelemetry } from './lib/telemetry';
import { registerHealthRoute } from './routes/health';
import { registerV1Routes } from './routes/v1';

export async function buildServer() {
  initApiTelemetry();

  const [
    kbQueueName,
    projectParseQueueName,
    answerGenerateQueueName,
    exportXlsxQueueName,
    retentionPurgeQueueName
  ] = queueNames;

  if (
    !kbQueueName ||
    !projectParseQueueName ||
    !answerGenerateQueueName ||
    !exportXlsxQueueName ||
    !retentionPurgeQueueName
  ) {
    throw new Error('Queue names are not configured');
  }

  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId'
  });
  const prisma = createPrismaClient();
  const redisUrl = process.env.REDIS_INTERNAL_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
  const queueDefaults = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 200
  };

  const kbIndex = new Queue<KBIndexJobPayload>(kbQueueName, {
    connection: redis,
    defaultJobOptions: queueDefaults
  });
  const projectParse = new Queue<ProjectParseJobPayload>(projectParseQueueName, {
    connection: redis,
    defaultJobOptions: queueDefaults
  });
  const answerGenerate = new Queue<AnswerGenerateJobPayload>(answerGenerateQueueName, {
    connection: redis,
    defaultJobOptions: queueDefaults
  });
  const exportXlsx = new Queue<ExportXlsxJobPayload>(exportXlsxQueueName, {
    connection: redis,
    defaultJobOptions: queueDefaults
  });
  const retentionPurge = new Queue<RetentionPurgeJobPayload>(retentionPurgeQueueName, {
    connection: redis,
    defaultJobOptions: {
      ...queueDefaults,
      attempts: 1
    }
  });

  app.decorate('services', {
    prisma,
    redis,
    storage: createStorageAdapter(),
    queues: {
      kbIndex,
      projectParse,
      answerGenerate,
      exportXlsx,
      retentionPurge
    }
  });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(authPlugin);
  await registerHealthRoute(app);
  await registerV1Routes(app);

  app.addHook('onError', async (request, _reply, error) => {
    const context: Parameters<typeof captureApiException>[1] = {
      requestId: request.id,
      method: request.method,
      orgId: request.auth?.orgId,
      userId: request.auth?.userId
    };

    if (request.routeOptions.url) {
      context.route = request.routeOptions.url;
    }

    captureApiException(error, context);
  });

  app.addHook('onReady', async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      app.log.info('database connection check passed');
    } catch (error) {
      app.log.warn({ error }, 'database connection check failed');
    }

    try {
      await redis.ping();
      app.log.info('redis connection check passed');
    } catch (error) {
      app.log.warn({ error }, 'redis connection check failed');
    }
  });

  app.addHook('onClose', async () => {
    await kbIndex.close();
    await projectParse.close();
    await answerGenerate.close();
    await exportXlsx.close();
    await retentionPurge.close();
    await redis.quit();
    await prisma.$disconnect();
    await closeApiTelemetry();
  });

  return app;
}
