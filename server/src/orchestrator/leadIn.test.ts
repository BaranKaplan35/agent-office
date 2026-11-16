import { describe, expect, it } from 'vitest';
import { instantMock, scripted, setup, waitFor } from '../test/fixtures';
import { trimLeadIn } from './leadIn';

describe('trimLeadIn', () => {
  it('removes the lead-in words and keeps the summary', () => {
    expect(
      trimLeadIn(
        'Here is a complete Arduino sketch for the traffic light project. It uses pins 2–4.\n\n## Code',
      ),
    ).toBe('A complete Arduino sketch for the traffic light project. It uses pins 2–4.\n\n## Code');
    expect(trimLeadIn("Here's the plan for week one.")).toBe('The plan for week one.');
    expect(trimLeadIn('Here are 3 thumbnail concepts and 5 titles.')).toBe(
      '3 thumbnail concepts and 5 titles.',
    );
    expect(trimLeadIn('Below is the edit plan for the video.')).toBe(
      'The edit plan for the video.',
    );
  });

  it('handles Turkish lead-ins and capitalises with Turkish rules', () => {
    expect(trimLeadIn('İşte uygulamanın teknik mimarisi ve veri modeli.')).toBe(
      'Uygulamanın teknik mimarisi ve veri modeli.',
    );
    expect(trimLeadIn('İşte iki kişilik bir ekip için plan.')).toBe(
      'İki kişilik bir ekip için plan.',
    );
    expect(trimLeadIn('Aşağıda, test stratejisi ve kontrol listesi sunulmaktadır.')).toBe(
      'Test stratejisi ve kontrol listesi sunulmaktadır.',
    );
  });

  it('drops an announcement that says nothing on its own', () => {
    expect(trimLeadIn('Here are the results:\nThe circuit works on the first try.')).toBe(
      'The circuit works on the first try.',
    );
    expect(trimLeadIn('Here is the report:\n\n## Findings\n\nAll good.')).toBe(
      '## Findings\n\nAll good.',
    );
  });

  it('works after the title of the final document', () => {
    expect(trimLeadIn('# Lesson Pack\n\nHere is the complete lesson.\n\n## Plan')).toBe(
      '# Lesson Pack\n\nThe complete lesson.\n\n## Plan',
    );
  });

  it('leaves everything else alone', () => {
    const untouched = [
      'The sketch controls three LEDs.',
      'Hereford cattle are a breed.', // a word that only starts like "here"
      '```cpp\n// Here is the loop\n```',
      '- Here is a list item',
      '| Here is | a table |',
      '# Title\n\n## Section\n\nHere is text in a later paragraph.\n\nMore.',
      '',
    ];
    for (const text of untouched) expect(trimLeadIn(text)).toBe(text);
  });

  it('only touches the first paragraph', () => {
    expect(trimLeadIn('First paragraph.\n\nHere is the second one.')).toBe(
      'First paragraph.\n\nHere is the second one.',
    );
  });
});

describe('Orchestrator — lead-ins', () => {
  it('stores reports without the lead-in, and the queue summary starts with the content', async () => {
    const llm = scripted(instantMock(), (req) =>
      req.meta.kind === 'work' && req.meta.agent.id === 'a'
        ? Promise.resolve({ text: 'Here is the wiring for three LEDs.\n\n## Parts' })
        : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    const task = await waitFor(orchestrator, id, (t) =>
      t.subtasks.some((s) => s.assignee === 'a' && s.versions.length > 0),
    );
    const version = task.subtasks.find((s) => s.assignee === 'a')!.versions[0]!;
    expect(version.markdown).toBe('The wiring for three LEDs.\n\n## Parts');
    expect(version.summary).toBe('The wiring for three LEDs.');
  });
});
