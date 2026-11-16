# AgentOffice

> Your AI team, one desk each.

An isometric office where every desk is an AI agent. Type a task, the coordinator
splits it up, the agents work on their pieces, and you approve each report — or
send it back with a note. When everything is approved, the coordinator merges it
into one final deliverable.

Teams are defined in plain YAML files, so a new team is a new file, not new code.
If a task is too vague (or just "hi"), the coordinator first asks one to three
questions and plans once you answer.

> 🚧 Work in progress — the full README (screenshots, architecture, how to add a
> team) arrives in phase 3.

## Getting started

Requirements: Node.js 20.6+ (developed on Node 24).

### Quick try (mock)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Nothing else to set up: without a `.env` (or with
`LLM_PROVIDER=mock`) every agent runs on the mock provider, including those that name
their own model in the team file. The answers are canned, but the whole workflow
works: questions, plans, reports, revisions, the final merge and the 3D office.

### With real models

1. Copy `.env.example` to `.env`.
2. Set `LLM_PROVIDER` to the coordinators' provider, e.g. `gemini`, and its key
   (`GEMINI_API_KEY`, free at https://aistudio.google.com/apikey).
3. The workers of both bundled teams run on a local [Ollama](https://ollama.com) model:
   install Ollama and run `ollama pull qwen3.5:9b`.
4. `npm run dev`. At startup the server lists every agent's model and names anything
   missing (key, Ollama not running, model not pulled).

Any agent can use another provider; see the table and the mixed-team example below.

## Models and providers

Every agent runs on a model. By default all agents use `LLM_PROVIDER` from `.env`
with that provider's default model; any agent can pick its own in the team file
(ignored while `LLM_PROVIDER=mock`).

| Provider     | Set in `.env`                             | Default model      | Cost                                   | Where your prompts go               |
| ------------ | ----------------------------------------- | ------------------ | -------------------------------------- | ----------------------------------- |
| `mock`       | nothing                                   | —                  | free                                   | nowhere: canned answers, no model   |
| `gemini`     | `GEMINI_API_KEY` (`GEMINI_MODEL`)         | `gemini-3.6-flash` | free tier with daily limits, then paid | Google (Gemini API)                 |
| `anthropic`  | `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`)   | `claude-haiku-5-5` | paid per token                         | Anthropic (Claude API)              |
| `ollama`     | `OLLAMA_BASE_URL` (`OLLAMA_MODEL`)        | `qwen3.5:9b`       | free, runs on your own computer        | stays on your machine               |
| `openrouter` | `OPENROUTER_API_KEY` (`OPENROUTER_MODEL`) | `openrouter/auto`  | some free models, otherwise per token  | OpenRouter and the model's provider |

- **Free tiers are small.** In November 2026 the Gemini free tier allowed only 20
  requests a day for `gemini-3.6-flash`, and one task makes about 7–10 calls (plan,
  one report per agent, revisions, the final merge). When the quota is used up the
  report says so and when it resets. Putting some agents on a local Ollama model
  spreads the load.
- **Ollama:** install it, then `ollama pull qwen3.5:9b` (or the model you name). Local
  models get one call at a time, a longer timeout and a 16K context window, so a worker
  that builds on its teammates' reports gets them in full (`OLLAMA_CONCURRENCY`,
  `OLLAMA_TIMEOUT_MS`, `OLLAMA_NUM_CTX`).
- **If planning fails** (quota, model down), the task bar shows why and offers "Try
  again"; the prompt and any answers to the coordinator's questions are kept.
- **At startup** the server checks every agent's model (keys present, Ollama running,
  model pulled) and names the team and agent that can't run. Those teams can be viewed
  but not started until it is fixed; the server rechecks every 30 s.
- **What you see:** each desk bubble shows its model on hover; every report shows the
  model, tokens and time it took (`ollama · qwen3.5:9b · 1.1K in / 1.5K out · 36s`);
  the final output adds the totals per model for the whole task.

### A mixed team

Add `llm` to any agent in `teams/*.yaml`; `model` is optional (the provider's default
from `.env` is used without it):

```yaml
agents:
  - id: coordinator
    type: coordinator
    llm: { provider: anthropic, model: claude-haiku-5-5 } # plans and merges
    # name, role, systemPrompt …
  - id: engineering
    type: worker
    llm: { provider: ollama, model: qwen3.5:9b } # code stays on your machine
  - id: marketing
    type: worker
    llm: { provider: openrouter } # OPENROUTER_MODEL
  - id: product # no llm: the .env default, e.g. Gemini
    type: worker
```

Each provider used needs its key in `.env`. API keys never leave the server; model
names are public and shown in the UI. Both bundled teams are mixed teams: the
coordinator (planning, questions, the final merge) uses the `.env` default, for example
Gemini, and every worker runs on `ollama / qwen3.5:9b`. That keeps a task to two or
three cloud calls, which fits the small free tiers.

## Scripts

| Command                              | What it does                                            |
| ------------------------------------ | ------------------------------------------------------- |
| `npm run dev`                        | API server + Vite dev server with hot reload            |
| `npm test`                           | Run all tests                                           |
| `npm run lint` / `npm run typecheck` | Static checks                                           |
| `npm run build`                      | Build client and server                                 |
| `npm start`                          | Run the production server (serves the built client too) |

## License

MIT
