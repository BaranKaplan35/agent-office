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
2. **All model calls go through `server/src/llm/`.** `index.ts` is the only place that
   maps a provider name to an adapter; nothing else imports a provider SDK or calls a
   provider URL (the startup preflight in `llm/preflight.ts` is the one other place that
   asks Ollama for its model list). Providers: `mock | gemini | anthropic | ollama |
openrouter`, one adapter each in `llm/providers/`. Each agent may set `llm: { provider, model }` in its
   YAML; without it the `.env` default applies (`LLM_PROVIDER` + that provider's default
   model). Adding a provider = one adapter file + one registry entry — team files and
   the orchestrator never change. A missing key or unreachable Ollama must be reported
   at startup naming the team and agent affected, never crash the whole server.
3. **API keys never reach the client.** No secrets in `VITE_*` variables. Provider and
   model names are public (shown on desks and reports); keys and base URLs are not.
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
- `server/src/app.ts` — Express app factory (`createApp({ env, teams, orchestrator })`, used by tests)
- `teams/*.yaml` — team templates; `server/src/teams/` — zod schema, loader/registry
  (hot reload in dev), `defaultPlan.ts` (one subtask per worker along `dependsOn`)
- `server/src/llm/` — `index.ts` (the router: agent → provider + model, per-provider
  concurrency, timeout and retries), `resolve.ts` (model resolution, pure), `providers/`
  (`gemini`, `anthropic`, `ollama`, `openrouter` + `http.ts`), `mock.ts`, `errors.ts`
  (`LLMError`: "provider · model: reason", retryable or not), `retry.ts` (backoff),
  `planSchema.ts` (structured plan output), `preflight.ts` (startup check: keys, Ollama
  running, model pulled → unavailable agents), `limiter.ts`
- `server/src/orchestrator/orchestrator.ts` — task/subtask state machine, scheduling,
  revisions, merge, cancel, timeouts, event publishing
- `server/src/orchestrator/prompts.ts` — plan / work / revision / merge prompts;
  `planParser.ts` — sanitises the coordinator's JSON plan (falls back to `defaultPlan`)
- `server/src/http/` — `routes.ts` (REST), `sse.ts` (event stream), `errors.ts`
- `server/src/test/fixtures.ts` — test team, scripted providers, `waitFor` helper
- `client/src/state/store.ts` — Zustand store: teams, current task, selection, review
  commands (approve/revise/retry/cancel); remembers team + task id in localStorage
- `client/src/state/selectors.ts` — pure derivations: `agentActivity` (what each agent is
  doing — the 3D office must reuse it), review queue, report model, export filename
- `client/src/api/useTaskStream.ts` — SSE with heartbeat watchdog; drops tasks the server
  forgot (restart) with a message
- `client/src/panels/` — review queue, report viewer (versions, approve, revise, export),
  message log, task input · `client/src/office/TeamBoard.tsx` — flat hub-and-spoke board
  (the WebGL / scene-error fallback)
