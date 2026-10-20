# CLAUDE.md — Project brief and working rules

Read this first, every session. Then read the doc that matches the task:

| Doc | Read it when |
|---|---|
| `GAME_RULES.md` | Anything touching countries, soldiers, dice, attacks, transfers, NPCs, turns, or winning. **Source of truth for game logic and its tests. It is fixed.** |
| `ARCHITECTURE.md` | Adding files, endpoints, Firestore fields, security rules, or deployment. |
| `DESIGN.md` | Any UI work: HTML, CSS, client components. |
| `PLAN.md` | Picking the next task, and ticking it off when done. |
| `docs/AI_DESIGN.md` | Anything touching the LLM commentary prompt or the NPC profiles' explanation. |

If two docs disagree, stop and ask which one is right. Do not guess. `GAME_RULES.md` wins over every other doc, and `PLAN.md` changes to match it, never the other way round.

## What the project is

**Geopolitics** is a Risk-inspired browser game built for the UCT INF4001N entrance exam (*Geopolitics Game Case Study*). The player logs in, picks a real country, and the server randomly adds 9 more. Each of those 9 is run by an NPC with its own profile. Each country starts with soldiers based on its population. The server builds a map that links nearby countries by the location of their capitals. Players take turns in a random order. On a turn a player can place reinforcements, transfer soldiers, and attack one neighbouring country by rolling dice repeatedly until they conquer it, run down to 1 soldier, or stop. NPC turns are simulated and replayed on screen, with a fast-forward option. The human wins by conquering all 10 countries. A player can run several games and continue any of them.

**Three things the brief and the marking sheet require, so never lose them:**
1. **Battles are shown as they happen** (each attack, dice rolls, losses, outcomes), with **commentary written by an LLM**.
2. **NPCs play to win**: each turn they evaluate the board, decide whether to attack, which country to target, and when to stop.
3. **Anyone with the game link can watch, but only a logged-in user can play a turn.**

## Stack

- **Runtime:** Node.js 22+, ES modules (`"type": "module"`)
- **Server:** Express (MVC: models / controllers / routes), deployed to **Vercel** as a serverless function
- **Database:** Cloud Firestore (NoSQL), accessed only through the Firebase Admin SDK on the server
- **Auth:** Firebase Authentication with **email and password**. The client sends a Firebase ID token with every write request.
- **LLM:** the Anthropic API, called **only from the server**, for battle commentary. The key lives in an environment variable.
- **Client:** Static HTML, plain CSS, and vanilla JavaScript modules in `public/`. No frameworks, no CSS libraries, no build step.
- **Tests:** Vitest for unit tests, Supertest for HTTP tests, and the Firebase Emulator Suite for Firestore and Auth in integration tests. The LLM client is always mocked in tests.
- **Data:** `src/data/countries.json` is a dated snapshot of the Worldometers population table.

## Folder layout

```
geopolitics/
├── CLAUDE.md  DESIGN.md  ARCHITECTURE.md  GAME_RULES.md  PLAN.md
├── AI_LOG.md               # one line per session: what AI did, what I did
├── README.md
├── package.json
├── vercel.json             # rewrites: /api/* → serverless function, /game/* → index.html
├── .env.example            # variable names only, never real values
├── firebase.json           # emulator config
├── firestore.rules         # deny all client reads and writes
├── firestore.indexes.json
├── api/
│   └── index.js            # Vercel entry: exports the Express app
├── docs/
│   └── AI_DESIGN.md        # commentary prompt, sample outputs, NPC profile explanation
├── src/
│   ├── server.js           # starts the HTTP server for local dev
│   ├── app.js              # builds the Express app (exported for Supertest and Vercel)
│   ├── config/firebase.js  # Admin SDK init (emulator-aware)
│   ├── data/countries.json # { code, name, population, lat, lng }[] + source/date
│   ├── game/               # PURE engine: soldiers, map, setup, dice, attack, transfer,
│   │                       #   reinforce, turn, npc, victory, commentary (template text)
│   ├── domain/             # OO layer: Game, Nation, Player, Battle classes wrapping src/game
│   ├── models/             # Firestore reads/writes only (gameModel, eventModel, playerModel)
│   ├── services/           # outside the engine: commentaryService (LLM + fallback)
│   ├── controllers/        # request → validate → model/domain → response
│   ├── routes/api.js       # URL → controller
│   └── middleware/         # requireAuth (verifyIdToken), validate, rateLimit, errorHandler
├── public/                 # the View layer (static client)
│   ├── index.html
│   ├── css/tokens.css      # design tokens from DESIGN.md
│   ├── css/main.css
│   └── js/
│       ├── app.js  api.js  auth.js  replay.js  poll.js
│       └── components/     # NationCard.js, DicePanel.js, CommentaryFeed.js, …
└── tests/
    ├── helpers.js          # scripted(), makeState(), mockLlm()
    ├── unit/               # one file per src/game module, plus domain and services
    └── integration/        # HTTP + Firestore emulator + rules
```

