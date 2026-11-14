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

## Phase 1b — Panels and workflow

- Team picker, task input, review queue, report viewer with version switcher,
  approve / revise-with-note, final output, Markdown export, message log
- Empty / error / cancelled states
- Acceptance: a task runs start to finish with no API key
- The office area keeps the phase-0 placeholder; the 3D office arrives in 1c

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

## Phase 2 — Real models

- Gemini provider (`@google/genai`), current free-tier model name verified
- `limiter.ts`: concurrency, 429 backoff, timeouts; errors surfaced in the UI
- JSON-schema plan output, token usage display
- Anthropic provider (`@anthropic-ai/sdk`, `claude-haiku-5-5`), switch via `.env`
- Prompt tuning for both templates on both providers

## Phase 3 — GitHub and portfolio

- Full README with GIF of the 3D office, screenshots (day / evening), architecture
  diagram, "add a team in one file" guide
- LICENSE (MIT), GitHub Actions (lint, typecheck, test, build)
- A third team template, added as YAML only
- Optional plan-approval step (approve the coordinator's subtask list before work starts)
- Optional: JSON-file persistence, deploy (Render / Fly.io)
