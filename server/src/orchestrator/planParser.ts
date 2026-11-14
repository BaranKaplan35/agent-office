import type { PlannedSubtask, TeamConfig } from '@agent-office/shared';
import { z } from 'zod';
import { findCycle } from '../lib/graph';
import type { PlanDraft } from '../teams/defaultPlan';

export class PlanParseError extends Error {
  override name = 'PlanParseError';
}

const RawPlanSchema = z.object({
  summary: z.string().default(''),
  subtasks: z
    .array(
      z.object({
        id: z.string().optional(),
        assignee: z.string(),
        title: z.string().trim().min(1),
        instructions: z.string().default(''),
        dependsOn: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

/** Pull a JSON object out of a model answer, tolerating ``` fences and chatter around it. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new PlanParseError('no JSON object in the answer');
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch (err) {
    throw new PlanParseError(`invalid JSON: ${(err as Error).message}`);
  }
}

/**
 * Turn the coordinator's answer into a safe plan:
 * - only real workers can be assignees (one subtask each; duplicates are merged),
 * - ids are renumbered sub_1…sub_n,
 * - unknown/self dependencies are dropped and cycles are broken.
 * Throws PlanParseError when nothing usable is left.
 */
export function parsePlan(text: string, team: TeamConfig): PlanDraft {
  const parsed = RawPlanSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new PlanParseError(`plan has the wrong shape: ${parsed.error.issues[0]?.message}`);
  }

  const workers = new Set(team.agents.filter((a) => a.type === 'worker').map((a) => a.id));
  const byAssignee = new Map<
    string,
    { rawIds: string[]; sub: PlannedSubtask; rawDeps: string[] }
  >();

  parsed.data.subtasks.forEach((raw, index) => {
    if (!workers.has(raw.assignee)) return;
    const rawId = raw.id?.trim() || `sub_${index + 1}`;
    const existing = byAssignee.get(raw.assignee);
    if (existing) {
      existing.rawIds.push(rawId);
      existing.sub.instructions =
        `${existing.sub.instructions}\n\n${raw.title}: ${raw.instructions}`.trim();
      existing.rawDeps.push(...raw.dependsOn);
      return;
    }
    byAssignee.set(raw.assignee, {
      rawIds: [rawId],
      rawDeps: [...raw.dependsOn],
      sub: {
        id: '',
        assignee: raw.assignee,
        title: raw.title,
        instructions: raw.instructions.trim() || raw.title,
        dependsOn: [],
      },
    });
  });

  const entries = [...byAssignee.values()];
  if (entries.length === 0) throw new PlanParseError('plan assigns no known team member');

  // Renumber, then translate dependencies through the old → new id map.
  const idMap = new Map<string, string>();
  entries.forEach((entry, i) => {
    entry.sub.id = `sub_${i + 1}`;
    for (const rawId of entry.rawIds) idMap.set(rawId, entry.sub.id);
  });
  for (const entry of entries) {
    const deps = new Set(
      entry.rawDeps.map((d) => idMap.get(d)).filter((d): d is string => !!d && d !== entry.sub.id),
    );
    entry.sub.dependsOn = [...deps];
  }

  // Break cycles by dropping one edge at a time.
  const graph = new Map(entries.map((e) => [e.sub.id, e.sub.dependsOn]));
  for (let cycle = findCycle(graph); cycle; cycle = findCycle(graph)) {
    const from = cycle[cycle.length - 1] as string;
    const to = cycle[0] as string;
    graph.set(
      from,
      (graph.get(from) ?? []).filter((d) => d !== to),
    );
  }
  for (const entry of entries) entry.sub.dependsOn = graph.get(entry.sub.id) ?? [];

  return { summary: parsed.data.summary.trim(), subtasks: entries.map((e) => e.sub) };
}
