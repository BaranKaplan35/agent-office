import { config as loadDotenv } from 'dotenv';
import { createApp } from './app';
import { parseEnv, type Env } from './env';
import { createLLMProvider, type LLMRouter } from './llm';
import { describeModels, formatProblem, preflight, type PreflightProblem } from './llm/preflight';
import { Orchestrator } from './orchestrator/orchestrator';
import { ENV_FILE, TEAMS_DIR } from './paths';
import { TeamRegistry, type TeamLoadError } from './teams/loader';

loadDotenv({ path: ENV_FILE, quiet: true });

/** While something is unavailable, check again this often (e.g. Ollama started later). */
const RECHECK_MS = 30_000;

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
let llm: LLMRouter;
try {
  // tsup replaces process.env.NODE_ENV with "production" in the build (see tsup.config.ts),
  // so `npm start` runs in production mode without extra tooling.
  env = parseEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV });
  llm = createLLMProvider(env);
} catch (err) {
  fail((err as Error).message);
}

const teams = new TeamRegistry(TEAMS_DIR);

// ---- preflight: which agents can't run right now, and why
let problems: PreflightProblem[] = [];
let lastReport: string | null = null;
async function checkModels(): Promise<void> {
  problems = await preflight(teams.list(), env);
  const report = problems.map(formatProblem).join('\n');
  if (report === lastReport) return;
  lastReport = report;
  if (problems.length === 0) {
    console.log('✓ Every agent has a usable model.');
  } else {
    console.warn(report);
    console.warn('  These teams can still be viewed but not started until this is fixed.');
  }
}

reportTeams(teams, await teams.load());
console.log('Models:\n' + describeModels(teams.list(), env).join('\n'));
await checkModels();
if (env.NODE_ENV === 'development') {
  teams.watch((errors) => {
    reportTeams(teams, errors);
    void checkModels();
  });
}
// Re-check while something is missing; a fixed Ollama is picked up without a restart.
setInterval(() => {
  if (problems.length > 0) void checkModels();
}, RECHECK_MS).unref();

// The orchestrator's own timeout is only a safety net above the router's
// per-provider timeouts and retries.
const orchestrator = new Orchestrator({
  llm,
  teams,
  timeoutMs: llm.maxTimeoutMs * (env.LLM_RETRIES + 1) + 60_000,
});
const app = createApp({ env, teams, orchestrator, problems: () => problems });

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
    `AgentOffice server on http://localhost:${env.port} [${env.NODE_ENV}] (default LLM: ${env.LLM_PROVIDER})`,
  );
});
