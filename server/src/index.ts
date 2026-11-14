import { config as loadDotenv } from 'dotenv';
import { createApp } from './app';
import { parseEnv, type Env } from './env';
import { createLLMProvider, type LLMProvider } from './llm';
import { Orchestrator } from './orchestrator/orchestrator';
import { ENV_FILE, TEAMS_DIR } from './paths';
import { TeamRegistry, type TeamLoadError } from './teams/loader';

loadDotenv({ path: ENV_FILE, quiet: true });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function reportTeams(registry: TeamRegistry, errors: TeamLoadError[]) {
  for (const { file, message } of errors) console.warn(`⚠ Team file ${file} skipped — ${message}`);
  const ids = registry.list().map((t) => t.id);
  console.log(`Teams loaded: ${ids.length ? ids.join(', ') : 'none (add a YAML file to teams/)'}`);
}

let env: Env;
let llm: LLMProvider;
try {
  // tsup replaces process.env.NODE_ENV with "production" in the build (see tsup.config.ts),
  // so `npm start` runs in production mode without extra tooling.
  env = parseEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV });
  llm = createLLMProvider(env);
} catch (err) {
  fail((err as Error).message);
}

const teams = new TeamRegistry(TEAMS_DIR);
reportTeams(teams, await teams.load());
if (env.NODE_ENV === 'development') {
  teams.watch((errors) => reportTeams(teams, errors));
}

const orchestrator = new Orchestrator({ llm, teams, timeoutMs: env.LLM_TIMEOUT_MS });
const app = createApp({ env, teams, orchestrator });

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
app.listen(env.port, (err?: Error) => {
  if (err) {
    const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
    fail(
      inUse
        ? `Port ${env.port} is already in use. Stop the other process or set SERVER_PORT in .env.`
        : `Server failed to start: ${err.message}`,
    );
  }
  console.log(
    `AgentOffice server on http://localhost:${env.port} [${env.NODE_ENV}] (LLM provider: ${env.LLM_PROVIDER})`,
  );
});
