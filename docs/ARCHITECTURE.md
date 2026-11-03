# ARCHITECTURE – Miljöjulkalendern

## Components

```mermaid
flowchart LR
  subgraph Browser
    UI[React UI<br/>src/web]
  end
  subgraph "Render web service (Node)"
    API[Fastify routes<br/>src/api/routes]
    AUTH[Auth seam<br/>src/api/auth]
    CLOCK[Clock<br/>src/api/clock.ts]
    DOMAIN[Domain rules<br/>src/domain]
    REPO[Repositories + SQL<br/>src/data]
    STATIC[Static files<br/>dist/web + piece images]
  end
  DB[(PostgreSQL<br/>PGlite locally)]
  CONTENT[/content/*.json/]
  ASSETS[/assets/puzzle/pieces/]

  UI -- JSON over HTTPS --> API
  UI -- GET / --> STATIC
  API --> AUTH
  API --> CLOCK
  API --> DOMAIN
  API --> REPO
  REPO --> DB
  CONTENT -. seed / config .-> REPO
  CONTENT -. config .-> API
  ASSETS --> API
  UI -. shares .-> DOMAIN
```

The domain layer has no framework or database imports. Both the server (authoritative) and the
client (instant feedback, for example snapping) use it.

## Data model

```mermaid
erDiagram
  users ||--o{ completions : makes
  missions ||--o{ completions : "completed in"
  users ||--o{ board_pieces : owns
  users ||--o{ lucka_openings : opens
  missions ||--o{ lucka_openings : "opened as"
  puzzle_pieces ||--o{ board_pieces : "positioned as"

  users {
    int id PK
    text external_id UK
    text display_name
    text role
    timestamptz created_at
  }
  missions {
    int id PK
    smallint day UK
    text title
    text description
    timestamptz updated_at
  }
  completions {
    int user_id PK,FK
    int mission_id PK,FK
    timestamptz completed_at
  }
  puzzle_pieces {
    smallint id PK
    smallint grid_row
    smallint grid_col
    smallint unlock_rank UK
    text image_file
    text alt_text
  }
  campaign_state {
    smallint id PK "always 1"
    int unlocked_pieces "high-water mark"
    timestamptz updated_at
  }
  lucka_openings {
    int user_id PK,FK
    int mission_id PK,FK
    timestamptz opened_at
  }
  board_pieces {
    int user_id PK,FK
    smallint piece_id PK,FK
    text area
    float x
    float y
    int z
    bool placed
    bool is_new
    timestamptz updated_at
  }
  campaign_summary {
    smallint day PK
    int completions
    int participants
    timestamptz captured_at
  }
```

## Tick off → counter → piece unlock → board update

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web UI
  participant A as API
  participant D as Domain
  participant DB as PostgreSQL

  U->>W: "Jag har gjort det!" (lucka d)
  W->>A: POST /api/completions {day: d}
  A->>D: missionStatus(d, today(Europe/Stockholm))
  alt lucka not open / campaign closed
    A-->>W: 409 MISSION_LOCKED / CAMPAIGN_CLOSED
  else open
    A->>DB: BEGIN; SELECT campaign_state FOR UPDATE
    A->>DB: INSERT completion ON CONFLICT DO NOTHING
    A->>DB: SELECT count(*) FROM completions
    A->>D: nextHighWaterMark(stored, total)
    A->>DB: UPDATE campaign_state SET unlocked_pieces = GREATEST(...); COMMIT
    A-->>W: 200 {completed, newlyUnlockedPieces, progress}
  end
  W->>W: update counter; announce
  opt newlyUnlockedPieces > 0
    W->>A: GET /api/board
    A->>DB: INSERT missing board_pieces at random tray positions ON CONFLICT DO NOTHING
    A-->>W: pieces (new ones marked isNew)
    W->>A: GET /api/pieces/:id/image
    W-->>U: "En ny pusselbit är upplåst!"
  end
```

## Layers and folders

| Folder       | Responsibility                                         | May import                 |
| ------------ | ------------------------------------------------------ | -------------------------- |
| `src/domain` | Pure rules: calendar, pieces, unlock order, board/snap | nothing                    |
| `src/shared` | zod contract shared by API and UI                      | `zod`, `src/domain` types  |
| `src/data`   | DB adapter, migrations, repositories, seed             | `src/domain`               |
| `src/api`    | Config, clock, auth, routes, app wiring                | everything above           |
| `src/web`    | React UI                                               | `src/shared`, `src/domain` |
| `scripts`    | CLI entry points (dev, migrate, seed, purge, smoke)    | `src/*`                    |
