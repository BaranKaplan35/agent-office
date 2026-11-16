/**
 * Small models often open a report with a chatty lead-in ("Here is a complete
 * sketch …", "İşte uygulamanın mimarisi …") even when the rules say not to. This
 * removes just those words from the first paragraph and keeps the rest of the
 * sentence, which usually carries the actual summary:
 *
 *   "Here is a complete Arduino sketch for the traffic light." → "A complete Arduino sketch …"
 *   "İşte öğrenciler için tasarlanan mimari." → "Öğrenciler için tasarlanan mimari."
 *
 * Only the first paragraph that isn't a heading is touched (after the "# Title" of
 * the final document); code, lists and tables never are.
 */
// Turkish letters are spelled out: JS `\b` and the `i` flag don't know "İ" or "ş".
const LEAD_IN =
  /^(?:[Hh]ere\s+(?:is|are)|[Hh]ere['’]s|[Bb]elow\s+(?:is|are|you\s+will\s+find)|[İIi]şte|[Aa]şağıda)(?=[\s,:]|$)[\s,:]*/;

/** Sentences that are nothing but an announcement, e.g. "Here are the results:". */
const ANNOUNCEMENT_ONLY = /^[^.!?\n]{0,40}:$/;

function capitalizeFirst(text: string): string {
  const first = text.charAt(0);
  return first.toLocaleUpperCase(/[ıiğüşöç]/.test(first) ? 'tr' : 'en') + text.slice(1);
}

export function trimLeadIn(markdown: string): string {
  const paragraphs = markdown.split(/(\n\s*\n)/);
  // Even indexes are paragraphs, odd ones the blank lines between them.
  const content = paragraphs.flatMap((p, i) => (i % 2 === 0 && p.trim() ? [i] : []));
  // The opening paragraph, or the one right after a leading "# Title".
  let index = content[0];
  if (index !== undefined && /^\s*#\s/.test(paragraphs[index] as string)) index = content[1];
  if (index === undefined || /^\s*#/.test(paragraphs[index] as string)) return markdown;

  const paragraph = paragraphs[index] as string;
  const leading = paragraph.match(/^\s*/)?.[0] ?? '';
  const body = paragraph.slice(leading.length);
  // Never touch code, lists, tables, quotes or HTML-ish blocks.
  if (/^(```|[-*+] |\d+\. |\||>|<)/.test(body)) return markdown;

  const match = LEAD_IN.exec(body);
  if (!match) return markdown;
  let rest = body.slice(match[0].length);

  // "Here are the results:\nThe sketch …" → drop the announcement line entirely.
  const firstLine = rest.split('\n', 1)[0] ?? '';
  if (ANNOUNCEMENT_ONLY.test(firstLine.trim())) {
    rest = rest.slice(firstLine.length).replace(/^\s+/, '');
  }
  if (!rest.trim()) {
    paragraphs.splice(index, 2);
    return paragraphs.join('').trim();
  }
  paragraphs[index] = leading + capitalizeFirst(rest);
  return paragraphs.join('');
}
