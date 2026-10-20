# GAME_RULES.md — The rulebook

This is the **source of truth** for `src/game/` and its tests. It follows the *Geopolitics Game Case Study* brief. Each numbered rule should map to at least one test. If a rule changes, update this file first, then the tests, then the code.

Where the brief is ambiguous, the decision taken is marked **[I-n]** and listed in §11. Change those only on purpose.

Notation: `s` = attacking country, `t` = target country, `soldiers(x)` = soldiers currently on country `x`, `value(x)` = the country's fixed **soldier value** (§1).

---

## 1. Countries and soldier value

**1.1** The game uses the world's countries from `src/data/countries.json`. That file is a dated snapshot of the Worldometers *population by country* table, and each entry is `{ code, name, population, lat, lng }`. `code` is the ISO 3166-1 alpha-3 code (e.g. `ZAF`). `lat`/`lng` is the country's capital, used to build the map (§3.7).

**1.2 Soldier value** is computed from population with `soldierValue(population)`. "Up to" means **inclusive**:

| Population | Soldier value |
|---|---|
| ≤ 5,000,000 | 1 |
| ≤ 10,000,000 | 2 |
| ≤ 25,000,000 | 3 |
| ≤ 50,000,000 | 4 |
| ≤ 75,000,000 | 5 |
| ≤ 100,000,000 | 6 |
| ≤ 125,000,000 | 7 |
| ≤ 150,000,000 | 8 |
| > 150,000,000 | 9 |

Boundary tests: 5,000,000 → 1 · 5,000,001 → 2 · 10,000,000 → 2 · 25,000,001 → 4 · 150,000,000 → 8 · 150,000,001 → 9 · Vatican City (~500) → 1 · India (~1.46 bn) → 9.

`value(x)` never changes during a game. `soldiers(x)` does.

## 2. Players

**2.1** A game has **10 players**: the human and 9 NPCs. Each starts with exactly one country.
**2.2** Player ids: the human is `human`, and each NPC is `npc:<CODE>` after its starting country (e.g. `npc:BRA`).
**2.3** Each NPC gets one of three **profiles** (§8): Warlord, Fortress, or Opportunist. The server shuffles the list `[W, W, W, F, F, F, O, O, O]` and assigns it to the 9 NPCs in turn order.
**2.4** A player is **eliminated** when they own zero countries. Eliminated players receive no soldiers and their turns are skipped for the rest of the game.

## 3. Setup

**3.1** The human chooses any one country from the catalogue.
**3.2** The server picks **9 other countries at random**, uniformly and without repeats, from the rest of the catalogue.
**3.3** Every country starts with `soldiers = value(country)`, owned by its own player.
**3.4** The server shuffles all 10 players to form the **turn order**. The first player in the order goes first, so this is how "the game randomly decides who goes first".
**3.5** `round = 1`, `status = "active"`, and it is the first player's turn.
**3.6** All randomness (country picks, shuffles, profiles, dice) happens **on the server** through injected functions: `randomInt(maxExclusive)` for picks and shuffles, and `rollDie()` for dice. The engine never calls `Math.random`.

### The map (borders)

The 10 countries are scattered around the world, so their real borders won't connect them. The game builds its own map from where they actually sit. Nearby countries border each other, and the whole map is always connected.

**3.7 Building borders** with `buildBorders(countries, k = 3)`:
1. Measure the great-circle (haversine) distance between every pair of capitals.
2. Each country borders its **3 nearest** other countries. Ties in distance go to the lower `code` alphabetically.
3. Borders are **symmetric**: if A picked B, then B borders A too, even if A wasn't in B's nearest 3.
4. **Connect the map.** While there is more than one connected group, add the single shortest link between any two different groups (ties → the alphabetically first pair of codes). Repeat until everything is connected.

**3.8** Borders are fixed for the whole game and stored with it.

**3.9** Tests for `buildBorders` use made-up coordinates along the equator (`lat 0`), so the distance order is obvious. They must check the nearest-3 rule, symmetry, tie-breaks, and that the result is always connected, including two far-apart clusters of 5 that get joined by exactly one extra link.

## 4. Turn structure

A turn moves through these **phases**:

```
          (round ≥ 2)                                        conquered
 start ──▶ reinforce ──▶ manoeuvre ──attack──▶ attacking ──────────────▶ occupy ──▶ end
   │        (place all)   │  ▲  transfer           │  roll / roll / …                 ▲
   │                      │  └──────┘              │ failed (1 soldier left) ─────────┤
   └─(round 1)────────────┘                        │ stop ────────────────────────────┤
                          └──skip──────────────────────────────────────────────────────┘
```

