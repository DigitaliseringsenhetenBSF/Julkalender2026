import { useState } from 'react';
import { sv } from '../texts.sv.ts';

const SEEN_KEY = 'mjk-intro-seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** "Så funkar det" – open on the first visit, remembered per browser as a convenience. */
export function Intro({ completionsPerPiece }: { completionsPerPiece: number }) {
  const [open] = useState(() => !readSeen());

  function onToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    try {
      localStorage.setItem(SEEN_KEY, event.currentTarget.open ? '0' : '1');
    } catch {
      // Storage may be unavailable (private mode); the intro then simply opens every time.
    }
  }

  return (
    <details className="card intro" open={open} onToggle={onToggle}>
      <summary>{sv.intro.title}</summary>
      <ol>
        {sv.intro.items(completionsPerPiece).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </details>
  );
}
