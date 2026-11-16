/**
 * Keeps tasks across server restarts in one JSON file (`data/tasks.json` by default).
 * Writes are atomic (temp file + rename), so a crash mid-write never leaves a broken
 * file; a file that can't be read is moved aside and the server starts empty.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Task, TeamConfig } from '@agent-office/shared';

/** Everything needed to continue a task: the task, the team as it was, and runtime notes. */
export interface PersistedTask {
  task: Task;
  /** The team snapshot taken when the task was created (a later YAML edit can't change it). */
  team: TeamConfig;
  messageSeq: number;
  /** Note of the last attempt per subtask (null = first attempt), for "Retry". */
  lastNotes: Record<string, string | null>;
  lastFinalNote: string | null;
}

export interface TaskPersistence {
  load(): PersistedTask[];
  save(records: PersistedTask[]): void;
}

interface FileShape {
  version: 1;
  savedAt: string;
  tasks: PersistedTask[];
}

const looksLikeRecord = (value: unknown): value is PersistedTask => {
  const r = value as PersistedTask;
  return (
    !!r &&
    typeof r === 'object' &&
    typeof r.task?.id === 'string' &&
    Array.isArray(r.task.messages) &&
    Array.isArray(r.team?.agents) &&
    typeof r.messageSeq === 'number'
  );
};

export function createJsonTaskStore(
  file: string,
  log: (message: string) => void = (m) => console.warn(m),
): TaskPersistence {
  return {
    load() {
      if (!existsSync(file)) return [];
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<FileShape>;
        if (data.version !== 1 || !Array.isArray(data.tasks)) throw new Error('unknown format');
        const records = data.tasks.filter(looksLikeRecord);
        if (records.length < data.tasks.length) {
          log(`⚠ ${data.tasks.length - records.length} unreadable task(s) in ${file} were skipped`);
        }
        return records;
      } catch (err) {
        const aside = `${file}.unreadable-${Date.now()}.json`;
        try {
          renameSync(file, aside);
        } catch {
          // Leave it; the next save overwrites it.
        }
        log(`⚠ Could not read saved tasks (${(err as Error).message}); moved to ${aside}`);
        return [];
      }
    },
    save(records) {
      const body: FileShape = { version: 1, savedAt: new Date().toISOString(), tasks: records };
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(body));
      renameSync(tmp, file);
    },
  };
}

/** Message for work that a restart cut off; the usual "Try again" continues it. */
export const INTERRUPTED = 'Interrupted by a server restart. Try again to continue.';
