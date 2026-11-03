# AI design: battle commentary

How the LLM commentary works and why it can't touch the game. Plan task S16c. The last section, "How the NPCs think", explains the NPC profiles (the bonus feature).

## The prompt

The system prompt, copied from `SYSTEM_PROMPT` in `src/services/commentaryService.js`. The two must stay identical.

```text
You are a war correspondent filing dispatches from a board game in which countries fight for control of the map. Your voice is terse, tense and dry: short sentences, in the present tense.

You receive one game event as JSON. It has already happened. Report it, and never predict what comes next.

Write one or two sentences, 40 words at most. Reply with the dispatch alone: no headline, label, quotation marks or formatting.

Use only the names and numbers in the event, exactly as they appear. Write every number as a digit, never a word: 7, not seven, and 1, not one. Do not count the dice. Do not add totals, differences or any number of your own. Every fact must come from the event: no cities, leaders, generals, weather, terrain, history, politics or motives, even though the countries are real. Strong verbs are welcome. Invented details are not. Describe only the event itself, and claim nothing about the rest of the map. In a roll, always list the value of every die for both sides, then the losses and the soldiers left. For other events, you do not have to use every field.

The fields:
- type: roll (one exchange of dice in an attack), conquest (the attacker takes the country), elimination (a player has lost their last country) or gameOver (the game has ended).
- from, to: the attacking country and the country under attack.
- player, by, previousOwner, winner: players. A player keeps their home country's name for the whole game, even after losing it, so player can differ from from.
- attackerDice, defenderDice: the dice each side rolled. The losses fields already give the result, so do not work it out from the dice.
- attackerLosses, defenderLosses: soldiers each side lost in this roll.
- attackerLeft, defenderLeft: soldiers still standing in the from and to countries after this roll.
- previousOwner: the player who held the to country until now.
- bonus: new soldiers the conqueror earns.
- In an elimination, player is the one eliminated and by is the one who did it.
- status: won or lost, from the side of the human player, who is not identified. Never say anything about that player, not even that they won, lost or were eliminated, and never speak for them (no "our", "we" or "your"). It tells you why the game ended: won means the winner conquered every country, and lost means the human player was eliminated and the game stopped at once.
- winner: a player, or null. A gameOver dispatch says only that the game is over and one fact about the winner, never the map, and never who holds what beyond that fact. When status is won, say the winner has conquered every country and won the game. When status is lost, the winner is only the player who held the most countries when the game stopped: say they hold the most countries, and never say they won, conquered or claimed victory. If winner is null, the most countries are tied: say only that the game is over and the most countries are tied, and name no player. Never mention the map, the board or the world, and give no number of countries.
```

The user message is the event as a JSON string, with codes and ids replaced by names, so `from: 'BRA'` is sent as `from: 'Brazil'`. It holds only that event's fields and nothing else from the game state.

## Why it's written that way

**Tone.** A war correspondent suits a game about armies, and a dispatch is short by nature. "Terse, tense and dry" gives the voice without asking for colour, which is where made-up facts come from. An early placeholder asked for "vivid" lines. That word is gone, because it invites cities, generals and weather. The prompt allows strong verbs instead, so the energy comes from how the line is written rather than from added facts.

**Length.** The limit is one or two sentences and 40 words. Commentary sits beside a live battle, and a roll can be on screen for only a moment. The limit also sits well below `max_tokens` (150), because a reply that hits `max_tokens` is cut off and thrown away for the template line. A word limit in the prompt keeps that from happening often.

**The "never invent" rule.** The brief requires commentary that describes the battle, so a wrong number or an invented event would misreport the game to the player and to anyone watching. Three parts of the prompt enforce this:

- It names the kinds of detail that are banned, because a general "be accurate" is weak against a model that knows a lot about real countries. The countries in this game are real, so it could easily add capitals, leaders or history.
- It bans derived numbers as well as invented ones. A total or a difference might be correct, but a reader couldn't check it against the event, and the rule is simple only if every number comes straight from the event.
- It tells the model not to work out the result from the dice, since the engine has already decided it and sends it in the losses fields.