- Heavy UI pieces load lazily: `LucideIcon.tsx` (icon map), `MarkdownRenderer.tsx`
- `client/src/office/` — 3D office (phase 1c):
  - `OfficeStage.tsx` — lazy-loads the scene, falls back to `TeamBoard` without WebGL
    or on a scene error; owns "Reset view" + Esc; `quality.ts` — Auto / High / Low store,
    `motion.ts` — System / Full / Reduced store (`?motion=reduce|full` overrides); both in
    `components/QualityMenu.tsx` ("Office settings")
  - `layout.ts` — hub-and-spoke positions for 3–6 agents (pure, tested)
  - `scene/` — `OfficeScene.tsx` (Canvas; default export, lazy), `daylight.ts` (hour →
    light, pure, tested), `camera.ts` (iso fit, orbit limits, focus, pure, tested),
    `Lighting.tsx`, `CameraRig.tsx` (drei `CameraControls`, focus / reset handle),
    `Station.tsx` (desk + selection ring), `DeskTag.tsx` (status bubble) +
    `TagProjector.tsx` (DOM bubbles glued to 3D points), `palette.ts` (CSS tokens →
    scene colours), `useSceneHour.ts` (`?hour=` override), `PerfProbe.tsx` (`?perf`)
  - `effects/` — `flights.ts` (assignment messages → envelope flights, pure, tested),
    `Envelopes.tsx` (pooled renderer)
  - `models/` — procedural props: `Room`, `Furniture`, `Decor`, `Lounge` (lounge, printer,
    water cooler, whiteboard), `Outside`, `parts` (primitives);
    `batch.ts` + `StaticBatch.tsx` merge static meshes per material — mark anything that
    changes on its own with `userData={{ dynamic: true }}`
  - `characters/` — `brain.ts` (behaviour state machine: desk, breaks, lounge seats,
    meetings; pure), `pose.ts` (joint angles, held items; pure), `activities.ts` (activity →
    goal), `personality.ts` (personality → temperament), `social.ts` (chats, high-fives,
    speech bubbles; pure), `appearance.ts`, `spotRegistry.ts` (weighted spots);
    `Character.tsx` (rig, applies poses), `Confetti.tsx`
  - `navigation/` — `grid.ts` (A\* + line-of-sight), `office.ts` (obstacles, seats, idle,
    meeting and celebration spots); `props.ts` — fixed furniture and lamp placements shared by
    scene and navigation (`props.test.ts`: lamps never cross a desk bubble)
  - `scene/Cast.tsx` — one brain per agent, sets goals from `agentActivity` every frame
    (held while the agent's envelope is in flight; `calmGoalFor` + `settle()` under
    reduced motion); characters never read React context and never decide anything themselves
  - Scene components never read React context: the stage passes translated text as props
- `client/src/styles/tokens.css` — "Daylight Studio" colour tokens (light + dark)

## API (all JSON, prefix `/api`)

- `GET /health` · `GET /teams` · `GET /teams/:teamId` (public view, no prompts)
- `POST /tasks {teamId, prompt, lang}` → `201 {taskId}` · `GET /tasks/:id` (snapshot)
- `GET /tasks/:id/events` — SSE; first event is a snapshot, then one event per change
- `POST /tasks/:id/subtasks/:subId/{approve|revise|retry}` (`revise` body: `{note}`)
- `POST /tasks/:id/final/{approve|revise|retry}` · `POST /tasks/:id/cancel`
- Errors: `{error: {code, message}}` — 400 validation, 404 not_found, 409 invalid_state / revision_limit

## Conventions

- TypeScript strict, ESM everywhere, `import type` for types.
- Pure logic (state machine, layout, plan parsing) gets unit tests next to the file (`*.test.ts`).
- Respect `prefers-reduced-motion` for all office animations.
- localStorage only for per-viewer conveniences (e.g. language), always wrapped in try/catch.

## Working agreement

Work proceeds phase by phase (1c in four sub-phases, 2 in two). At the end of each phase
or sub-phase: stop, summarise simply what was done, and wait for the go-ahead before
starting the next one. Plan changes are applied to `docs/PLAN.md` and this file once
the current phase is finished, never mid-phase.

## Status

- [x] Phase 0 — skeleton, tooling, shared types, palette, empty layout, i18n, health endpoint
- [x] Phase 1a — team loader + schema, mock provider, orchestrator, REST + SSE
- [x] Phase 1b — team picker, task input, review queue, report viewer, final output, export
- [x] Phase 1c-1 — 3D room, hub-and-spoke layout, soft shadows, real-time daylight, quality setting
- [x] Phase 1c-2 — low-poly characters, procedural animation, activity mapping, navigation
- [x] Phase 1c-3 — flying envelopes, full status bubbles, camera controls + focus, reduced motion, perf
- [x] Phase 1c-4 — office life: motion setting, personalities, conversations, idle behaviours, work breaks, lounge/printer/whiteboard/water cooler
- [x] Phase 2a — provider layer (gemini, anthropic, ollama, openrouter), per-agent `llm` in YAML, startup preflight
- [ ] Phase 2b — model labels on desks/reports, per-report tokens + duration, mixed-team README example
- [ ] Polish — see the list at the end of `docs/PLAN.md`
- [ ] Phase 3 — README, CI, third config-only template, optional plan approval, deploy
