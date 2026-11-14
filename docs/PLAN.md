# AgentOffice — Roadmap

Work proceeds phase by phase. At the end of each phase (and each 1c sub-phase) work
stops for a plain-language summary and the go-ahead for the next one.

## Phase 0 — Skeleton ✅

npm workspaces (`shared`, `server`, `client`), TypeScript strict, ESLint, Prettier,
Vitest. Shared types for teams, tasks, subtasks, report versions, agent messages and
API/SSE shapes. Express app with `/api/health` and env validation. Empty three-panel
UI with the "Daylight Studio" palette (light + dark), EN/TR i18n, server status pill.

## Phase 1a — Backend core (mock) ✅

- `teams/*.yaml` loader + zod schema (1 coordinator, 2–5 workers, unique ids,
  valid `dependsOn`, no cycles, hex colours); a test validates every team file
- Two templates: Maker Lesson Studio, Software Startup
- `LLMProvider` interface + mock provider (team-agnostic, uses optional `mockResponse`)
- Orchestrator state machine + dependency scheduler (unit tested)
- REST endpoints + SSE (each event carries a full task snapshot)

## Phase 1b — Panels and workflow ✅

- Team picker, task input, review queue, report viewer with version switcher,
  approve / revise-with-note, final output, Markdown export, message log
- Empty / error / cancelled states; lost-task detection after a server restart
  (SSE heartbeat watchdog)
- Acceptance: a task runs start to finish with no API key
- The office area is a flat hub-and-spoke board (`TeamBoard`); it stays as the
  WebGL fallback when the 3D office arrives in 1c

## Phase 1c — 3D office (the showcase)

Low-poly 3D office with **Three.js via react-three-fiber + drei**, orthographic
camera at an isometric angle. **Every model is built in code from primitives** — no
external models, textures or HDRIs. The design is our own (see _Art direction_);
it must not copy other "AI office" projects.

Split into three sub-phases, each ending with a stop and a summary.

### 1c-1 — Room, light and layout

- Lazy-loaded scene chunk (`React.lazy`) so panels render instantly; WebGL-missing
  fallback that keeps the whole workflow usable from the panels
- Orthographic camera, default iso view (azimuth 45°, polar ≈ 55°)
- **Room:** cutaway corner (two walls), warm plank floor, window wall with mullions,
  coffee corner (counter, machine, mugs), plants, bookshelf, **wall clock showing the
  real time**, pendant lamps
- **Hub-and-spoke layout** (signature): coordinator at a round hub desk in the
  centre, workers' desks on an arc around it — the app's architecture made visible.
  `layout.ts` is a pure function (2–5 workers → positions + facing), unit tested
- Desks, monitors, chairs per agent, accented with the agent's `deskColor`
- **Lighting:** warm ambient/hemisphere light + soft shadows (PCF soft shadow map,
  contact shadows under characters)
- **Real-time daylight:** `daylight(hour)` pure function → sun colour, intensity,
  direction through the window, sky colour, lamp intensity. Keyframes for night,
  dawn, day, golden hour, dusk, interpolated smoothly; lamps glow in the evening.
  Dev override `?hour=19.5` for screenshots. Unit tested
- **Quality setting** (header ⚙ menu, stored per viewer): Auto / High / Low.
  Low = shadows off, pixel ratio 1, no post-processing, fewer idle animations.
  Auto starts High and drops via drei `PerformanceMonitor`
- Scene background and materials follow the light/dark theme tokens

### 1c-2 — Characters and animation

- Cute, chunky low-poly figures built from primitives: big head, small body,
  stubby limbs, agent-colour outfit; simple face (eyes, blush), a role accessory
  (e.g. headset, glasses, cap) chosen from the icon or index
- Procedural animation in `useFrame` (sine-based, no clips): a small rig of pose
  functions blended per frame
- **Activity mapping** (`activities.ts`, pure, unit tested) from agent/subtask state:
  - idle → wander between waypoints; idle variants: stretch, sip coffee at the
    coffee corner, look out the window
  - working / revising → walk to desk, sit, typing arms; **scrolling code/text lines
    on the monitor** (instanced bars in the agent colour)
  - delivered (awaiting review) → raise a hand, then wait at the desk
  - approved → small nod, then back to idle
  - failed → slumped pose
  - final approved → whole team **celebrates** (jump, arms up, primitive confetti)
- Walking: arm/leg swing, body bob; grid navigation with A* around desks
  (`navigation/`, unit tested)

### 1c-3 — Interaction and effects

- **Envelope:** on each `assignment` message a glowing envelope flies from the hub
  desk to the worker's desk on a curved path (quadratic Bézier with an arc),
  emissive material + additive glow sprite; landing triggers the walk-to-desk
- **Status bubbles** as drei `<Html>` above each desk: name, role and status chip
  (Working… / ! / ✎ / ✓ / error), all text through `t()`
