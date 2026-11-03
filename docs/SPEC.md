# SPEC – Miljöjulkalendern

> Living source of truth. Update this file in the same change whenever rules, data model,
> architecture or scope change. Statements are marked **[observed]**, **[inferred]** or
> **[unknown]** where certainty matters.

Last updated: 2026-11-03

---

## 1. Purpose

Miljöjulkalendern is a web-based Advent calendar for the staff of **Skolkontoret** at
**Barn- och skolförvaltningen (BSF), Lunds kommun**, used 1–24 December 2026. Each day opens one
**miljöuppdrag** (an environmental mission). Staff tick off the missions they have completed. All
completions are pooled, and every 15 completions unlock one **pusselbit** of a shared picture.
Each person assembles **pusslet** on their own board, and the board is saved server-side.

Product thesis: small individual actions become meaningful when they visibly add up.

## 2. Users

| User                                                                                          | Needs                                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Skolkontoret staff (primary; ~30–60 expected participants **[inferred from campaign owner]**) | Tick off today's uppdrag in < 30 s on phone or work computer; see the shared progress; play the puzzle. |
| Campaign owner / admin (Digitaliseringsenheten)                                               | Enter the 24 uppdrag texts, follow statistics, run the post-campaign purge.                             |

## 3. Core journeys

1. **First visit:**
   - The user opens the link from Teams or e-mail and signs in.
   - They see a short "Så funkar det" explanation, the puzzle and the 24 luckor. Today's lucka
     is marked "Idag".
2. **Daily tick-off:**
   - The user opens ("vänder") today's lucka in the lucka grid. The door turns over and reveals
     the uppdrag, and it stays open from then on.
   - The user ticks "Gjort" in the lucka.
   - Each opened lucka shows how many colleagues have done that uppdrag.
   - If the total crosses a multiple of 15, a new pusselbit appears in a tray with a short,
     non-intrusive message.
3. **Catch-up:** The user opens and ticks off several earlier luckor in the lucka grid, until
   the close date (2027-01-10). The intro text states the close date.
4. **Puzzle play:**
   - The user drags pieces from the trays to the board, or uses the keyboard to pick a piece and
     choose a slot.
   - A piece placed in the correct slot snaps and locks.
   - Every move is saved automatically.
5. **New pieces after absence:** Pieces unlocked by colleagues appear in the trays at stored
   random positions, marked "Ny".
6. **Statistics:** Each opened lucka shows how many colleagues have done that uppdrag. The page
   shows no other statistics, by design, to keep it clean (decided 2026-11-03).
7. **Admin:** Deferred (see §13). Until then, mission texts are edited in `content/missions.json`
   and loaded with `npm run db:seed`.

## 4. Success criteria

- [ ] Tick-off in under 30 s on a phone.
- [ ] Today's uppdrag opens automatically at 00:00 Europe/Stockholm. The server decides; the client
      clock is never used.
- [ ] Earlier uppdrag can be ticked off until the close date. Future uppdrag never can (enforced by
      the API).
- [ ] `total completions = count(distinct (user, uppdrag))`.
- [ ] `unlocked pieces = max(high-water mark, min(floor(total / 15), 24))`, and it never decreases.
- [ ] Placed pieces are exactly where the user left them, on any device.
- [ ] Individual and collective statistics are consistent with the data.
- [ ] The puzzle is fully usable with keyboard only and with a screen reader.
- [ ] Works on current Edge, Chrome, Safari (incl. iOS) and at 375 px width.
- [ ] Personal data is deleted after the campaign (§9).

## 5. Rules and mechanics

All values live in `content/campaign.json` and `content/puzzle.json`. They are not hard-coded.

| Name                                          | Value                                                   | Source                                          |
| --------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `timezone` (CAMPAIGN_TIMEZONE)                | `Europe/Stockholm`                                      | campaign.json                                   |
| `firstMissionDate` (CAMPAIGN_START)           | `2026-12-01`                                            | campaign.json                                   |
| `totalMissions` (TOTAL_MISSIONS)              | `24`                                                    | campaign.json                                   |
| `lastTickOffDate` (CAMPAIGN_CLOSE_DATE)       | `2027-01-10` (last day on which tick-offs are accepted) | campaign.json, decided 2026-11-03               |
| `completionsPerPiece` (COMPLETIONS_PER_PIECE) | `15`                                                    | campaign.json                                   |
| `columns` × `rows`                            | 6 × 4 = 24 pieces (PUZZLE_PIECE_COUNT)                  | puzzle.json **[observed from provided images]** |
| `snapTolerance` (SNAP_TOLERANCE)              | `0.35` of a piece's width/height                        | puzzle.json                                     |
| `unlockSeed`                                  | `20261201`                                              | puzzle.json                                     |

