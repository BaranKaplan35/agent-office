import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Both server/src/*.ts (dev) and server/dist/index.js (build) sit two levels below the repo root.
const here = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = resolve(here, '..', '..');
export const TEAMS_DIR = resolve(ROOT_DIR, 'teams');
export const CLIENT_DIST_DIR = resolve(ROOT_DIR, 'client', 'dist');
export const ENV_FILE = resolve(ROOT_DIR, '.env');
