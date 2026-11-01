# AI design: battle commentary

How the LLM commentary works and why it can't touch the game. Plan task S16c. The NPC profiles' explanation will be added here separately.

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
- status: won or lost, from the side of the human player, who is not identified. Do not report it.
- winner: the player who won the game. A gameOver dispatch says only that the game is over and that the winner won the game, never the map, and never says who holds what. If winner is null, say only that the game ended with no single winner.
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

Real runs on 2026-11-01 through `generateCommentary` with the default model, `claude-haiku-5-5`, using the 5 sample events above. There were 4 rounds and 50 calls in all, and no call fell back to the template line. Round 1 ran each sample once, and rounds 2 to 4 ran each sample 3 times, because replies vary between runs. A throwaway script flagged number words, numbers not in the event, and replies over 40 words. The checks stayed the same throughout, and only the prompt changed.

### Final outputs

One reply per sample from round 4, the last round run so far. The prompt shown above includes the round 5 change below, which these outputs do not reflect.

| # | Type | Real output | Words |
|---|---|---|---|
| 1 | `roll` | Brazil's army in Argentina rolls 6, 5 and 2 against Chile's 3, 1 and 6. Argentina loses 1 soldier, leaving 7; Chile loses 2, leaving 3. | 26 |
| 2 | `conquest` | Brazil takes Chile from Peru after an attack launched from Argentina. The conqueror earns 4 new soldiers. | 17 |
| 3 | `elimination` | Peru has lost its last country, and Brazil has eliminated it from the game. | 14 |
| 4 | `gameOver` | The war is over. Brazil has won the game. | 9 |
| 5 | `gameOver` (tie) | The game is over. It ended with no single winner. | 10 |

In round 4, all 15 replies were within 40 words, the longest being 29, and every number came from its event. The script flagged one reply, "Brazil is the one that took it", which was a false alarm: "one" there is not a number.

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
| 5 | The `gameOver` rule did not say what the winner won, which left room for a claim about the map | Found in review, not in a round 4 reply | Extended the rule: the winner won the game, never the map. Rerun pending |

### Known limits

- **Tense:** 2 of the 3 round 4 replies for sample 1 slipped into the past tense ("rolled", "lost"). This is a style fault, not a factual one, so it was left alone.
- **Voice:** the rules that removed invented facts also made the lines plainer than the expected lines, most clearly for `gameOver`. Accuracy was put first, because the brief and the LLM rule care about it most.
- **Not enforced by code:** the rules are instructions to the model, so a wrong number is unlikely but not impossible. The service does not check replies against the event. A wrong line can only misdescribe an event, not change the game.