### 5.1 Time and unlocking ("the server owns time")

- "Today" is the server's current instant converted to a calendar date in `Europe/Stockholm`
  (`Intl.DateTimeFormat`). The client clock is never used.
- Lucka _d_ (1–24) opens at `2026-12-dd 00:00` Stockholm time.
- **Phases:**

  | Phase      | Dates                   | Open luckor                                                                                                                                      |
  | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `before`   | today < 2026-12-01      | none                                                                                                                                             |
  | `active`   | 2026-12-01 … 2026-12-24 | luckor 1…_d_                                                                                                                                     |
  | `catch_up` | 2026-12-25 … 2027-01-10 | all 24                                                                                                                                           |
  | `closed`   | today > 2027-01-10      | tick-offs and un-ticks rejected (`CAMPAIGN_CLOSED`); calendar, statistics and puzzle stay viewable and the puzzle stays playable until the purge |

- A lucka that is not open never sends its title or description to the client.
- December has no DST transition in Stockholm (UTC+1 throughout), but the conversion is
  zone-correct in any case.

### 5.2 Completions (avklarade uppdrag)

- At most one completion per user and uppdrag: `PRIMARY KEY (user_id, mission_id)` and
  `INSERT … ON CONFLICT DO NOTHING`. Double clicks, retries and parallel tabs never double-count.
- `POST /api/completions` for a lucka that is not open → `409 MISSION_LOCKED`. After the close
  date → `409 CAMPAIGN_CLOSED`.
- **Un-tick is allowed** (decided 2026-11-03) while the campaign is not closed. The total decreases,
  but unlocked pieces stay (§5.3).
- This is an honour system. Completions are not verified.

### 5.2a Opening luckor ("vända luckan")

- A lucka whose date has come is shown as a closed door. The user opens it with a click, tap or
  Enter. It turns over and reveals the uppdrag, the "Gjort" checkbox and the per-uppdrag count
  (§6).
- An opened lucka **stays open** for that user on every device. It is stored in
  `lucka_openings` (`PRIMARY KEY (user_id, mission_id)`, idempotent `POST /api/openings`) and
  there is no way to close it again.
- A completed lucka always counts as opened, including after an un-tick.
- Opening a lucka whose date has not come → `409 MISSION_LOCKED`. Opening is still allowed after
  the close date, so late visitors can read the uppdrag. Ticking off is not.
- Opening a lucka has no effect on the counter or the puzzle.

### 5.3 Shared counter and pusselbitar

- `total` is always derived from `count(*)` over `completions`. It is never incremented by hand.
- `computed = min(floor(total / completionsPerPiece), pieceCount)`.
- `campaign_state.unlocked_pieces` is the **high-water mark**, set to `GREATEST(stored, computed)`
  in the same transaction as each completion. The transaction takes a row lock
  (`SELECT … FOR UPDATE`) on `campaign_state` so that concurrent tick-offs serialise and the count
  is exact.
- Pieces are **monotonic**: un-ticks never lower the high-water mark.
- "Uppdrag kvar till nästa pusselbit" = `(unlocked + 1) × completionsPerPiece − total`. This can
  exceed 15 after un-ticks. It is `0` once all pieces are unlocked.
- **End state:** all 24 unlocked → "Pusslet är komplett!" (shown once the user has also placed
  them all). Further completions are still recorded and counted, without errors.

### 5.4 Deterministic unlock order

- At seed time, piece IDs 1…24 are shuffled with the seeded PRNG **mulberry32** and a
  **Fisher–Yates** shuffle (`unlockSeed`). The result is stored as `puzzle_pieces.unlock_rank`
  (0-based).
- The _k_ first ranks are unlocked when `unlocked_pieces = k`. Every user sees the same pieces in
  the same order.
- Seeding refuses to change the order once `unlocked_pieces > 0`.

### 5.5 Board state (per user)

