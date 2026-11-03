import type { FastifyInstance } from 'fastify';
import { findUserById, listDevUsers, DEV_USER_PREFIX } from '../../data/users.ts';
import { devLoginRequest } from '../../shared/contract.ts';
import type { AppContext } from '../context.ts';
import { ApiError, parseInput } from '../errors.ts';
import { setSession } from './session.ts';

/**
 * TEMPORARY identity provider (AUTH_MODE=dev): pick one of the seeded test users.
 * Only registered when AUTH_MODE=dev, which config refuses in production. Replace with the
 * real provider once sign-in is decided (SPEC Q1).
 */
export async function devAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/api/dev-auth/users', async () => ({ users: await listDevUsers(ctx.db) }));

  app.post('/api/dev-auth/login', async (request, reply) => {
    const { userId } = parseInput(devLoginRequest, request.body);
    const devUsers = await listDevUsers(ctx.db);
    // Only seeded test identities may be used, never arbitrary user ids.
    if (!devUsers.some((u) => u.id === userId)) {
      throw new ApiError(404, 'NOT_FOUND', `No ${DEV_USER_PREFIX} test user with id ${userId}`);
    }
    const user = await findUserById(ctx.db, userId);
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    setSession(reply, user.id, ctx.config.secureCookies);
    return { user };
  });
}
