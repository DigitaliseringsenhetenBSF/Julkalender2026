import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CONTENT_DIR } from './paths.ts';

/**
 * Campaign content and rules from `content/*.json` (SPEC §5). Validated on load so a typo in a
 * content file stops the server instead of producing a subtly wrong calendar.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const campaignSchema = z.object({
  timezone: z.string().min(1),
  firstMissionDate: isoDate,
  totalMissions: z.number().int().positive(),
  lastTickOffDate: isoDate,
  completionsPerPiece: z.number().int().positive(),
});

const missionsSchema = z.object({
  missions: z.array(
    z.object({
      day: z.number().int().positive(),
      title: z.string().min(1),
      description: z.string(),
    }),
  ),
});

const puzzleSchema = z.object({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  unlockSeed: z.number().int(),
  snapTolerance: z.number().positive().max(0.5),
  pieces: z.array(
    z.object({
      id: z.number().int().positive(),
      // Plain file names only – they are joined onto the pieces folder when served.
      file: z.string().regex(/^[\w.-]+\.png$/),
      alt: z.string().min(1),
    }),
  ),
});

export type CampaignContent = z.infer<typeof campaignSchema>;
export type MissionContent = z.infer<typeof missionsSchema>['missions'][number];
export type PuzzleContent = z.infer<typeof puzzleSchema>;

export interface Content {
  campaign: CampaignContent;
  missions: MissionContent[];
  puzzle: PuzzleContent;
}

function readJson(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(dir, file), 'utf8'));
}

export function loadContent(dir: string = CONTENT_DIR): Content {
  const campaign = campaignSchema.parse(readJson(dir, 'campaign.json'));
  const { missions } = missionsSchema.parse(readJson(dir, 'missions.json'));
  const puzzle = puzzleSchema.parse(readJson(dir, 'puzzle.json'));

  const days = missions.map((m) => m.day).sort((a, b) => a - b);
  const expectedDays = Array.from({ length: campaign.totalMissions }, (_, i) => i + 1);
  if (days.join() !== expectedDays.join()) {
    throw new Error(`missions.json must contain days 1–${campaign.totalMissions} exactly once`);
  }

  const ids = puzzle.pieces.map((p) => p.id).sort((a, b) => a - b);
  const expectedIds = Array.from({ length: puzzle.columns * puzzle.rows }, (_, i) => i + 1);
  if (ids.join() !== expectedIds.join()) {
    throw new Error(`puzzle.json must contain piece ids 1–${expectedIds.length} exactly once`);
  }

  if (campaign.lastTickOffDate < campaign.firstMissionDate) {
    throw new Error('lastTickOffDate must not be before firstMissionDate');
  }

  return { campaign, missions, puzzle };
}
