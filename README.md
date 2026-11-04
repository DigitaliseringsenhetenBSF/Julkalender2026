# Miljöjulkalendern

An environmental Advent calendar for the staff of **Skolkontoret, Barn- och skolförvaltningen
(BSF), Lunds kommun**.

- **What it is:** 24 miljöuppdrag, one lucka per day from 1 to 24 December 2026.
- **How it works:** Everyone's tick-offs are pooled, and every 15 completions unlock a pusselbit
  of a shared picture.
- **The puzzle:** Each person assembles the puzzle on their own board, saved on the server.

The full specification is [docs/SPEC.md](docs/SPEC.md), the living source of truth. See also
[TECHNICAL_PLAN](docs/TECHNICAL_PLAN.md), [SYSTEM_CONTRACT](docs/SYSTEM_CONTRACT.md),
[ARCHITECTURE](docs/ARCHITECTURE.md) and [TASKS](docs/TASKS.md).

> **Status:** working local version with test data; ready to run behind Verktygsportalen.
>
> - The 24 uppdrag come from the campaign owner's document (2026-11-04).
> - Locally, sign-in is a test-user picker (`AUTH_MODE=dev`), which the server refuses to run in
>   production. In production the calendar runs behind Verktygsportalen, whose login is the
>   identity (`AUTH_MODE=portal`, see below).
> - The calendar is temporary: it is taken down entirely in early January 2027 (the owner's
>   decision 2026-11-04), service and database included.

## Quick start

Requires Node.js 24 or newer. No Docker or database install is needed: locally the app uses
PGlite, an embedded PostgreSQL.

```bash
npm ci
cp .env.example .env
FAKE_TODAY=2026-12-10 SEED_DEMO=true npm run dev
```

Open <http://localhost:5173>, choose a test user and try it out.

- `FAKE_TODAY` makes the server act as if it were that day.
- `SEED_DEMO` adds 39 demo completions (with 10 per piece), so 3 pieces are unlocked and the next
  tick-off unlocks the 4th.

## Commands

| Task                                             | Command                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                                          | `npm ci`                                                                                                                                                        |
| Dev server (API on :3001 + Vite on :5173)        | `npm run dev`                                                                                                                                                   |
| Simulate a date (dev/staging only)               | `FAKE_TODAY=2026-12-10 npm run dev` or a full timestamp such as `FAKE_TODAY=2026-11-30T23:59:00+01:00`                                                          |
| Migrate the database                             | `npm run db:migrate`                                                                                                                                            |
| Seed content and test users                      | `npm run db:seed`                                                                                                                                               |
| Seed demo completions                            | `FAKE_TODAY=2026-12-10 npm run db:seed:demo`                                                                                                                    |
| Unlock every piece (try laying the whole puzzle) | Stop the dev server, then `FAKE_TODAY=2026-12-10 npm run db:seed:all-pieces`, and sign in as "Pusseltestare (alla bitar)". Delete `.data/pglite` to start over. |
| Unit and integration tests                       | `npm test`                                                                                                                                                      |
| E2E and accessibility tests                      | `npx playwright install chromium webkit`, then `npm run test:e2e`                                                                                               |
| Lint / format / type check                       | `npm run lint` · `npm run format` · `npm run typecheck`                                                                                                         |
| Lint, type check and tests in one go             | `npm run check`                                                                                                                                                 |
| Build                                            | `npm run build`                                                                                                                                                 |
| Start (built app)                                | `npm start`                                                                                                                                                     |
| Smoke verification                               | `npm run smoke -- http://localhost:3000`                                                                                                                        |
| Cut the puzzle into jigsaw pieces                | `npm run puzzle:cut` (only before launch: the shapes must not change afterwards)                                                                                |
| GDPR purge after the campaign                    | `npm run gdpr:purge` (dry run) · `npm run gdpr:purge -- --confirm`                                                                                              |
| Deploy                                           | Render Blueprint `render.yaml` (a private service behind Verktygsportalen, see below). Created by the portal's owner in the Render dashboard                    |

## Behind Verktygsportalen (`AUTH_MODE=portal`)

In production the calendar is not a site of its own: Verktygsportalen serves it under
`/julkalender` through a proxy that only a signed-in person gets past, and tells the calendar
who they are. Nothing is listed in the portal; only people with the address find it.

- The portal's proxy forwards every request under `/julkalender` unchanged to this service (a
  **private** Render service, no public address) with three headers: `x-portal-key` (the shared
  secret), `x-portal-user` (the verified e-mail address) and `x-portal-name` (the display name,
  percent-encoded). `src/api/auth/portalAuth.ts` accepts an identity only when the key matches
  `PORTAL_KEY`; the person is created in `users` on their first visit as `portal:<e-mail>`.
- There is no cookie and no "Logga ut" in this mode: the portal's session is the session, and
  the portal's logout is the way out. Without a signed-in person `/api/me` answers
  `401 PORTAL_SIGN_IN` and the page says to open the calendar via the portal.
- `BASE_PATH=/julkalender` puts the API, the icons, the piece images and the built web app under
  that path, so the proxy needs no rewriting. `/health` stays at the root for Render.
- The dev picker, `FAKE_TODAY` and `SEED_DEMO` stay refused in production as before.

To try it locally: build with the base path, start in portal mode and send the headers yourself.

```bash
BASE_PATH=/julkalender npm run build
APP_ENV=development AUTH_MODE=portal PORTAL_KEY=$(openssl rand -hex 32) BASE_PATH=/julkalender PORT=3001 npm start
# in another shell, with the same key:
curl -H "x-portal-key: $KEY" -H "x-portal-user: anna@skola.lund.se" -H "x-portal-name: Anna" http://127.0.0.1:3001/julkalender/api/me
```

The portal's side (the proxy, the hidden registry entry, the variables `JULKALENDER_URL` and
`JULKALENDER_KEY`) lives in the portal's repository, `DigitaliseringsenhetenBSF/lund_kommun_RAG`
(its `docs/LAB_SERVICES.md`).

## Changing content

| What                                    | Where                                                | Then                                                                                   |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Mission texts and icons                 | `content/missions.json`, `assets/icons/lucka-NN.svg` | `npm run db:seed`, or restart the server, which applies content on start               |
| Rules (dates, threshold 10, close date) | `content/campaign.json`                              | Changing rules after launch is a game-rule change, so ask first                        |
| Puzzle image, grid and alt texts        | `assets/puzzle/source/`, `content/puzzle.json`       | Then `npm run puzzle:cut`. The unlock order is frozen once the first piece is unlocked |
| Colours and fonts                       | `src/web/styles/tokens.css`                          | Placeholders until Lund's graphic profile is provided                                  |
| UI wording                              | `src/web/texts.sv.ts`                                | All Swedish texts live in this one file                                                |
