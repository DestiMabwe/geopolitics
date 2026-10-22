# PLAN.md — Tasks and definition of done

**Deadline: Fri 6 Nov 2026 (INF4001N entrance project). Today: Tue 20 Oct. 17 days.**
**GAME_RULES.md is fixed. If this plan and GAME_RULES.md disagree, this plan is wrong.**

## How to use this file

- **One session = a few short blocks.** Pick the first unticked task, ask AI for a plan (see CLAUDE.md), do it, tick it.
- A task is done only when its **Done when** line is true *and* `npm test` is green.
- If a task turns out bigger than estimated, split it here before you continue.
- Roles: **[AI]** = AI may write it (boilerplate, data, tests, refactor). **[ME]** = I write the logic, and AI writes the tests first.
- Size: **S** ≈ 1 block, **M** ≈ 2 blocks, **L** ≈ 3 blocks. A block is 30 to 40 minutes of focus, followed by a break. These are guesses, and I re-check them after the first two days.
- **After every session, add one line to AI_LOG.md:** what I asked AI, what AI produced, what I wrote or changed myself. (The rubric marks AI use, so the evidence is built as I go, not at the end.)

## Decisions made

| Question | Decision |
|---|---|
| Login | **Email + password** (Firebase Auth). Logging in is required to create or play a game. Visitors can only watch. |
| Spectating | **Polling.** A visitor's page calls the public `GET /games/:id` and `GET /games/:id/events?after=` every 2 seconds. Firestore rules deny all client access, so nothing private can leak and the server stays the only door. |
| Commentary | **Simple rule:** the LLM writes one line for each `roll`, `conquest`, `elimination` and `gameOver` event, at normal speed. All other events, and anything during fast-forward, use the template line. A game stops using the LLM after 60 calls, and any LLM failure falls back to the template. |
| Hosting | Vercel (Pro plan), Express as a serverless function. One request does at most one NPC turn (bounded by GAME_RULES §4.5 and the 20-roll cap), so no request runs long. |
| Bonus feature | **Proposed: NPC profiles** (brief's bonus idea 9, already required by GAME_RULES §8). Confirm before Mon 2 Nov. See §8. |

## 0. Rubric (INF4001N entrance exam, 56 marks)

14 criteria, each marked 0 to 4. Every row is worth the same, so no area can be ignored.

| Rubric criterion | Marks | Tasks |
|---|---|---|
| Database layer: separate from the rest of the app, configured, appropriate (NoSQL), online | 4 | S02, S17, S18, S31a |
| Connection to database | 4 | S02, S17, S31a |
| Design of the database | 4 | S06, S17, S18, ARCHITECTURE §2 |
| Coding structure: framework (MVC), best practice | 4 | S01, S17–S21b, S30 |
| Object-oriented concepts: classes, encapsulation | 4 | S13b, S18 |
| Data validation, controls and security | 4 | S22, S22b, S30 |
| Functionality | 4 | S04–S15, S19–S21 |
| Works correctly: lists, searching, filtering, viewing | 4 | S03, S25, S25b, S26b |
| User interface | 4 | S24–S29 |
| Ease of navigation | 4 | S25, S25b, S29 |
| Security: authentication and authorisation | 4 | S17, S18, S22, S25 |
| Sophistication and complexity (battle engine, game engine, AI integration, access control) | 4 | S14, S15, S16b, S21, bonus |
| AI application | 4 | S15, S16b, S16c, AI_LOG.md |
| Overall evidence of effort | 4 | tests, AI_LOG.md, README, S32 |

### Brief requirements → tasks

| Requirement | Tasks |
|---|---|
| Battles shown as they happen: each attack, dice rolls, losses, outcomes | S20a, S25b, S26b, S28 |
| **AI/LLM generates dynamic commentary describing the battle** | S16b, S16c, S21b, S28 |
| **NPCs play to win: evaluate the board, choose whether to attack, whom, and when to stop** | S14, S15, S21 |
| **Anyone with the shared link can watch; only a logged-in user can play** | S17, S22, S25, S25b |
| NoSQL database (Firestore) | S02, S17, S18 |
| Web app on a chosen stack | S01, S31a |
| Pick a country + 9 random others | S03, S06, S17 |
| Map: nearby countries border each other | S03, S05b, S06 |
| Soldiers from population table | S03, S04 |
| Random first player / turn order | S06 |
| Attack: repeated rolls, dice = min side, leave 1 behind, pairs, ties | S05, S07, S08, S20a, S26b |
| Conquest bonus `max(2, value/2)` + move-in | S09, S20b |
| Transfers between own countries (keep ≥ 1, not mid-attack) | S10, S19 |
| Reinforcements from round 2 (`2 × countries`), free allocation | S11, S19 |
| Turns, skip, rounds, elimination | S12, S13 |
| Fast-forward (still showing gameplay) | S28 |
| Win by conquering all 10; lose if eliminated | S13, S15 |
| Multiple games, play any session | S17, S25 |
| Testing / TDD evidence | throughout |
| Bonus feature | §8 |

## Calendar and cut line

The plan is built as a **vertical slice first**: login, create a game, one attack, and a logged-out visitor watching it, all working end to end by Tue 27 Oct. Then each later task deepens something that already works, so there is always a working app to submit.

Capacity assumed: about 4 blocks a day (2 to 4 hours of deep work with breaks). The task sizes add up to about 65 blocks for the must-haves, which leaves almost no slack, so **check the pace on Thu 22 Oct and cut early rather than late.**

| Date | Tasks | Blocks | Checkpoint |
|---|---|---|---|
| Tue 20 Oct | S01, S02 | 2 | Scaffold runs, emulators work |
| Wed 21 Oct | S03, S31a | 3 | **Public Vercel URL** reads one real Firestore doc |
| Thu 22 Oct | S04, S05, S05b | 4 | Pace check: if behind, cut now (see below) |
| Fri 23 Oct | S06, S07 | 3 | Engine can create a game and resolve a roll |
| Sat 24 Oct | S08, S17 | 4 | |
| Sun 25 Oct | S18, S20a, S22 | 4 | **API works:** create a game and roll through HTTP |
| Mon 26 Oct | S24, S25 | 3 | Sign up, log in, start a game in the browser |
| Tue 27 Oct | S25b | 3 | **SLICE DONE:** I attack and roll in the browser and a logged-out visitor watches |
| Wed 28 Oct | S09, S10, S11 | 4 | |
| Thu 29 Oct | S12, S13, S13b | 4 | All of GAME_RULES §4–§9 tested for the human's side |
| Fri 30 Oct | S14, S15 | 5 | NPCs play whole turns in tests |
| Sat 31 Oct | S16, S16b, S16c, S19 | 5 | LLM commentary works with fallback |
| Sun 1 Nov | S20b, S21, S21b, S22b | 4 | **Full game playable through the API** |
| Mon 2 Nov | S26b, S27 | 5 | Confirm the bonus |
| Tue 3 Nov | S28, S29 | 4 | **Full game playable in the browser, with fast-forward** |
| Wed 4 Nov | S30, S31b, S32 | 5 | Final deploy, fresh-clone test |
| Thu 5 Nov | Buffer only. No new features. Rehearse the demo | | |
| Fri 6 Nov | Submit | | |

**Must-have (never cut):** S01–S22b, S24–S28, S30, S31a, S31b, S32.
**Cut in this order if behind:** (1) S26a WorldMap, (2) S29 polish beyond keyboard and mobile basics, (3) S23 player stats, (4) the optional replay stretch.
**Never cut:** the AI log, tests for the engine, the spectator view, and the LLM commentary. These are the brief's required items and marked rubric rows.

---

## A. Foundations and early deploy

- [x] **S01 [AI] (S): Project scaffold.** `package.json` (ESM, scripts from CLAUDE.md), Express `app.js`/`server.js`, `GET /api/health`, `.gitignore`, `.env.example`, Vitest config, `tests/helpers.js` with `scripted()`, `git init`, an empty `AI_LOG.md`.
  **Done when:** `npm run dev` serves `/api/health → {ok:true}`, `npm test` runs one passing smoke test plus a test of `scripted()` (including that it throws when exhausted), and `git status` shows no secrets or `node_modules`.
- [x] **S02 [AI] (S): Firebase emulators.** `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `config/firebase.js` (emulator-aware), `npm run emulators` and `npm run test:integration`.
  **Done when:** `npm run test:integration` starts the emulators, writes and reads one doc through the Admin SDK, and exits 0.
- [x] **S03 [AI] (S): Country data.** `src/data/countries.json` from the Worldometers table (population) joined with capital coordinates (`lat`, `lng`), including `source` and `retrievedOn`, plus `GET /api/countries`. Tests check every entry has a unique `code`, a `name`, an integer `population > 0`, `lat` in −90…90 and `lng` in −180…180, that there are ≥ 190 countries, and **a spot-check of about 10 known countries** (e.g. India → value 9, Vatican City → 1, South Africa → 5) against GAME_RULES §1.2.
  **Done when:** the data tests pass and the endpoint returns the list.
- [x] **S31a [ME + AI] (M): Walking-skeleton deploy on Vercel.** Connect the GitHub repo to Vercel (an `api/` entry that exports the Express app, `vercel.json` rewrites), a real Firebase project (Auth with email/password enabled, Firestore in Native mode), env vars set in Vercel, `/api/health` live.
  **Done when:** the public URL returns `{ok:true}`, a server route reads and writes one Firestore doc in the real project, and `git log -p` contains no secrets. *Do this early so hosting surprises show up in week one, not week three.*

## B. Engine for the slice (pure)

- [x] **S04 [AI tests → ME] (S): `soldierValue`, `conquestBonus`, `reinforcementAmount`** (§1.2, §5.5, §7.2).
  **Done when:** every boundary in §1.2 and every example in §5.5 and §7.2 passes.
- [ ] **S05 [AI tests → ME] (S): `diceCount`** (§5.2).
  **Done when:** all four rows of the §5.2 table pass, and `soldiers(s) = 1` throws `IllegalMoveError`.
- [ ] **S05b [AI tests → ME] (M): `distanceKm` + `buildBorders`** (§3.7–3.9).
  **Done when:** tests on equator coordinates prove the nearest-3 rule, symmetry, distance tie-breaks, that the map is always connected, and that two far clusters of 5 are joined by exactly one extra link.
- [ ] **S06 [AI tests → ME] (M): `createGame`** (§2, §3).
  **Done when:** with scripted `randomInt`, the game has 10 distinct countries including the human's, `borders` from `buildBorders`, starting soldiers = value, a shuffled turn order of 10, profiles 3/3/3, `round` 1, and the first player's phase is `manoeuvre`.
- [ ] **S07 [AI tests → ME] (S): `resolveRoll`** (§5.3).
  **Done when:** every row of the §5.3 table passes, pairs stay in roll order, and ties kill nobody.
- [ ] **S08 [AI tests → ME] (M): `startAttack` + `rollAttack` + `stopAttack`** (§5.1, §5.4).
  **Done when:** tests cover every legality rule in §5.1 (including attacking a non-neighbour → 422), the in-progress / failed / stopped outcomes, that the phase is `attacking` throughout, and that a failed or stopped attack ends the turn (§4.5).

## C. Slice wiring: server and a minimal browser game

- [ ] **S17 [AI tests → ME] (M): Auth middleware + create/list/read games.** `requireAuth`, `errorHandler`, `POST /games`, `GET /games`, `GET /games/:id`, `GET /games/:id/events`.
  **Done when:** HTTP tests show 401 without a token, 201 with a valid starting state stored in the emulator, `GET /games` returns only the caller's games, `GET /games/:id` and `/events` work **without** a token (public), and `ownerUid` never appears in a response (an `isOwner` flag does).
- [ ] **S18 [AI tests → ME] (M): `gameModel.runAction`.** One transaction: load → owner, turn and version checks → engine → save game + events.
  **Done when:** tests show 403 for another uid, 409 for a stale version, and that a 422 from the engine writes nothing.
- [ ] **S20a [AI tests → ME] (S): Attack, roll and stop endpoints** (`/attack`, `/attack/roll`, `/attack/stop`).
  **Done when:** each roll is one request with server dice, a body containing `dice` / `soldiers` → 400, and a double roll with the same version → 409.
- [ ] **S22 [AI] (S): Firestore rules tests.** Rules deny **all** client reads and writes, so Firestore is reachable only through the server.
  **Done when:** an unauthenticated client and a signed-in client are both denied every read and write on `games`, `events`, and `players`.
- [ ] **S24 [AI] (S): Tokens + responsive shell.** `tokens.css`, `main.css` reset, the layout from DESIGN §4 with empty component slots, plus AppHeader and Toast.
  **Done when:** there is no horizontal page scroll from 320px to 1440px, and no raw hex values appear outside `tokens.css`.
- [ ] **S25 [AI shell → ME logic] (M): Sign up, log in, log out, API client, Home (StartScreen + GameList).**
  **Done when:** I can create an email/password account, log in, search for a country, start a game, see it in My games, log out and in again, and continue it after a refresh. Starting a game while logged out is impossible (the button asks me to log in).
- [ ] **S25b [AI shell → ME logic] (L): Game page v1 (the slice).** `/game/:id` opens for anyone. It shows the 10 countries as NationCards with owner and soldiers, a "You are spectating" banner and a **Log in to play** button for visitors, and a **Copy link** button for the owner. The owner gets Attack, Roll and Stop buttons, and sees the latest dice and a simple log of events. Visitors' pages poll every 2 seconds.
  **Done when:** I attack and roll in the browser, and a logged-out private window opens the link and sees each roll appear within a few seconds, with no action buttons for the visitor.

> **Slice checkpoint (Tue 27 Oct):** real login, real Firestore, an attack through the API, a visitor watching. If this isn't working, nothing else starts.

## D. Engine for the full human game (pure)

- [ ] **S09 [AI tests → ME] (M): Conquest + `occupy`** (§5.5, §5.6).
  **Done when:** the full §5.7 worked example passes roll by roll, occupy accepts a move-in of 1…`soldiers(s) − 1` and rejects 0 or too many, bonus placements must add up exactly to the bonus and go on owned countries, the total army grows by the bonus, and the turn ends.
- [ ] **S10 [AI tests → ME] (S): `transfer`** (§6).
  **Done when:** tests cover a legal transfer, leaving < 1, unowned from/to, same country, a non-integer count, and a 409 during `attacking`.
- [ ] **S11 [AI tests → ME] (S): `placeReinforcements`** (§7).
  **Done when:** tests cover an exact sum (ok), an under- or over-sum, an unowned country, negative numbers, and that the phase moves to `manoeuvre`.
- [ ] **S12 [AI tests → ME] (S): `endTurn` + skip** (§4.6, §7.1).
  **Done when:** tests cover the next player, skipping eliminated players, `round += 1` on wrap, no reinforcements in round 1, and `pendingReinforcements = 2 × owned` from round 2.
- [ ] **S13 [AI tests → ME] (S): Elimination + game over** (§2.4, §9).
  **Done when:** conquering a player's last country eliminates them, the human owning all 10 → `won`, the human owning 0 → `lost` with the right `winner` (most countries, or `null` on a tie, §9.2), and any action afterwards → 409.
- [ ] **S13b [ME + AI review] (M): Domain classes (object-oriented layer).** `Game`, `Nation`, `Battle` and `Player` classes in a new **`src/domain/`** folder (not `models/`, which is only for Firestore access). They hold their own state (private fields, getters, no public mutation) and delegate the rules to the pure `src/game/` functions.
  **Done when:** the engine still has no Express or Firebase imports, state can only change through class methods (a test proves a direct write is blocked), `Game` can be rebuilt from a stored Firestore document and serialised back unchanged, and the controllers and `gameModel` work with these classes. *This is the evidence for the "OO concepts" row.*

## E. NPCs and commentary

- [ ] **S14 [AI tests → ME] (M): `chooseTarget` per profile** (§8.1).
  **Done when:** all four §8.3 examples pass, plus a tie-break test and a "no leader when tied" test.
- [ ] **S15 [AI tests → ME] (L): `npcReinforce`, `shouldStop`, `npcOccupy`, `playNpcTurn`** (§8.1, §8.2, §9.2).
  **Done when:** with scripted dice, a full NPC turn produces the exact expected event list, the 20-roll cap stops a run of ties, targets are always neighbours, the bonus is placed according to the profile, and the next player is set. **If an NPC conquers the human's last country, the game ends as `lost` at once and the NPC does nothing more** (§9.2, I-6).
- [ ] **S16 [AI tests → ME] (S): `commentary.toText`, the template fallback** for every event type in §10.
  **Done when:** each type returns a non-empty line that names the countries and uses only numbers taken from the event.
- [ ] **S16b [ME + AI shell] (M): LLM commentary service.** `src/services/commentaryService.js` (outside the pure engine) sends one event as structured data to an LLM and returns one or two lines. The API key stays server-side. A timeout of about 5 seconds, and on any failure or timeout it returns the S16 template line.
  **Done when:** tests with a mocked LLM client prove (a) a good response is returned and trimmed, (b) a timeout returns the template line, (c) an API error returns the template line, (d) the prompt contains only numbers from the event, (e) the real key never appears in logs or responses, and (f) only `roll`, `conquest`, `elimination` and `gameOver` events call the LLM.
- [ ] **S16c [ME] (S): Commentary prompt design.** Write the system prompt (tone, length limit, "never invent numbers or countries"), and list 3 to 5 sample events with the commentary you expect. Save it in `docs/AI_DESIGN.md` along with your reasons.
  **Done when:** the prompt is in the repo, the sample outputs read well on a real run of the 4 event types, and any problem found (too long, made-up facts) is logged with what you changed.

## F. Rest of the server

- [ ] **S19 [AI tests → ME] (S): Reinforce, transfer, skip endpoints.**
  **Done when:** each returns `{ game, events }` and the phase errors match ARCHITECTURE §3.
- [ ] **S20b [AI tests → ME] (S): Occupy endpoint** (`/attack/occupy`).
  **Done when:** it takes `count` and `placements`, returns 422 for a count out of range or placements that don't sum to the bonus, and ends the turn.
- [ ] **S21 [AI tests → ME] (S): `POST /npc-turn`.** One request plays one NPC's whole turn and saves its events with their template text. It never calls the LLM.
  **Done when:** it plays exactly one NPC turn, returns its events in order, gives 409 on the human's turn, and ends the game correctly if the human is eliminated.
- [ ] **S21b [AI tests → ME] (S): `POST /games/:id/events/:eventId/commentary`.** Calls `commentaryService` and saves the result as `aiText` on the event. Idempotent: a second call returns the saved text without another LLM call. Stops calling the LLM after 60 calls in a game.
  **Done when:** tests show it requires login and ownership, saves the text once, returns the template when the LLM fails or the cap is reached, and never calls the LLM for other event types.
- [ ] **S22b [AI tests → ME] (S): Input validation and abuse controls.** Strict body validation on every request (types, ranges, unknown fields rejected, per ARCHITECTURE §5.2), rate limiting on the commentary and attack endpoints, and a consistent error shape.
  **Done when:** malformed bodies return 400 with a clear message and write nothing, a burst of commentary requests gets 429, and no endpoint trusts a client-sent dice or soldier count.
- [ ] **S23 [AI tests → ME] (S): Player stats** + `GET /players/me`. *(Cut third.)*
  **Done when:** wins and losses increase exactly once per finished game.

## G. Full browser game

- [ ] **S26b [AI shell → ME logic] (L): NationBoard, TurnOrderBar, DicePanel, ActionBar, full attack flow.**
  **Done when:** source → enemy neighbour → Attack → Roll… → conquered/failed/stopped all work, the dice shown match the server, only neighbours can be targeted, and occupy (move in + place bonus) works.
- [ ] **S27 [AI shell → ME logic] (M): ReinforcePanel + TransferPanel.**
  **Done when:** I can place reinforcements exactly and transfer repeatedly before attacking, and Transfer is disabled mid-attack.
- [ ] **S28 [AI shell → ME logic] (L): `replay.js` + NPC turns + FastForwardToggle + CommentaryFeed.** The feed shows the template line immediately, then swaps in the LLM line when it arrives (S21b). During fast-forward it uses template lines. Visitors' polled events replay through the same code.
  **Done when:** NPC turns play automatically until my turn, every roll and conquest is visible at both speeds, fast-forward is noticeably faster, commentary appears for each event (LLM text for the four event types at normal speed, otherwise the template), and the setting persists. A watching visitor sees the same events and commentary.
- [ ] **S29 [AI] (S): GameOverDialog + accessibility pass.**
  **Done when:** won/lost dialogs work, the game is fully playable by keyboard on a 375px viewport, and reduced-motion disables the dice tumble.
- [ ] **S26a [AI shell → ME logic] (L): WorldMap.** *(Stretch. Cut first.)* SVG projection + zoom-to-fit, nodes, border links, selection highlighting, kept in sync with NationBoard.
  **Done when:** the 10 countries appear roughly where they are in the world, every border link is drawn, and tapping a node selects it.

## H. Hardening and ship

- [ ] **S30 [AI] (M): Refactor, coverage, and an authority audit.**
  **Done when:** `src/game/` has ≥ 90% line coverage, a test fails if `src/game/` imports `firebase-admin`/`express` or uses `Math.random`, the client contains no dice or soldier maths, every POST goes through `requireAuth`, and the API response and the polled spectator page contain no `ownerUid`.
- [ ] **S31b [ME + AI] (S): Final deploy and demo rehearsal.** Redeploy to Vercel with the final env vars (including the LLM key), deploy the Firestore rules, and play a full game on the public URL while a second device watches as a logged-out visitor.
  **Done when:** a public URL plays a full game, a logged-out phone watches it live, and `git log -p` contains no secrets.
- [ ] **S32 [ME + AI] (M): README + AI-use reflection.**
  **Done when:** a fresh clone + README steps → running app + green tests, and the reflection (built from AI_LOG.md) explains what AI wrote versus what I wrote, how I checked the AI's work, and where the game's own AI (NPCs, commentary) fits.

## 8. Bonus feature

The brief allows **one** extra feature. **Proposed: NPC profiles** (brief idea 9: "Create profiles for NPCs, e.g. aggressive attacker, defensive"). They are already in GAME_RULES §8 (Warlord, Fortress, Opportunist), so the work is to make them visible and explainable:
- [ ] **B1 [ME + AI] (S):** Show each NPC's profile badge in TurnOrderBar and NationCard, and add a short "How the NPCs think" section to the README and `docs/AI_DESIGN.md`, with the three scoring formulas.
  **Done when:** a visitor can see which profile each NPC has, and the README explains the three behaviours with one of the §8.3 examples.

**Stretch only if everything above is done and green:** replay a finished game (brief idea 5). It reuses `replay.js` and needs no new writes.

**Chosen bonus:** _NPC profiles (proposed, confirm by Mon 2 Nov)_

---

## Log

| Date | Task | Notes |
|---|---|---|
| 2026-10-20 | S00 | Context docs created. Rewritten to follow the Geopolitics Game Case Study (10 countries, population-based soldiers, multi-roll attacks, 9 NPCs, fast-forward) |
| 2026-10-20 | S00 | Added a nearest-3 map with neighbour-only attacks. Conquest bonus is now freely placed, and move-in ≥ 1. NPC roll cap 20. Added a "how you win" section |
| 2026-10-20 | S00 | Plan revised: real rubric weights (14 × 4 marks), LLM commentary tasks, spectator tasks, OO classes, validation, early Vercel deploy, dates, cut line, per-session AI log |
| 2026-10-20 | S00 | Plan finalised against GAME_RULES.md (unchanged): email/password login, polling spectator view with Firestore rules denying all client access, simple LLM commentary rule, vertical slice first, `src/domain/` for OO classes, §9.2 test in S15, bonus = NPC profiles, S26a WorldMap moved to stretch |
| 2026-10-20 | S01 | Scaffold done. I wrote `scripted()` (closure + `>=` bounds check) after AI's failing tests; AI refactored its error message. Node 22 `--env-file-if-exists` used instead of dotenv. Emulator scripts deferred to S02. `makeState`/`mockLlm` deferred to first use (S06/S16b) |
| 2026-10-20 | S02 | Emulators work: `npm run test:integration` starts Firestore + Auth, writes/reads one doc via Admin SDK, exits 0. Needs JDK 21 (installed Temurin). `firebase-tools` is a devDependency, project alias `demo-geopolitics` (emulator-only). `npm audit` flags transitive issues, mostly in dev-only `firebase-tools`; review in S30. Harmless "Firestore Emulator has exited upon receiving signal: SIGKILL" warning on Windows shutdown |
| 2026-10-20 | S02 | Follow-up: Emulator UI "site can't be reached" was because the emulators weren't running. `npm run emulators` must stay open; `test:integration` shuts them down after the run. UI confirmed at http://127.0.0.1:4000 |
| 2026-10-20 | S03 | Worldometers 2026 table joined with ISO alpha-3 + capital coords from Wikidata, since REST Countries v3 is retired. 24 name mismatches mapped by hand, multi-capital picks listed in the file's `notes`. **Decision: sovereign states only (195 = 193 UN members + VAT, PSE).** All 234 rows gave 106 one-soldier entries (37 under 100k people, mostly remote islands/territories), which flooded the §3.2 random picks; island *states* (TUV, NRU, FJI…) stay. Drops TWN, HKG, ESH, PRI, GRL etc. `GET /api/countries` returns the raw catalogue; ARCHITECTURE §3 wants `soldierValue` in it, deferred to after S04. Build scripts were throwaway (not in repo) |
| 2026-10-21 | S31a | Live at https://geopolitics-peach.vercel.app (Vercel team EL FX, region cpt1): `/api/health` → `{ok:true}`, `/api/health/db` writes and reads `_health/ping` in the real Firestore project, `git log -p` clean, 46/46 unit tests green. Learned: Vercel's runtime has require(esm) off, so `jwks-rsa`'s `jose` is pinned to v5 via `overrides` (regression test in `tests/unit/vercelRuntime.test.js`). `FIREBASE_PRIVATE_KEY` must be pasted without the JSON's outer quotes, or cert() fails with "Failed to parse private key". Email/password Auth to be confirmed in the Firebase console |
| 2026-10-22 | S04 | `src/game/soldiers.js` done: `soldierValue`, `conquestBonus`, `reinforcementAmount`, 17 tests, 63/63 green. No input guards: GAME_RULES is silent and §2.4 means 0 countries never reaches §7.2 |
