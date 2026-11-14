# AgentOffice

An isometric "AI office" where a coordinator agent splits a user's task into
subtasks, worker agents produce reports, the user approves each report or sends
it back with a note, and the coordinator merges the approved work into one final
output. Portfolio project: optimise for clarity, small dependencies and a polished UI.

## Stack

- npm workspaces: `server/` (Express 5 + TS), `client/` (React 19 + Vite + TS), `shared/` (types, TS source)
- Live updates: Server-Sent Events. User actions: plain REST POSTs.
- Office scene: low-poly 3D with Three.js via `@react-three/fiber` + `@react-three/drei`,
  orthographic camera at an isometric angle, lazy-loaded. Tests: Vitest. Validation: zod.
- Roadmap and phase details: `docs/PLAN.md`.
- Server dev runs via `tsx`; the build is bundled by `tsup` (shared is bundled in, NODE_ENV baked to production).

## Commands

- `npm install` — install all workspaces
- `npm run dev` — API (port 3001) + Vite (port 5173, proxies `/api`)
- `npm test` — all tests · `npm run lint` · `npm run typecheck`
- `npm run build` then `npm start` — one production server serving API + built client

## Architecture rules (do not break)

1. **Teams are data, not code.** Every team lives in `teams/*.yaml` and is validated
   by `server/src/teams/schema.ts`. Adding a team must never need a code change. If a
   feature needs per-team behaviour, add an optional schema field.
2. **All model calls go through `server/src/llm/index.ts`.** Nothing else imports a
   provider SDK. Provider is chosen by `LLM_PROVIDER` (mock | gemini | anthropic).
3. **API keys never reach the client.** No secrets in `VITE_*` variables.
4. **Agents never talk directly.** Every message is an `AgentMessage`
   (`shared/src/types.ts`) routed and logged by the orchestrator.
5. **Approved output is immutable.** Dependent subtasks only receive approved
   versions. A revision creates a new version; old versions are kept.
6. **No hard-coded UI strings.** Use `t()` with keys in `client/src/i18n/{en,tr}.json`.
   English is the default. `tr.json` is type-checked against `en.json`.
7. **LLM output is untrusted.** Render Markdown with raw HTML disabled.
8. **Mock mode must stay fully functional.** It is the default for dev and tests.
9. **Ports:** the API uses `SERVER_PORT` (default 3001); it only follows `PORT` in
   production, because dev tooling often sets `PORT` for the frontend.
10. **The office art is procedural and original.** Every model is built in code from
    Three.js primitives under `client/src/office/models/` — no external models,
    textures, HDRIs or fonts loaded by the scene. Do not imitate other "AI office"
    projects; follow the art direction below.
11. **The workflow never depends on the 3D scene.** With WebGL missing, Low quality or
    reduced motion, everything (approve, revise, read reports) still works from the panels.
12. **Scene logic stays testable.** Layout, daylight, navigation and status→activity
    mapping are pure functions with unit tests; components only render their output.

## Office art direction

- **Hub and spoke:** coordinator at a round hub desk in the centre, workers' desks on
  an arc around it. Envelopes fly from the hub to the spokes — the architecture, visible.
- **Cutaway corner room:** two walls, warm plank floor, window wall, coffee corner,
  plants, bookshelf, pendant lamps, a wall clock showing the real time.
- **Characters:** chunky, cute low-poly figures (big head, small body, stubby limbs),
  outfit in the agent's `deskColor`, simple face, one role accessory.
- **Light:** warm and soft. Daylight through the window follows the viewer's local
  clock (`daylight(hour)`); lamps glow in the evening. `?hour=19.5` overrides it.
- **Palette:** materials derive from `tokens.css` ("Daylight Studio"); flat shading,
  rounded silhouettes, no outlines, no photo-real textures.
- **Motion:** procedural (`useFrame`, sine-based poses), never keyframe files. Under
  `prefers-reduced-motion`: no wandering/idle loops, fades instead of flights,
  instant camera moves.
- **Quality setting:** Auto / High / Low (per viewer, localStorage). Low = no shadows,
  pixel ratio 1, no post-processing.

## Key files

- `shared/src/types.ts` — teams, tasks, subtasks, messages, API/SSE shapes
- `server/src/env.ts` — environment parsing (one readable error for all problems)
- `server/src/app.ts` — Express app factory (`createApp(env)`, used by tests)
- `server/src/orchestrator/` — task/subtask state machine, prompts, plan parser (phase 1a)
- `client/src/office/` — 3D office (phase 1c):
  `OfficeStage.tsx` (lazy load, WebGL fallback, quality), `scene/` (canvas, camera,
  lighting, `daylight.ts`), `models/` (procedural props), `characters/` (rig, poses,
  `activities.ts`), `navigation/` (grid + A*), `layout.ts` (hub-and-spoke, 3–6 agents)
- `client/src/styles/tokens.css` — "Daylight Studio" colour tokens (light + dark)

## Conventions

- TypeScript strict, ESM everywhere, `import type` for types.
- Pure logic (state machine, layout, plan parsing) gets unit tests next to the file (`*.test.ts`).
- Respect `prefers-reduced-motion` for all office animations.
- localStorage only for per-viewer conveniences (e.g. language), always wrapped in try/catch.

## Working agreement

Work proceeds phase by phase (phase 1c in three sub-phases). At the end of each phase
or sub-phase: stop, summarise simply what was done, and wait for the go-ahead before
starting the next one. Plan changes are applied to `docs/PLAN.md` and this file once
the current phase is finished, never mid-phase.

## Status

- [x] Phase 0 — skeleton, tooling, shared types, palette, empty layout, i18n, health endpoint
- [ ] Phase 1a — team loader + schema, mock provider, orchestrator, REST + SSE
- [ ] Phase 1b — team picker, task input, review queue, report viewer, final output, export
- [ ] Phase 1c-1 — 3D room, hub-and-spoke layout, soft shadows, real-time daylight, quality setting
- [ ] Phase 1c-2 — low-poly characters, procedural animation, activity mapping, navigation
- [ ] Phase 1c-3 — flying envelopes, Html status bubbles, camera controls + focus, reduced motion, perf
- [ ] Phase 2 — Gemini + Claude Haiku providers, rate limiting, prompt tuning
- [ ] Phase 3 — README, CI, third config-only template, optional plan approval, deploy
