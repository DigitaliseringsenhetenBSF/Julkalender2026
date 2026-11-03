import type { FastifyInstance } from 'fastify';
import {
  campaignPhase,
  canChangeCompletion,
  localDateInZone,
  missionOpenDate,
  missionStatus,
  openMissionCount,
} from '../../domain/calendar.ts';
import { setCompletion } from '../../data/completions.ts';
import { findMissionIdByDay, listCompletedDays, listMissions } from '../../data/missions.ts';
import { getProgress } from '../../data/progress.ts';
import {
  type CalendarResponse,
  type CompletionResponse,
  completionRequest,
  dayParams,
} from '../../shared/contract.ts';
import { currentUser } from '../auth/session.ts';
import type { AppContext } from '../context.ts';
import { ApiError, parseInput } from '../errors.ts';

/** "Today" in the campaign time zone, from the server clock (never the client's). */
export function campaignToday(ctx: AppContext): string {
  return localDateInZone(ctx.clock.now(), ctx.calendar.timezone);
}

export async function calendarRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get('/api/calendar', async (request): Promise<CalendarResponse> => {
    const user = currentUser(request);
    const today = campaignToday(ctx);
    const [missions, completed] = await Promise.all([
      listMissions(ctx.db),
      listCompletedDays(ctx.db, user.id),
    ]);
    return {
      today,
      simulated: ctx.clock.simulated,
      phase: campaignPhase(today, ctx.calendar),
      firstMissionDate: ctx.calendar.firstMissionDate,
      lastTickOffDate: ctx.calendar.lastTickOffDate,
      totalMissions: ctx.calendar.totalMissions,
      missions: missions.map((m) => {
        const status = missionStatus(m.day, today, ctx.calendar);
        const locked = status === 'locked';
        return {
          day: m.day,
          opensOn: missionOpenDate(m.day, ctx.calendar),
          status,
          // Locked luckor never reveal their content (SPEC §5.1).
          title: locked ? null : m.title,
          description: locked ? null : m.description,
          completed: completed.has(m.day),
        };
      }),
    };
  });

  app.get('/api/progress', async (request) => {
    const user = currentUser(request);
    const open = openMissionCount(campaignToday(ctx), ctx.calendar);
    return getProgress(ctx.db, user.id, open, ctx.rules);
  });

  async function changeCompletion(
    userId: number,
    day: number,
    completed: boolean,
  ): Promise<CompletionResponse> {
    if (day > ctx.calendar.totalMissions) {
      throw new ApiError(400, 'VALIDATION_ERROR', `day must be 1–${ctx.calendar.totalMissions}`);
    }
    const today = campaignToday(ctx);
    // The API enforces the calendar; hiding future luckor in the UI is not enough (SPEC §5.2).
    const decision = canChangeCompletion(day, today, ctx.calendar);
    if (decision === 'campaign_closed') {
      throw new ApiError(409, 'CAMPAIGN_CLOSED', 'The calendar is closed for tick-offs');
    }
    if (decision === 'mission_locked') {
      throw new ApiError(409, 'MISSION_LOCKED', `Lucka ${day} is not open yet`);
    }
    const missionId = await findMissionIdByDay(ctx.db, day);
    if (missionId === null) throw new ApiError(404, 'NOT_FOUND', `No mission for day ${day}`);

    const newlyUnlockedPieces = await setCompletion(
      ctx.db,
      { userId, missionId, completed },
      ctx.rules,
    );
    const progress = await getProgress(
      ctx.db,
      userId,
      openMissionCount(today, ctx.calendar),
      ctx.rules,
    );
    return { day, completed, newlyUnlockedPieces, progress };
  }

  app.post('/api/completions', async (request) => {
    const { day } = parseInput(completionRequest, request.body);
    return changeCompletion(currentUser(request).id, day, true);
  });

  app.delete('/api/completions/:day', async (request) => {
    const { day } = parseInput(dayParams, request.params);
    return changeCompletion(currentUser(request).id, day, false);
  });
}
