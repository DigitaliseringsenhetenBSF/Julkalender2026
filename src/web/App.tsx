import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiUser } from '../shared/contract.ts';
import { ApiCallError, api } from './api.ts';
import { DevSignIn } from './components/DevSignIn.tsx';
import { Header } from './components/Header.tsx';
import { Intro } from './components/Intro.tsx';
import { MissionGrid } from './components/MissionGrid.tsx';
import { Puzzle } from './puzzle/Puzzle.tsx';
import { errorMessage, sv } from './texts.sv.ts';
import { useCampaign } from './useCampaign.ts';

type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: ApiUser };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setAuth({ status: 'signedIn', user }))
      .catch(() => setAuth({ status: 'signedOut' }));
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setAuth({ status: 'signedOut' });
  }, []);

  if (auth.status === 'loading') {
    return (
      <p className="page-status" role="status">
        {sv.loading}
      </p>
    );
  }
  if (auth.status === 'signedOut') {
    return <DevSignIn onSignedIn={(user) => setAuth({ status: 'signedIn', user })} />;
  }
  return (
    <CalendarPage
      user={auth.user}
      onSignOut={signOut}
      onSessionLost={() => setAuth({ status: 'signedOut' })}
    />
  );
}

/** How long the visual toast stays (the live region announcement is separate). */
const TOAST_MS = 5000;

function CalendarPage(props: { user: ApiUser; onSignOut: () => void; onSessionLost: () => void }) {
  const { calendar, progress, loadFailed, reload, setCompletion, openLucka } = useCampaign(
    props.onSessionLost,
  );
  const [announcement, setAnnouncement] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const claimedUnlocks = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const announce = useCallback((message: string) => {
    // Clear first so repeating the same sentence is still announced.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const toast = useCallback((message: string) => {
    setToastText(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), TOAST_MS);
  }, []);

  async function toggle(day: number, completed: boolean) {
    setBusyDay(day);
    setErrorText(null);
    try {
      const result = await setCompletion(day, completed);
      if (result.newlyUnlockedPieces > 0) {
        claimedUnlocks.current += result.newlyUnlockedPieces;
        announce(sv.celebrate.pieceUnlocked);
        toast(sv.celebrate.pieceUnlocked);
      }
    } catch (error) {
      const message = errorMessage(error instanceof ApiCallError ? error.code : 'generic');
      setErrorText(message);
      void reload();
    } finally {
      setBusyDay(null);
    }
  }

  async function open(day: number) {
    setErrorText(null);
    try {
      await openLucka(day);
    } catch (error) {
      setErrorText(errorMessage(error instanceof ApiCallError ? error.code : 'generic'));
    }
  }

  if (!calendar || !progress) {
    return loadFailed ? (
      <main id="main" className="page-status">
        <p role="alert">{sv.loadError}</p>
        <button type="button" className="button button--secondary" onClick={() => void reload()}>
          {sv.retry}
        </button>
      </main>
    ) : (
      <p className="page-status" role="status">
        {sv.loading}
      </p>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        {sv.skipToContent}
      </a>
      <Header
        user={props.user}
        simulatedToday={calendar.simulated ? calendar.today : null}
        onSignOut={props.onSignOut}
      />
      <main id="main" className="page" tabIndex={-1}>
        {errorText && (
          <p className="banner banner--error" role="alert">
            {errorText}
          </p>
        )}
        <Intro calendar={calendar} completionsPerPiece={progress.completionsPerPiece} />
        <Puzzle
          unlockedPieces={progress.unlockedPieces}
          completionsPerPiece={progress.completionsPerPiece}
          claimedUnlocks={claimedUnlocks}
          announce={announce}
          toast={toast}
          onSessionLost={props.onSessionLost}
        />
        <MissionGrid
          calendar={calendar}
          busyDay={busyDay}
          onToggle={(d, c) => void toggle(d, c)}
          onOpen={(d) => void open(d)}
        />
      </main>
      {/* Kept as a discreet link: users must be told how their data is handled (GDPR art. 13). */}
      <footer className="site-footer">
        <details>
          <summary>{sv.privacy.heading}</summary>
          {sv.privacy.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
      </footer>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {toastText && (
        <div className="toast" aria-hidden="true">
          <span className="toast__icon">✨</span> {toastText}
        </div>
      )}
    </>
  );
}
