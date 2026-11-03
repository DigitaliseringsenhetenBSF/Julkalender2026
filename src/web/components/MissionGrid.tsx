import type { CalendarResponse } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

interface MissionGridProps {
  calendar: CalendarResponse;
  busyDay: number | null;
  onToggle: (day: number, completed: boolean) => void;
}

/** The 24 luckor: locked ones show when they open; open ones can be ticked off any time. */
export function MissionGrid({ calendar, busyDay, onToggle }: MissionGridProps) {
  const closed = calendar.phase === 'closed';
  return (
    <section className="card missions" aria-labelledby="missions-heading">
      <h2 id="missions-heading">{sv.missions.heading}</h2>
      <p className="lead">{sv.missions.lead}</p>
      <ol className="luckor">
        {calendar.missions.map((mission) => {
          if (mission.status === 'locked') {
            return (
              <li key={mission.day} className="lucka lucka--locked">
                <span className="lucka__day" aria-hidden="true">
                  {mission.day}
                </span>
                <span className="lucka__locked">
                  <span aria-hidden="true">🔒 </span>
                  <span className="visually-hidden">Lucka {mission.day}: </span>
                  {sv.missions.locked(mission.opensOn)}
                </span>
              </li>
            );
          }
          const title = mission.title ?? '';
          const id = `lucka-${mission.day}`;
          return (
            <li
              key={mission.day}
              className={`lucka${mission.status === 'today' ? ' lucka--today' : ''}${
                mission.completed ? ' lucka--done' : ''
              }`}
            >
              <div className="lucka__top">
                <span className="lucka__day" aria-hidden="true">
                  {mission.day}
                </span>
                {mission.status === 'today' && (
                  <span className="pill pill--today">{sv.missions.today}</span>
                )}
              </div>
              <h3 className="lucka__title" id={`${id}-title`}>
                {title}
              </h3>
              <p className="lucka__text">{mission.description}</p>
              <label className="lucka__check">
                <input
                  type="checkbox"
                  checked={mission.completed}
                  disabled={closed || busyDay === mission.day}
                  aria-label={sv.missions.checkboxLabel(mission.day, title)}
                  onChange={(event) => onToggle(mission.day, event.currentTarget.checked)}
                />
                <span aria-hidden="true">{sv.missions.done}</span>
              </label>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
