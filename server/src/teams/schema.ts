import { MAX_WORKERS, MIN_WORKERS, type TeamConfig } from '@agent-office/shared';
import { z } from 'zod';
import { findCycle } from '../lib/graph';

const text = z.string().trim().min(1);
const LocalizedSchema = z.strictObject({ en: text, tr: text });

const IdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,39}$/,
    'must be 1–40 lowercase letters, digits or "-", starting with a letter',
  );

const AgentSchema = z.strictObject({
  id: IdSchema,
  type: z.enum(['coordinator', 'worker']),
  name: LocalizedSchema,
  role: LocalizedSchema,
  icon: z.string().regex(/^[a-z0-9-]+$/, 'must be a lucide icon name such as "book-open"'),
  deskColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex colour such as "#0F766E"'),
  systemPrompt: z.string().trim().min(20, 'is too short (at least 20 characters)'),
  dependsOn: z.array(IdSchema).default([]),
  mockResponse: z.string().optional(),
});

const DEFAULT_SETTINGS = { maxRevisions: 3, maxOutputTokens: 2048 };

const SettingsSchema = z.strictObject({
  maxRevisions: z.number().int().min(0).max(10).default(DEFAULT_SETTINGS.maxRevisions),
  maxOutputTokens: z.number().int().min(256).max(16384).default(DEFAULT_SETTINGS.maxOutputTokens),
});

export const TeamSchema = z
  .strictObject({
    id: IdSchema,
    version: z.number().int().positive(),
    name: LocalizedSchema,
    description: LocalizedSchema,
    taskPlaceholder: LocalizedSchema,
    finalTitle: LocalizedSchema,
    settings: SettingsSchema.default(DEFAULT_SETTINGS),
    agents: z.array(AgentSchema).min(1),
  })
  .superRefine((team, ctx) => {
    const issue = (message: string, path: PropertyKey[] = ['agents']) =>
      ctx.addIssue({ code: 'custom', message, path });

    const coordinators = team.agents.filter((a) => a.type === 'coordinator');
    if (coordinators.length !== 1) {
      issue(`needs exactly one coordinator (found ${coordinators.length})`);
    }

    const workers = team.agents.filter((a) => a.type === 'worker');
    if (workers.length < MIN_WORKERS || workers.length > MAX_WORKERS) {
      issue(`needs ${MIN_WORKERS}–${MAX_WORKERS} workers (found ${workers.length})`);
    }

    const seen = new Set<string>();
    team.agents.forEach((agent, i) => {
      if (seen.has(agent.id)) issue(`duplicate agent id "${agent.id}"`, ['agents', i, 'id']);
      seen.add(agent.id);
    });

    const workerIds = new Set(workers.map((w) => w.id));
    team.agents.forEach((agent, i) => {
      const path = ['agents', i, 'dependsOn'];
      if (agent.type === 'coordinator' && agent.dependsOn.length > 0) {
        issue('a coordinator cannot have dependsOn', path);
      }
      for (const dep of agent.dependsOn) {
        if (dep === agent.id) issue(`"${agent.id}" cannot depend on itself`, path);
        else if (!workerIds.has(dep))
          issue(`"${agent.id}" depends on unknown worker "${dep}"`, path);
      }
    });

    const graph = new Map(
      workers.map((w) => [w.id, w.dependsOn.filter((d) => d !== w.id && workerIds.has(d))]),
    );
    const cycle = findCycle(graph);
    if (cycle) issue(`dependsOn has a cycle: ${[...cycle, cycle[0]].join(' → ')}`);
  });

export type TeamValidation = { ok: true; team: TeamConfig } | { ok: false; message: string };

/** Validate a parsed YAML/JSON object as a team. Error messages name the field. */
export function validateTeam(raw: unknown): TeamValidation {
  const result = TeamSchema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, message };
  }
  const team: TeamConfig = result.data;
  return { ok: true, team };
}
