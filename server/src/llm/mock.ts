import type { AgentConfig, Lang } from '@agent-office/shared';
import { defaultPlan } from '../teams/defaultPlan';
import type { LLMCallMeta, LLMProvider, LLMRequest, LLMResponse } from './types';

export interface MockOptions {
  /** Each answer waits a random time in [minDelayMs, maxDelayMs] to feel like work. */
  minDelayMs: number;
  maxDelayMs: number;
  /**
   * Added before a plan or a first work report: in the office the agent first walks
   * to the desk and sits down, and the "work" only starts then. Revisions and the
   * merge happen at the desk already, so they don't wait.
   */
  walkInMs?: number;
  random?: () => number;
}

/** Calls whose agent may still be on the way to the desk. */
export function needsWalkIn(meta: LLMCallMeta): boolean {
  if (meta.kind === 'plan') return meta.clarifications.length === 0;
  return meta.kind === 'work' && !meta.revision;
}

/** Messages that are small talk, not a task, in either language. */
const SMALL_TALK = new Set(
  (
    'hi hello hey yo hiya howdy sup ok okay thanks thank you test testing ping help good ' +
    'morning evening how are what up there everyone team all selam selamlar slm merhaba ' +
    'merhabalar mrb sa as naber nasılsın nasilsin günaydın gunaydin iyi akşamlar aksamlar ' +
    'teşekkürler tamam deneme yardım yardim kolay gelsin '
  )
    .trim()
    .split(' '),
);

/**
 * The mock coordinator's stand-in for judgement (pure): a message needs details
 * when it is only small talk or too short to be a task ("selam", "hi there",
 * "logo"). A real model decides this itself from the plan prompt.
 */
export function needsDetails(text: string): boolean {
  const words = text
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  if (words.every((w) => SMALL_TALK.has(w))) return true;
  return words.length === 1 && words[0]!.length < 12;
}

function clarification(meta: Extract<LLMCallMeta, { kind: 'plan' }>): string {
  const t = T[meta.lang];
  const lead = meta.team.agents.find((a) => a.type === 'coordinator');
  const name = lead?.name[meta.lang] ?? '';
  const first = meta.clarifications.length === 0;
  return JSON.stringify({
    action: 'clarify',
    reply: first ? t.clarifyReply(name) : t.clarifyAgain,
    questions: first ? t.clarifyQuestions : t.clarifyQuestions.slice(0, 1),
    summary: '',
    subtasks: [],
  });
}

const T = {
  en: {
    summary: (agent: string, role: string, title: string) =>
      `${agent} (${role}) prepared “${title}”. This is a mock report, generated without an AI model so the whole workflow can be tried for free.`,
    revised: (v: number, note: string) =>
      `Revised version ${v}, updated after your note: “${note}”.`,
    changes: 'Changes in this revision',
    changesBody: (note: string) => `- Addressed the review note: “${note}”`,
    approach: 'Approach',
    approachRead: 'Read the task and the brief from the coordinator.',
    approachBuilt: (names: string) => `Built on the approved work of ${names}.`,
    approachKeep: 'Kept the result short, concrete and ready to use.',
    deliverable: 'Deliverable',
    table: ['#', 'Item', 'Notes'],
    row: (i: number, title: string) => [`${title} — part ${i}`, 'Mock content, real in phase 2'],
    questions: 'Open questions',
    question: 'Which constraint (time, budget or audience) matters most for the next revision?',
    finalIntro: (task: string, n: number) =>
      `Final package for “${task}”, combining ${n} approved reports from the team.`,
    clarifyReply: (name: string) =>
      `Hi! I'm ${name}, the coordinator. Before I split the work, I need a little more to go on.`,
    clarifyAgain:
      "Thanks! I still can't tell what the team should make — a sentence about the result is enough.",
    clarifyQuestions: [
      'What should the team produce?',
      'Who is it for, and how will it be used?',
      'Any limits on time, budget or tools?',
    ],
  },
  tr: {
    summary: (agent: string, role: string, title: string) =>
      `${agent} (${role}) “${title}” çalışmasını hazırladı. Bu bir sahte (mock) rapordur; tüm iş akışı ücretsiz denenebilsin diye yapay zekâ modeli olmadan üretildi.`,
    revised: (v: number, note: string) =>
      `Revize edilmiş ${v}. versiyon; notuna göre güncellendi: “${note}”.`,
    changes: 'Bu revizyondaki değişiklikler',
    changesBody: (note: string) => `- İnceleme notu ele alındı: “${note}”`,
    approach: 'Yaklaşım',
    approachRead: 'Görevi ve koordinatörün yönergesini okudum.',
    approachBuilt: (names: string) => `${names} tarafından onaylanan çalışmaları temel aldım.`,
    approachKeep: 'Sonucu kısa, somut ve kullanıma hazır tuttum.',
    deliverable: 'Çıktı',
    table: ['#', 'Kalem', 'Not'],
    row: (i: number, title: string) => [`${title} — bölüm ${i}`, 'Sahte içerik, 2. aşamada gerçek'],
    questions: 'Açık sorular',
    question: 'Bir sonraki revizyonda hangi kısıt (süre, bütçe ya da hedef kitle) daha önemli?',
    finalIntro: (task: string, n: number) =>
      `“${task}” için final paket; ekipten onaylanan ${n} raporu bir araya getirir.`,
    clarifyReply: (name: string) =>
      `Merhaba! Ben ${name}, koordinatörüm. İşi bölüştürmeden önce biraz daha bilgiye ihtiyacım var.`,
    clarifyAgain:
      'Teşekkürler! Ekibin ne hazırlaması gerektiğini hâlâ anlayamadım; sonucu anlatan bir cümle yeterli.',
    clarifyQuestions: [
      'Ekip ne hazırlamalı?',
      'Kimin için ve nasıl kullanılacak?',
      'Süre, bütçe ya da araçlarla ilgili bir sınır var mı?',
    ],
  },
} satisfies Record<Lang, unknown>;

