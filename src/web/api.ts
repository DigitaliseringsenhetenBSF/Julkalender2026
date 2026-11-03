import type { z } from 'zod';
import {
  boardResponse,
  calendarResponse,
  completionResponse,
  devLoginResponse,
  devUsersResponse,
  errorResponse,
  meResponse,
  movePieceResponse,
  progressSchema,
  type MovePieceRequest,
} from '../shared/contract.ts';

/** A failed API call. `code` is a contract error code, or "NETWORK" when offline. */
export class ApiCallError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T extends z.ZodType>(
  schema: T | null,
  method: string,
  url: string,
  payload?: unknown,
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new ApiCallError(0, 'NETWORK', `Network error for ${method} ${url}`);
  }

  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorResponse.safeParse(json);
    throw new ApiCallError(
      response.status,
      parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR',
      parsed.success ? parsed.data.error.message : `HTTP ${response.status}`,
    );
  }
  // Responses are validated against the shared contract, so drift fails loudly.
  return (schema ? schema.parse(json) : undefined) as z.infer<T>;
}

export const api = {
  me: () => request(meResponse, 'GET', '/api/me'),
  devUsers: () => request(devUsersResponse, 'GET', '/api/dev-auth/users'),
  devLogin: (userId: number) =>
    request(devLoginResponse, 'POST', '/api/dev-auth/login', { userId }),
  logout: () => request(null, 'POST', '/api/auth/logout'),
  calendar: () => request(calendarResponse, 'GET', '/api/calendar'),
  progress: () => request(progressSchema, 'GET', '/api/progress'),
  tick: (day: number) => request(completionResponse, 'POST', '/api/completions', { day }),
  untick: (day: number) => request(completionResponse, 'DELETE', `/api/completions/${day}`),
  board: () => request(boardResponse, 'GET', '/api/board'),
  movePiece: (id: number, body: MovePieceRequest) =>
    request(movePieceResponse, 'PUT', `/api/board/pieces/${id}`, body),
  pieceImageUrl: (id: number) => `/api/pieces/${id}/image`,
};
