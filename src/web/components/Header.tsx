import type { ApiUser } from '../../shared/contract.ts';
import { sv } from '../texts.sv.ts';

interface HeaderProps {
  user: ApiUser;
  simulatedToday: string | null;
  /** null when the sign-in is not ours to end (portal mode). */
  onSignOut: (() => void) | null;
}

export function Header({ user, simulatedToday, onSignOut }: HeaderProps) {
  return (
    <>
      {simulatedToday && (
        <p className="sim-banner" role="note">
          {sv.simulatedDate(simulatedToday)}
        </p>
      )}
      <header className="site-header">
        <div className="site-header__inner">
          <div>
            <h1 className="site-title">{sv.appName}</h1>
            <p className="site-org">{sv.orgLine}</p>
          </div>
          <div className="site-user">
            <span className="muted">{sv.signedInAs(user.displayName)}</span>
            {onSignOut && (
              <button type="button" className="button button--ghost" onClick={onSignOut}>
                {sv.signOut}
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
