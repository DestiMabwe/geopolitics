# ARCHITECTURE.md — Structure and data

## 1. MVC layout

```
Browser (View)                       Vercel serverless function (Express)                Firestore
──────────────                       ────────────────────────────────────                ─────────
public/js/components/*  ──fetch──▶  routes/api.js
  NationCard, DicePanel,              │
  CommentaryFeed …                    ▼
                                    middleware: requireAuth (verify ID token → req.uid),
                                                validate, rateLimit, errorHandler
                                      │
                                      ▼
                                    controllers/*  ──▶  domain/* (Game, Nation, Battle, Player)
                                      │                     │ delegates rules to
                                      │                     ▼
                                      │                 game/* (pure engine)
                                      ▼
                                    models/*  ──────────────────────────────────────▶  games, events, players
                                    services/commentaryService ──▶ LLM API (outside the engine)

Visitors: public/js/poll.js ──GET /games/:id, /events?after=──▶ (no token)   every 2 seconds
```

The browser never talks to Firestore. Every read and write goes through the API.

| Layer | Folder | Owns | Must not |
|---|---|---|---|
| **Model** | `src/models/` | Every Firestore read and write. Turns documents into plain state objects and back. Runs each action inside a **transaction**. | Contain game rules. Know about `req` or `res`. |
| **Domain** | `src/domain/` | The object-oriented layer: `Game`, `Nation`, `Player`, `Battle`. Each class keeps its own state private, exposes getters and action methods, and delegates rules to the engine. A `Game` can be rebuilt from a stored document and serialised back unchanged. | Be changed from outside except through its methods. Import Express or Firebase. |
| **Engine** | `src/game/` | Every rule in `GAME_RULES.md`: soldier values, setup, dice, attacks, transfers, reinforcements, NPC decisions, victory, events, template commentary. Pure functions. | Import `firebase-admin`, `express` or make network calls. Call `Math.random` or `Date.now`. |
| **Service** | `src/services/` | Things outside the rules that need the network: `commentaryService` (LLM call, timeout, fallback). | Decide any game outcome. |
| **Controller** | `src/controllers/` | Check the request's shape, call model + domain, map errors to HTTP status codes, shape the JSON response. | Hold rules (delegate to the engine) or raw Firestore calls (delegate to models). |
| **Routes** | `src/routes/api.js` | Map URL + method → middleware + controller. | Hold logic. |
| **Middleware** | `src/middleware/` | `requireAuth` (verify token), `validate` (strict body shapes), `rateLimit`, `errorHandler` (one place that turns errors into JSON). | — |
| **View** | `public/` | Rendering, user input, calling the API, polling, replaying events (normal or fast-forward speed). Displays state. Never computes outcomes. | Roll dice, pick countries, change soldiers, or touch Firestore. |

The country catalogue `src/data/countries.json` (code, name, population, capital lat/lng) is static data in the repo, not in Firestore. The engine and `GET /api/countries` both read it.

### Engine modules (`src/game/`)

| Module | Exports (signatures are written as stubs by AI) | Rules |
|---|---|---|
| `soldiers.js` | `soldierValue(population)`, `conquestBonus(value)`, `reinforcementAmount(countriesOwned)` | §1.2, §5.5, §7.2 |
| `map.js` | `distanceKm(a, b)`, `buildBorders(countries, k = 3)`, `borders(state, code)`, `isNeighbour(state, a, b)` | §3.7–3.9 |
| `setup.js` | `createGame({ humanCode, catalogue, randomInt })` (calls `buildBorders`) | §2, §3 |
| `dice.js` | `diceCount(attacking, defending)`, `resolveRoll(attackerDice, defenderDice)` | §5.2, §5.3 |
| `attack.js` | `startAttack`, `rollAttack(state, rollDie)`, `stopAttack`, `occupy` | §5 |
| `transfer.js` | `transfer(state, from, to, count)` | §6 |
| `reinforce.js` | `placeReinforcements(state, placements)` | §7 |
| `turn.js` | `endTurn(state)` (next player, round, reinforcement setup) | §4 |
| `npc.js` | `chooseTarget`, `shouldStop`, `npcReinforce`, `npcOccupy`, `playNpcTurn(state, rollDie)` | §8 |
| `victory.js` | `checkElimination`, `checkGameOver` | §2.4, §9 |
| `commentary.js` | `toText(event, catalogue)`, the template line used as fallback | §10 |

