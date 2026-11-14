import { describe, expect, it } from 'vitest';
import { summarize } from './summarize';

describe('summarize', () => {
  it('takes the first plain paragraph and strips Markdown', () => {
    const md =
      '# Title\n\n> quote\n\nThe **circuit** uses `pin 13` and a [resistor](http://x).\n\n## More';
    expect(summarize(md)).toBe('The circuit uses pin 13 and a resistor.');
  });

  it('skips code blocks, lists and tables', () => {
    const md = '```cpp\nint x;\n```\n\n- item\n\n| a | b |\n\nReal summary here.';
    expect(summarize(md)).toBe('Real summary here.');
  });

  it('shortens long text with an ellipsis', () => {
    const result = summarize('word '.repeat(100), 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns an empty string when there is no prose', () => {
    expect(summarize('## Only a heading')).toBe('');
  });
});