## Commands

```bash
npm install                 # install dependencies
npm run dev                 # start the server with auto-reload (node --watch) on http://localhost:3000
npm start                   # start the server for production
npm test                    # run unit tests once (Vitest)
npm run test:watch          # unit tests in watch mode
npm run test:integration    # start Firestore + Auth emulators, run integration tests, stop them
npm run emulators           # start the Firebase emulators by hand (UI on http://localhost:4000)
npm run test:all            # unit + integration
```

If a command here does not exist in `package.json` yet, adding it is boilerplate. Add it and tell me.

## How AI works on this project (TDD flow)

This is a learning project, and the exam marks how I used AI. **I write the logic. AI writes boilerplate and tests, and refactors.** Stick to these roles:

| AI does | AI does NOT do |
|---|---|
| Scaffolding: `package.json`, config, Express wiring, routes, middleware, emulator setup, HTML/CSS shells, the `countries.json` data snapshot | Write the body of any function in `src/game/`, `src/domain/`, `src/controllers/`, or `src/models/` that holds game or business logic |
| Writes **failing tests first**, taken straight from `GAME_RULES.md` and `ARCHITECTURE.md` | Change a test so it passes, unless I agree the test is wrong |
| Writes function stubs with JSDoc signatures that throw `new Error('not implemented')` | "Just quickly" fill in a stub, even when it is asked to make tests pass |
| Refactors **after** my code is green, keeping the tests green | Add features, files, or dependencies that are not in the plan |
| Reviews my code and explains failures, hints before answers | Paste a full solution when I'm stuck. Give a hint first, then a smaller hint |

### The loop for every task

1. **Plan first. Nothing gets built without a plan.** Before touching files, AI writes a short plan in chat: the task from `PLAN.md`, files to create or change, the tests to write (by name), and anything unclear. **Wait for my "go".**
2. **Red:** AI writes the tests and any stubs. Run `npm test` and show that they fail for the right reason.
3. **Green:** I write the logic. AI waits, or answers questions.
4. **Refactor:** Once I say it's green, AI may suggest or make refactors. Run the tests after every change.
5. **Tick:** Update `PLAN.md` (tick the item, note anything learned or deferred) and **add one line to `AI_LOG.md`**: what I asked AI, what AI produced, what I wrote or changed myself.

One task per session. If a task grows, split it in `PLAN.md` and stop.

## Hard rules

- **Never commit secrets.** No service-account JSON, API keys, or `.env` files in git. `.env`, `*serviceAccount*.json`, and `*-debug.log` are in `.gitignore`. Put names in `.env.example` and keep values out. The Firebase Admin credentials and the LLM key live only in Vercel environment variables (and my local `.env`). If a secret is ever staged, stop and tell me.
- **The server decides all dice rolls**, and every other random choice: the 9 random countries, the turn order, and the NPC profiles. The client sends only *intent* (`attack X from Y`, `roll`, `stop`, `transfer 3 from A to B`). It never sends dice, outcomes, or soldier totals. The server uses `crypto.randomInt`. The engine takes `rollDie` and `randomInt` as parameters, so tests can pass in fixed values.
- **The client never touches Firestore.** There is no Firestore SDK in the browser. All reads and writes go through the server's API, and the Firestore rules deny every client request.
- **Anyone can read a game; only the logged-in owner can change it.** `GET /games/:id` and `/events` are public. Every `POST`, `GET /games` and `GET /players/me` need a verified ID token, and the server checks that the caller owns the game.
- **`src/game/` stays pure.** No `firebase-admin`, no `express`, no `fetch`, no `Math.random`, no `Date.now()` inside it. Inputs in, outputs out, and inputs are never mutated.
- **The LLM never decides anything in the game.** It only writes commentary for events the engine has already produced. It gets structured event data, must use only the numbers and names in it, and its output is never parsed for game logic. Any LLM failure falls back to the template text from `src/game/commentary.js`.
- **The LLM is called from `src/services/` only**, and only through the commentary endpoint. Never inside a transaction, and never inside `/npc-turn`, so no request can run long on Vercel.
- **`GAME_RULES.md` wins.** If code and rules disagree, the code is wrong. If the rules are unclear, ask me before changing anything. `GAME_RULES.md` is not edited by AI.
- **Fast-forward is client-side pacing only.** It must still show every NPC move.
- **Plain CSS only.** No Tailwind, Bootstrap, or component libraries. Use the tokens in `DESIGN.md`.
- **No user-facing numbers computed in the browser.** The client displays what the server returned.

## Style

- ES modules, `const` by default, small named exports, no default exports in `src/game/`.
- File names: `camelCase.js` for modules, `PascalCase.js` for UI components and domain classes.
- Test names read as rules: `it('kills nobody on a tied pair')`.
- Keep comments for the *why*. Cite the rule section when code implements one, e.g. `// GAME_RULES §5.3`.
