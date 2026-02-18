import type { FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    let db = 'down';
    let redis = 'down';

    try {
      await app.services.prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'down';
    }

    try {
      const pong = await app.services.redis.ping();
      redis = pong === 'PONG' ? 'ok' : 'down';
    } catch {
      redis = 'down';
    }

    const healthy = db === 'ok' && redis === 'ok';

    if (!healthy) {
      reply.code(503);
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        api: 'ok',
        database: db,
        redis
      },
      timestamp: new Date().toISOString()
    };
  });
}
