import { buildServer } from './server';

async function start(): Promise<void> {
  const server = await buildServer();
  const port = Number(process.env.PORT ?? 4000);

  try {
    await server.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

void start();