**4.1 Reinforce** (round ≥ 2 only, §7): the player must place all of them before doing anything else.
**4.2 Manoeuvre:** the player may make **any number of transfers** (§6), then either **attack** (§5) or **skip**.
**4.3 Attacking:** the player rolls repeatedly or stops (§5.4). Transfers are **not** allowed while an attack is in progress.
**4.4 Occupy:** after a conquest, the player moves at least 1 soldier into the newly conquered country and places the conquest bonus (§5.6). Then the turn ends.
**4.5** One attack per turn at most. A failed or stopped attack ends the turn. **[I-2]**
**4.6 End of turn:** play passes to the next non-eliminated player in the turn order. When play wraps from the last position back to the first, `round += 1`. The first round is complete once every player has taken one turn.

## 5. Attacking

**5.1 Who may attack.** Attacking from `s` to `t` is legal only if all of these hold:
- it is the attacker's turn and the phase is `manoeuvre`
- the attacker owns `s` and does **not** own `t`
- `t` **borders** `s` on the map (§3.7) **[I-1]**
- `soldiers(s) ≥ 2`

**5.2 Dice per roll.** Each roll, both sides roll the same number of dice:
```
dice = min(soldiers(s) − 1, soldiers(t))
```
The attacker must always leave one soldier behind, so it fights with `soldiers(s) − 1`. There is **no 3-dice cap**.

| soldiers(s) | soldiers(t) | dice each |
|---|---|---|
| 10 | 2 | 2 |
| 3 | 5 | 2 |
| 2 | 5 | 1 |
| 1 | any | cannot attack |

**What you risk.** Only the soldiers that are rolling can die, and each one appears as a die. With 10 soldiers against 2, each side rolls 2 dice, so the most you can lose in that roll is 2. The other 8 are safe. Across the whole attack you can never lose your last soldier in `s`, because the attack ends as soon as you're down to 1.

**5.3 Resolving one roll.** Pair the dice **in the order rolled**, attacker die *i* against defender die *i* (they are **not sorted**). For each pair:
- the higher die wins, and the side with the lower die loses 1 soldier
- **tie → nobody loses a soldier**

| Attacker (soldiers) | Defender (soldiers) | Attacker dice | Defender dice | Result |
|---|---|---|---|---|
| 10 | 2 | [1, 4] | [2, 3] | 1<2 attacker −1; 4>3 defender −1 → **9 vs 1** (case-study example) |
| 6 | 3 | [5, 5, 1] | [5, 2, 6] | tie; defender −1; attacker −1 → **5 vs 2** |
| 2 | 4 | [3] | [3] | tie → **2 vs 4** (no change) |
| 5 | 2 | [6, 6] | [1, 1] | defender −2 → **5 vs 0 → conquered** |

**5.4 Continuing.** After each roll:
- `soldiers(t) = 0` → **conquered** (§5.5), go to `occupy`
- `soldiers(s) = 1` → **failed**. The attack ends, the defender keeps the country, the attacker keeps `s` with 1 soldier, and the turn ends.
- otherwise the attack is **in progress**. The player either **rolls again** or **stops**. Stopping ends the turn, and both countries keep their current soldiers.

**5.5 Conquest.**
- ownership of `t` passes to the attacker
- the attacker earns a **conquest bonus** of `max(2, floor(value(t) / 2))` **new** soldiers. These are extra soldiers added to your army, on top of everything you already have. **[I-3]**
  - India (value 9) → max(2, 4) = **4** · Vatican City (1) → max(2, 0) = **2** · value 5 → **2** · value 6 → **3**
- if the previous owner now owns zero countries, they are **eliminated** (§2.4)
- check for a win (§9)

At the moment of conquest `soldiers(s) ≥ 2` always holds, so the attacker can always move at least one soldier in. The defender only loses its last soldier in a roll where it lost every pair, which means the attacker lost none in that roll.

**5.6 Occupy** is one action with two parts, and then the turn ends. **[I-4]**
1. **Move in:** move `k` soldiers from `s` into `t`, where `1 ≤ k ≤ soldiers(s) − 1`, so neither country is left empty.
2. **Place the bonus:** split the bonus soldiers across **any** of your countries, the new one included, the same way as reinforcements (§7.3). The placement must add up exactly to the bonus.

