import type { CallMetrics, Task } from '@agent-office/shared';
import { describe, expect, it } from 'vitest';
import { formatDuration, formatTokens, modelLabel, taskCalls, taskTotals } from './metrics';

const call = (
  provider: CallMetrics['provider'],
  model: string,
  durationMs: number,
  usage?: [number, number],
): CallMetrics => ({
  provider,
  model,
  durationMs,
  ...(usage ? { usage: { inputTokens: usage[0], outputTokens: usage[1] } } : {}),
});

const version = (n: number, metrics?: CallMetrics) => ({
  version: n,
  markdown: 'x',
  summary: 'x',
  createdAt: '',
  ...(metrics ? { metrics } : {}),
});

const task = (): Task => ({
  id: 't',
  teamId: 't',
  prompt: 'p',
  lang: 'en',
  status: 'awaiting_final_review',
  clarifications: [],
  planCalls: [call('gemini', 'flash', 2000, [100, 50])],
  subtasks: [
    {
      id: 'sub_1',
      assignee: 'a',
      title: 'A',
      instructions: '',
      dependsOn: [],
      status: 'approved',
      versions: [
        version(1, call('gemini', 'flash', 3000, [200, 400])),
        version(2, call('gemini', 'flash', 1000, [300, 100])),
      ],
    },
    {
      id: 'sub_2',
      assignee: 'b',
      title: 'B',
      instructions: '',
      dependsOn: [],
      status: 'approved',
      versions: [version(1, call('ollama', 'qwen3.5:9b', 45_000)), version(2)],
    },
  ],
  final: {
    status: 'awaiting_review',
    versions: [version(1, call('gemini', 'flash', 5000, [1, 2]))],
  },
  messages: [],
  createdAt: '',
  updatedAt: '',
});

describe('modelLabel', () => {
  it('names provider and model, and keeps mock short', () => {
    expect(modelLabel({ provider: 'ollama', model: 'qwen3.5:9b' })).toBe('ollama · qwen3.5:9b');
    expect(modelLabel({ provider: 'mock', model: 'mock' })).toBe('mock');
  });
});

describe('formatting', () => {
  it('formats tokens compactly per language', () => {
    expect(formatTokens(850, 'en')).toBe('850');
    expect(formatTokens(1234, 'en')).toBe('1.2K');
    expect(formatTokens(1234, 'tr')).toMatch(/^1,2\sB$/);
    expect(formatTokens(48_000, 'en')).toBe('48K');
  });

  it('formats durations from tenths of a second to minutes', () => {
    expect(formatDuration(430, 'en')).toBe('0.4s');
    expect(formatDuration(4321, 'en')).toBe('4.3s');
    expect(formatDuration(42_400, 'en')).toBe('42s');
    expect(formatDuration(125_000, 'en')).toBe('2m 5s');
    expect(formatDuration(120_000, 'en')).toBe('2m');
    expect(formatDuration(4321, 'tr')).toMatch(/^4,3\s?sn$/);
    expect(formatDuration(73_000, 'tr')).toMatch(/^1\s?dk 13\s?sn$/);
  });
});

describe('taskTotals', () => {
  it('adds planning, every report version and the final, per model', () => {
    expect(taskCalls(task())).toHaveLength(5); // the version without metrics is skipped
    const { rows, total } = taskTotals(task());
    expect(rows).toEqual([
      {
        provider: 'gemini',
        model: 'flash',
        calls: 4,
        inputTokens: 601,
        outputTokens: 552,
        durationMs: 11_000,
        uncounted: 0,
      },
      {
        provider: 'ollama',
        model: 'qwen3.5:9b',
        calls: 1,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 45_000,
        uncounted: 1,
      },
    ]);
    expect(total).toEqual({
      calls: 5,
      inputTokens: 601,
      outputTokens: 552,
      durationMs: 56_000,
      uncounted: 1,
    });
  });

  it('is empty without a task', () => {
    expect(taskTotals(null).rows).toEqual([]);
  });
});
