import { lazy, Suspense } from 'react';

// The Markdown renderer is only needed once a report is opened, so it loads on demand.
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

export function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<pre className="markdown markdown-loading">{text}</pre>}>
      <MarkdownRenderer text={text} />
    </Suspense>
  );
}