Every state-changing function returns `{ state, events }` and throws `IllegalMoveError` (→ 422) or `WrongPhaseError` (→ 409). It never mutates its input.

### Domain classes (`src/domain/`)

| Class | Holds | Methods (delegating to the engine) |
|---|---|---|
| `Game` | the whole state (round, phase, turn order, players, nations, attack in progress, version) | `start`, `reinforce`, `transfer`, `attack`, `roll`, `stop`, `occupy`, `skip`, `playNpcTurn`, `toDocument()`, `static fromDocument()` |
| `Nation` | code, name, value, owner, soldiers, neighbours | read-only getters, `isNeighbourOf` |
| `Player` | id, type, profile, home country, eliminated | `ownedNations`, `isHuman` |
| `Battle` | the attack in progress and its rolls | `rolls`, `isFinished`, `outcome` |

Private fields (`#state`) make state changes possible only through methods. Each method calls the engine, replaces the private state with the returned one, and returns the events.

## 2. Firestore data model

### `games/{gameId}`

The whole game state sits in **one document**, so each action is one atomic read-modify-write.

| field | type | notes |
|---|---|---|
| `ownerUid` | string | Firebase Auth uid of the human. **Never returned by the API.** |
| `status` | string | `active` \| `won` \| `lost` |
| `winner` | string \| null | player id |
| `round` | number | starts at 1 |
| `turnOrder` | array\<string\> | 10 player ids, shuffled at setup |
| `currentTurn` | number | index into `turnOrder` |
| `phase` | string | `reinforce` \| `manoeuvre` \| `attacking` \| `occupy` |
| `pendingReinforcements` | number | > 0 only in `reinforce` |
| `players` | map | `{ [playerId]: { type: "human"\|"npc", profile: null\|"warlord"\|"fortress"\|"opportunist", homeCode, eliminated: bool } }` |
| `countries` | map | `{ [code]: { name, value, lat, lng, owner: playerId, soldiers } }`, 10 entries |
| `borders` | map | `{ [code]: array<code> }`, symmetric and connected, built once at setup |
| `attack` | map \| null | `{ from, to, rolls, bonus }`. `bonus` is set on conquest and used in `occupy` |
| `version` | number | +1 on every write. Used for stale-request checks |
| `eventSeq` | number | last event sequence number used |
| `llmCalls` | number | LLM commentary calls used in this game (capped at 60) |
| `createdAt`, `updatedAt` | timestamp | server timestamps |

### `games/{gameId}/events/{eventId}`

One document per engine event (GAME_RULES §10). `eventId` = zero-padded `seq` (e.g. `000042`), so documents sort naturally.

| field | type | notes |
|---|---|---|
| `seq` | number | strictly increasing within a game |
| `round` | number | |
| `type` | string | see GAME_RULES §10 |
| `data` | map | type-specific fields |
| `text` | string | template commentary line, always present |
| `aiText` | string \| null | LLM commentary, set later by the commentary endpoint, only for `roll`, `conquest`, `elimination` and `gameOver` |
| `createdAt` | timestamp | |

### `players/{uid}`

| field | type | notes |
|---|---|---|
| `gamesStarted`, `wins`, `losses` | number | |
| `lastPlayedAt` | timestamp | |

Indexes: a composite index on `games` for `ownerUid ==` + `updatedAt desc`, for the "my games" list. `events` ordered by `seq` needs no extra index.

## 3. Endpoints

Base path `/api`. Bodies are JSON. Errors are `{ "error": { "code": "...", "message": "..." } }`.

Every **game action** body includes `version` (the version the client last saw). Every action responds `200 { game, events }`, with `events` covering only that action.

