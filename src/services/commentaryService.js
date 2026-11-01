import Anthropic from '@anthropic-ai/sdk';
import { LLM_EVENTS, countryName, playerName, toText } from '../game/commentary.js';

// The reasons for this wording are in docs/AI_DESIGN.md. Change the copy there too.
const SYSTEM_PROMPT = `You are a war correspondent filing dispatches from a board game in which countries fight for control of the map. Your voice is terse, tense and dry: short sentences, in the present tense.

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
- winner: the player who won the game. A gameOver dispatch says only that the game is over and that the winner won the game, never the map, and never says who holds what. If winner is null, say only that the game ended with no single winner.`;

const COUNTRY_FIELDS = ['from', 'to'];
const PLAYER_FIELDS = ['player', 'previousOwner', 'by', 'winner'];

const model = () => process.env.LLM_MODEL || 'claude-haiku-5-5';

let sharedClient;
// Built on first use, so importing this file never needs the key. The SDK reads ANTHROPIC_API_KEY.
const defaultClient = () => (sharedClient ??= new Anthropic());

// The event with its codes and ids swapped for names. `winner` can be null on a tie (GAME_RULES §9.2).
function withNames(event, state) {
  const named = { ...event };
  for (const field of COUNTRY_FIELDS) {
    if (event[field]) named[field] = countryName(state, event[field]);
  }
  for (const field of PLAYER_FIELDS) {
    if (event[field]) named[field] = playerName(state, event[field]);
  }
  return named;
}

/**
 * One or two lines of LLM commentary for an event the engine has already produced, or the
 * template line. Never throws, and never decides anything: the reply is only shown.
 * ARCHITECTURE §4.3, PLAN S16b
 *
 * Only `roll`, `conquest`, `elimination` and `gameOver` call the LLM. Every other type returns
 * `toText(event, state)` straight away.
 *
 * The request is `client.messages.create(body, options)`:
 * - body: `model: model()`, `max_tokens: 150`, `system: SYSTEM_PROMPT`,
 *   `thinking: { type: 'disabled' }` (Haiku thinks by default, which eats the 5 seconds), and one
 *   `user` message holding the event as structured data.
 * - That data has names, not ids or codes, so `from: 'EEE'` is sent as `Country E`, and it has only
 *   this event's fields: nothing else from `state`.
 * - options: `{ timeout: 5000, maxRetries: 0 }`. The SDK retries timeouts, which would turn 5 seconds
 *   into 15.
 *
 * Returns the reply's text, trimmed. Returns the template line instead if the call throws, if
 * `stop_reason` is not `end_turn` (a refusal, or a line cut off by `max_tokens`), or if there is
 * no text. Anything logged must not contain the key, so log no more than `err.status`.
 *
 * @param {{ type: string, [field: string]: unknown }} event a flat engine event, as listed in §10
 * @param {object} state the game state, for names
 * @param {{ messages: { create: Function } }} [client] tests pass `mockLlm()` here
 * @returns {Promise<string>}
 */
export async function generateCommentary(event, state, client = defaultClient()) {
  const template = toText(event, state);
  if (!LLM_EVENTS.has(event.type)) return template;

  try {
    const reply = await client.messages.create(
      {
        model: model(),
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: JSON.stringify(withNames(event, state)) }],
      },
      { timeout: 5000, maxRetries: 0 },
    );
    const text = reply.content.find((block) => block.type === 'text')?.text.trim();
    return reply.stop_reason === 'end_turn' && text ? text : template;
  } catch (err) {
    console.warn('Commentary fell back to the template line, status:', err.status);
    return template;
  }
}