**5.7 Full worked example** (scripted dice, for an engine test):
`s` has 4 soldiers. `t` has value 6 and 2 soldiers.
1. dice = min(3, 2) = 2. A [6, 2] vs D [3, 5] → defender −1, attacker −1 → s 3, t 1. In progress.
2. dice = min(2, 1) = 1. A [4] vs D [4] → tie → s 3, t 1. In progress.
3. dice = 1. A [5] vs D [2] → defender −1 → t 0 → **conquered**. Bonus = max(2, floor(6/2)) = 3. Phase is now `occupy`.
4. Occupy `{ count: 1, placements: { t: 2, s: 1 } }` → s = 3 − 1 + 1 = **3**, t = 1 + 2 = **3**. Total army went from 3 (after losses) to 6.

## 6. Transfers

**6.1** A transfer moves `k` soldiers from `a` to `b` and is legal only if:
- it is the player's turn, and the phase is `manoeuvre`
- the player owns both `a` and `b`, and `a ≠ b`
- `k` is an integer ≥ 1, and `soldiers(a) − k ≥ 1`

**6.2** There is no limit on the number of transfers per turn, as long as no attack is in progress.

## 7. Receiving soldiers (reinforcements)

**7.1** In **round 1**, nobody receives soldiers.
**7.2** From **round 2** on, at the start of each of their turns, a player receives `2 × countriesOwned`. Examples: 1 → 2 · 3 → 6 · 5 → 10.
**7.3** The player splits them across any of their countries in any combination. The placement must be non-negative integers that add up **exactly** to the amount, on countries the player owns. Otherwise it is rejected (422).

## 8. NPC profiles

NPCs follow the same turn structure as the human (§4). Each profile defines four decisions: **where to reinforce**, **which target to pick**, **when to stop rolling**, and **how many to move in on occupy**. NPCs make no voluntary transfers in `manoeuvre`.

### 8.1 Choosing a target (all profiles)
1. List the **candidates** `(s, t)`: every `s` the NPC owns with `soldiers(s) ≥ 2`, paired with every `t` that **borders `s`** and that it does not own.
2. Score each candidate with the profile formula. Drop any that are ineligible or below the threshold.
3. If none are left, **skip**.
4. Otherwise attack the best one. **Tie-break order:** highest score → lowest `soldiers(t)` → `t.code` alphabetical → `s.code` alphabetical.

Let `d = soldiers(s) − soldiers(t)`. The **leader** is the non-eliminated player, other than the NPC itself, who owns the most countries. If there is a tie for most, there is no leader. In round 1 there is never a leader, because everyone owns one country.

| | **Warlord** (aggressive, targets the human) | **Fortress** (cautious, sure wins only) | **Opportunist** (picks off the weak and the leader) |
|---|---|---|---|
| Reinforce | All to its country with the most soldiers (tie → code) | One at a time, each to its country with the fewest soldiers (tie → code) | All to its country with the most soldiers (tie → code) |
| Eligible if | always | `soldiers(s) ≥ 2 × soldiers(t) + 1` | always |
| Score | `d + (owner(t) = human ? 2 : 0)` | `soldiers(s) − 2 × soldiers(t)` | `d + (soldiers(t) ≤ 2 ? 3 : 0) + (owner(t) = leader ? 2 : 0)` |
| Threshold | score ≥ 0 | score ≥ 1 | score ≥ 2 |
| Stop rolling when | never (rolls until conquered or failed) | `soldiers(s) < 2 × soldiers(t) + 1` | `soldiers(s) ≤ soldiers(t)` |
| Occupy: move in `k` | `max(1, floor((soldiers(s) − 1) / 2))` | 1 | 1 |
| Occupy: place bonus | all on the new country | using its Reinforce rule | all on the new country |

**8.2 Safety cap.** An NPC attack stops after **20 rolls** if it hasn't finished. Repeated ties could otherwise make it run for a very long time. The human has no cap, because they can press Stop.

**8.3 Worked examples** (for tests). In each one, every listed country borders the NPC's country.

**Warlord** owns `ARG` (6). Other countries: `BRA` human 4 → 6−4+2 = **4**. `CHL` npc 2 → 6−2 = **4**. `PER` npc 5 → **1**. The 4s tie, so the lower `soldiers(t)` wins → **attacks `CHL`**.