- One row per (user, unlocked piece): `area ∈ {tray_left, tray_right, board}`, `x, y ∈ [0, 1]`,
  `z` (stacking order), `placed`, `is_new`.
- **Coordinates:**
  - **board:** `x, y` is the piece's top-left corner as a fraction of the board's width and height
    (`x ≤ 1 − 1/columns`, `y ≤ 1 − 1/rows`). The values are independent of screen size.
  - **trays:** `x, y` is the fraction of the tray's free range (tray size minus piece size), so any
    value fits.
  - Trays are canonically tall. On narrow screens they are drawn as horizontal bands, with x and y
    swapped so that the arrangement is preserved.
- **New pieces:** When a user's board is read and an unlocked piece has no row yet, the server
  creates one in the tray with fewer loose pieces (ties at random), at a random position
  ("huller om buller"), with `is_new = true`. It is stored immediately so it does not jump on
  reload (`ON CONFLICT DO NOTHING` handles parallel tabs).
- **Snap:**
  - A piece dropped on the board with its top-left within `snapTolerance` piece-widths
    horizontally and piece-heights vertically of its correct slot snaps to the slot exactly and
    becomes `placed = true`.
  - Placed pieces are locked and cannot be moved (`409 PIECE_LOCKED`).
  - Otherwise the piece stays where it was dropped (free placement on board or tray).
  - The server is authoritative; the client runs the same domain function for instant feedback.
- Moving a piece clears `is_new`.
- Pieces have no rotation.
- A user can only read and write their own board: rows are keyed by the session user and there
  are no user IDs in the URLs.

### 5.6 Puzzle image secrecy

- Piece images are served only via `GET /api/pieces/:id/image`, and only once that piece is
  collectively unlocked (otherwise `404`).
- The answer image (`facit`) is never served.
- Locked pieces' alt texts are never sent.

## 6. Statistics (definitions)

| Statistic                 | Definition                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mina uppdrag              | `count(completions where user = me)` "av" `openMissionCount(today)` möjliga                                                                                                         |
| Tillsammans – uppdrag     | `count(completions)`                                                                                                                                                                |
| Tillsammans – pusselbitar | `campaign_state.unlocked_pieces` "av" piece count                                                                                                                                   |
| Deltagare                 | `count(distinct user_id)` in completions                                                                                                                                            |
| Per uppdrag               | `count(completions)` for that mission. Shown on each opened lucka as "Du och 6 kollegor har gjort uppdraget" or "7 kollegor har gjort uppdraget" (the user excluded from "others"). |

**What the UI shows:** Since 2026-11-03 only the per-uppdrag count is displayed, on each opened
lucka. The rest stays in `GET /api/progress` for a future admin view:

- the "Dagens uppdrag" card;
- the "Tillsammans" progress card ("N uppdrag kvar till nästa pusselbit");
- the Statistik card (Mina uppdrag, Tillsammans, Pusselbitar, Deltagare);
- the per-lucka chart.

The collective progress now shows only through the puzzle itself and the "En ny pusselbit har
låsts upp!" message.

No per-person data about anyone else is ever shown, only counts. There is no leaderboard.

## 7. Data model

| Table               | Columns                                                                                                          | Notes                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `users`             | `id`, `external_id` (unique, from the identity provider), `display_name`, `role` (`user`\|`admin`), `created_at` |                                                |
| `missions`          | `id`, `day` (1–24, unique), `title`, `description`, `updated_at`                                                 |                                                |
| `completions`       | `user_id`, `mission_id`, `completed_at`                                                                          | PK `(user_id, mission_id)`                     |
| `puzzle_pieces`     | `id` (1–24), `grid_row`, `grid_col`, `unlock_rank` (unique), `image_file`, `alt_text`                            |                                                |
| `campaign_state`    | singleton `id = 1`, `unlocked_pieces`, `updated_at`                                                              |                                                |
| `lucka_openings`    | `user_id`, `mission_id`, `opened_at`                                                                             | PK `(user_id, mission_id)`; migration 002      |
| `board_pieces`      | `user_id`, `piece_id`, `area`, `x`, `y`, `z`, `placed`, `is_new`, `updated_at`                                   | PK `(user_id, piece_id)`                       |
| `campaign_summary`  | `day`, `completions`, `participants`, `captured_at`                                                              | Anonymous aggregates written by the GDPR purge |
| `schema_migrations` | `name`, `applied_at`                                                                                             |                                                |

