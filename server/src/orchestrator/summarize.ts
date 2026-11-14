/**
 * One-line summary of a Markdown report for the review queue: the first plain
 * paragraph, stripped of Markdown syntax and shortened.
 */
export function summarize(markdown: string, max = 200): string {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');
  const paragraph =
    withoutCode
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^(#|>|\||[-*+] |\d+\. |---)/.test(p)) ?? '';

  const plain = paragraph
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
