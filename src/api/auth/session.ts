import type { FastifyReply, FastifyRequest } from 'fastify';
import { findUserById, type User } from '../../data/users.ts';
import type { AppContext } from '../context.ts';
import { ApiError } from '../errors.ts';

/**
 * Session handling – the single seam every identity provider uses (SPEC §8).
 * A provider identifies the person, upserts them in `users` and calls `setSession`.
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

/** preHandler: rejects requests without a valid session and sets `request.user`. */
export function requireUser(ctx: AppContext) {
  return async (request: FastifyRequest): Promise<void> => {
    const userId = readSessionUserId(request);
    const user = userId === null ? null : await findUserById(ctx.db, userId);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
    request.user = user;
  };
}

/** The signed-in user inside a route protected by `requireUser`. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
  return request.user;
}