**The field notes.** These cover what the model can't guess. `attackerLeft` means soldiers still standing. `player` can differ from `from`, because a player keeps their home country's name after losing it. `winner` can be null on a tie (GAME_RULES §9.2), and without a note the model might name a winner anyway. `status` is told to stay out of the line, because it is from the human's side and the event doesn't say who the human is.

## Why the LLM can't affect the game

- **It only sees events that have already happened.** The engine resolves every roll and writes it to Firestore first. Commentary is asked for afterwards, through its own endpoint.
- **Its reply is never parsed.** The text is stored as `aiText` and shown. No game logic reads it, so a strange reply can only be a strange line of commentary.
- **It holds no state.** It gets one event's fields, no game state and no tools, so it has nothing it could change.
- **Any failure falls back to the template line.** A timeout (5 seconds, no retries), an API error, a refusal, a reply cut off by `max_tokens` or an empty reply all return the line from `src/game/commentary.js`. Every event already has that line stored, and it is on screen before the LLM replies.
- **It can't slow the game down.** It is never called inside a transaction or inside `/npc-turn`, so no game action waits for it.

## Sample events

Written before the first real run, as something to compare against. The events are shown as the LLM receives them. The expected lines show the standard, not the exact wording.

| # | Type | Event | Expected line |
|---|---|---|---|
| 1 | `roll` | `{"type":"roll","player":"Brazil","from":"Argentina","to":"Chile","attackerDice":[6,5,2],"defenderDice":[3,1,6],"attackerLosses":1,"defenderLosses":2,"attackerLeft":7,"defenderLeft":3}` | Argentina rolls 6, 5 and 2 and Chile answers with 3, 1 and 6. Chile loses 2 soldiers to Argentina's 1, leaving 3 facing 7. |
| 2 | `conquest` | `{"type":"conquest","player":"Brazil","from":"Argentina","to":"Chile","previousOwner":"Peru","bonus":4}` | Chile falls. Brazil drives through from Argentina, strips it from Peru and banks 4 new soldiers. |
| 3 | `elimination` | `{"type":"elimination","player":"Peru","by":"Brazil"}` | Peru is finished, its last ground lost to Brazil. |
| 4 | `gameOver` | `{"type":"gameOver","status":"won","winner":"Brazil"}` | The guns fall silent. Brazil has won the game. |
| 5 | `gameOver` (tie) | `{"type":"gameOver","status":"lost","winner":null}` | The fighting ends with no single winner left standing. |

## Results

Real runs on 2026-11-01 through `generateCommentary` with the default model, `claude-haiku-5-5`, using the 5 sample events above. There were 7 rounds and 105 calls in all, and no call fell back to the template line. Round 1 ran each sample once, and rounds 2 to 7 ran each sample 3 times, because replies vary between runs, except that round 6 ran the `gameOver` sample 10 times to test the fix for a fault seen in 1 reply of 3. A throwaway script flagged number words, numbers not in the event, and replies over 40 words. Those checks stayed the same throughout, and only the prompt changed. Rounds 6 and 7 also flagged words that suggest a claim about the map, such as "map" and "board".

### Final outputs

The first reply per sample from round 7, the last round, using the prompt shown above.

| # | Type | Real output | Words |
|---|---|---|---|
| 1 | `roll` | Argentina's attack on Chile rolls 6, 5, 2 against 3, 1, 6. Argentina loses 1 soldier and keeps 7; Chile loses 2 and keeps 3. | 25 |
| 2 | `conquest` | Brazil takes Chile from Peru after an attack launched from Argentina. The conquest earns Brazil 4 new soldiers. | 18 |
| 3 | `elimination` | Peru has lost its last country. Brazil has eliminated Peru from the game. | 13 |
| 4 | `gameOver` | The game is over. Brazil has won. | 7 |
| 5 | `gameOver` (tie) | The game is over. It ended with no single winner. | 10 |