**Fortress** owns `EGY` (5). `KEN` 2: is 5 ≥ 5? Yes → score 1. `MAR` 1: 5 ≥ 3 → score **3**. `NGA` 3: is 5 ≥ 7? No → ineligible. → **attacks `MAR`**. Before each roll it checks `5 ≥ 2×1+1`, so it keeps going while that holds.

**Fortress skips.** Owns `EGY` (4). Every other country has ≥ 2 soldiers → 4 ≥ 5 fails for all → **skips**.

**Opportunist** owns `TUR` (5). The human owns 3 countries and every other player owns 1 or fewer → leader = `human`. `IND` human 3 → 5−3+0+2 = **4**. `NPL` npc 1 → 5−1+3 = **7**. `IRN` npc 4 → 1 → below the threshold. → **attacks `NPL`**.

## 9. Winning and losing

**9.1 Win:** the human owns all 10 countries → `status = "won"`, `winner = "human"`.
**9.2 Loss:** the human is eliminated → `status = "lost"`, and the game ends immediately. `winner` = the player owning the most countries, or `null` on a tie.
**9.3** The game has no round limit.

**How you get to all 10.** You don't need to fight all 9 NPCs yourself. The game snowballs in your favour if you keep conquering:
- **Reinforcements grow with your territory.** You get 2 soldiers per country every turn (§7.2). With 1 country you get +2 a turn, and with 5 countries you get +10.
- **Each conquest pays twice:** the bonus soldiers straight away (§5.5), and +2 more every turn after that, because you hold one more country.
- **NPCs fight each other too.** By the time you reach them, many countries have already changed hands, and some NPCs are already gone. When you conquer a player's last country, they're eliminated for good.
- **The map decides your route.** You can only attack neighbours, so each conquest opens new borders. Beginners should start with weak neighbours (low soldier value), then use the extra reinforcements on the big countries.

Typical arc: rounds 1–3, you take one or two weak neighbours. In the middle game you're the largest player, so the Opportunists start targeting you (§8.1 leader bonus). In the end game you collect the last few countries with large reinforcement stacks.
**9.4** Every action on a finished game is rejected (409).

## 10. Events (what commentary is built from)

The engine returns an ordered list of events for every action. Tests check event **types and fields**, not the wording.

| type | fields |
|---|---|
| `turnStart` | `player, round` |
| `reinforce` | `player, amount, placements{code: n}` |
| `transfer` | `player, from, to, count` |
| `attackStart` | `player, from, to` |
| `roll` | `player, from, to, attackerDice[], defenderDice[], attackerLosses, defenderLosses, attackerLeft, defenderLeft` |
| `conquest` | `player, from, to, previousOwner, bonus` |
| `occupy` | `player, from, to, count, placements{code: n}` |
| `attackFailed` | `player, from, to` |
| `attackStopped` | `player, from, to` |
| `skip` | `player` |
| `elimination` | `player, by` |
| `gameOver` | `status, winner` |

`commentary.js` turns each event into one short line, e.g. *"Brazil hurls 3 dice at Chile — 6, 5, 2 against 3, 1, 6. Chile falls."* The wording is free. It must name the countries and must not invent numbers.

## 11. Interpretations of the brief

| id | Brief says / doesn't say | Decision |
|---|---|---|
| I-1 | Doesn't mention borders. The 10 countries are random, so real borders won't connect them | A generated map: each country borders its 3 nearest (by capital), symmetric, forced connected (§3.7). You can attack only neighbours. |
| I-2 | "Stop → turn ends". Silent on transfers after a failed attack | Any attack ending (conquered + occupy, failed, stopped) ends the turn. Transfers only happen before attacking. |
| I-3 | "They gain max(2, value/2) soldiers". Silent on where | The bonus is **new** soldiers added to the conqueror's army, placed freely on any of their countries. `value` = the conquered country's population-based soldier value, not its current soldiers. |
| I-4 | "Can select how many soldiers to transfer to this conquered country" | You must move in 1 to `soldiers(s) − 1` from the attacking country (so it isn't empty), plus place the bonus. |
| I-5 | "Randomly decide which player goes first" | The whole turn order is shuffled once at setup. |
| I-6 | Silent on what happens after the human is eliminated | The game ends as a loss. NPCs don't play on. |
| I-7 | Dice pairing "Soldier 1 vs Soldier 1" | Pair in roll order. Do not sort, unlike Risk. |
