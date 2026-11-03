# Geopolitics

A Risk-inspired browser game built for the UCT INF4001N entrance exam (*Geopolitics Game Case Study*).
You pick a real country, the server adds 9 more, and each of those 9 is run by an NPC with its own
playing style. Conquer all 10 countries to win.

**Live game:** https://geopolitics-peach.vercel.app


Name and Surname: Destiny Mabwe 
Student Number: MBWDES001

## What it does

- **Start a game.** Pick your country. The server randomly picks 9 others, gives each soldiers by
  population, links nearby countries by the location of their capitals, and shuffles the turn order.
- **Take a turn.** Place your reinforcements (from round 2), transfer soldiers between your countries,
  then attack one neighbour by rolling dice until you conquer it, are down to 1 soldier, or stop.
- **Watch battles as they happen.** Every attack, dice roll, loss and outcome is shown, with a line of
  commentary written by an LLM (Anthropic's Claude). If the LLM fails, a plain template line is used.
- **NPCs play to win.** Each NPC evaluates the board, decides whether to attack, whom, and when to stop.
  Their turns are replayed on screen, and **fast-forward** speeds them up without hiding any move.
- **Share the link.** Anyone with a game's link can watch it live. Only the logged-in owner can play.
- **Run many games** and continue any of them.

You win by owning all 10 countries. You lose if you are eliminated. The full rules are in
[`GAME_RULES.md`](GAME_RULES.md).

## Playing and testing the live game

**Link:** https://geopolitics-peach.vercel.app

1. Click **Sign up**, enter an email and a password, then pick a country and press **Begin**. This makes a
   real account in the live Firebase project, and no email verification is needed.
2. On your turn, press **Attack**, pick your own country, pick a neighbour, press **Attack** again, then
   **Roll** as often as you like, or **Stop attack**. **Transfer** and **Skip** are there too. From round 2
   you place your reinforcements first.
3. NPC turns play on their own, one move at a time. **Fast-forward** speeds them up and still shows every move.
4. Press **Copy link** and open it in a private window without logging in. A visitor should see
   "You are spectating", the same board, dice and feed updating live, and no action buttons.

What to look at:

- Each NPC decision has a muted second line saying why it chose that.
- Roll, conquest, elimination and game-over lines start as plain text and should turn into an italic
  AI-written line within a second or two. If they never do, the LLM key is missing or wrong.
- The owner sees **Victory** or **Defeat** on a finished game. A visitor sees a neutral **Game over**.
- Country names and badges stay whole, and no two map nodes sit on top of each other.
- Right after **Attack**, the Dice panel says "No dice rolled yet." instead of showing the last fight.
- If the page cannot reach the server it shows a message with **Try again**, not an endless "Loading".

Rough edges worth knowing about:

- Narrow phone screens were only checked in an emulated narrow window, not on a real phone.
- The LLM call has a 5 second limit. A slow call falls back to the plain template line, so now and then
  a line will stay plain.
- NPC turns replay at a fixed pace (about 0.4 s per step, 0.12 s with fast-forward).

## How the NPCs think

Each NPC gets one of three profiles when the game is created, shown as a badge next to its name.
The profile only changes how it scores a target. The dice and the turn structure are the same as yours.

| Profile | Plays like | Attacks when |
|---|---|---|
| **Warlord** | Aggressive, goes after the human | score ≥ 0, where score = `own − target soldiers`, +2 if the target is the human |
| **Fortress** | Cautious, sure wins only | it has at least `2 × target + 1` soldiers |
| **Opportunist** | Picks off the weak and the current leader | score ≥ 2, with +3 for a target of 2 soldiers or fewer and +2 for the leader |

*Example (Opportunist).* It owns `TUR` with 5 soldiers and the human leads with 3 countries. `IND`
(human, 3) scores 5 − 3 + 2 = 4. `NPL` (1 soldier) scores 5 − 1 + 3 = **7**. `IRN` (4) scores 1, which
is below the threshold. It attacks `NPL`.

The three formulas, the stop rules and the reinforcement rules are in
[`docs/AI_DESIGN.md`](docs/AI_DESIGN.md#how-the-npcs-think).

## Tech

| Layer | Choice |
|---|---|
| Runtime | Node.js 22+, ES modules |
| Server | Express (models / controllers / routes), deployed to Vercel as a serverless function |
| Database | Cloud Firestore, reached only through the Firebase Admin SDK on the server |
| Auth | Firebase Authentication, email and password |
| LLM | Anthropic API, called only from the server, for battle commentary |
| Client | Static HTML, plain CSS and vanilla JavaScript modules in `public/`. No framework, no build step |
| Tests | Vitest, Supertest, and the Firebase Emulator Suite |

Three rules shape the design:

1. **The server decides every random thing** (dice, the 9 countries, turn order, profiles). The client
   only sends intent, such as "attack X from Y", and never dice or soldier totals.
2. **The browser never touches Firestore.** The Firestore rules deny every client request.
3. **The LLM never decides anything in the game.** It only describes events the engine already produced.

## Run it locally

You need **Node.js 22 or later**. For the emulators and integration tests you also need **Java 21**
(the Firestore emulator runs on the JVM).

```bash
git clone https://github.com/DestiMabwe/geopolitics.git
cd geopolitics
npm install
cp .env.example .env     # then fill in the values below
npm run dev:emu          # app on http://localhost:3000 with local Firestore + Auth emulators
```

`npm run dev:emu` uses the demo project `demo-geopolitics`, which can never reach Google, so no Firebase
account is needed to play locally.

### Environment variables

Names are in `.env.example`. Real values go in your local `.env` and in Vercel. **Never commit them.**

| Variable | What it is |
|---|---|
| `PORT` | Local port, default 3000 |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin credentials, only needed against a real project |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Set by the emulator scripts |
| `ANTHROPIC_API_KEY` | Enables LLM commentary. Without it the game uses template lines |
| `LLM_MODEL` | The Claude model used for commentary |

### Before pointing production at a Firestore project

The emulator does **not** enforce composite indexes, so a missing one passes every test and then breaks
the live site (every logged-in player saw "Something went wrong"). Deploy them first, and wait until
they show **Enabled** in the Firebase console:

```bash
npx firebase login
npx firebase deploy --only firestore:indexes --project prod
```

## Commands

```bash
npm run dev               # server with auto-reload on http://localhost:3000
npm start                 # server for production
npm test                  # unit tests (Vitest)
npm run test:watch        # unit tests in watch mode
npm run test:coverage     # unit tests with coverage
npm run emulators         # Firebase emulators by hand (UI on http://localhost:4000)
npm run dev:emu           # server + emulators together
npm run test:integration  # start the emulators, run the HTTP + Firestore + rules tests, stop them
npm run test:all          # unit + integration
```

`npm test` needs no Firebase and no network. The LLM client is always mocked in tests.

## Project layout

```
api/index.js        Vercel entry: exports the Express app
src/game/           the pure game engine (no Firebase, no Express, no randomness of its own)
src/domain/         Game, Nation, Player and Battle classes wrapping the engine
src/models/         Firestore reads and writes only
src/controllers/    request → validate → model → response
src/routes/api.js   URL → controller
src/services/       the LLM commentary service, with its fallback
src/middleware/     auth, validation, rate limiting, error handling
src/data/           countries.json, a dated snapshot of the Worldometers population table
public/             the client: index.html, css/, js/ and js/components/
tests/unit/         one file per engine module, plus domain and services
tests/integration/  HTTP, Firestore emulator and rules tests
docs/AI_DESIGN.md   the commentary prompt and the NPC profiles
```

## Documents

| File | What is in it |
|---|---|
| [`GAME_RULES.md`](GAME_RULES.md) | The rules, which the code and tests follow |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Endpoints, data model, security rules, deployment |
| [`DESIGN.md`](DESIGN.md) | Design tokens and the UI components |
| [`PLAN.md`](PLAN.md) | The task list and what was done |
| [`docs/AI_DESIGN.md`](docs/AI_DESIGN.md) | How the LLM commentary and the NPCs work |
| [`AI_LOG.md`](AI_LOG.md) | One row per session: what AI did and what I did |
| [`docs/AI_REFLECTION.md`](docs/AI_REFLECTION.md) | My reflection on using AI for this project |
| [`.gstack/qa-reports/`](.gstack/qa-reports/) | The browser QA reports of 2026-11-02 and 2026-11-03: what was found and what was fixed |

## Known limits

<!-- ✍️ YOU TYPE: 2 to 4 honest bullets on what is missing or rough. For example: anything in PLAN.md
     you did not finish, anything you did not test by hand, the one test that is flaky. Keep it
     short and true. Markers read that honesty well. -->
1. I rarely tested by hand 
2. I changed some tests
3. I didnt use as many AI agents as I could have 

## Credits

Country flags in `public/flags/` are from [flag-icons](https://github.com/lipis/flag-icons) 7.2.3 (MIT licence, included as `public/flags/LICENSE`), renamed to the game's 3-letter country codes.
