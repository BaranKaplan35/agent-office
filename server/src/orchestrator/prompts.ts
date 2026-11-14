import type { AgentConfig, Lang, ReportVersion, TeamConfig } from '@agent-office/shared';
import type { ChatMessage, LLMRequest } from '../llm';

const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', tr: 'Turkish' };

export interface ApprovedSource {
  subtaskId: string;
  agent: AgentConfig;
  title: string;
  version: number;
  markdown: string;
}

/** Appended to every report-writing system prompt so team configs stay short. */
function reportRules(lang: Lang): string {
  return `
---
Output rules (from the AgentOffice system):
- Write the entire report in ${LANGUAGE_NAMES[lang]}.
- Use GitHub-flavoured Markdown. Put code in fenced code blocks. Never use raw HTML.
- Begin with one or two plain sentences that summarise the result (no heading before them), then use "##" headings for the sections.
- No greetings, no meta commentary, no questions at the end. If something is unclear, list it under an "Open questions" section.`;
}

function coordinatorOf(team: TeamConfig): AgentConfig {
  const coordinator = team.agents.find((a) => a.type === 'coordinator');
  if (!coordinator) throw new Error(`team "${team.id}" has no coordinator`);
  return coordinator;
}

function sourcesBlock(heading: string, sources: ApprovedSource[], lang: Lang): string {
  if (sources.length === 0) return '';
  const blocks = sources.map(
    (s) =>
      `### ${s.agent.role[lang]} — ${s.agent.name[lang]} (${s.subtaskId}, v${s.version})\n\n${s.markdown}`,
  );
  return `\n\n## ${heading}\n\n${blocks.join('\n\n')}`;
}

export function buildPlanRequest(team: TeamConfig, task: string, lang: Lang): LLMRequest {
  const coordinator = coordinatorOf(team);
  const workers = team.agents.filter((a) => a.type === 'worker');
  const roster = workers
    .map((w) => {
      const usual = w.dependsOn?.length ? w.dependsOn.join(', ') : 'nothing';
      return `- id "${w.id}": ${w.name.en}, ${w.role.en}. Usually builds on: ${usual}.`;
    })
    .join('\n');

  const system = `${coordinator.systemPrompt}
---
You are now PLANNING. Split the user's task into subtasks for your team.

Team members (use these ids exactly):
${roster}

Rules:
- Create at most one subtask per team member. Skip members who are not needed.
- Subtask ids are "sub_1", "sub_2", … in the order you list them.
- "dependsOn" lists the ids of subtasks whose approved output this subtask needs. Follow the usual hand-offs above unless the task clearly needs otherwise. Never create cycles.
- Write "summary", titles and instructions in ${LANGUAGE_NAMES[lang]}. Titles: at most 8 words. Instructions: 2–4 concrete sentences.
- Reply with JSON only, no Markdown fences, exactly in this shape:
{"summary": string, "subtasks": [{"id": string, "assignee": string, "title": string, "instructions": string, "dependsOn": string[]}]}`;

  return {
    system,
    messages: [{ role: 'user', content: task }],
    maxOutputTokens: team.settings.maxOutputTokens,
    json: true,
    meta: { kind: 'plan', team, task, lang },
  };
}

export interface WorkRequestInput {
  team: TeamConfig;
  agent: AgentConfig;
  task: string;
  lang: Lang;
  title: string;
  instructions: string;
  sources: ApprovedSource[];
  /** Present when the user sent the previous version back. */
  revision?: { previous: ReportVersion; note: string };
}

export function buildWorkRequest(input: WorkRequestInput): LLMRequest {
  const { team, agent, task, lang, title, instructions, sources, revision } = input;
  const brief =
    `## Task from the user\n\n${task}\n\n## Your subtask: ${title}\n\n${instructions}` +
    sourcesBlock('Approved work from your teammates', sources, lang);

  const messages: ChatMessage[] = [{ role: 'user', content: brief }];
  if (revision) {
    messages.push(
      { role: 'assistant', content: revision.previous.markdown },
      {
        role: 'user',
        content: `The user reviewed your report (v${revision.previous.version}) and asks for changes:\n\n${revision.note}\n\nReturn the complete revised report, not only the changes. Start with a short summary that says what changed.`,
      },
    );
  }

  return {
    system: agent.systemPrompt + reportRules(lang),
    messages,
    maxOutputTokens: team.settings.maxOutputTokens,
    meta: {
      kind: 'work',
      team,
      agent,
      task,
      lang,
      title,
      instructions,
      basedOn: sources.map((s) => s.agent),
      revision: revision
        ? { note: revision.note, nextVersion: revision.previous.version + 1 }
        : undefined,
    },
  };
}

export interface MergeRequestInput {
  team: TeamConfig;
  task: string;
  lang: Lang;
  sources: ApprovedSource[];
  revision?: { previous: ReportVersion; note: string };
}

export function buildMergeRequest(input: MergeRequestInput): LLMRequest {
  const { team, task, lang, sources, revision } = input;
  const coordinator = coordinatorOf(team);
  const finalTitle = team.finalTitle[lang];

  const system = `${coordinator.systemPrompt}
---
You are now MERGING. Combine the approved reports into one coherent final document titled "${finalTitle}".
- Start the document with "# ${finalTitle}" and a short overview.
- Keep every essential detail (code, tables, materials, numbers). Remove duplication and fix inconsistencies between sections.
- Organise it for the reader, not by team member.${reportRules(lang)}`;

  const brief =
    `## Task from the user\n\n${task}` + sourcesBlock('Approved reports', sources, lang);
  const messages: ChatMessage[] = [{ role: 'user', content: brief }];
  if (revision) {
    messages.push(
      { role: 'assistant', content: revision.previous.markdown },
      {
        role: 'user',
        content: `The user reviewed the final document (v${revision.previous.version}) and asks for changes:\n\n${revision.note}\n\nReturn the complete revised document.`,
      },
    );
  }

  return {
    system,
    messages,
    maxOutputTokens: Math.min(team.settings.maxOutputTokens * 2, 16384),
    meta: {
      kind: 'merge',
      team,
      task,
      lang,
      sources: sources.map((s) => ({ agent: s.agent, markdown: s.markdown })),
      revision: revision
        ? { note: revision.note, nextVersion: revision.previous.version + 1 }
        : undefined,
    },
  };
}
