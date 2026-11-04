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

- **Pieces (since 2026-11-04):** 45 classic jigsaw pieces (9 × 5) cut from "Vinterfest i den
  snötäckta byn".
  - `npm run puzzle:cut` builds the outlines with `src/domain/jigsaw.ts`: seeded tabs and
    blanks; every interior edge is a tab on one side and the matching blank on the other.
  - It cuts the image in the Chromium that Playwright already installs (canvas clip,
    `toDataURL('image/webp')`), so no image library is needed.
  - Output: `assets/puzzle/pieces/bit-NN.webp` (about 570 kB in total) and
    `content/puzzle-shapes.json`.
- **Rendering:** each piece is an `<img>` inside a button that is clipped to the piece's outline
  (`clip-path: url(#…)` with `objectBoundingBox` units). Only the visible piece reacts to the
  pointer.
  - The shadow and the focus/selection ring use `filter: drop-shadow`, so they follow the
    outline.
  - All pieces sit in one layer that spans trays and board, so a drag can cross areas.
- **Sizing:** The board has the picture's aspect ratio. Cell size = board size / grid, and the
  piece box = cell + 2 × pad. Positions are stored normalised (SPEC §5.5) and converted with
  measured rectangles (`ResizeObserver`).
- **Drag:** Pointer Events with `setPointerCapture` and `touch-action: none`. On drop the piece
  stays exactly where it was dropped: no snapping, no locking, no hints (SPEC §5.5).
- **Saving:** one in-flight request per piece and the latest position wins. Retries use
  exponential backoff (1 s → 30 s).
- **Keyboard/click alternative:** select a piece, then a cell in the 9 × 5 grid. The cells are
  only shown while a piece is selected. The cell is announced, never whether it is right.
- **Image secrecy:** images are fetched from `/api/pieces/:id/image`, which only answers for
  unlocked pieces. The source image is never served.
- **Lucka icons:** `assets/icons/lucka-NN.svg`, served from `/icons/`. Each one is drawn as a
  CSS mask in the current text colour (white on doors, green inside an opened lucka).

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