ER diagram: see [ARCHITECTURE.md](ARCHITECTURE.md).

**Source of truth vs generated:**

- **Source of truth:**
  - DB: completions, high-water mark, board state, users, missions after seed.
  - `content/*.json`: rules, puzzle layout, unlock seed, alt texts and mission texts until the
    admin UI exists.
  - `assets/puzzle/pieces/*.png`: the provided pieces.
- **Generated:** `dist/` (frontend bundle and compiled server), the HTTP responses' derived
  statistics, and `campaign_summary`.

**Applying content:**

- Every server start runs migrations and then the idempotent content seed
  (`src/api/bootstrap.ts`), so a deploy with edited `content/missions.json` updates the texts.
- When the admin UI exists, the seed must switch to "insert missing only" so that admin edits are
  not overwritten.

## 8. Identity and access

- **Current (temporary): `AUTH_MODE=dev`.**
  - A test-user picker signs in as a seeded test user, using a signed, httpOnly session cookie.
  - The server **refuses to start** with `AUTH_MODE=dev` when `APP_ENV=production`, so production
    cannot run until real sign-in exists. This is deliberate: there is no "temporary bypass".
- **Planned:** Real sign-in is decided later (open question Q1). The auth module exposes one seam:
  - identify the user;
  - upsert `users` by `external_id`;
  - set the session.

  Every other route only sees `request.user`.

- All `/api/*` routes except `/api/dev-auth/*` require a session (`401 UNAUTHENTICATED`).
- Admin routes, when added, require `role = admin` (`403 FORBIDDEN`).

## 9. GDPR

- **Data stored:**
  - stable user identifier (`external_id`) and display name;
  - completions with timestamps;
  - which luckor the user has opened, with timestamps;
  - piece positions.

  Nothing else: no e-mail, no IP logging in the app database.

- **Visibility:** No individual data is visible to other users.
- **Legal basis:** **[unknown]**, see Q16. Likely public interest/official authority for staff
  engagement, to be confirmed by BSF's dataskyddsombud.
- **Retention:** until the purge, at the latest **2027-01-31** (proposed).
- **Purge:** `npm run gdpr:purge -- --confirm`. In a single transaction it:
  - writes anonymous per-lucka aggregates to `campaign_summary`;
  - deletes `board_pieces`, `lucka_openings`, `completions` and `users`.

  Without `--confirm` it is a dry run. It must not be run in a shared environment without explicit
  approval.

- An information text ("Om dina uppgifter") is shown as a discreet expandable link in the app
  footer. It was kept when the page was simplified, because users must be informed (GDPR art. 13).
  Wording to be approved (Q16).

## 10. Accessibility (WCAG 2.1 AA, DOS-lagen)

- **Keyboard puzzle:**
  - Each loose piece is a button.
  - Enter/Space picks it up; focus moves to the 6 × 4 slot grid.
  - Arrow keys move between slots ("Rad 2, kolumn 3"). Enter/Space places the piece and Escape
    cancels.
  - Clicking or tapping works the same way, so dragging is never required.
- **Screen readers:**
  - Pieces have Swedish alt texts (`puzzle.json`).
  - Moves, snaps, unlocks and save errors are announced in an `aria-live` region.
- **Motion and contrast:** `prefers-reduced-motion` disables animations. Contrast ≥ 4.5:1 for text.
- **Zoom:** Layout works at 200 % zoom and 375 px width.
- **Testing:** automated axe checks in e2e (no serious/critical issues), plus a manual checklist
  in TASKS.md.
- A _tillgänglighetsredogörelse_ is likely required (Q21).

## 11. Graphic profile

- Lunds kommuns grafiska profil is **[unknown]**: no assets have been provided yet (Q19).
- Colours and fonts are placeholders in `src/web/styles/tokens.css` (system font stack, neutral
  festive palette). No logo is used.
- The bundled puzzle image was provided by the campaign owner. Usage rights are **[unknown]**, to
  be confirmed (Q14).

## 12. Non-goals

- No access outside Skolkontoret / Lunds kommun staff.
- No ranking of named individuals.
- No verification of completions.
- No real-time multiplayer puzzle.
- No native app.
- No general calendar platform, though content stays configurable for reuse next year.
- No AI features.

