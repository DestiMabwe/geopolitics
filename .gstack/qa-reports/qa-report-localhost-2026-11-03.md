# QA report: Geopolitics (local build, branch s13b-domain-classes)

Date: 2026-11-03 · Target: http://localhost:3000 and an isolated server on :3100 with Firebase emulators (demo-geopolitics) · Mode: full, report only
Method: `npm test`, then a throwaway emulator account, played one game from start to defeat in the browser, logged out and loaded the game link as a spectator, then reproduced the "keeps loading" report with the emulators stopped.
Not tested: live Vercel site, real Firebase login, LLM commentary (no emulator-run key), fast-forward button (the game ended before the click landed), a win, real phone width (the extension could not resize the viewport), keyboard/accessibility pass.

**Health score: 90 / 100** (Performance and Accessibility were not tested and default to 100, so this is an upper bound. Functional is 62.)

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 1 |
| Low | 6 |

Unit tests: 38 files, 679 tests, all pass (8s).

## Fixed since the 2026-11-02 report
- ISSUE-004 spectators were told "You": fixed. A logged-out visitor now sees "You are spectating" and owner names, no "You".

## Issues

### ISSUE-A (High, Functional): Page hangs on "Loading..." forever when the backend cannot reach Firestore  (the reported problem; extends old ISSUE-003)
When Firestore is unreachable, `GET /api/games/:id` does not return an error. In my repro it was still pending after 45 seconds. The client has no timeout, so the page shows "Loading the game..." (or "Loading your games...") with no message and no retry. The server only logs a gRPC `code: 14 ... ECONNREFUSED 127.0.0.1:8080` much later.
Likely cause on your machine: `npm run dev:emu` stops when its emulators stop, or the emulators were never started, while a server kept running. At the start of this session ports 4000, 8080 and 9099 were down and a server was still answering on 3000. On localhost the client always logs in against the Auth emulator at :9099, and the server uses whatever Firestore it was started with, so any mismatch looks like "loading forever".
Repro: start a server with `FIRESTORE_EMULATOR_HOST` pointing at a port with nothing on it, open `/game/<id>`. Evidence: screenshot taken after 10 s shows only "Loading the game..."; fetch timed out at 45 s.
Wanted: server-side timeout returning 503, client-side timeout with an error state and a Retry button.

### ISSUE-B (High, Functional): NPC decision reasons still not shown  (old ISSUE-001, still open, S33b)
Round 1 and 2 logs read "Brazil attacks Guatemala." and "Jordan calls off the attack on South Sudan." with no reason. The brief asks for a justification of NPC decisions.

### ISSUE-C (Low, UX wording; was Medium, corrected after reading GAME_RULES.md): "Thailand wins the game" when the human is eliminated
Not a rules bug. GAME_RULES §9.2 says a human elimination ends the game at once as a loss, and `winner` is the player owning the most countries (null on a tie); I-6 says NPCs do not play on. In the QA game Thailand held 3 countries and every other player 2 or fewer, so "Thailand wins" is what the rules produce. It still reads wrongly to a player, because "wins" suggests Thailand conquered the world while eight other countries are alive.
Same cause, by design: South Africa shows 0 soldiers while owned by Algeria. A conquest leaves the country empty until the occupy step (§5.5, §5.6), and the game ends before that step.
Wording only: the server's `gameOver` template (`src/game/commentary.js`), `eventText.js`, and the Defeat dialog (`gameOver.js`).

### ISSUE-D (Medium, Visual): Owner name and profile badge wrap mid-word on cards  (old ISSUE-005, still present)
"Jorda / n  Opportunis / t", "Nicaragu / a  Warlor / d", "Thaila / nd Opportun / ist", "Fortre / ss". Visible on most NPC-owned cards at 1568 px.

### ISSUE-E (WITHDRAWN, 2026-11-03 follow-up): replay too fast
Not reproduced. Re-measured on a fresh origin with fast-forward off: the feed gained a line about every 400 ms (about 700 ms before a roll), 14 events in 6.8 s, which is the designed pace (`--replay-step` 400 ms, `--replay-roll` 700 ms in tokens.css, DESIGN §1). My first run had no timestamps, only a guess of "about 4 seconds", and a fast-forward setting left over from an earlier session on that origin may also have been on (the button never clicked in that run, so I could not confirm). No code change.

### ISSUE-F (Low, UX): Spectator on a finished game sees "Live" and a "DEFEAT" badge
`/game/:id` logged out on a lost game: "You are spectating · Live" plus a red DEFEAT chip in the header. The game is over, and the visitor did not lose.

### ISSUE-G (Low, UX): Dice panel shows the previous NPC fight when the human starts an attack  (old ISSUE-010, still present)
After Attack is confirmed, before the first Roll, the panel still reads "Brazil 6 / Guatemala 4, 5 vs 0, Guatemala conquered".

### ISSUE-H (WITHDRAWN, 2026-11-03 follow-up): action buttons shift, clicks miss
Not an app bug. A sampler recorded the action bar through six states (NPC turn, choose a country, choose a neighbour, confirm, attacking, after a roll): bar height 77 px, bar top 1130 px and page height 1238 px never changed. In the first QA run the screenshot height had dropped from 745 to 688 px at the moment the click missed, so the browser tool's viewport shrank; a button at y=708 was then below the visible area.

### NEW-K (found while measuring; FIXED): stray text "false" in the action bar on every NPC turn
`ActionBar` appended `npcPaused && button(...)`; a raw `append(false)` writes the text "false", so the bar read "Hungary is playing. false Copy link". Fixed, with a source-scan test (`domAppend.test.js`) so no other `append(a && b)` can creep in.

### ISSUE-I (FIXED by the ISSUE-D change): country code wraps on cards
Codes are now `white-space: nowrap`; ZAF, JOR, KEN, VCT render whole at 500px and 343px wide.

### ISSUE-J (FIXED): map nodes overlap
`spread()` in worldMap.js pushes nodes at least 52px apart (smallest gap 2.3-5.9px before, 52px after, on three capital sets).

## What works
- Sign up, log in, log out (emulator). Home list, search, Begin starts a game and lands on `/game/:id`.
- Attack flow: Attack, pick your country, neighbours highlighted, pick target, Roll, Stop attack. Transfer disabled mid-attack. Dice arithmetic checked on 3 rolls (6,2 vs 5,5 gave one loss each; 3 vs 4 and 3 vs 6 cost the attacker 1).
- NPC turns replay with dice, losses, conquests, eliminations, "Round 2" divider.
- Defeat modal with New game / My games / View board; My games shows "Round 2 · Lost".
- Spectator view: public, no action controls, Log in to play.

## Top 3 to fix
1. ISSUE-A: add a timeout and an error state with Retry; this is the "nothing ever loads" you reported.
2. ISSUE-B: show NPC reasons (brief requirement).
3. ISSUE-C: confirm and fix the winner rule on human elimination.

## Console health
One console read at landing: no errors. Not re-read after every interaction (the extension only captures from first call).

## Housekeeping note
While stopping my test emulators I killed processes by a name pattern that was too broad. After that, port 3000 (your dev server) stopped answering. Restart it with `npm run dev:emu` (or `npm run dev` plus `npm run emulators`).
