/**
 * API contract shared by server and client. docs/SYSTEM_CONTRACT.md describes the same shapes
 * in prose – keep both in sync. The integration tests parse every response with these schemas.
 */
import { z } from 'zod';
import type { BoardArea } from '../domain/board.ts';
import type { CampaignPhase, MissionStatus } from '../domain/calendar.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().min(0);

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'MISSION_LOCKED',
  'CAMPAIGN_CLOSED',
  'PIECE_LOCKED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponse = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});

// --- Identity -------------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string(),
  role: z.enum(['user', 'admin']),
});
export type ApiUser = z.infer<typeof userSchema>;

export const meResponse = z.object({ user: userSchema, authMode: z.enum(['dev']) });
export const devUsersResponse = z.object({ users: z.array(userSchema) });
export const devLoginRequest = z.object({ userId: z.number().int().positive() });
export const devLoginResponse = z.object({ user: userSchema });

// --- Calendar -------------------------------------------------------------------------------

const missionStatus = z.enum(['locked', 'open', 'today']) satisfies z.ZodType<MissionStatus>;
const campaignPhase = z.enum([
  'before',
  'active',
  'catch_up',
  'closed',
]) satisfies z.ZodType<CampaignPhase>;

export const missionSchema = z.object({
  day: z.number().int().positive(),
  opensOn: isoDate,
  status: missionStatus,
  title: z.string().nullable(),
  description: z.string().nullable(),
  completed: z.boolean(),
  /** The user has opened ("vänt") this lucka; a completed lucka always counts as opened. */
  opened: z.boolean(),
  /** How many people (including the user) have completed this uppdrag; 0 while locked. */
  completions: count,
});
export type ApiMission = z.infer<typeof missionSchema>;

export const openingRequest = z.object({ day: z.number().int().positive() });
export const openingResponse = z.object({
  day: z.number().int().positive(),
  opened: z.literal(true),
});

export const calendarResponse = z.object({
  today: isoDate,
  simulated: z.boolean(),
  phase: campaignPhase,
  firstMissionDate: isoDate,
  lastTickOffDate: isoDate,
  totalMissions: z.number().int().positive(),
  missions: z.array(missionSchema),
});
export type CalendarResponse = z.infer<typeof calendarResponse>;

// --- Progress & completions ----------------------------------------------------------------

export const progressSchema = z.object({
  totalCompletions: count,
  unlockedPieces: count,
  totalPieces: z.number().int().positive(),
  completionsPerPiece: z.number().int().positive(),
  remainingToNextPiece: count,
  participants: count,
  perDay: z.array(z.object({ day: z.number().int().positive(), completions: count })),
  mine: z.object({ completed: count, possible: count }),
});
export type ApiProgress = z.infer<typeof progressSchema>;

export const completionRequest = z.object({ day: z.number().int().positive() });
export const dayParams = z.object({ day: z.coerce.number().int().positive() });

export const completionResponse = z.object({
  day: z.number().int().positive(),
  completed: z.boolean(),
  newlyUnlockedPieces: count,
  progress: progressSchema,
});
export type CompletionResponse = z.infer<typeof completionResponse>;

// --- Board ----------------------------------------------------------------------------------

export const boardAreaSchema = z.enum([
  'tray_left',
  'tray_right',
  'board',
]) satisfies z.ZodType<BoardArea>;

export const boardPieceSchema = z.object({
  id: z.number().int().positive(),
  area: boardAreaSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  z: z.number().int(),
  placed: z.boolean(),
  isNew: z.boolean(),
  alt: z.string(),
});
export type ApiBoardPiece = z.infer<typeof boardPieceSchema>;

export const boardResponse = z.object({
  grid: z.object({ columns: z.number().int().positive(), rows: z.number().int().positive() }),
  snapTolerance: z.number().positive(),
  totalPieces: z.number().int().positive(),
  pieces: z.array(boardPieceSchema),
  /** Pieces placed in this user's trays by this request, i.e. unlocked since the last visit. */
  arrived: count,
  /** The user had no pieces before this request. */
  firstVisit: z.boolean(),
});
export type BoardResponse = z.infer<typeof boardResponse>;

/** Positions outside [0, 1] are accepted and clamped by the server. */
export const movePieceRequest = z.object({
  area: boardAreaSchema,
  x: z.number().min(-10).max(10),
  y: z.number().min(-10).max(10),
});
export type MovePieceRequest = z.infer<typeof movePieceRequest>;
export const movePieceResponse = z.object({ piece: boardPieceSchema });
export const pieceIdParams = z.object({ id: z.coerce.number().int().positive() });

export const healthResponse = z.object({ status: z.enum(['ok', 'error']) });