function shorten(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5}) /gm, '#$1 ');
}

function workReport(meta: Extract<LLMCallMeta, { kind: 'work' }>): string {
  const t = T[meta.lang];
  const { agent, lang } = meta;
  const name = agent.name[lang];
  const role = agent.role[lang];
  const parts: string[] = [];

  if (meta.revision) {
    parts.push(t.revised(meta.revision.nextVersion, meta.revision.note));
    parts.push(`## ${t.changes}\n\n${t.changesBody(meta.revision.note)}`);
  } else {
    parts.push(t.summary(name, role, meta.title));
  }

  if (agent.mockResponse) {
    parts.push(agent.mockResponse.replaceAll('{{task}}', shorten(meta.task)).trim());
    return parts.join('\n\n');
  }

  const approach = [t.approachRead];
  if (meta.basedOn.length > 0) {
    approach.push(t.approachBuilt(meta.basedOn.map((a: AgentConfig) => a.name[lang]).join(', ')));
  }
  approach.push(t.approachKeep);
  parts.push(`## ${t.approach}\n\n${approach.map((a) => `- ${a}`).join('\n')}`);

  const [h1, h2, h3] = t.table;
  const rows = [1, 2, 3].map((i) => {
    const [item, note] = t.row(i, meta.title);
    return `| ${i} | ${item} | ${note} |`;
  });
  parts.push(
    `## ${t.deliverable}\n\n> ${shorten(meta.instructions, 300)}\n\n| ${h1} | ${h2} | ${h3} |\n|---|---|---|\n${rows.join('\n')}`,
  );
  parts.push(`## ${t.questions}\n\n- ${t.question}`);
  return parts.join('\n\n');
}

function mergeReport(meta: Extract<LLMCallMeta, { kind: 'merge' }>): string {
  const t = T[meta.lang];
  const lines = [
    `# ${meta.team.finalTitle[meta.lang]}`,
    t.finalIntro(shorten(meta.task), meta.sources.length),
  ];
  if (meta.revision) lines.push(`> ${t.revised(meta.revision.nextVersion, meta.revision.note)}`);
  for (const { agent, markdown } of meta.sources) {
    lines.push(
      `## ${agent.role[meta.lang]} · ${agent.name[meta.lang]}\n\n${demoteHeadings(markdown)}`,
    );
  }
  return lines.join('\n\n');
}

function answer(meta: LLMCallMeta): string {
  switch (meta.kind) {
    case 'plan': {
      const latest = meta.clarifications.at(-1)?.answer ?? meta.task;
      if (meta.canAsk && needsDetails(latest)) return clarification(meta);
      const request = [meta.task, ...meta.clarifications.map((c) => c.answer)].join(' — ');
      return JSON.stringify({ action: 'plan', ...defaultPlan(meta.team, request, meta.lang) });
    }
    case 'work':
      return workReport(meta);
    case 'merge':
      return mergeReport(meta);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** A provider that needs no network or API key. The default in development and tests. */
export function createMockProvider(options: MockOptions): LLMProvider {
  const random = options.random ?? Math.random;
  return {
    name: 'mock',
    async generate(request: LLMRequest): Promise<LLMResponse> {
      const { minDelayMs: min, maxDelayMs: max } = options;
      const walkIn = needsWalkIn(request.meta) ? (options.walkInMs ?? 0) : 0;
      const delay = walkIn + min + Math.round(random() * Math.max(0, max - min));
      if (delay > 0) await sleep(delay, request.signal);
      else if (request.signal?.aborted) throw request.signal.reason;

      const text = answer(request.meta);
      const input = request.system + request.messages.map((m) => m.content).join('\n');
      return {
        text,
        usage: { inputTokens: estimateTokens(input), outputTokens: estimateTokens(text) },
      };
    },
  };
}
