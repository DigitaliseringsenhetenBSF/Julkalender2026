# TECHNICAL PLAN – Miljöjulkalendern

## Stack (approved 2026-11-03)

| Layer      | Choice                                                                                                      | Why                                                                                                      | Alternatives considered        |
| ---------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Runtime    | Node.js ≥ 24 (LTS), TypeScript 6 strict, ESM                                                                | One language end to end; Node runs `.ts` natively in dev (type stripping), `tsc` compiles for production | Python/FastAPI (two languages) |
| HTTP       | Fastify 5, `@fastify/cookie`, `@fastify/static`                                                             | Mature, fast, small                                                                                      | Express 5                      |
| Validation | zod 4, schemas shared by server and client (`src/shared/contract.ts`)                                       | One contract, checked at runtime both ways                                                               | JSON Schema                    |
| Database   | PostgreSQL (Render managed) in staging/prod; **PGlite** (Postgres compiled to WASM) for local dev and tests | Same SQL dialect everywhere; no Docker on the dev machine                                                | SQLite locally (dialect drift) |
| DB access  | Plain SQL behind a 40-line adapter (`src/data/db.ts`); numbered `.sql` migrations                           | Auditable, no ORM                                                                                        | Drizzle, Kysely                |
| Frontend   | React 19 + Vite 8, plain CSS with tokens                                                                    | Best-known option; pointer events for drag (no library)                                                  | Vanilla TS, Preact             |
| Tests      | Vitest (unit + integration via `fastify.inject` against in-memory PGlite), Playwright + axe                 | Fast, no external services                                                                               | Jest                           |

## Runtime configuration

All configuration comes from environment variables (`.env.example`), validated at start-up by
`src/api/config.ts`.

| Variable         | Notes                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`        | `development`, `test`, `staging` or `production`.                                                                          |
| `PORT`           | HTTP port.                                                                                                                 |
| `DATABASE_URL`   | Required in staging and production. When it is empty, PGlite runs in `PGLITE_DIR` (`memory://` for an in-memory database). |
| `SESSION_SECRET` | Required, 32 or more characters, in staging and production.                                                                |
| `AUTH_MODE`      | Only `dev` exists so far. It is refused in production.                                                                     |
| `FAKE_TODAY`     | Date simulation. Refused in production.                                                                                    |

Campaign rules are content and live in `content/*.json` (see SPEC §5).

## Hosting (proposal – needs approval before creating anything)

- **Web service:** One Render web service (Node, plan _starter_ or higher, so it doesn't spin down
  and a pre-deploy step is available).
  - Build: `npm ci && npm run build`.
  - Pre-deploy: `node dist/scripts/migrate.js`.
  - Start: `npm start`.
  - Health check: `/health`.
- **Database:** One Render PostgreSQL. A paid tier is needed: as far as we know, free databases
  expire after 30 days **[unverified]**.
- **Region:** Frankfurt (EU data residency).
- **Blueprint:** `render.yaml`.
- **Environments:** _staging_ (`APP_ENV=staging`, dev sign-in and date simulation allowed) and
  _production_ (`APP_ENV=production`, only once real sign-in exists).

## Auth approach

- **The seam:** `src/api/auth/` owns identity. The rest of the server only reads `request.user`.
- **Dev mode:** a test-user picker plus a signed cookie with the user ID.
- **Real sign-in (later):**
  - Add a provider, e.g. Entra ID OIDC: authorization-code flow, then a callback that upserts the
    user by `external_id` and calls `setSession`.
  - Set `AUTH_MODE=entra`.
  - No other module changes.

## Puzzle rendering

- **Pieces:** 24 provided square PNG tiles, 256×256 px with painted jigsaw edges, in a 6 × 4 grid.
  They render as `<img>` inside absolutely positioned buttons, in one layer that spans trays and
  board, so a drag can cross areas.
- **Sizing:** Piece size = board width / columns. The board keeps a 3:2 aspect ratio. Positions are
  stored normalised (SPEC §5.5) and converted to pixels from measured rectangles
  (`ResizeObserver`).
- **Drag:** Pointer Events with `setPointerCapture` and `touch-action: none`.
  - Drop → find the area under the piece centre → normalise → run the domain `resolveDrop` (snap)
    → optimistic update → save.
- **Saving:** one in-flight request per piece and the latest position wins. Retries use
  exponential backoff (1 s → 30 s) and show a status line.
- **Keyboard/click alternative:** select a piece, then a slot button in the 6 × 4 grid (roving
  focus with the arrow keys).
- **Image secrecy:** images are fetched from `/api/pieces/:id/image`, which only answers for
  unlocked pieces.

## Date simulation

- **How:** Start the server with `FAKE_TODAY=2026-12-10` or a full ISO timestamp. Example:
  `FAKE_TODAY=2026-12-10 npm run dev`.
  - The clock module returns that instant, and the API reports `simulated: true`. The UI then
    shows a banner.
  - A date without time means 12:00 UTC on that date, which is the same calendar date in
    Stockholm.
- **Production:** start-up throws if `FAKE_TODAY` is set while `APP_ENV=production`.

## Test approach

| Level       | What                                                                                                                                                   | Where               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Unit        | Calendar/phase boundaries, piece maths, high-water mark, unlock order, snap/clamp, tray choice                                                         | `tests/unit`        |
| Integration | API via `fastify.inject` on in-memory PGlite: auth, tick-off rules, idempotency, un-tick, concurrency, board isolation, image gating, contract parsing | `tests/integration` |
| E2E + a11y  | Playwright (Chromium desktop, WebKit phone): tick off → new piece → drag → reload; keyboard-only flow; axe                                             | `tests/e2e`         |
| Smoke       | `npm run smoke -- <url>`: `/health`, page load, dev sign-in, tick-off, counter check                                                                   | `scripts/smoke.ts`  |

**Known limitation:** PGlite runs queries serially, so the concurrency test proves the logic, not
real Postgres parallelism. Re-run it against Render Postgres in staging with
`DATABASE_URL=… npm test`.
