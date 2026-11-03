import { describe, expect, it } from 'vitest';
import {
  type CalendarConfig,
  campaignPhase,
  canChangeCompletion,
  daysBetween,
  localDateInZone,
  missionOpenDate,
  missionStatus,
  openMissionCount,
} from '../../src/domain/calendar.ts';

const config: CalendarConfig = {
  timezone: 'Europe/Stockholm',
  firstMissionDate: '2026-12-01',
  totalMissions: 24,
  lastTickOffDate: '2027-01-10',
};

/** "Today" for an instant given with an explicit offset, as the server computes it. */
const todayAt = (iso: string) => localDateInZone(new Date(iso), config.timezone);

describe('localDateInZone', () => {
  it('uses Stockholm wall-clock time, not UTC', () => {
    // 23:00 UTC on 30 Nov is already 00:00 on 1 Dec in Stockholm (UTC+1 in winter).
    expect(todayAt('2026-11-30T22:59:59Z')).toBe('2026-11-30');
    expect(todayAt('2026-11-30T23:00:00Z')).toBe('2026-12-01');
  });

  it('follows summer time (UTC+2) as well', () => {
    expect(todayAt('2026-06-30T21:59:59Z')).toBe('2026-06-30');
    expect(todayAt('2026-06-30T22:00:00Z')).toBe('2026-07-01');
  });
});

describe('open luckor around the boundaries', () => {
  it.each([
    ['2026-11-30T23:59:00+01:00', 0, 'before'],
    ['2026-12-01T00:00:00+01:00', 1, 'active'],
    ['2026-12-01T23:59:00+01:00', 1, 'active'],
    ['2026-12-02T00:00:00+01:00', 2, 'active'],
    ['2026-12-23T23:59:00+01:00', 23, 'active'],
    ['2026-12-24T00:00:00+01:00', 24, 'active'],
    ['2026-12-24T23:59:00+01:00', 24, 'active'],
    ['2026-12-25T00:00:00+01:00', 24, 'catch_up'],
    ['2027-01-10T23:59:00+01:00', 24, 'catch_up'],
    ['2027-01-11T00:00:00+01:00', 24, 'closed'],
  ])('at %s: %i open, phase %s', (instant, open, phase) => {
    const today = todayAt(instant);
    expect(openMissionCount(today, config)).toBe(open);
    expect(campaignPhase(today, config)).toBe(phase);
  });

  it('has no luckor open long before the campaign', () => {
    expect(openMissionCount('2026-11-03', config)).toBe(0);
  });
});

describe('missionStatus', () => {
  it('marks today, earlier and future luckor', () => {
    expect(missionStatus(10, '2026-12-10', config)).toBe('today');
    expect(missionStatus(1, '2026-12-10', config)).toBe('open');
    expect(missionStatus(11, '2026-12-10', config)).toBe('locked');
  });

  it('opens every lucka after 24 December with none marked today', () => {
    for (let day = 1; day <= 24; day++) {
      expect(missionStatus(day, '2026-12-28', config)).toBe('open');
    }
  });

  it('rejects days outside 1–24', () => {
    expect(missionStatus(0, '2026-12-28', config)).toBe('locked');
    expect(missionStatus(25, '2026-12-28', config)).toBe('locked');
  });
});

describe('canChangeCompletion', () => {
  it('allows today and past days, rejects future days', () => {
    expect(canChangeCompletion(10, '2026-12-10', config)).toBe('ok');
    expect(canChangeCompletion(1, '2026-12-10', config)).toBe('ok');
    expect(canChangeCompletion(11, '2026-12-10', config)).toBe('mission_locked');
  });

  it('rejects everything before the start and after the close date', () => {
    expect(canChangeCompletion(1, '2026-11-30', config)).toBe('mission_locked');
    expect(canChangeCompletion(1, '2027-01-10', config)).toBe('ok');
    expect(canChangeCompletion(1, '2027-01-11', config)).toBe('campaign_closed');
  });
});

describe('date helpers', () => {
  it('computes open dates across month boundaries', () => {
    expect(missionOpenDate(1, config)).toBe('2026-12-01');
    expect(missionOpenDate(24, config)).toBe('2026-12-24');
    expect(daysBetween('2026-12-24', '2027-01-10')).toBe(17);
  });
});
