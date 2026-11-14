# AgentOffice

> Your AI team, one desk each.

An isometric office where every desk is an AI agent. Type a task, the coordinator
splits it up, the agents work on their pieces, and you approve each report — or
send it back with a note. When everything is approved, the coordinator merges it
into one final deliverable.

Teams are defined in plain YAML files, so a new team is a new file, not new code.

> 🚧 Work in progress — the full README (screenshots, architecture, how to add a
> team) arrives in phase 3.

## Quick start

Requirements: Node.js 20.6+ (developed on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:5173. No API key is needed: the app runs with mock agents by default.

To use a real model, copy `.env.example` to `.env` and set `LLM_PROVIDER` and the matching API key.

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
