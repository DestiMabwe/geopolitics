# QA report: Geopolitics (local build, branch s13b-domain-classes)

Date: 2026-11-02 · Target: http://localhost:3000 with Firebase emulators (demo-geopolitics) · Mode: diff-aware, report only
Tooling note: gstack `browse` would not start on Windows (server-node.mjs missing), so the Chrome extension tools were used.
Method: signed up a throwaway emulator account, played round 1 and 2 as South Africa, then logged out and loaded the game link as a visitor.
Not tested: the live Vercel site, real Firebase login, LLM commentary (no ANTHROPIC key in the emulator run), fast-forward (button only seen idle), a full game to victory/defeat, real phone.

**Health score: 89 / 100** (Accessibility and Performance were not systematically tested, scored 100 by default, so treat as an upper bound.)

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 4 |
| Low | 5 |

## What works
- Sign up validation (empty form shows field errors), signup/login, home list, country search filter, Begin starts a game.
- NPC turns replay with dice, losses and outcomes; Dice panel and log match the server events.
- Attack flow: source then neighbour-only targets (non-neighbours disabled), Roll / Stop attack, Transfer disabled mid-attack.
- Occupy: Occupy blocked until bonus placed exactly (2 of 2), a third soldier is refused, totals correct (ZAF 5 -> 3 -> 2 after move-in, LBN 0 -> 3).
- Reinforcement round 2: 4 soldiers for 2 countries, Confirm blocked at "1 of 4 left", then 5 and 4 on the board.
- Transfer: illegal move of all 5 soldiers rejected with a message.
- Access control: GET game and events are public (200); GET /games, /players/me and every POST return 401 without a token; a bad token gives 401. `ownerUid` is absent from the game and events responses.
- Spectator view for a logged-out visitor: "You are spectating", Live indicator, Log in to play, no action controls.
- No horizontal page overflow at 375px (emulated in an iframe). Profile badges render in the turn bar and on cards.

## Issues

### ISSUE-001 (High, Functional): NPC decisions show no reason in the UI
The server already attaches `reason` to NPC events (15 of 51 events in the test game carry it, e.g. "Opportunist: moves just 1 into ..."), but the event log and feed show only the plain text ("Cambodia attacks Estonia."). The brief (p.5) requires a justification for every NPC decision, visible during fast-forward. This is S33b, still open.
Repro: start any game, watch round 1 NPC turns, read the log. Evidence: screenshots in session, API `GET /api/games/:id/events` shows `data.reason`.

### ISSUE-002 (Medium, Functional): Events have `round: 0` except turnStart
`GET /api/games/:id/events` returns `round: 0` for skip, attackStart, roll, conquest, elimination, occupy, attackFailed, attackStopped and reinforce. Only `turnStart` has 1 or 2. Anything reading `event.round` for these types gets 0 (for example the template text for `gameOver` uses `event.round ?? data.round`, and 0 is not nullish). Not confirmed to surface in the UI. Repro: play two rounds, fetch events, group `round` by `type`.

### ISSUE-003 (Medium, UX): Failed load leaves "Loading..." forever
Right after sign up the server was restarting (node --watch), `GET /api/games` failed, and home showed "Loading your games..." and "Loading countries..." with only a short "Failed to fetch" toast. No error state and no retry. A reload fixed it. Repro: stop the server briefly while the home page loads.

### ISSUE-004 (Medium, UX): Spectators are told "You"
A logged-out visitor sees "You to move" in the header, a "You" chip in the turn bar, and "You" as the owner on the human's cards. The visitor is not the player. Repro: open `/game/:id` logged out.

### ISSUE-005 (Medium, Visual): Owner name and profile badge wrap mid-word on cards
Narrow country cards break words: "Cambod / ia  Opportun / ist", "Lebano / n", "Trinidad and Tobago  Warl / ord", "Fortre / ss". Also seen in the 375px emulation (Portugal card). The badge sits in the same row as the owner name and has no room. Repro: any game, look at cards owned by NPCs with long names.

### ISSUE-006 (Low, Visual): Map nodes overlap
TTO, GUY and BRB are drawn on top of each other at the left edge (their capitals are close), so two are hidden and labels collide "TTO / GUY". Repro: this game, or any with Caribbean neighbours.

### ISSUE-007 (Low, Visual): Country code wraps on cards
"ZAF" shows as "ZA / F" and "TTO" as "T / T / O" in the card header. Repro: look at the South Africa and Trinidad and Tobago cards.

### ISSUE-008 (Low, Visual): Transfer "from" select is clipped
Shows "South Africa (" without the soldier count; the "to" select shows "Lebanon (4)". Repro: open Transfer.

### ISSUE-009 (Low, UX): Failed transfer wipes the typed value
After the "must leave at least one soldier behind" error the whole game view re-renders and the soldiers field goes back to 1. The message is also a lowercase fragment. Repro: Transfer with count = all soldiers.

### ISSUE-010 (Low, UX): Dice panel shows the last NPC roll when a new attack starts
After pressing Attack (before the first Roll) the Dice panel still shows the previous NPC fight ("Lebanon 1 / Cambodia 6, 1 vs 1"). Repro: start an attack after NPC turns.

## Top 3 to fix
1. ISSUE-001: show the NPC reasons (S33b). It is a brief requirement.
2. ISSUE-004: spectator "You" labels, the first thing a visitor reads on a shared link.
3. ISSUE-005: badge and owner wrapping on cards, which my B1 badge made visible.

## Console health
No console errors were recorded on the pages visited. One failed fetch (ISSUE-003) happened during a dev-server restart.

## Test framework
Vitest is present (651 unit tests in the last run, 1 flaky timeout in vercelRuntime.test.js).
