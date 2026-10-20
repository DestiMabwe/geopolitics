# DESIGN.md — UI system

> **Source:** Claude Design. This file is the hand-off. If the design changes in Claude Design, update this file first, then `public/css/tokens.css`.
> **Status:** working draft. Replace the token values below with the final export from Claude Design. Keep the token *names* stable so the CSS does not need to change.

## 0. Rules

- **Plain CSS, no libraries.** No Tailwind, Bootstrap, or icon/component kits. No CSS-in-JS, no preprocessors, no build step.
- All colours, type sizes, spacing, radii, and timing come from the tokens below. Using a raw hex or px value in `main.css` is a bug (except `1px` borders).
- System font stacks only, so the app makes no font network requests.
- Mobile-first: base styles target phones, and `min-width` media queries add the desktop layout.
- An owner is never shown by colour alone. It always pairs with the country name or a 3-letter code (accessibility).
- The UI only displays what the server returns. Dice, outcomes, and soldier counts are never computed in the browser.
- The browser never talks to Firestore. All data comes from the API.
- **Build order:** NationBoard first (it lists each country's neighbours, so attacks work without a map). WorldMap is a **stretch** component, added last if time allows.

## 1. Design tokens (`public/css/tokens.css`)

```css
:root {
  /* ── Surfaces & text ─────────────────────────── */
  --color-bg:             #0e1318;  /* page: night-time war room */
  --color-surface:        #17202a;  /* cards, panels */
  --color-surface-raised: #202b37;  /* hover, selected, dialogs */
  --color-border:         #2d3a48;
  --color-text:           #e8edf2;
  --color-text-muted:     #98a6b5;
  --color-text-inverse:   #0e1318;

  /* ── Semantic ────────────────────────────────── */
  --color-accent:   #d9a441;  /* brass: primary actions, round counter */
  --color-success:  #3fb27f;
  --color-danger:   #e25555;
  --color-warning:  #e0a030;
  --color-focus:    #7cc4ff;

  /* ── Owners: the human + 9 NPC slots (by turn-order position) ── */
  --owner-human: #3d8bfd;
  --owner-1: #d64545;
  --owner-2: #2bb3a3;
  --owner-3: #a66bf0;
  --owner-4: #e08a2e;
  --owner-5: #c9c94a;
  --owner-6: #e05fa6;
  --owner-7: #6fbf4a;
  --owner-8: #8d99ae;
  --owner-9: #b07a52;

  /* ── NPC profile badges ──────────────────────── */
  --profile-warlord:     #d64545;
  --profile-fortress:    #2bb3a3;
  --profile-opportunist: #a66bf0;

  /* ── Dice ────────────────────────────────────── */
  --dice-face:      #f4efe3;
  --dice-pip:       #15191e;
  --dice-win-ring:  var(--color-success);
  --dice-lose-ring: var(--color-danger);
  --dice-tie-ring:  var(--color-text-muted);
  --dice-size:      40px;
  --dice-size-sm:   28px;   /* mobile, or more than 5 dice */

  /* ── Type ────────────────────────────────────── */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-display: Georgia, "Times New Roman", serif;   /* headings, country names */
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;  /* soldier counts, dice */

  --text-xs:   0.75rem;   /* 12px: meta, codes */
  --text-sm:   0.875rem;  /* 14px: feed lines, labels */
  --text-md:   1rem;      /* 16px: body */
  --text-lg:   1.25rem;   /* 20px: card titles */
  --text-xl:   1.5rem;    /* 24px: section headings */
  --text-2xl:  2rem;      /* 32px: screen titles, game-over */

  --weight-regular: 400;
  --weight-medium:  500;
  --weight-bold:    700;
  --leading-tight:  1.2;
  --leading-normal: 1.5;

  /* ── Spacing (4px base) ──────────────────────── */
  --space-1: 0.25rem;  /*  4 */
  --space-2: 0.5rem;   /*  8 */
  --space-3: 0.75rem;  /* 12 */
  --space-4: 1rem;     /* 16 */
  --space-5: 1.5rem;   /* 24 */
  --space-6: 2rem;     /* 32 */
  --space-7: 3rem;     /* 48 */
  --space-8: 4rem;     /* 64 */

  /* ── Shape & depth ───────────────────────────── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;
  --shadow-card:   0 1px 2px rgb(0 0 0 / 0.4);
  --shadow-raised: 0 6px 20px rgb(0 0 0 / 0.45);

  /* ── Motion ──────────────────────────────────── */
  --duration-fast: 120ms;
  --duration-base: 220ms;
  --duration-dice: 700ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* ── Replay pacing (read by replay.js via getComputedStyle) ── */
  --replay-roll:       700ms;
  --replay-step:       400ms;
  --replay-roll-fast:  120ms;
  --replay-step-fast:  120ms;

  /* ── Spectator polling (read by poll.js) ─────── */
  --poll-interval:     2000ms;

  /* ── Layout ──────────────────────────────────── */
  --content-max: 1200px;
  --tap-min: 44px;   /* minimum touch target */
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-base: 0ms; --duration-dice: 0ms; }
}
```

Breakpoints (CSS variables cannot be used inside media queries, so these are fixed values):
- tablet **768px**
- desktop **1100px**

## 2. Components

Each component is one file in `public/js/components/` that exports `render(props) → HTMLElement` (or `update(el, props)`), plus a matching block in `main.css` that uses BEM-ish class names (`.nation-card`, `.nation-card__soldiers`, `.nation-card--selected`).

| Component | Purpose | Props / data | States |
|---|---|---|---|
| **AppHeader** | Title, `Round 3`, whose turn it is, and the account menu (My games / New game / Log out), or **Log in** / **Sign up** when logged out | `round, currentPlayer, status, user` | default · game-over (result badge) · logged-out |
| **AuthForm** | Sign up / log in with email and password, one form with a toggle. Validation messages under each field | `mode ("login"\|"signup")` | idle · invalid (field errors) · submitting · error (wrong password, email in use, network) |
| **SpectatorBanner** | Strip at the top of a game page for visitors: "You are spectating", a **Log in to play** button, and a "Live" dot that pulses on every successful poll | `lastPolledAt` | live · stale (no successful poll for 10 s: "Reconnecting…") |
| **ShareButton** | **Copy link** for the game page, shown to the owner. Confirms with "Link copied" | `url` | idle · copied · error |
| **TurnOrderBar** | The 10 players in turn order as chips (owner colour + code + profile badge). Current player highlighted, eliminated players struck through | `turnOrder, players, currentTurn` | default · current · eliminated |
| **NationBoard** | List of the 10 NationCards. Each card lists its neighbours by code, so a target can be chosen without a map | `countries, borders, selection, phase` | default · choosing-source · choosing-target · transfer-mode |
| **NationCard** | One country: name, code, owner chip, soldier count, soldier value (`★5`), neighbours | `code, name, owner, soldiers, value, borders, role` | default · hover/focus · **selectable-source** (yours, ≥2) · **selected-source** · **valid-target** (an enemy neighbour of the source) · disabled · **under-attack** (pulsing border during an attack) · **just-conquered** (brief flash) · owner-eliminated |
| **ReinforcePanel** | Place `N` new soldiers. Shows a −/+ stepper per owned country, the remaining count, and "Confirm" | `amount, owned[]` | placing · complete (Confirm enabled only at 0 remaining) · submitting |
| **TransferPanel** | Move soldiers between your countries: from, to, a count stepper (max `soldiers(from) − 1`) | `owned[]` | idle · ready · submitting · disabled (during an attack) |
| **ActionBar** | Context buttons for the current phase: `Attack` / `Transfer` / `Skip` in manoeuvre, `Roll` / `Stop attack` while attacking. Not shown to visitors | `phase, canAttack, pending` | manoeuvre · attacking · **pending** ("Server is rolling…") · npc-turn (hidden, replaced by the fast-forward toggle) · disabled |
| **DicePanel** | The latest roll: attacker dice on top, defender dice below, each pair in one column in **roll order**, a ring per pair (win/lose/tie), and a running total `9 vs 1` | `roll event \| null` | empty ("Pick a target to attack") · **rolling** (tumble for `--duration-dice`, no values) · result · conquered · failed · stopped |
| **OccupyDialog** | After a conquest, two steps: (1) "Move soldiers into {country}" with a stepper 1…`soldiers(s) − 1`. (2) "Place your +N bonus" with a stepper per owned country, like ReinforcePanel. Confirm is enabled when the bonus is fully placed | `from, to, max, bonus, owned[]` | move-in · place-bonus · submitting |
| **FastForwardToggle** | `▶▶ Fast-forward` switch, shown during NPC turns. The setting is remembered in `localStorage` | `on` | off · on |
| **CommentaryFeed** | Running list of commentary lines, newest at the bottom, grouped by round with a "Round n" divider. Each line shows the template text at once. For `roll`, `conquest`, `elimination` and `gameOver` lines the AI text swaps in when it arrives | `events[]` | empty ("The world holds its breath…") · populated · replaying (lines appear one at a time) · **ai-pending** (a line shows a faint "writing…" shimmer while the AI text loads) · **ai-fallback** (template shown because the AI line failed, no error shown to the player) · error (retry) |
| **StartScreen** | Search the country list and pick one. Each row shows name, population, and soldier value. Needs login | `countries` | loading · ready · selected · submitting · error · **login-required** |
| **GameList** | "My games": each session with your country, round, status, and last played. Continue / view | `games[]` | loading · empty ("No games yet") · populated |
| **GameOverDialog** | Result, rounds played, countries held, "New game" / "My games" | `status, winner` | won · lost |
| **Toast** | Short error messages (409 stale, 422 illegal, 429 slow down, network) | `message, tone` | info · error. Auto-dismisses after 4s |
| **WorldMap** *(stretch)* | Inline SVG (no map library). Each country is a node placed at its capital (equirectangular projection, **zoomed to fit the 10 countries** with padding). Nodes show code, owner colour, and soldiers. Border links are drawn as lines between them. Tapping a node selects it, the same as tapping its card | `countries, borders, selection, phase` | default · choosing-source · choosing-target · attacking · just-conquered |

### Interaction rules
- **Attack:** tap one of your countries with ≥2 soldiers (the source), tap an enemy **neighbour** (the target, highlighted on the board), then press `Attack`. After that, `Roll` sends one request per click. `Stop attack` ends the turn.
- **Transfer:** only in manoeuvre. Open TransferPanel, pick from, to, and a count, then Confirm. It can be repeated.
- **Reinforce:** at the start of your turn from round 2, ReinforcePanel opens and blocks everything else until confirmed.
- **NPC turns** play automatically. `replay.js` shows each returned event in order, at normal pace or at the fast-forward pace from the tokens. **Fast-forward never hides events.** It only shortens the gaps between them, and uses template commentary lines.
- **Spectating:** `poll.js` fetches new events every `--poll-interval` and feeds them to `replay.js`, so a visitor sees the same dice, losses and commentary as the player. Visitors never see action buttons.
- The client can grey out obviously illegal choices (e.g. a source with 1 soldier), but **the server is the authority**. A 422 shows a Toast.
- DicePanel shows only server-returned dice. The tumble animation is decoration until the response arrives.
- Commentary requests never block play. If the AI line is slow or fails, the template line simply stays.
- CommentaryFeed is `role="log"` with `aria-live="polite"`. During fast-forward it announces only one summary line per NPC turn, so screen readers are not flooded.
- All interactive elements are reachable by keyboard. NationCards are `<button>`s. Focus ring: `2px solid var(--color-focus)`, offset 2px. Keys `R` = roll, `S` = stop, `F` = toggle fast-forward.

## 3. Screens and their states

### 3.1 Log in / Sign up
AuthForm on its own screen, with a "Back to watching" link if the visitor came from a game link.
| State | What shows |
|---|---|
| idle | Email and password fields, a toggle between "Log in" and "Create account", and the submit button |
| invalid | Inline messages ("Enter a valid email", "Password must be at least 6 characters") |
| submitting | Button spinner, fields disabled |
| error | Inline message for wrong password or an email already in use. Toast for network errors |
| success | Redirects to Home, or back to the game link the visitor came from |

### 3.2 Home / Start
| State | What shows |
|---|---|
| logged-out | Short intro, **Log in** and **Sign up** buttons. Nothing to start until logged in |
| loading | Skeleton list |
| ready | GameList (if any) above "Start a new game". StartScreen has a searchable country list, sortable by name or soldier value |
| selected | Selected country summary (`South Africa · 64.0M · ★5`), "Begin" enabled |
| submitting | "Begin" spinner, list disabled |
| error | Toast, "Begin" re-enabled |

### 3.3 Game screen (`/game/:id`)
| State | What shows |
|---|---|
| loading | Header + skeleton board + empty feed |
| your-turn · reinforce | ReinforcePanel open, board shows the live totals as you place |
| your-turn · manoeuvre | Sources selectable, ActionBar `Attack` / `Transfer` / `Skip`, hint "Choose a country to attack from" |
| choosing-target | The source's enemy neighbours highlighted on the board, everything else dimmed, hint "Choose a neighbour to attack". If the source has no enemy neighbours: "No enemies border {country}. Pick another or transfer." |
| attacking | Source and target marked, DicePanel live, ActionBar `Roll` / `Stop attack`, Transfer disabled |
| pending | Buttons disabled, DicePanel tumbling |
| occupy | OccupyDialog over the board |
| npc-turn | TurnOrderBar highlights the NPC, the board animates its moves, feed lines replay, FastForwardToggle visible, ActionBar hidden |
| error | Toast. A 409 refetches the game and re-renders |
| **visitor (not logged in)** | Same board, dice, and feed, updating by polling. SpectatorBanner with **Log in to play**. No ActionBar, no panels |
| **logged in, not the owner** | Same as visitor, but the banner says "You are spectating {country}'s game" and offers "Start your own game" |
| game-over | GameOverDialog over the board, board visible beneath |

### 3.4 Game over
won / lost. The headline uses `--color-success` / `--color-danger`, in `--font-display` at `--text-2xl`.

## 4. Layout: mobile and desktop

**Mobile (< 768px), single column, in this order:**
1. AppHeader (sticky top, compact). For visitors, SpectatorBanner sits directly beneath it
2. TurnOrderBar (horizontal scroll inside its own strip, the only allowed horizontal scroll)
3. NationBoard: **2 columns × 5 rows**, compact cards (name, code, owner chip, soldiers, neighbours). If WorldMap exists, it sits above the board at full width, about 4:3 aspect
4. DicePanel (`--dice-size-sm`, wrapping to two rows of pairs when there are more than 5)
5. CommentaryFeed: last 6 lines with "Show all"
6. ActionBar **sticky to the bottom** (owner only), full-width buttons ≥ `--tap-min` tall, with safe-area padding. ReinforcePanel, TransferPanel, and OccupyDialog open as bottom sheets

**Tablet (768–1099px):** NationBoard as **5 columns × 2 rows** at full width (WorldMap above it, if present). DicePanel and CommentaryFeed sit side by side below it. Panels become centred dialogs.

**Desktop (≥ 1100px), two columns, max width `--content-max`, centred:**
- Left (≈ 2/3): AppHeader, TurnOrderBar, NationBoard (5 × 2) with WorldMap above it if present, ActionBar inline (owner only)
- Right (≈ 1/3): DicePanel on top, CommentaryFeed filling the remaining height, scrolling on its own. ReinforcePanel and TransferPanel dock here instead of opening as dialogs

General:
- Page gutter: `--space-4` on mobile, `--space-6` on desktop.
- No horizontal page scroll at 320px width.
- Touch targets ≥ 44px. Hover styles only inside `@media (hover: hover)`.
- Text contrast ≥ 4.5:1 against `--color-surface`. Use owner colours for chips, bars, and borders, not for body text.
- The login and sign-up screen is a single centred column on every width, max 400px.
