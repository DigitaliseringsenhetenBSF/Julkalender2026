import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/**
 * Identity provider for AUTH_MODE=portal (SPEC §8): Verktygsportalen's login.
 *
 * The portal serves the calendar under its own address (BASE_PATH) through a proxy that only a
 * signed-in person gets past, and tells us who they are in two request headers. A third header
 * carries the shared PORTAL_KEY, so a request that did not come through the portal's proxy
 * cannot claim an identity whatever headers it sends. There is no cookie of our own in this mode:
 * every request is identified afresh, and the portal's session is the only session.
 */

export const PORTAL_KEY_HEADER = 'x-portal-key';
/** The verified e-mail address of the signed-in person. */
export const PORTAL_USER_HEADER = 'x-portal-user';
/** Their display name, percent-encoded so that any script survives the header (optional). */
export const PORTAL_NAME_HEADER = 'x-portal-name';
/** `external_id` prefix for people identified by the portal: "portal:<e-mail>". */
export const PORTAL_ID_PREFIX = 'portal:';

const MAX_NAME_LENGTH = 120;

export interface PortalIdentity {
  externalId: string;
  displayName: string;
}

export type PortalIdentification =
  { ok: true; identity: PortalIdentity } | { ok: false; reason: 'key' | 'user' };

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** "anna.b.andersson@skola.lund.se" → "Anna B Andersson", when the portal sent no name. */
export function nameFromEmail(email: string): string {
  const local = email.slice(0, email.indexOf('@'));
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('sv-SE') + part.slice(1))
    .join(' ');
}

function decodeName(encoded: string): string {
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return '';
  }
}

export function displayNameFrom(encodedName: string, email: string): string {
  return (decodeName(encodedName) || nameFromEmail(email)).slice(0, MAX_NAME_LENGTH);
}

/** Reads the portal's headers; `reason: 'key'` means the proxy's secret was missing or wrong. */
export function identifyPortalUser(
  headers: IncomingHttpHeaders,
  key: string,
): PortalIdentification {
  const given = header(headers, PORTAL_KEY_HEADER);
  if (!given || !safeEqual(given, key)) return { ok: false, reason: 'key' };
  const email = header(headers, PORTAL_USER_HEADER).trim().toLowerCase();
  if (!email.includes('@') || email.length > 254) return { ok: false, reason: 'user' };
  return {
    ok: true,
    identity: {
      externalId: PORTAL_ID_PREFIX + email,
      displayName: displayNameFrom(header(headers, PORTAL_NAME_HEADER), email),
    },
  };
}
