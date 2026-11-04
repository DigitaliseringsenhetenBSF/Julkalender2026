import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ICONS_DIR, WEB_DIST_DIR } from '../data/paths.ts';
import { devAuthRoutes } from './auth/devAuth.ts';
import { requireUser } from './auth/session.ts';
import { resetDatabase, unlockAllPieces } from './bootstrap.ts';
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

  // Always at the root, whatever the base path: Render's health check and `npm run smoke` read it.
  app.get('/health', async (_request, reply) => {
    try {
      await ctx.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'error' });
    }
  });

  // Everything the browser talks to lives under the base path ('' at the root, or e.g.
  // /julkalender behind Verktygsportalen's proxy), so the portal can pass requests through
  // unchanged and the built web app can use the same prefix (Vite's `base`).
  const { basePath } = ctx.config;
  const webDistDir = options.webDistDir ?? WEB_DIST_DIR;
  const hasWebBuild = existsSync(join(webDistDir, 'index.html'));

  // Outside the base path there is nothing to serve, not even the page (one handler per prefix).
  if (basePath) {
    app.setNotFoundHandler((request, reply) =>
      sendError(reply, 404, 'NOT_FOUND', `No route for ${request.method} ${request.url}`),
    );
  }

  await app.register(
    async (scope) => {
      // Lucka icons are decorative and shown on every door, so they need no session.
      scope.get('/icons/:file', async (request, reply) => {
        const { file } = request.params as { file: string };
        const path = join(ICONS_DIR, file);
        if (!/^[\w-]+\.svg$/.test(file) || !existsSync(path)) {
          throw new ApiError(404, 'NOT_FOUND', 'Icon not found');
        }
        return reply
          .type('image/svg+xml')
          .header('Cache-Control', 'public, max-age=86400')
          .send(createReadStream(path));
      });

      await sessionRoutes(scope, ctx);
      if (ctx.config.authMode === 'dev') await devAuthRoutes(scope, ctx);

      // Everything registered in this scope requires a signed-in user.
      await scope.register(async (protectedScope) => {
        protectedScope.addHook('preHandler', requireUser(ctx));
        await calendarRoutes(protectedScope, ctx);
        await boardRoutes(protectedScope, ctx);
      });

      if (ctx.config.appEnv === 'test') {
        scope.post('/api/test/reset', async (_request, reply) => {
          await resetDatabase(ctx);
          return reply.status(204).send();
        });
        scope.post('/api/test/unlock-all', async (_request, reply) => {
          await unlockAllPieces(ctx);
          return reply.status(204).send();
        });
      }

      if (hasWebBuild) {
        await scope.register(fastifyStatic, {
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

      scope.setNotFoundHandler((request, reply) => {
        const path = request.url.split('?')[0] ?? request.url;
        const isPageRequest =
          request.method === 'GET' &&
          !path.startsWith(`${basePath}/api/`) &&
          !path.startsWith(`${basePath}/icons/`);
        if (hasWebBuild && isPageRequest) {
          return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
        }
        return sendError(reply, 404, 'NOT_FOUND', `No route for ${request.method} ${request.url}`);
      });
    },
    { prefix: basePath || undefined },
  );

  return app;
}
