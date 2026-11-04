# TASKS – Miljöjulkalendern

Status: `[x]` done · `[ ]` open · `[~]` in progress. Each task has acceptance criteria (AC).

## Phase 0 – Foundations (2026-11-03)

- [x] **Repo skeleton:** package.json, TypeScript, ESLint, Prettier, `.env.example`, `.gitignore`.
  - AC: `npm run lint`, `npm run typecheck` pass.
- [x] **Copy the provided pieces** into `assets/puzzle/pieces`. The originals stay untouched.
- [x] **Docs:** SPEC, TECHNICAL_PLAN, SYSTEM_CONTRACT, ARCHITECTURE, TASKS.

## Phase 1 – Domain rules (2026-11-03)

- [x] **Calendar.** AC:
  - phases and open luckor are correct at 23:59 and 00:00 Stockholm on 30 Nov, 1 Dec and 24 Dec;
  - correct after 24 Dec and after 10 Jan;
  - UTC instants are converted correctly.
- [x] **Pieces.** AC:
  - `unlocked` is correct for 0, 14, 15, 29, 30, 45 and values above the cap;
  - the high-water mark is monotonic;
  - "remaining to next" is correct, including after un-ticks.
- [x] **Unlock order.** AC: the same seed gives the same permutation, it is a true permutation of
      1…24, and a different seed gives a different order.
- [x] **Board/snap.** AC:
  - drops within tolerance snap exactly; drops outside do not;
  - positions are clamped;
  - trays are balanced.

## Phase 2 – Data + API vertical slice (2026-11-04)

- [x] **Migrations, seed and demo seed** (24 placeholders, puzzle, test users). AC: running the seed
      twice changes nothing, and the order is locked once a piece is unlocked.
- [x] **Dev sign-in, session cookie and `requireUser`.** AC: `401` without a session, and dev mode
      is refused in production.
- [x] **Calendar and completions API.** AC:
  - today and past days succeed; future days give `409`; after close gives `409`;
  - a double POST counts once; un-tick works;
  - pieces never decrease.
- [x] **Concurrency.** AC: 30 parallel tick-offs give exactly 30 completions and 2 pieces.
- [x] **Board API.** AC: rows are created once; snap works; placed pieces lock; user A cannot see
      user B's board.
- [x] **Image gating.** AC: a locked piece gives `404`.

## Phase 3 – Staff UI (2026-11-05)

- [x] **Dev sign-in page, header, simulated-date banner and "Så funkar det".**
- [x] **Today card + progress.** AC: a tick-off updates the counter without a reload.
- [x] **Lucka grid** with locked/open/today states and the checkbox.
- [x] **Puzzle:** trays, board, drag (mouse and touch), snap, saving with retry, "Ny" badges.
- [x] **Keyboard/click puzzle mode with live announcements.**
- [x] **Statistics** with bars and a table alternative.
- [x] **Responsive layout** down to 375 px (trays become bands).

## Phase 4 – E2E, accessibility, deploy files (2026-11-06)

- [x] **Playwright** in Chromium desktop and WebKit phone. AC: the flow tick off → new piece →
      drag to board → reload → still placed passes, and the keyboard-only flow passes.
- [x] **axe.** AC: zero serious or critical issues.
- [x] **`render.yaml`, `npm run smoke` and `npm run gdpr:purge`** (dry run by default).

## Phase 5 – Feedback from the campaign owner (2026-11-03)

- [x] **Intro states the close date** for tick-offs (from `campaign.json`).
- [x] **Luckor are doors.** A door turns over to reveal the uppdrag and stays open (stored per
      user, `POST /api/openings`). AC:
  - it stays open after a reload and on other devices;
  - future doors cannot be opened;
  - keyboard focus moves to the uppdrag behind the door.
- [x] **Per-uppdrag count** on each opened lucka ("Du och 6 kollegor har gjort uppdraget"). The
      per-lucka chart is removed from Statistik.

- [x] **Cleaner page.** The "Dagens uppdrag", "Tillsammans" and Statistik cards are removed;
      "Om dina uppgifter" is a small expandable footer link. Today's lucka is ticked off in the
      grid.

## Phase 6 – Real content and a real jigsaw (2026-11-04)

- [x] **The 24 uppdrag from "24 uppdrag.docx"** in `content/missions.json`, with title, "Gör så
      här", "Om du vill" and an icon (migration 003).
- [x] **24 lucka icons** (simple line icons) in `assets/icons`, shown on every door and inside
      opened luckor.
- [x] **45 classic jigsaw pieces** cut from Vinterfest (`npm run puzzle:cut`). AC:
  - outlines interlock;
  - only the visible piece reacts to the pointer;
  - the source image is never served.
- [x] **Threshold 10 completions per piece.**
- [x] **No help in the puzzle.** AC:
  - a piece dropped next to its slot stays where it was dropped;
  - nothing locks;
  - there is no "in place" counter and no right/wrong announcement;
  - "Pusslet är komplett!" shows only when every piece is unlocked and in place.

- [x] **"Tråden" made explicit:** "julkalenderns tråd i Skolkontorets Teams-chatt" (10 luckor).
- [x] **`npm run db:seed:all-pieces`** (dev only): unlocks all 45 pieces and adds the test user
      "Pusseltestare (alla bitar)" with every piece in the trays.

## Later phases (need decisions or material)

- [ ] **Real sign-in** (Q1). Entra ID app registration with IT, or magic links. Remove dev mode in
      production.
- [ ] **Admin UI** (Q3): edit missions, view statistics, preview any date, trigger the purge with
      confirmation.
- [ ] **Real mission texts** from the campaign owner (Q12/Q13), then content freeze.
- [ ] **Lund graphic profile** (Q19): replace `tokens.css` values and add the logo if allowed.
- [ ] **GDPR information text and legal basis** approved (Q16).
- [ ] **GitHub repo** in `DigitaliseringsenhetenBSF` (ask first).
- [ ] **Render staging**, then pilot group (16–20 Nov) and production (by 30 Nov) (ask first).
- [ ] **Re-run the concurrency test** against Render Postgres.
- [ ] **Tillgänglighetsredogörelse** (Q21).

## Manual accessibility checklist (before pilot)

- [ ] The whole flow works by keyboard only, with visible focus everywhere.
- [ ] NVDA (Windows/Edge) and VoiceOver (iOS Safari): luckor, tick-off, puzzle mode,
      announcements.
- [ ] 200 % zoom with no loss of content or function.
- [ ] `prefers-reduced-motion`: no animations.
- [ ] Contrast checked against the final graphic profile colours.

## Release checklist

- [ ] All automated tests green (unit, integration, e2e in Chromium and WebKit, axe).
- [ ] `npm run smoke` passes against staging.
- [ ] `FAKE_TODAY` is not set in production, and production refuses dev sign-in.
- [ ] Mission texts are frozen, and the threshold is calibrated against the final participant
      estimate.
- [ ] The purge date is in the calendar (≤ 2027-01-31).