## 13. Scope of the current increment

**Included:**

- domain rules;
- database;
- API;
- dev sign-in;
- the staff UI (intro, puzzle with drag and keyboard, lucka grid with doors and per-uppdrag
  counts);
- date simulation;
- tests;
- deploy files.

**Deferred:**

- real sign-in;
- admin UI;
- real mission texts;
- official graphic profile;
- GitHub repository and Render services (each needs approval or material from the campaign
  owner).

## 14. Open questions

| #   | Question                                                         | Default / proposal                                                                                                                                                          | Owner                | Status                       |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- |
| Q1  | How do users sign in?                                            | Microsoft Entra ID (M365 SSO). Fallback if IT lead time is too long: personal magic links by e-mail.                                                                        | Campaign owner + IT  | **Open – deferred by owner** |
| Q2  | Who counts as Skolkontoret staff, and how many?                  | ~30–60 participants                                                                                                                                                         | Campaign owner       | Answered (approx.)           |
| Q3  | Who is admin, and how do they sign in?                           | Digitaliseringsenheten; same sign-in + `role = admin`                                                                                                                       | Campaign owner       | Open                         |
| Q4  | Piece count / threshold                                          | 24 pieces (provided) × 15 = 360 completions. With 30–60 people at ~40 % → complete ~15 Dec – early Jan, ~20 Dec at 45 people. Keep 15; recalibrate before launch if needed. | Campaign owner       | Decided (default 15)         |
| Q5  | All pieces unlocked before 24 Dec / far from complete on 24 Dec? | Completed picture + "Pusslet är komplett!"; catch-up until 10 Jan helps a slow start.                                                                                       | Campaign owner       | Proposed                     |
| Q6  | Un-tick allowed?                                                 | Yes; pieces stay                                                                                                                                                            | Campaign owner       | **Decided 2026-11-03**       |
| Q7  | Cut-off for catch-up                                             | Through 2027-01-10                                                                                                                                                          | Campaign owner       | **Decided 2026-11-03**       |
| Q8  | Uppdrag on weekends too?                                         | Yes, all 24 days                                                                                                                                                            | Campaign owner       | Assumed                      |
| Q9  | Piece shape                                                      | Provided pieces are square tiles with painted jigsaw edges, drawn as squares                                                                                                | –                    | Decided by assets            |
| Q10 | Snap/free placement/rotation                                     | Snap to correct slot and lock; free placement elsewhere; no rotation                                                                                                        | Campaign owner       | Proposed                     |
| Q11 | New-piece indicators / celebration                               | "Ny" badge + short message; no animation with reduced motion                                                                                                                | Campaign owner       | Proposed                     |
| Q12 | Who writes the 24 uppdrag?                                       | Campaign owner will describe them; placeholders "Uppdrag 1–24" until then                                                                                                   | Campaign owner       | **Decided 2026-11-03**       |
| Q13 | Uppdrag fields                                                   | Title + short description (a "why it matters" field can be added)                                                                                                           | Campaign owner       | Proposed                     |
| Q14 | Puzzle image rights                                              | Image provided by campaign owner; rights to be confirmed                                                                                                                    | Campaign owner       | Open                         |
| Q15 | Which statistics?                                                | As §6; no per-person data to others                                                                                                                                         | Campaign owner       | Proposed                     |
| Q16 | GDPR legal basis, info text, retention                           | Purge by 2027-01-31; keep anonymous aggregates                                                                                                                              | Campaign owner + DSO | Open                         |
| Q17 | Standalone Render service or verktygsportal page?                | Standalone service (deadline, separate auth)                                                                                                                                | Campaign owner       | Proposed                     |
| Q18 | URL/domain                                                       | `*.onrender.com` unless a lund.se subdomain is required                                                                                                                     | Campaign owner + IT  | Open                         |
| Q19 | Lund graphic profile assets                                      | Needed (colours, fonts, logo usage)                                                                                                                                         | Campaign owner       | Open                         |
| Q20 | Big-screen "tillsammans" view?                                   | Not in this increment                                                                                                                                                       | Campaign owner       | Open                         |
| Q21 | Tillgänglighetsredogörelse                                       | Probably required under DOS-lagen                                                                                                                                           | Campaign owner       | Open                         |
| Q22 | "Vinterfest i den snötäckta byn" image                           | Not used                                                                                                                                                                    | Campaign owner       | **Decided 2026-11-03**       |

