import { config as loadDotenv } from 'dotenv';
import { createApp } from './app';
import { parseEnv } from './env';
import { ENV_FILE } from './paths';

loadDotenv({ path: ENV_FILE, quiet: true });

let env;
try {
  // tsup replaces process.env.NODE_ENV with "production" in the build (see tsup.config.ts),
  // so `npm start` runs in production mode without extra tooling.
  env = parseEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV });
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const app = createApp(env);

app.listen(env.port, () => {
  console.log(
    `AgentOffice server on http://localhost:${env.port} [${env.NODE_ENV}] (LLM provider: ${env.LLM_PROVIDER})`,
  );
});
