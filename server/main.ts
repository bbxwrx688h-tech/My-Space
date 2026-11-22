import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import rateLimit from '@fastify/rate-limit';
import { AuthController } from './auth/auth.controller';
import { SessionGuard } from './auth/session';
import { MeetingsController } from './meetings/meetings.controller';
import { StationsController } from './stations/stations.controller';
import { WorkspaceController } from './workspace.controller';
import { migrate } from './db/migrate';

@Module({
  controllers: [AuthController, WorkspaceController, MeetingsController, StationsController],
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
