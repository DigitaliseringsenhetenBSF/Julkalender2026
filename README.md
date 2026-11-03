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

> **Status:** working local version with test data.
>
> - The 24 uppdrag are placeholders ("Uppdrag 1–24").
> - Sign-in is a temporary test-user picker (`AUTH_MODE=dev`), which the server refuses to run in
>   production.

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
- `SEED_DEMO` adds 59 demo completions, so 3 pieces are unlocked and the next tick-off unlocks the
  4th.

## Commands

| Task                                      | Command                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Install                                   | `npm ci`                                                                                               |
| Dev server (API on :3001 + Vite on :5173) | `npm run dev`                                                                                          |
| Simulate a date (dev/staging only)        | `FAKE_TODAY=2026-12-10 npm run dev` or a full timestamp such as `FAKE_TODAY=2026-11-30T23:59:00+01:00` |
| Migrate the database                      | `npm run db:migrate`                                                                                   |
| Seed content and test users               | `npm run db:seed`                                                                                      |
| Seed demo completions                     | `FAKE_TODAY=2026-12-10 npm run db:seed:demo`                                                           |
| Unit and integration tests                | `npm test`                                                                                             |
| E2E and accessibility tests               | `npx playwright install chromium webkit`, then `npm run test:e2e`                                      |
| Lint / format / type check                | `npm run lint` · `npm run format` · `npm run typecheck`                                                |
| Lint, type check and tests in one go      | `npm run check`                                                                                        |
| Build                                     | `npm run build`                                                                                        |
| Start (built app)                         | `npm start`                                                                                            |
| Smoke verification                        | `npm run smoke -- http://localhost:3000`                                                               |
| GDPR purge after the campaign             | `npm run gdpr:purge` (dry run) · `npm run gdpr:purge -- --confirm`                                     |
| Deploy                                    | Render Blueprint `render.yaml`. Not created yet; needs approval.                                       |

## Changing content

| What                                    | Where                       | Then                                                                     |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Mission texts                           | `content/missions.json`     | `npm run db:seed`, or restart the server, which applies content on start |
| Rules (dates, threshold 15, close date) | `content/campaign.json`     | Changing rules after launch is a game-rule change, so ask first          |
| Puzzle layout and alt texts             | `content/puzzle.json`       | The unlock order is frozen once the first piece is unlocked              |
| Colours and fonts                       | `src/web/styles/tokens.css` | Placeholders until Lund's graphic profile is provided                    |
| UI wording                              | `src/web/texts.sv.ts`       | All Swedish texts live in this one file                                  |