| Method | Path | Auth | Body | Notes / errors |
|---|---|---|---|---|
| GET | `/health` | public | — | `{ ok: true }` |
| GET | `/countries` | public | — | catalogue with `soldierValue` |
| GET | `/games` | token | — | the caller's games (sessions), newest first |
| POST | `/games` | token | `{ countryCode }` | 201 · 422 unknown country |
| GET | `/games/:id` | **public** | — | the game state for anyone with the link · 404 |
| GET | `/games/:id/events?after=<seq>` | **public** | — | max 200, ascending. Spectators poll this |
| POST | `/games/:id/reinforce` | token + owner | `{ version, placements: { CODE: n } }` | 409 wrong phase · 422 bad sum or not owned |
| POST | `/games/:id/transfer` | token + owner | `{ version, from, to, count }` | 409 wrong phase · 422 §6.1 |
| POST | `/games/:id/attack` | token + owner | `{ version, from, to }` | starts the attack, no dice yet · 422 §5.1 (including not a neighbour) |
| POST | `/games/:id/attack/roll` | token + owner | `{ version }` | **one dice roll per request** · 409 if not `attacking` |
| POST | `/games/:id/attack/stop` | token + owner | `{ version }` | ends the turn |
| POST | `/games/:id/attack/occupy` | token + owner | `{ version, count, placements: { CODE: n } }` | moves `count` in + places the bonus, ends the turn · 422 count out of range / placements don't sum to the bonus |
| POST | `/games/:id/skip` | token + owner | `{ version }` | ends the turn |
| POST | `/games/:id/npc-turn` | token + owner | `{ version }` | plays **the current NPC's whole turn** and never calls the LLM · 409 if it is the human's turn |
| POST | `/games/:id/events/:eventId/commentary` | token + owner | — | writes `aiText` on the event (LLM, or the template on failure) · idempotent · 429 when rate limited |
| GET | `/players/me` | token | — | stats |

Common errors on every action: 400 bad body · 401 no or invalid token · 403 not the owner · 404 · 409 stale `version` / wrong phase / not your turn / game over · 422 illegal by the rules · 429 too many requests.

