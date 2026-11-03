import type { Queryable } from './db.ts';

export type Role = 'user' | 'admin';

export interface User {
  id: number;
  displayName: string;
  role: Role;
}

/** Prefix for the seeded test identities used by AUTH_MODE=dev. */
export const DEV_USER_PREFIX = 'dev:';

const SELECT_USER = 'SELECT id, display_name AS "displayName", role FROM users';

export async function findUserById(db: Queryable, id: number): Promise<User | null> {
  const [user] = await db.query<User>(`${SELECT_USER} WHERE id = $1`, [id]);
  return user ?? null;
}

export async function listDevUsers(db: Queryable): Promise<User[]> {
  return db.query<User>(`${SELECT_USER} WHERE external_id LIKE $1 ORDER BY role DESC, id`, [
    `${DEV_USER_PREFIX}%`,
  ]);
}

/** Creates the user on first sign-in; keeps id and role stable afterwards. */
export async function upsertUser(
  db: Queryable,
  input: { externalId: string; displayName: string; role?: Role },
): Promise<User> {
  const [user] = await db.query<User>(
    `INSERT INTO users (external_id, display_name, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (external_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id, display_name AS "displayName", role`,
    [input.externalId, input.displayName, input.role ?? 'user'],
  );
  if (!user) throw new Error('upsertUser returned no row');
  return user;
}
