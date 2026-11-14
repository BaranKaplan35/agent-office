import type { Lang, PlannedSubtask, TeamConfig } from '@agent-office/shared';

export interface PlanDraft {
  summary: string;
  subtasks: PlannedSubtask[];
}

const TEXT: Record<
  Lang,
  { summary: (n: number) => string; instructions: (role: string, task: string) => string }
> = {
  en: {
    summary: (n) =>
      `I split the task into ${n} subtasks, one per teammate, following our usual hand-offs.`,
    instructions: (role, task) =>
      `Deliver the "${role}" part of this request: "${task}". Build on your teammates' approved work where it is relevant, and keep it concrete and ready to use.`,
  },
  tr: {
    summary: (n) =>
      `Görevi her ekip arkadaşına bir tane olmak üzere ${n} alt göreve böldüm, her zamanki iş sırasını izledim.`,
    instructions: (role, task) =>
      `Bu isteğin "${role}" kısmını hazırla: "${task}". Gereken yerlerde ekip arkadaşlarının onaylanmış çalışmalarını temel al; somut ve kullanıma hazır olsun.`,
  },
};

function shorten(text: string, max = 200): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * The plan a team gets when the coordinator's own plan is unusable: one subtask per
 * worker, wired with the `dependsOn` hand-offs from the team config. The mock
 * provider also uses it as the coordinator's answer.
 */
export function defaultPlan(team: TeamConfig, task: string, lang: Lang): PlanDraft {
  const workers = team.agents.filter((a) => a.type === 'worker');
  const subId = new Map(workers.map((w, i) => [w.id, `sub_${i + 1}`]));
  const t = TEXT[lang];

  return {
    summary: t.summary(workers.length),
    subtasks: workers.map((w) => ({
      id: subId.get(w.id) as string,
      assignee: w.id,
      title: w.role[lang],
      instructions: t.instructions(w.role[lang], shorten(task)),
      dependsOn: (w.dependsOn ?? [])
        .map((d) => subId.get(d))
        .filter((d): d is string => d !== undefined),
    })),
  };
}
