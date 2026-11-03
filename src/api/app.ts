import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { WEB_DIST_DIR } from '../data/paths.ts';
import { devAuthRoutes } from './auth/devAuth.ts';
import { requireUser } from './auth/session.ts';
import { resetDatabase } from './bootstrap.ts';
import type { AppContext } from './context.ts';
import { ApiError, sendError } from './errors.ts';
import { boardRoutes } from './routes/board.ts';
import { calendarRoutes } from './routes/calendar.ts';
import { sessionRoutes } from './routes/session.ts';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; " +
    "form-action 'self'",
};

export async function buildApp(
  ctx: AppContext,
  options: { logger?: FastifyServerOptions['logger']; webDistDir?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: true });

  await app.register(cookie, { secret: ctx.config.sessionSecret });
  app.decorateRequest('user', null);

  app.addHook('onSend', async (_request, reply) => {
    reply.headers(SECURITY_HEADERS);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(reply, error.status, error.code, error.message);
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      // Framework-level client errors (malformed JSON, wrong content type, too large body).
      const message = error instanceof Error ? error.message : 'Bad request';
      return sendError(reply, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message);
    }
    request.log.error(error);
    return sendError(reply, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  });

  app.get('/health', async (_request, reply) => {
    try {
      await ctx.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'error' });
    }
  });

  await sessionRoutes(app, ctx);
  if (ctx.config.authMode === 'dev') await devAuthRoutes(app, ctx);

  // Everything registered in this scope requires a signed-in user.
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireUser(ctx));
    await calendarRoutes(scope, ctx);
    await boardRoutes(scope, ctx);
  });

  if (ctx.config.appEnv === 'test') {
    app.post('/api/test/reset', async (_request, reply) => {
      await resetDatabase(ctx);
      return reply.status(204).send();
    });
  }

  const webDistDir = options.webDistDir ?? WEB_DIST_DIR;
  const hasWebBuild = existsSync(join(webDistDir, 'index.html'));
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      setHeaders(res, path) {
        // Vite fingerprints assets, so they can be cached forever; index.html must not be.
        res.header(
          'Cache-Control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const isPageRequest =
      request.method === 'GET' && !request.url.startsWith('/api/') && request.url !== '/health';
    if (hasWebBuild && isPageRequest) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return sendError(reply, 404, 'NOT_FOUND', `No route for ${request.method} ${request.url}`);
  });

  return app;
}
