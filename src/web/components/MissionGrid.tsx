import { useEffect, useRef } from 'react';
import type { ApiMission, CalendarResponse } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

interface MissionGridProps {
  calendar: CalendarResponse;
  busyDay: number | null;
  onToggle: (day: number, completed: boolean) => void;
  onOpen: (day: number) => void;
}

/**
 * The 24 luckor as doors. A door whose date has come can be turned ("vänd") to reveal the
 * uppdrag; once opened it stays open (stored on the server). Future doors show when they open.
 */
export function MissionGrid({ calendar, busyDay, onToggle, onOpen }: MissionGridProps) {
  const headings = useRef(new Map<number, HTMLHeadingElement>());
  const focusAfterOpen = useRef<number | null>(null);

  // After turning a door, move focus to the uppdrag behind it so screen readers read it.
  useEffect(() => {
    const day = focusAfterOpen.current;
    const heading = day === null ? undefined : headings.current.get(day);
    if (heading) {
      heading.focus();
      focusAfterOpen.current = null;
    }
  });

  function open(day: number) {
    focusAfterOpen.current = day;
    onOpen(day);
  }

  return (
    <section className="card missions" aria-labelledby="missions-heading">
      <h2 id="missions-heading">{sv.missions.heading}</h2>
      <p className="lead">
        {calendar.phase === 'before'
          ? sv.missions.leadBefore(calendar.firstMissionDate)
          : calendar.phase === 'closed'
            ? sv.missions.leadClosed
            : sv.missions.lead}
      </p>
      <ol className="luckor">
        {calendar.missions.map((mission) => (
          <Lucka
            key={mission.day}
            mission={mission}
            closed={calendar.phase === 'closed'}
            busy={busyDay === mission.day}
            onOpen={open}
            onToggle={onToggle}
            headingRef={(el) => {
              if (el) headings.current.set(mission.day, el);
              else headings.current.delete(mission.day);
            }}
          />
        ))}
      </ol>
    </section>
  );
}

interface LuckaProps {
  mission: ApiMission;
  closed: boolean;
  busy: boolean;
  onOpen: (day: number) => void;
  onToggle: (day: number, completed: boolean) => void;
  headingRef: (el: HTMLHeadingElement | null) => void;
}

/** The lucka's icon, drawn in the current text colour (the SVG file is used as a mask). */
function LuckaIcon({ file, className }: { file: string; className: string }) {
  const url = `url("/icons/${file}")`;
  return (
    <span
      className={`lucka-icon ${className}`}
      aria-hidden="true"
      style={{ WebkitMaskImage: url, maskImage: url }}
    />
  );
}

function Lucka({ mission, closed, busy, onOpen, onToggle, headingRef }: LuckaProps) {
  const isToday = mission.status === 'today';

  if (mission.status === 'locked') {
    return (
      <li className="lucka lucka--locked">
        <div className="door door--locked">
          <span className="door__day" aria-hidden="true">
            {mission.day}
          </span>
          <LuckaIcon file={mission.icon} className="door__icon" />
          <span className="door__hint">
            <span aria-hidden="true">🔒 </span>
            <span className="visually-hidden">Lucka {mission.day}: </span>
            {sv.missions.locked(mission.opensOn)}
          </span>
        </div>
      </li>
    );
  }

  const classes = [
    'lucka',
    mission.opened && 'lucka--opened',
    isToday && 'lucka--today',
    mission.completed && 'lucka--done',
  ]
    .filter(Boolean)
    .join(' ');
  const title = mission.title ?? '';

  // The button's name comes from its visible text ("Lucka 3 … Öppna"), so what sighted
  // speech-input users see is part of what they can say (WCAG 2.5.3 Label in Name).
  const doorFace = (
    <>
      <span className="door__day">
        <span className="visually-hidden">Lucka </span>
        {mission.day}
      </span>
      {isToday && <span className="pill pill--today">{sv.missions.today}</span>}
      <LuckaIcon file={mission.icon} className="door__icon" />
      <span className="door__hint">{sv.missions.open}</span>
      <span className="door__knob" aria-hidden="true" />
    </>
  );

  return (
    <li className={classes}>
      <div className="lucka__inner">
        <div className="lucka__face lucka__front" aria-hidden={mission.opened || undefined}>
          {mission.opened ? (
            <div className="door">{doorFace}</div>
          ) : (
            <button type="button" className="door" onClick={() => onOpen(mission.day)}>
              {doorFace}
            </button>
          )}
        </div>
        {/* The back is only rendered once opened, so unopened uppdrag stay a surprise. */}
        {mission.opened && (
          <div className="lucka__face lucka__back">
            <div className="lucka__top">
              <span className="lucka__day" aria-hidden="true">
                {mission.day}
              </span>
              <LuckaIcon file={mission.icon} className="lucka__icon" />
              {isToday && <span className="pill pill--today">{sv.missions.today}</span>}
            </div>
            <h3 className="lucka__title" ref={headingRef} tabIndex={-1}>
              <span className="visually-hidden">Lucka {mission.day}: </span>
              {title}
            </h3>
            <h4 className="lucka__label">{sv.missions.howTo}</h4>
            <p className="lucka__text">{mission.howTo}</p>
            {mission.ifYouWant && (
              <>
                <h4 className="lucka__label">{sv.missions.ifYouWant}</h4>
                <p className="lucka__text">{mission.ifYouWant}</p>
              </>
            )}
            <label className="lucka__check">
              <input
                type="checkbox"
                checked={mission.completed}
                disabled={closed || busy}
                aria-label={sv.missions.checkboxLabel(mission.day, title)}
                onChange={(event) => onToggle(mission.day, event.currentTarget.checked)}
              />
              <span aria-hidden="true">{sv.missions.done}</span>
            </label>
            <p className="lucka__stat">
              <span aria-hidden="true">👥 </span>
              {sv.missions.others(mission.completions, mission.completed)}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}
