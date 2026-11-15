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

Split into four sub-phases (1c-4 was added after 1c-3), each ending with a stop and a summary.

### 1c-1 — Room, light and layout ✅

Done as planned, with these decisions made along the way:

- Soft shadows use `PCFShadowMap` + `shadow.radius` (three 0.187 removed
  `PCFSoftShadowMap`). No contact-shadow pass: the sun's real shadows through the
  window openings plus the lamp light ground the furniture
- The room is a closed shadow box: invisible, shadow-only walls and ceiling close
  the open sides, so sunlight only enters through the windows (real window-shaped
  light patches and mullion shadows on the floor)
- Three.js lights are physically based, so the ambient parts are scaled up in
  `Lighting.tsx` (`HEMISPHERE_SCALE`); tone mapping is Khronos Neutral (keeps the
  theme colours true). Dark theme uses its own lifted `--scene-*` tokens
- Name tags are ordinary DOM buttons positioned every frame by `TagProjector`, not
  drei `<Html>` (it renders in a separate React root, which breaks under React 19
  and can't use app context). They are real, keyboard-focusable buttons with a
  status dot; the status text expands on hover / focus / selection
- Monitors already show the agent's status colour and static text lines; the lines
  start scrolling in 1c-2
- Outside the windows: a sky gradient with sun / moon / stars and a small garden
- Original plan for this sub-phase:

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

### 1c-2 — Characters and animation ✅

Done as planned, with these decisions made along the way:

- **Pure brain, thin renderer.** All behaviour is Three.js-free and unit tested:
  `navigation/` (grid, A\* with line-of-sight smoothing, furniture obstacles, idle
  and celebration spots), `characters/brain.ts` (state machine: seated → rising →
  walking → acting / celebrating → sitting), `characters/pose.ts` (joint angles from
  sines), `characters/activities.ts` (activity → goal), `characters/appearance.ts`.
  `Character.tsx` only applies the numbers to the rig
- Tests found real layout bugs: the room is now 12 deep (was 11) and the hub sits
  further forward, so every seat has room behind the chair and every spot can reach
  every other (checked for 2–5 workers)
- Seats were tucked in (chair 0.75 from the desk centre) and keyboards moved closer
  so the typing hands actually reach them
- Looks come from the agent: skin, hair and outfit derive from the id and desk
  colour; the accessory comes from the icon (headset for the coordinator, glasses for
  code / cpu, cap, goggles, headband). Hats and headbands get the short haircut
- Activities: planning / working / revising / merging type, coordinating reads,
  review raises a hand (9 s cycle, 5 s raised), approved nods for 2.2 s then wanders,
  failed slumps, done gathers on the rug and cheers with confetti; waiting / idle /
  not needed wander (coffee with a mug, window, bookshelf, stretch)
- Characters hurry (1.55×) when going back to work, so a task visibly starts fast
- Monitor text scrolls while an agent is working
- Clicking a character opens its report, like the name tag
- Not yet done (planned for 1c-3): `prefers-reduced-motion` still lets characters
  wander; the camera is still fixed
- Original plan for this sub-phase:

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

### 1c-3 — Interaction and effects ✅

Done as planned, with these decisions made along the way:

- **Envelopes** (`effects/flights.ts`, pure and tested): a `MessageWatcher` turns new
  `assignment` messages into flights on a `FlightBoard`; the task already open when the
  office loads counts as history, so a reload never replays old envelopes. Flights from
  one snapshot are staggered. The worker is _held_ (keeps its previous goal) until its
  envelope lands, then hurries to the desk. Rendering is a fixed pool of 6 envelopes
  (paper + flap and seal in the agent colour, an additive glow sprite painted once in
  code, a landing ring); 1.45 s flight + 0.35 s landing
- **Status bubbles:** the desk tag became a speech bubble with a tail in the agent colour:
  badge + name, opening to role + status on hover / focus / selection. Badges per
  activity (bouncing dots while busy, ✎ revising, ! review with a pulse, ✓ approved,
  ✕ failed, hourglass waiting, coffee idle, party when done); the badge pops whenever
  the activity changes. On a wide canvas (container query, ≥ 820 px) bubbles that
  need the user (review, failed) stay open
- **Camera:** drei `CameraControls` with the planned limits (pure `orbitLimits`,
  `focusZoom`, `isOverview`, tested). Left drag / one finger turns, wheel / pinch zooms,
  no panning; rotate speed halved for the small diorama. A drag is not a click (desks
  and characters ignore pointer-ups after > 6 px). Opening a desk from the scene (desk,
  character or bubble) glides there; opening from the panel does not move the camera.
  "Reset view" (with an Esc hint) appears only when the view left the overview; a new
  canvas (quality change) or another team starts from the overview again
- **Reduced motion** (`motion.ts`; `?motion=reduce|full` overrides for screenshots):
  `calmGoalFor` keeps everyone at their desk (no wandering, no "approved → wander"),
  `brain.settle()` jumps straight to the end state, poses hold one frame (no blinking),
  monitor text stands still, envelopes fade in at the desk, camera moves are instant,
  no confetti; CSS animations were already off
- **Performance:** static batching (`models/batch.ts` + `StaticBatch`): meshes that never
  move are merged into one mesh per distinct material; anything that changes on its own
  is marked `userData.dynamic`. Originals are hidden, not removed, so React still owns
  them and clicks still reach them. Applied to the room and furniture, each desk (the
  monitor screen stays dynamic) and each character's head and torso. Monitor text lines
  are one instanced mesh per screen. Draw calls for a 5-agent office went from 522 to
  259 (shadow casters 402 → 181). `?perf` publishes fps and renderer counts on
  `window.__officePerf` for checking
- Not done: the stretch wall task board

- Original plan for this sub-phase:

- **Envelope:** on each `assignment` message a glowing envelope flies from the hub
  desk to the worker's desk on a curved path (quadratic Bézier with an arc),
  emissive material + additive glow sprite; landing triggers the walk-to-desk
- **Status bubbles:** upgrade the 1c-1 `DeskTag` (DOM, positioned by `TagProjector`)
  into the full bubble: role, richer status (Working… / ! / ✎ / ✓ / error), a small
  entrance animation, all text through `t()`
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

### 1c-4 — Office life ✅

Added after 1c-3, before phase 2: the office should feel like a real, lively office.

Done as planned, with these decisions made along the way:

- **Motion setting** (`motion.ts`): System / Full / Reduced in the ⚙ menu (now "Office
  settings"), stored per viewer; System shows what the device asks for. `?motion=`
  still overrides everything for screenshots
- **Seated before working:** the scene shows its own "On the way to the desk…" state
  (footprints badge, monitor still dark) from the envelope's launch until the agent sits;
  panels keep the real status. The mock waits `MOCK_WALK_IN_MS` (default 4.5 s) before a
  plan or a first report. The server can't know when a viewer's character sits (several
  viewers, reduced motion, no WebGL), so this is a fixed walk-in time, not a signal from
  the scene: the workflow still never depends on the 3D office. Revisions and the merge
  happen at the desk and don't wait
- **Personality** (`characters/personality.ts`, pure): five personalities, each a
  temperament: idle-activity weights, break interval, sociability, walking pace. Without
  `personality` in YAML, one is derived from the name (hash). The teams set it for some
  agents and leave others to the fallback, to show both
- **Idle spots** (`navigation/office.ts`): phone (open floor), water cooler, printer,
  whiteboard, sofa seats and the armchair (characters sit down and get up again), and a
  "look at a teammate's screen" spot beside each desk that its own agent never uses.
  `SpotRegistry` picks an activity by weight, then a free spot for it
- **Chats and high-fives** (`characters/social.ts`, pure): a `SocialDirector` gathers 2–3
  idle agents (chance scaled by sociability, at most two chats at a time, a cooldown
  afterwards) at the coffee counter, water cooler, a window, the lounge, the open floor or
  beside a desk. Meeting places come from the layout and drop slots that would block a
  seat or an idle spot; the coffee counter is too crowded for a standing group with 4
  workers, so coffee chats use the two counter spots (reserved while chatting). Members
  face the centre; the speaker gestures and gets an emoji or "…" bubble, the others nod
  with folded arms. Work always wins: a member called to the desk leaves, and a pair
  breaks up. An agent whose work is approved high-fives the nearest free teammate
  (double high-five, 🙌)
- **Ambient bubbles:** "?" when asking a neighbour, "…" on the phone, 💡 at the
  whiteboard, 🎉 while celebrating. Speech bubbles are DOM, written straight from the
  render loop (no React state per frame)
- **Breaks at the desk:** after a personality-dependent stretch of typing (10–40 s): lean
  back with hands behind the head, scratch the head, or turn to the nearest neighbour
  and ask (body and head turn towards that desk). Mock work is short, so breaks show
  mostly with real models
- **New furniture** (`models/Lounge.tsx`): lounge under the right window (sofa, armchair,
  side table, rug), printer and water cooler on the open right edge, a whiteboard on a
  rolling stand at the front. Characters hold a phone, a paper cup, a printed page or a
  marker when needed
- **Lamp cords:** they now end at the ceiling (the top of the shadow box) with a small
  canopy instead of rising far above the walls, and the hub lamp hangs in front of the
  hub. `props.test.ts` checks that no lamp or cord overlaps a desk bubble at the default
  view for 2–5 workers
- **Performance:** same draw calls as 1c-3 (259 meshes, 178 shadow casters, was 181 for
  a 5-agent team): lamps' fixed parts are batched (bulbs stay dynamic), the new props
  share a small colour set, and each forearm is merged with its hand
- Reduced motion: no wandering, chats, breaks or speech bubbles

- Original plan for this sub-phase:

- **Motion setting:** the header ⚙ menu gets a persistent "Motion: System / Full /
  Reduced" choice (per viewer, localStorage, default System). Windows with animation
  effects turned off reports `prefers-reduced-motion`, which made characters "teleport"
- **Seated before working:** in full motion an agent's bubble and monitor only switch
  to "working" once the agent sits at the desk ("on the way" until then); the mock
  provider waits a walk-in time (`MOCK_WALK_IN_MS`) before it starts counting, so the
  report doesn't land while the agent is still walking
- **Personality** (optional `personality` in YAML: social, diligent, coffee, calm,
  curious): decides what an agent does when idle and how often it takes short breaks.
  Without it, a stable personality is derived from the agent's name
- **Conversations:** two (sometimes three) idle agents meet at the coffee corner, a
  desk, a window or the lounge, face each other, gesture, and show speech bubbles with
  emoji or "…" (no text). High-fives when an agent's work is approved
- **More idle behaviour:** phone calls, looking at a teammate's screen, stretching,
  drinking water, fetching paper from the printer, drawing on the whiteboard, sitting
  in the lounge
- **Breaks while working:** leaning back, scratching the head, turning to a neighbour
  to ask something
- **Fill the office:** lounge corner (sofa, armchair), printer, whiteboard and water
  cooler on the empty front and right floor; new behaviours use them
- **Fix:** pendant lamp cords ran through the name bubbles
- Rules: behaviour logic stays pure and tested, apart from the renderer; reduced
  motion turns conversations and wandering off; performance no worse than 1c-3

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
