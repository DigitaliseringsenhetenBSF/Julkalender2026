import { useEffect, useState } from 'react';
import type { ApiUser } from '../../shared/contract.ts';
import { api } from '../api.ts';
import { sv } from '../texts.sv.ts';

/** TEMPORARY sign-in for AUTH_MODE=dev: choose a seeded test user. */
export function DevSignIn({ onSignedIn }: { onSignedIn: (user: ApiUser) => void }) {
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .devUsers()
      .then((r) => setUsers(r.users))
      .catch(() => setError(true));
  }, []);

  async function signIn(userId: number) {
    try {
      const { user } = await api.devLogin(userId);
      onSignedIn(user);
    } catch {
      setError(true);
    }
  }

  return (
    <main id="main" className="signin">
      <div className="card signin__card">
        <p className="eyebrow">{sv.appName}</p>
        <h1>{sv.devSignIn.title}</h1>
        <p>{sv.devSignIn.lead}</p>
        {error && <p role="alert">{sv.devSignIn.error}</p>}
        {users && (
          <ul className="signin__list">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void signIn(user.id)}
                >
                  {user.displayName}
                  {user.role === 'admin' && <span className="muted"> ({sv.devSignIn.admin})</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