In round 7, all 15 replies were within 40 words, the longest being 26, and every number came from its event. None of the 6 `gameOver` replies made a claim about the map, and neither did any of the 13 in round 6. The script flagged one reply, "Chile loses 2 and holds 3", which was a false alarm: "holds" there is about soldiers left, not the map.

### Problems found and what changed

| Round | Problem | Example | Prompt change |
|---|---|---|---|
| 1 | Numbers written as words | "costs the defenders two soldiers" | Later rounds strengthened this rule to "Write every number as a digit, never a word" |
| 1 | The dice were left out of a roll, though the brief says rolls must be shown | Sample 1 mentioned only losses and soldiers left | Added an instruction to always give the dice, the losses and the soldiers left in a roll |
| 1 | Invented claim about the board, false when the winner only holds the most countries (GAME_RULES §9.2) | "the map is theirs to hold" | Added "claim nothing about the rest of the map" |
| 1 | Invented outcome, and the prompt's own wording showing through | "a stalemate with no single winner named" | Told it to say only that the game ended with no single winner |
| 1 | Sounded like a report, not a dispatch | Long, flat sentences | Added "short sentences" to the voice |
| 2 | Number words again, including a count of the dice | "throws three dice" | Added "1, not one" and "Do not count the dice" |
| 2 | Soldiers left described as if they were there before the roll | "Argentina's 7 soldiers meet Chile's 3" | Added "after this roll" to the `attackerLeft` note |
| 2 | Invented claims survived the general rule | "Brazil holds the last country", "the board stands unclaimed" | Added a specific `gameOver` rule: only that the game is over and who won, never who holds what |
| 3 | One roll still counted the dice instead of listing them | "throws three dice against Chile" | Changed the roll rule to "list the value of every die for both sides" |
| 5 | Invented claim about the board, in 1 of the 3 replies for sample 4 | "Brazil has won the map" | Extended the `gameOver` rule: the winner won the game, never the map. Rounds 6 and 7 were clean, including 10 of 10 replies for sample 4 in round 6 |
| After round 7 (2026-11-03, QA ISSUE-C) | The prompt said the winner "won the game" for every `gameOver`, but after a loss GAME_RULES §9.2 makes the winner only the player with the most countries, so a loss could be reported as a conquest. Found by reading, not seen in a run | "Thailand won the game" after the human was eliminated while other countries were still alive | Split by `status`: won says the winner won, lost says only that the winner holds the most countries and never that they won or conquered, null says the most countries are tied, and no number of countries. The server template and the Defeat dialog already read this way |

### Known limits

- **Tense:** 2 of the 3 round 4 replies for sample 1 slipped into the past tense ("rolled", "lost"), while all 3 in rounds 6 and 7 stayed in the present. It varies between runs. This is a style fault, not a factual one, so it was left alone.
- **Who conquers:** 2 of the 3 round 7 replies for sample 2 said "Argentina takes Chile", naming the attacking country rather than the player, Brazil. Both still credit Brazil with the bonus and Argentina is the event's `from`, so this was left alone.
- **Awkward wording:** roll replies can say "Brazil's Argentina" (2 of 3 in rounds 6 and 7), and one elimination reply said "Brazil eliminates the player". These are accurate but odd.
- **Map rule outside `gameOver`:** the map rule is written for `gameOver`, and one round 6 elimination reply said "Peru's campaign ends on the map". It claims nothing about who holds what, so it was left alone.
- **Slow calls:** one call in the 40 timed in rounds 5 and 6 took 4,918 ms, close to the 5-second limit. The rest stayed under about 2.7 seconds. A call over the limit falls back to the template line, so this costs a line of colour, not the game.
- **Rewritten `gameOver` rules, real run on 2026-11-03:** 15 calls with `claude-haiku-5-5`, 5 each for a win, a loss with a winner (Chile) and a tie, none fell back to the template and all took under 2 seconds. The loss, which is what the rewrite was for, was clean in 5 of 5: "The game is over. Chile holds the most countries.", with no "won", "conquered" or "victory". Leaks seen, none about the loss: in 3 of 5 win replies the model added "The map is theirs." (true after a win, but against the rule "never the map"); in 1 of 5 tie replies "no single power holds the map"; in 1 of 5 tie replies "Our side has been eliminated", which takes the human's side although the prompt says not to report won or lost for that player. A throwaway script flagged "no one" as a number word, which is a false alarm. **Second real run, same day, after tightening the rules** (never speak for or about the human player, a win means every country was conquered, name no player in a tie, never mention the map, the board or the world): another 15 calls, again no fallbacks and all under 2 seconds. Loss: 5 of 5 identical and clean. Tie: 5 of 5 clean, with no map, no "our side", no "eliminated" and no winner named ("The game is over. The most countries are tied, and no single power leads."). Win: all 5 now say the winner conquered every country and won, but 4 of 5 say "every country on the map", so the "never mention the map" rule was not obeyed there (the sentence is true, and it replaced "The map is theirs."). The extra flags for "our/we/your" and "eliminated" were not run because the check script's edit failed; the 15 replies were read by eye instead. Open: the win wording, which a literal sentence frame ("X has conquered every country and won the game.") would probably fix.
- **Voice:** the rules that removed invented facts also made the lines plainer than the expected lines, most clearly for `gameOver`. Accuracy was put first, because the brief and the LLM rule care about it most.
- **Not enforced by code:** the rules are instructions to the model, so a wrong number is unlikely but not impossible. The service does not check replies against the event. A wrong line can only misdescribe an event, not change the game.


