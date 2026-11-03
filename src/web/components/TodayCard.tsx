import { daysBetween } from '../../domain/calendar.ts';
import type { CalendarResponse } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

interface TodayCardProps {
  calendar: CalendarResponse;
  busyDay: number | null;
  onToggle: (day: number, completed: boolean) => void;
}

export function TodayCard({ calendar, busyDay, onToggle }: TodayCardProps) {
  const todayMission = calendar.missions.find((m) => m.status === 'today');

  let body: React.ReactNode;
  if (calendar.phase === 'before') {
    body = (
      <>
        <p className="today__lead">{sv.today.before(calendar.firstMissionDate)}</p>
        <p className="muted">
          {sv.today.daysLeft(daysBetween(calendar.today, calendar.firstMissionDate))}
        </p>
      </>
    );
  } else if (calendar.phase === 'closed') {
    body = <p className="today__lead">{sv.today.closed}</p>;
  } else if (calendar.phase === 'catch_up' || !todayMission) {
    const left = calendar.missions.filter((m) => m.status !== 'locked' && !m.completed).length;
    body = (
      <>
        <p className="today__lead">{sv.today.catchUp(calendar.lastTickOffDate)}</p>
        <p className="muted">{sv.today.leftToDo(left)}</p>
      </>
    );
  } else {
    const busy = busyDay === todayMission.day;
    body = (
      <>
        <p className="eyebrow">{sv.today.lucka(todayMission.day, todayMission.opensOn)}</p>
        <h3 className="today__title">{todayMission.title}</h3>
        <p>{todayMission.description}</p>
        {todayMission.completed ? (
          <div className="today__done">
            <p className="done-badge">
              <span aria-hidden="true">✓ </span>
              {sv.today.done}
            </p>
            <button
              type="button"
              className="button button--ghost"
              aria-label={sv.today.undoLabel(todayMission.day)}
              disabled={busy}
              onClick={() => onToggle(todayMission.day, false)}
            >
              {sv.today.undo}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button button--primary button--large"
            disabled={busy}
            onClick={() => onToggle(todayMission.day, true)}
          >
            {sv.today.doIt}
          </button>
        )}
      </>
    );
  }

  return (
    <section className="card today" aria-labelledby="today-heading">
      <h2 id="today-heading">{sv.today.heading}</h2>
      {body}
    </section>
  );
}
