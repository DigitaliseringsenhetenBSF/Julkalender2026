import { mkdirSync } from 'node:fs';
import pg from 'pg';

/**
 * Minimal database interface shared by PostgreSQL (staging/production) and PGlite (local dev
 * and tests). Plain SQL with $1-style parameters – both engines speak the same dialect.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createPostgresDb(connectionString: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle client losing its connection must not crash the process.
  pool.on('error', (err) => console.error('PostgreSQL pool error', err));

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(sql, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await client.query(sql);
    },
  });

  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Embedded Postgres (WASM). `dataDir` is a folder for a persistent dev database, or
 * "memory://" for a throwaway one. Loaded lazily so production never pulls in the WASM build.
 * PGlite executes one query at a time; transactions are serialised by PGlite itself.
 */
export async function createPgliteDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (!dataDir.startsWith('memory://')) mkdirSync(dataDir, { recursive: true });
  const db = await PGlite.create(dataDir);

  type PgliteLike = Pick<typeof db, 'query' | 'exec'>;
  const wrap = (target: PgliteLike): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await target.query<T>(sql, params);
      return result.rows;
    },
    async exec(sql: string) {
      await target.exec(sql);
    },
  });

  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}

export function openDatabase(options: { databaseUrl?: string; pgliteDir: string }): Promise<Db> {
  return options.databaseUrl
    ? createPostgresDb(options.databaseUrl)
    : createPgliteDb(options.pgliteDir);
}
