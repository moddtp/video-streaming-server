import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { logger, loggerOptions } from './logger';
import { assertFeatures } from './ffmpeg/binary';
import { createCatalogStore } from './catalog/store';
import { sendFile } from './util/http';
import { SessionManager } from './session/manager';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerCatalogRoutes } from './routes/catalog.routes';
import { registerSessionRoutes } from './routes/session.routes';
import { registerStreamRoutes } from './routes/stream.routes';

export async function buildServer() {
  const app = Fastify({ logger: loggerOptions });

  // Permissive CORS (token auth, no cookies) so a browser player on any origin —
  // and the bundled test player — can stream. Mobile players ignore CORS.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', config.corsAllowOrigin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
    reply.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    if (req.method === 'OPTIONS') reply.code(204).send();
  });

  const catalog = await createCatalogStore();
  const sessions = new SessionManager();
  sessions.startSweeper(config.sweepIntervalSec * 1000);

  app.addHook('onClose', async () => {
    await sessions.shutdown();
    await catalog.close();
  });

  app.get('/health', async () => ({ ok: true, name: 'video-streaming-server' }));
  registerAuthRoutes(app);
  registerCatalogRoutes(app, catalog);
  registerSessionRoutes(app, catalog, sessions);
  registerStreamRoutes(app, sessions);

  // The simulated pre-roll ad clip (played client-side before a video when enabled).
  const adPath = path.join(config.root, 'assets', 'ad.mp4');
  app.get('/ad.mp4', async (req, reply) => sendFile(req, reply, adPath, 'video/mp4'));

  // Serve the browser test player (and its assets) from the project's test-player/ dir.
  await app.register(fastifyStatic, {
    root: path.join(config.root, 'test-player'),
    prefix: '/',
    index: ['index.html'],
  });

  return app;
}

async function main() {
  // Fail fast if the bundled/installed ffmpeg can't burn watermarks.
  await assertFeatures();

  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
  logger.info(`listening on ${config.publicBaseUrl}`);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