- **Camera:** drei `CameraControls` — rotate and zoom within limits (azimuth
  ±35° around the default, polar 40–65°, zoom 0.7–2.5, no free pan); click a desk or
  character → smooth transition to that desk and open its report in the side panel;
  "Reset view" button and Esc return to the overview
- **Reduced motion** (`prefers-reduced-motion`): no wandering or idle loops, envelope
  fades instead of flying, instant camera moves, no confetti
- Performance pass: instancing for repeated props/lines/confetti, shared geometries
  and materials, target 60 fps on a mid-range laptop at High, smooth at Low
- Stretch: a wall task board with sticky notes per subtask (agent colour) that move
  to "done" on approval

**Testing for 1c:** unit tests for layout, daylight, navigation and activity mapping;
visual checks via screenshots for 3–6 agents, three times of day, both quality
modes, reduced motion, and phone width.

## Phase 2 — Real models, multi-provider

Multi-provider support is one of the project's headline features: a single team can
mix models from different providers ("mixed team"), chosen per agent in YAML.
Split into two sub-phases, each ending with a stop and a summary.

### 2a — Provider layer and per-agent models

- **Providers:** `mock`, `gemini` (`@google/genai`), `anthropic` (`@anthropic-ai/sdk`),
  `ollama` (local HTTP API, `OLLAMA_BASE_URL` default `http://localhost:11434`, no key),
  `openrouter` (OpenAI-compatible HTTP API, `OPENROUTER_API_KEY`). Ollama and
  OpenRouter use plain `fetch`, no SDK. Current model names verified at
  implementation time (Gemini free tier, `claude-haiku-5-5`, a small Ollama model)
- **One adapter file per provider** under `server/src/llm/providers/`, registered in
  `server/src/llm/index.ts` (still the only place that maps a name to an adapter).
  `LLMRequest` gains `model`; adapters normalise answers to `{ text, usage }`
- **Per-agent model in YAML:** optional `llm: { provider, model }` on any agent
  (coordinator included). Missing → the `.env` default (`LLM_PROVIDER` + that
  provider's default model, e.g. `GEMINI_MODEL`). Schema validates the provider
  name; the model is a free string
  ```yaml
  - id: code
    llm: { provider: ollama, model: qwen2.5-coder:7b }
  ```
- **Startup preflight** (`server/src/llm/preflight.ts`): resolve every agent of every
  team, then check that each needed provider has its key and that Ollama answers
  (`/api/tags`) and has the model pulled. The log names exactly who is affected, e.g.
  `⚠ maker-lesson-studio › Byte (code) → ollama:qwen2.5-coder:7b — Ollama is not running at http://localhost:11434`.
  The server still starts; `/api/teams` marks affected teams/agents as unavailable
  with the reason, and the UI disables sending for that team with a clear message.
  (Replaces today's hard env check that stops the server when the default key is missing)
- **Per-provider limits:** separate concurrency limiters (Ollama defaults to 1),
  429 / 5xx backoff, per-provider timeout (local models get longer,
  `OLLAMA_TIMEOUT_MS`); errors surface in the UI with the provider name
- **Structured plan output** per provider: Gemini `responseSchema`, Anthropic tool /
  JSON instructions, Ollama `format` schema, OpenRouter `response_format` where the
  model supports it — the existing tolerant `planParser` stays as the safety net
- **Tests:** adapters against mocked `fetch` / SDK responses (usage mapping per
  provider), model resolution, preflight messages, schema for the `llm` field

### 2b — Model visibility, metrics and docs

- **Model labels:** `PublicAgent` exposes its resolved `{ provider, model }` (never
  keys); a small tag on each desk and in the report header, e.g. `ollama · qwen2.5-coder`
- **Per-report metrics:** each `ReportVersion` records `provider`, `model`,
  `durationMs` and normalised token usage (Gemini `usageMetadata`, Anthropic
  `usage`, Ollama `prompt_eval_count/eval_count`, OpenRouter `usage`); the report
  footer shows e.g. `gemini · gemini-2.5-flash · 1.2k in / 850 out · 4.3 s`, and
  "—" when a provider gives no counts
- **Task totals:** tokens and time per provider for the whole task (final view)
- **README:** a "mixed team" example YAML (e.g. coordinator on Claude Haiku, coder on
  a local Ollama model, the rest on Gemini, marketing via OpenRouter) plus a
  provider table: required env vars, free/local options, what data goes where
- Prompt tuning for both templates across providers

## Phase 3 — GitHub and portfolio

- Full README with GIF of the 3D office, screenshots (day / evening), architecture
  diagram, "add a team in one file" guide
- LICENSE (MIT), GitHub Actions (lint, typecheck, test, build)
- A third team template, added as YAML only
- Optional plan-approval step (approve the coordinator's subtask list before work starts)
- Optional: JSON-file persistence, deploy (Render / Fly.io)

## Polish (left for the end)

Small improvements collected along the way; done after the main phases unless one
becomes blocking.

- [ ] When a task is completed, the "All done" screen in the right panel offers
      "View final" and "Download .md" buttons directly (today you have to open the
      coordinator's desk first)
