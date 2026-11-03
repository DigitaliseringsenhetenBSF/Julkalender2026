import type { FastifyInstance } from 'fastify';
import { clearSession, currentUser, requireUser } from '../auth/session.ts';
import type { AppContext } from '../context.ts';

export async function sessionRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/api/me', { preHandler: requireUser(ctx) }, async (request) => ({
    user: currentUser(request),
    authMode: ctx.config.authMode,
  }));

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSession(reply);
    return reply.status(204).send();
  });
}