## How the NPCs think

Bonus feature: NPC profiles (brief idea 9). The three profiles are fixed rules in `GAME_RULES.md` §8. There is no LLM in the loop, so NPC play is deterministic given the dice. The server shuffles three of each profile across the 9 NPCs when the game is created (§2.3). Each NPC shows a badge in the turn bar and on its countries, and hovering the badge gives a one-line description.

On its turn every NPC lists its legal attacks (a country of its own with 2 or more soldiers, next to a country it doesn't own), scores each one with its profile's formula, drops the ones below the profile's threshold, and attacks the best. If nothing is left it skips. Ties go to the weakest target, then the country code. `d` below is `soldiers(source) − soldiers(target)`.

| | **Warlord** | **Fortress** | **Opportunist** |
|---|---|---|---|
| Character | Aggressive, goes after the human | Cautious, sure wins only | Picks off the weak and the leader |
| Score | `d + 2` if the target is the human | `soldiers(source) − 2 × soldiers(target)` | `d + 3` if the target has 2 or fewer soldiers, `+ 2` if it belongs to the leader |
| Attacks only if | score ≥ 0 | score ≥ 1 and `soldiers(source) ≥ 2 × soldiers(target) + 1` | score ≥ 2 |
| Stops rolling when | never (until it conquers or is down to 1) | `soldiers(source) < 2 × soldiers(target) + 1` | `soldiers(source) ≤ soldiers(target)` |
| Reinforces | all on its biggest country | one at a time on its smallest | all on its biggest country |
| Moves in after a conquest | half its spare soldiers | 1 | 1 |

The leader is the player with the most countries, other than the NPC itself. If two players tie there is no leader. Every NPC attack is also capped at 20 rolls so a run of ties can't go on forever.

**Worked example (Opportunist, §8.3).** An Opportunist owns `TUR` with 5 soldiers, and the human holds 3 countries, so the human is the leader.
- `IND` (human, 3 soldiers): 5 − 3 + 0 + 2 = **4**.
- `NPL` (NPC, 1 soldier): 5 − 1 + 3 = **7**.
- `IRN` (NPC, 4 soldiers): 5 − 4 = 1, below the threshold of 2, so it is dropped.

It attacks `NPL`: the weak country is worth more to it than the leader.

**Why three profiles.** Same rules and same dice, different appetite for risk. A Warlord makes the human's neighbourhood dangerous, a Fortress sits still until it is safe, and an Opportunist swings towards whoever is winning, which stops the human running away with the game unopposed.
**What the client does.** It only shows the profile name and description. The scores and thresholds exist on the server alone, and the client never works them out.
