# SYSTEM CONTRACT – Miljöjulkalendern API

The machine-checked version of this contract is [`src/shared/contract.ts`](../src/shared/contract.ts)
(zod schemas). The client parses every response with these schemas, and the integration tests
assert every response against them, so drift fails the tests. Keep this document and the schemas
in sync.

## Conventions

- JSON in and out. Mutating requests must send `Content-Type: application/json`.
- Session: signed, httpOnly cookie `mjk_session` (`SameSite=Lax`; `Secure` outside development and
  test).
- Errors always have this shape:

  ```json
  { "error": { "code": "MISSION_LOCKED", "message": "Human-readable (English) explanation" } }
  ```

- Dates are ISO calendar dates (`YYYY-MM-DD`) in Europe/Stockholm unless stated otherwise.

## Error codes

| HTTP | code               | When                                                                |
| ---- | ------------------ | ------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` | Body or params fail the schema                                      |
| 401  | `UNAUTHENTICATED`  | No or invalid session                                               |
| 403  | `FORBIDDEN`        | Authenticated but lacks role (admin routes, future)                 |
| 404  | `NOT_FOUND`        | Unknown route/resource, piece not (yet) unlocked, dev-auth disabled |
| 409  | `MISSION_LOCKED`   | Tick-off/un-tick of a lucka that is not open yet                    |
| 409  | `CAMPAIGN_CLOSED`  | Tick-off/un-tick after `lastTickOffDate`                            |
| 500  | `INTERNAL_ERROR`   | Unexpected server error (details only in server logs)               |

## Endpoints

### `GET /health` (no auth)

`200 { "status": "ok" }` when the database answers, otherwise `503 { "status": "error" }`.

### `GET /api/me`

`200`:

```json
{ "user": { "id": 1, "displayName": "Testanvändare 1", "role": "user" }, "authMode": "dev" }
```

### Dev sign-in (only when `AUTH_MODE=dev` and `APP_ENV != production`; otherwise `404`)

- `GET /api/dev-auth/users` → `200 { "users": [{ "id", "displayName", "role" }] }`
- `POST /api/dev-auth/login` with body `{ "userId": 1 }` → `200 { "user": {…} }`, plus
  `Set-Cookie`. Returns `404` for an unknown user.

### `POST /api/auth/logout`

`204`. Clears the session cookie. Does not require a session.

### `GET /api/calendar`

```json
{
  "today": "2026-12-10",
  "simulated": false,
  "phase": "active",
  "firstMissionDate": "2026-12-01",
  "lastTickOffDate": "2027-01-10",
  "totalMissions": 24,
  "missions": [
    {
      "day": 1,
      "opensOn": "2026-12-01",
      "status": "open",
      "title": "Tipsa om ett miljöhack i teamet",
      "howTo": "Dela ett smart vardagsknep …",
      "ifYouWant": "Skriv ditt tips i tråden.",
      "icon": "lucka-01.svg",
      "completed": true,
      "opened": true,
      "completions": 7
    },
    {
      "day": 10,
      "opensOn": "2026-12-10",
      "status": "today",
      "title": "Slå in julklapp på alternativt sätt",
      "howTo": "…",
      "ifYouWant": "…",
      "icon": "lucka-10.svg",
      "completed": false,
      "opened": false,
      "completions": 5
    },
    {
      "day": 11,
      "opensOn": "2026-12-11",
      "status": "locked",
      "title": null,
      "howTo": null,
      "ifYouWant": null,
      "icon": "lucka-11.svg",
      "completed": false,
      "opened": false,
      "completions": 0
    }
  ]
}
```

- `phase` is one of `before | active | catch_up | closed`.
- `status` is one of `locked | open | today`.
- Locked luckor always have `title`, `howTo` and `ifYouWant` set to `null` (only the
  decorative `icon` is sent), and they have
  `opened = false` and `completions = 0`.
- `opened` is `true` once the user has opened the lucka, or if they have ever completed it.
- `completions` is how many people, the user included, have completed that uppdrag. The UI shows
  the number of others.

### `POST /api/openings`

Body: `{ "day": 1..24 }`. Opens ("vänder") the lucka for the user. It is idempotent, and an
opened lucka stays open.

`200`:

```json
{ "day": 3, "opened": true }
```

Errors:

- `400` if the day is invalid;
- `401` without a session;
- `409 MISSION_LOCKED` if the lucka's date has not come.

Opening is allowed after the close date.

### `GET /api/progress`

```json
{
  "totalCompletions": 137,
  "unlockedPieces": 9,
  "totalPieces": 24,
  "completionsPerPiece": 15,
  "remainingToNextPiece": 13,
  "participants": 31,
  "perDay": [{ "day": 1, "completions": 25 }],
  "mine": { "completed": 9, "possible": 10 }
}
```

`perDay` lists open luckor only, in day order.

### `POST /api/completions`

Body: `{ "day": 1..24 }`. Idempotent.

`200`:

```json
{ "day": 3, "completed": true, "newlyUnlockedPieces": 1, "progress": { …Progress } }
```

`newlyUnlockedPieces` is the number of pieces this request unlocked (0 when it was already
completed). Errors: `400`, `401`, `409 MISSION_LOCKED`, `409 CAMPAIGN_CLOSED`.

### `DELETE /api/completions/:day`

Idempotent un-tick.

`200`:

```json
{ "day": 3, "completed": false, "newlyUnlockedPieces": 0, "progress": { … } }
```

Unlocked pieces never decrease. Errors are the same as for `POST`.

### `GET /api/board`

Returns the caller's own board only. Missing rows for unlocked pieces are created at random tray
positions first.

```json
{
  "grid": { "columns": 9, "rows": 5 },
  "imageAspect": 1.7768,
  "pad": { "x": 0.3, "y": 0.2965 },
  "totalPieces": 45,
  "pieces": [
    {
      "id": 7,
      "area": "tray_left",
      "x": 0.42,
      "y": 0.13,
      "z": 3,
      "isNew": true,
      "alt": "Solnedgång bakom granarna",
      "shape": "M 0.2655 0.2635 L 0.3949 0.2635 C … Z",
      "image": "/api/pieces/7/image?v=3f9c2a71b0de"
    }
  ],
  "complete": false,
  "arrived": 1,
  "firstVisit": false
}
```

- `area` is one of `tray_left | tray_right | board`.
- Coordinates follow SPEC §5.5. On the board, `x`/`y` is the cell's top-left. Each piece box
  extends `pad` (a share of a cell) beyond its cell on every side for the tabs.
- `shape` is the jigsaw outline as an SVG path in 0–1 units of the piece box. It is meant for
  `clipPathUnits="objectBoundingBox"`.
- `image` is the piece's image URL. The `v` parameter is a hash of the image file, so a re-cut
  puzzle gets new URLs and a browser can never show a cached old image.
- No per-piece "correct" flag is sent (no hints, SPEC §5.5).
- `complete` is `true` when every piece is unlocked and lies in its place on this board.
- `isNew` marks a piece the user has not moved yet (the "Ny" badge).
- `arrived` is how many pieces this request added to the user's trays, i.e. pieces unlocked since
  the last visit.
- `firstVisit` is `true` when the user had no pieces before this request.

### `PUT /api/board/pieces/:id`

Body: `{ "area": "board", "x": 0.33, "y": 0.25 }`.

The server:

- clamps the position to the area, without snapping;
- records whether the piece now lies in its place;
- clears `isNew`;
- moves the piece to the top of the stack.

Any piece can always be moved again.

`200 { "piece": BoardPiece, "complete": false }`. Errors:

- `400` if the body is invalid;
- `401` without a session;
- `404` if the piece is unknown or not unlocked.

### `GET /api/pieces/:id/image`

- `200 image/webp` (`Cache-Control: private, max-age=31536000, immutable`) if the piece is
  collectively unlocked. The image is the jigsaw-cut piece box, transparent outside the outline.
- Otherwise `404`.

### `GET /icons/:file` (no auth)

`200 image/svg+xml` for a lucka icon from `assets/icons`. The icons are decorative and shown on
every door.

### Test only: `POST /api/test/reset` (registered only when `APP_ENV=test`)

`204`. Resets the database to seed and demo state for e2e tests.

### Test only: `POST /api/test/unlock-all` (registered only when `APP_ENV=test`)

`204`. Unlocks every piece and adds "Pusseltestare (alla bitar)" (e2e: the puzzle can be built).

## Invariants

1. **The server decides "today"** in Europe/Stockholm. Client clocks are ignored.
2. **One completion per (user, uppdrag)** (primary key). Retries never double-count.
3. **`totalCompletions` is `count(*)`** of the completions table.
4. **`unlockedPieces` is monotonic:** `GREATEST(stored, min(floor(total / 15), 24))`, updated in
   the completion transaction under a row lock.
5. **The unlock order is fixed** by `puzzle_pieces.unlock_rank` and is the same for everyone.
6. **Board state is per user.** There is no endpoint that accepts another user's ID.
7. **Locked luckor never expose content**, and locked pieces never expose images or alt texts.
8. **Date simulation and dev sign-in cannot be enabled when `APP_ENV=production`**: the server
   refuses to start.
