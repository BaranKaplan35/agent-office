import { watch } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PublicTeam, TeamConfig } from '@agent-office/shared';
import { parse as parseYaml } from 'yaml';
import { validateTeam } from './schema';

export interface TeamLoadError {
  file: string;
  message: string;
}

export interface TeamLoadResult {
  teams: TeamConfig[];
  errors: TeamLoadError[];
}

const TEAM_FILE = /\.ya?ml$/i;

/**
 * Read every *.yaml / *.yml file in `dir`. A broken file never stops the others
 * from loading: it is reported in `errors` and skipped.
 */
export async function loadTeamsFromDir(dir: string): Promise<TeamLoadResult> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => TEAM_FILE.test(f)).sort();
  } catch (err) {
    return {
      teams: [],
      errors: [{ file: dir, message: `cannot read teams directory: ${(err as Error).message}` }],
    };
  }

  const teams: TeamConfig[] = [];
  const errors: TeamLoadError[] = [];
  const ids = new Map<string, string>();

  for (const file of files) {
    let raw: unknown;
    try {
      raw = parseYaml(await readFile(join(dir, file), 'utf8'));
    } catch (err) {
      errors.push({ file, message: `invalid YAML: ${(err as Error).message}` });
      continue;
    }

    const result = validateTeam(raw);
    if (!result.ok) {
      errors.push({ file, message: result.message });
      continue;
    }

    const clash = ids.get(result.team.id);
    if (clash) {
      errors.push({ file, message: `team id "${result.team.id}" is already used by ${clash}` });
      continue;
    }
    ids.set(result.team.id, file);
    teams.push(result.team);
  }

  return { teams, errors };
}

/** Team as sent to the browser: system prompts and mock data stay on the server. */
export function toPublicTeam(team: TeamConfig): PublicTeam {
  return {
    ...team,
    agents: team.agents.map(({ systemPrompt: _s, mockResponse: _m, ...agent }) => agent),
  };
}

export class TeamRegistry {
  private teams = new Map<string, TeamConfig>();

  constructor(private readonly dir: string) {}

  /** (Re)load all team files. Returns the problems found, if any. */
  async load(): Promise<TeamLoadError[]> {
    const { teams, errors } = await loadTeamsFromDir(this.dir);
    this.teams = new Map(teams.map((t) => [t.id, t]));
    return errors;
  }

  list(): TeamConfig[] {
    return [...this.teams.values()];
  }

  get(id: string): TeamConfig | undefined {
    return this.teams.get(id);
  }

  /** Reload when a file in the teams directory changes (development only). */
  watch(onReload: (errors: TeamLoadError[]) => void): () => void {
    let timer: NodeJS.Timeout | undefined;
    const watcher = watch(this.dir, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.load().then(onReload), 200);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }
}
