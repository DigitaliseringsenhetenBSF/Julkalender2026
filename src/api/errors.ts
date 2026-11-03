import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { ErrorCode } from '../shared/contract.ts';

/** An expected API error with a contract error code (docs/SYSTEM_CONTRACT.md). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

/** Validates input at the API boundary; throws a 400 VALIDATION_ERROR on failure. */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', detail);
  }
  return result.data;
}
