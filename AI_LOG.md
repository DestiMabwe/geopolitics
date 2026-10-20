# AI_LOG.md

| Date | Task | What I asked AI | What AI produced | What I wrote or changed myself |
|---|---|---|---|---|
| 2026-10-20 | S01 | Plan + scaffold the project TDD-style (AI red, me green, AI refactor) | Plan; `package.json`, `.gitignore`, `.env.example`, Vitest config, `server.js`, `app.js` + `routes/api.js` (health route, static files); failing tests for `scripted()` and `/api/health`; closure explanation + step hints; refactor of `scripted()` error message | Wrote `scripted()` in `tests/helpers.js` myself from hints; caught that Express wiring is AI's boilerplate per CLAUDE.md, not mine |
| 2026-10-20 | S02 | Plan + set up Firebase emulators | Checked prerequisites (no Java, no CLI); `firebase.json`, `.firebaserc`, deny-all `firestore.rules`, indexes, `src/config/firebase.js` (emulator-aware Admin SDK), integration Vitest config + scripts; failing-then-passing Firestore round-trip test | Installed JDK 21 myself; tried to jump to the bonus, AI pushed back (depends on S06/S14/S15/S26b), so I stayed on the plan |
