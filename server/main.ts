import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import rateLimit from '@fastify/rate-limit';
import { AuthController } from './controllers/auth.controller';
import { SessionGuard } from './auth/session';
import { MeetingsController } from './controllers/meetings.controller';
import { MeetingActionsController } from './controllers/meeting-actions.controller';
import { StationsController } from './controllers/stations.controller';
import { WorkspaceController } from './controllers/workspace.controller';
import { migrate } from './db/migrate';
import { transaction } from './db/connection';
import { expireRequests, lockSchedule } from './meetings/requests';

@Module({
  controllers: [
    AuthController,
    WorkspaceController,
    MeetingsController,
    MeetingActionsController,
    StationsController,
  ],
  providers: [SessionGuard],
})
class AppModule {}

export async function buildApp(quiet = false) {
  if (
    (process.env.CONFIRMATION_SECRET?.length || 0) < 32 ||
    process.env.CONFIRMATION_SECRET?.startsWith('replace-with')
  ) {
    throw new Error('Set CONFIRMATION_SECRET to a random secret at least 32 characters long');
  }
  await migrate();
  const adapter = new FastifyAdapter();
  const fastify = adapter.getInstance();
  // Expired holds stop blocking immediately in queries. This timer also delivers
  // expiry notifications when nobody has opened the calendar recently.
  const expiryTimer = setInterval(() => {
    void transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
    }).catch((error: Error) => console.error('Meeting request expiry failed:', error.message));
  }, 60_000);
  expiryTimer.unref();
  fastify.addHook('onClose', async () => clearInterval(expiryTimer));
  await fastify.register(rateLimit, { global: false });
  const loginLimit = fastify.rateLimit({ max: 20, timeWindow: '1 minute' });
  fastify.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      // A same-origin custom header prevents cross-origin HTML form submissions.
      if (req.headers['x-my-space'] !== '1')
        return reply.code(403).send({ message: 'הבקשה אינה מורשית' });
      if (req.url === '/api/auth/admin') await loginLimit.call(fastify, req, reply);
    }
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: quiet ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api');
  if (existsSync('dist/web/index.html'))
    app.useStaticAssets({ root: resolve('dist/web'), prefix: '/' });
  await app.init();
  return app;
}
if (require.main === module) {
  buildApp()
    .then((app) => app.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1'))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