## 15. Decisions log

| Date       | Decision                                                                                                                 | Why                                                     | Alternatives                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------- |
| 2026-11-03 | Stack: TypeScript, Fastify, zod, PostgreSQL (PGlite locally), React + Vite, Vitest, Playwright                           | One language, boring tech, no Docker needed locally     | Python/FastAPI; verktygsportal module              |
| 2026-11-03 | Plain SQL + small adapter, numbered migrations                                                                           | Auditable, no ORM to learn                              | Drizzle, Kysely                                    |
| 2026-11-03 | Temporary `AUTH_MODE=dev`, refused in production                                                                         | Owner deferred sign-in; never bypass auth in production | Shared campaign code                               |
| 2026-11-03 | Un-tick allowed; close 2027-01-10; threshold 15; 24 provided pieces                                                      | Owner answers                                           | –                                                  |
| 2026-11-03 | Piece images gated by unlock; facit never served                                                                         | Keep the picture a surprise                             | Serve all statically                               |
| 2026-11-03 | Luckor are doors that turn over and stay open (server-stored); per-uppdrag counts on each lucka; per-lucka chart removed | Campaign owner's request                                | Plain list with checkboxes; client-only open state |
| 2026-11-03 | Clean page: remove the "Dagens uppdrag", "Tillsammans" and Statistik cards; privacy text becomes a discreet footer link  | Campaign owner wants a stilren service                  | Keep the cards                                     |
| 2026-11-03 | Snapped pieces lock                                                                                                      | Prevents accidental moves; simpler keyboard model       | Movable after snap                                 |

## 16. Engineering conventions (the six core areas)

### 16.1 Commands

The full table is in [README.md](../README.md#commands).

| Area            | Commands                                                                |
| --------------- | ----------------------------------------------------------------------- |
| Install / run   | `npm ci`, `npm run dev`                                                 |
| Date simulation | `FAKE_TODAY=2026-12-10 npm run dev`. Refused when `APP_ENV=production`. |
| Database        | `npm run db:migrate`, `npm run db:seed`, `npm run db:seed:demo`         |
| Quality gate    | `npm run check` (lint, type check, unit and integration tests)          |
| E2E             | `npm run test:e2e`                                                      |
| Build and run   | `npm run build`, `npm start`                                            |
| Operations      | `npm run smoke -- <url>`, `npm run gdpr:purge -- --confirm`             |
| Deploy          | `render.yaml` (Render Blueprint, staging)                               |

### 16.2 Testing

Strategy and status are in [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md#test-approach).

"Done" means:

- `npm run check` is green;
- `npm run test:e2e` is green in Chromium desktop and WebKit phone, with axe reporting zero
  serious or critical issues;
- `npm run smoke` passes against staging.

### 16.3 Project structure

See [ARCHITECTURE.md](ARCHITECTURE.md#layers-and-folders).

- `src/domain` is pure and has no framework or database imports.
- `content/` holds data, not code.
- `assets/puzzle` holds the provided images.

### 16.4 Code style

- TypeScript strict, ESM, Prettier and ESLint.
- No magic numbers: rules come from `content/*.json`. Named constants (`DRAG_THRESHOLD_PX`,
  `DEMO_COMPLETIONS`, `REFRESH_INTERVAL_MS`) carry a comment.
- Input is validated with zod at the API boundary, and the client parses responses with the same
  schemas.
- All Swedish UI text lives in `src/web/texts.sv.ts`. Code and docs are in English.
- Secrets only come from environment variables. `.env.example` documents every variable.

### 16.5 Git workflow

- **Branches:** `main` (deployable), plus `feat/…`, `fix/…` and `docs/…`.
- **Commits:** conventional commits.
- **Before every commit:** run `npm run check`.
- **SPEC.md:** update it in the same change as any rule, data-model or architecture change.

### 16.6 Boundaries

The three tiers (always / ask first / never) from the project brief apply unchanged.

**Ask first:**

- schema changes after real users exist;
- auth or deploy changes;
- game-rule changes;
- any purge in a shared environment;
- creating the GitHub repository or Render services;
- using images, fonts or logos not provided by the campaign owner.
