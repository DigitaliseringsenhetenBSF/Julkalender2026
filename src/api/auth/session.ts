import type { FastifyReply, FastifyRequest } from 'fastify';
import { ensureUser, findUserById, type User } from '../../data/users.ts';
import type { AppContext } from '../context.ts';
import { ApiError } from '../errors.ts';
import { identifyPortalUser } from './portalAuth.ts';

/**
 * Session handling – the single seam every identity provider uses (SPEC §8).
 * A provider identifies the person, upserts them in `users` and sets `request.user`; in dev mode
 * through a signed cookie, in portal mode from the portal's headers on every request.
 * Everything else only reads `request.user`.
 */

export const SESSION_COOKIE = 'mjk_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // covers the whole campaign

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export function setSession(reply: FastifyReply, userId: number, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, String(userId), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readSessionUserId(request: FastifyRequest): number | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;
  const id = Number(unsigned.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** preHandler: rejects requests without a signed-in person and sets `request.user`. */
export function requireUser(ctx: AppContext) {
  if (ctx.config.authMode === 'portal') return requirePortalUser(ctx);
  return async (request: FastifyRequest): Promise<void> => {
    const userId = readSessionUserId(request);
    const user = userId === null ? null : await findUserById(ctx.db, userId);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
    request.user = user;
  };
}

function requirePortalUser(ctx: AppContext) {
  const key = ctx.config.portalKey;
  if (!key) throw new Error('AUTH_MODE=portal without PORTAL_KEY (config should have refused)');
  return async (request: FastifyRequest): Promise<void> => {
    const result = identifyPortalUser(request.headers, key);
    if (!result.ok) {
      if (result.reason === 'key') {
        // A request that did not come through the portal's proxy, or a key mismatch between the
        // two services. Worth a line in the log; the address or headers never are.
        request.log.warn({ reason: 'portal_key' }, 'request without a valid portal key');
        throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      }
      throw new ApiError(401, 'PORTAL_SIGN_IN', 'Open the calendar through Verktygsportalen');
    }
    request.user = await ensureUser(ctx.db, result.identity);
  };
}

/** The signed-in user inside a route protected by `requireUser`. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
  return request.user;
}