**What a response contains.** `game` never includes `ownerUid`. It includes `isOwner` (true only when the caller's token matches), so the client knows whether to show action buttons. Visitors always get `isOwner: false`.

## 4. Request flows

### 4.1 One roll per request (the human's attack)

The human's attack is interactive: each **Roll** click is one request, and the server rolls one round of dice for it.

```
Client                         Server                                          Firestore
  │ POST /games/:id/attack/roll  │                                                │
  │ Authorization: Bearer <idToken>                                               │
  │ { version: 41 }              │                                                │
  │─────────────────────────────▶│ 1. requireAuth: verifyIdToken → req.uid        │
  │                              │ 2. validate body (400)                         │
  │                              │ 3. model.runAction(gameId, uid, fn):           │
  │                              │    runTransaction ────────────────────────────▶│ read games/{id}
  │                              │      404 · 403 ownerUid ≠ uid                  │
  │                              │      409 status/version/phase/turn             │
  │                              │      game.roll(rollDie)  (engine inside)       │
  │                              │        → 422 if illegal (nothing written)     │
  │                              │        → { state, events }                    │
  │                              │      write game (version 42) + events ────────▶│ (atomic)
  │ 200 { game, events }         │                                                │
  │◀─────────────────────────────│                                                │
  │ DicePanel shows the pairs; Roll/Stop stay enabled while in progress.          │
```

### 4.2 NPC turns

When `turnOrder[currentTurn]` is an NPC, the client calls `POST /npc-turn` once per NPC. The server runs `playNpcTurn` (reinforce → target → rolls → occupy → end) and returns every event in order. One NPC turn is bounded (at most one attack per turn, at most 20 rolls, GAME_RULES §4.5 and §8.2), so one request stays short on Vercel. The client **replays** the events one by one:
- **Normal speed:** about 700 ms per roll event and 400 ms for the others.
- **Fast-forward:** about 120 ms per event. It still shows every roll, conquest and line of commentary, and only the pacing changes. It keeps going until the human's turn comes round.

Fast-forward is purely client playback speed. The server never skips or summarises anything. If an NPC conquers the human's last country, the game ends as `lost` in that same turn and the response says so.

### 4.3 Commentary

Commentary never blocks a game action.
1. Every event is saved with its template `text` when the action is saved.
2. At normal speed, for each `roll`, `conquest`, `elimination` and `gameOver` event the client shows the template line straight away and calls `POST /games/:id/events/:eventId/commentary`.
3. The server loads the event, checks ownership and the `llmCalls` cap (60 per game), and asks `commentaryService` for one or two lines. The prompt contains only fields from the event. On a timeout (about 5 seconds), an error, or the cap being reached, it returns the template line.
4. The server saves `aiText` on the event (once; a second call returns what is saved) and returns it. The client swaps the line in.
5. In fast-forward, the client shows template lines and skips the LLM.

### 4.4 Spectating (public, polling)

```
Visitor's browser (no token)        Server                               Firestore
  │ GET /api/games/:id              │ (no auth needed)                     │
  │────────────────────────────────▶│ read game, strip ownerUid ──────────▶│
  │ ◀── { game (isOwner: false) } ──│                                      │
  │ every 2 s: GET /events?after=<lastSeq>                                  │
  │────────────────────────────────▶│ read new events ────────────────────▶│
  │ ◀── { events } ─────────────────│                                      │
  │ replay.js plays the new events with the same dice animation and feed.   │
```

A visitor sees the board, battles and commentary, but every action button is hidden, and every `POST` would return 401. A visitor sees a **Log in to play** button instead.

Key points:
- **`rollDie` and `randomInt` are created on the server** with `crypto.randomInt` and passed into the engine. Tests pass scripted functions instead.
- **Randomness happens inside the transaction callback.** If Firestore retries the callback, it rolls again, and only the committed result is ever seen.
- `version` makes actions idempotent. A double-clicked Roll gets 409 for the second request, and the client refetches.

## 5. Security

### 5.1 Firestore rules (`firestore.rules`)

**Deny everything to clients.** The Admin SDK bypasses rules, so the server can still read and write. The browser has no Firestore SDK, and these rules are the second lock on the door.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Public viewing happens through the API (§4.4), not through Firestore. The API strips `ownerUid`, and no client can read the raw document.

### 5.2 Token check on every turn action

- Users sign up and log in with **email and password** through Firebase Auth in the browser.
- `requireAuth` reads `Authorization: Bearer <idToken>` and calls `admin.auth().verifyIdToken(token)`. If the header is missing, malformed, expired, or invalid, it returns **401**. **Every** `POST` route and the `GET /games` and `/players/me` routes use it.
- Inside the transaction the model checks `game.ownerUid === req.uid`. If they differ, it returns **403**. This includes `/npc-turn` and `/commentary`, so only the owner can advance their game.
- Bodies are validated against strict shapes: unknown keys are rejected, country codes must be in this game, and counts must be positive integers. The client never sends dice, outcomes, soldier totals, or random picks. Any such field means **400**.
- `rateLimit` protects the commentary and attack endpoints (429), which also limits LLM cost.

### 5.3 Secrets and config

- Service-account credentials and the LLM key are **Vercel environment variables** and a local, git-ignored `.env`. They are never in the repo, never logged, and never returned in a response.
- `.env.example` lists names only: `PORT`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `ANTHROPIC_API_KEY`, `LLM_MODEL`.
- The Firebase **web** config in the client (needed for Auth sign-in) is public by design. It still comes from one config file rather than being scattered around.

## 6. Deployment (Vercel)

- `api/index.js` exports the Express app. `vercel.json` rewrites `/api/(.*)` to that function and `/game/(.*)` to `index.html`. Everything in `public/` is served as static files.
- Each request runs as a short-lived function, so nothing is kept in memory between requests. All state lives in Firestore.
- Pro plan limits are generous, but the design doesn't rely on them: one request is one roll, one NPC turn, or one commentary line. The LLM call has its own timeout.
- Set all environment variables in the Vercel project, deploy the Firestore rules with the Firebase CLI, and keep one Firebase project for production and the emulators for development.

## 7. Testing strategy

| Level | Location | What | Firestore |
|---|---|---|---|
| Unit | `tests/unit/*.test.js` | Every rule in GAME_RULES.md via the pure engine, with scripted `rollDie` / `randomInt`. Domain classes (encapsulation, round-trip to a document). `commentaryService` with a mocked LLM | none |
| HTTP | `tests/integration/api.test.js` | Status codes, auth, public reads, body validation, phases, version checks, commentary endpoint and cap (Supertest on `app.js`) | emulator |
| Rules | `tests/integration/rules.test.js` | Clients can neither read nor write (`@firebase/rules-unit-testing`) | emulator |
| Audit | `tests/unit/audit.test.js` | `src/game/` has no Express/Firebase imports or `Math.random`; no response contains `ownerUid` | none |

Scripted helpers in `tests/helpers.js`:
- `scripted(...values)` returns a function that yields those values in order and **throws if it runs out**.
- `makeState({...})` builds a minimal valid state for a test.
- `mockLlm({ reply | error | delayMs })` stands in for the LLM client, so tests never call the network.
