# How I used AI on this project

<!-- HOW TO USE THIS FILE
     This is YOUR reflection, so the sentences must be yours. The exam marks how you used AI, and a
     reader can tell a pasted paragraph from a real one.
     - Each section below has a "Facts from AI_LOG.md" list. I took these from your log. Check each
       one against AI_LOG.md before you rely on it.
     - Under each "✍️ YOU TYPE" comment, write 3 to 6 sentences in your own words.
     - Delete every HTML comment like this one when you are done.
     - Aim for one page in total. Plain words, first person, concrete examples. -->

## 1. The plan I started with

The rule I set at the start (in `CLAUDE.md`): **I write the logic. AI writes boilerplate and tests, and
refactors.** The loop for each task was: plan, AI writes failing tests and stubs, I make them pass,
AI refactors, then I log it.

I choose to work based on the red green refactor loop inspired by test-driven development, my favourite way of writing code as the tests help me build the logic. I used psuedocdoe heavily but I needed the tests still for that. I learned the importance of patterns in building functions, something  I had neglected to study again before this exam.

## 2. What AI wrote and what I wrote

**Facts from AI_LOG.md** (check them):

- **AI wrote:** the project scaffold, Express wiring, emulator setup, the HTML/CSS shells and design
  tokens, the country data snapshot, and nearly all the failing tests and function stubs.
- **I wrote the logic** for the core engine, for example `soldierValue` and the other S04 functions,
  `diceCount` (S05), `distanceKm` and `buildBorders` (S05b), `startAttack` / `rollAttack` / `stopAttack`
  (S08), `placeReinforcements` (S11), `transfer` (S10), `chooseTarget` (S14), the NPC turn (S15),
  `toText` (S16), the LLM service (S16b), the commentary prompt (S16c), the endpoints (S19, S21), and the
  profile labels (B1).
- **Exceptions, where AI wrote the code and I logged it.** When I was behind or overwhelmed I asked
  AI to finish whole tasks: S09, S12, S13, S20b, S25b0 and S25b together, then S18's model code, S23, S26a,
  S27, S28, S29, S30, the S31b deploy work, and the debug and refactor of `npcReason.js` (S33a).


I broke my own rules only after I tried to write the logic and realized that I cannot start or my attempts would not move the needle. Its not that I didnt want to write the logic but there are clear times when I needed AI for extra help. I would use flow charts to understand how many functions work together but translate code to pseudocode to understand what was built

## 3. How I checked the AI's work

**Facts from AI_LOG.md** (check them):

- I ran the tests myself after each change, and the tests came from `GAME_RULES.md`, not from the code.
- I caught AI mistakes: for example S08, where AI's tied-roll test was wrong and I fixed it, and S20a,
  where I spotted a problem in the controller work. Add the other cases you remember.
- I ran the commentary prompt against the real API for rounds 1 to 4 (S16c) and logged what broke:
  made-up facts, lines too long, slow calls.
- I opened the emulator UI and the live site myself rather than trusting a green test (S02, S31b).
- `GAME_RULES.md` is fixed. AI is not allowed to edit it, and a test is not changed to pass.

In all honesty, AI did the heavy lifting of checking itself against the tests. One decision to use TDD saved me lots of pressure.

## 4. Where the game's own AI fits

**Facts**

- **NPCs are not AI in the LLM sense.** They follow three fixed profiles (Warlord, Fortress,
  Opportunist) that score each possible attack and decide when to stop. Given the same dice they play the
  same way. See `docs/AI_DESIGN.md`.
- **The LLM only writes commentary.** It receives an event the engine already produced, such as a roll or
  a conquest, and must use only the names and numbers in it. Its output is never read by game logic.
  Any LLM failure falls back to template text. The prompt and its test rounds are in `docs/AI_DESIGN.md`.
- **Why the line is drawn there:** a wrong commentary line can misdescribe an event but cannot change the
  game. The server decides every roll and every NPC move.

I kept the LLM out of the NPC decisions more because I wanted to very careful on not finishing credit for AI as my budget is relatively low, nonetheless I think it also ads to my game being unique


## 5. What I would do differently

Nothing, I am genuinely proud of the work I did and cant wait to hear the feedback of the educators