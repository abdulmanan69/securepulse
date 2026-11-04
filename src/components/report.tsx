import { CategoryTable, GradeBadge, SeverityTag, StatusTag } from '@/components/grade';
import type { Finding as FindingRow } from '@/lib/db/schema';
import type { CategoryScore } from '@/lib/scanner/score';

/**
 * The report body, shared by the dashboard view, the print view and the
 * shareable link. One component means the client-facing PDF cannot drift away
 * from what the customer saw on screen.
 */

function EvidenceBlock({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );
  if (entries.length === 0) return null;

  return (
    <dl className="mt-3 border border-rule bg-paper p-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-x-2 py-0.5 font-mono text-[11px]">
          <dt className="text-slate">{key}:</dt>
          <dd className="min-w-0 break-all">
            {typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function FindingCard({ finding }: { finding: FindingRow }) {
  return (
    <li className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag status={finding.status} />
        <SeverityTag severity={finding.severity} />
        <span className="ml-auto font-mono text-[11px] text-slate">
          {finding.checkId}
        </span>
      </div>

      <h3 className="mt-3 text-[15px] font-semibold">{finding.title}</h3>
      <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-slate">
        {finding.detail}
      </p>

      {finding.remediation ? (
        <div className="mt-3 border-l-2 border-signal bg-signal-soft/50 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            How to fix it
          </p>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed">
            {finding.remediation}
          </p>
        </div>
      ) : null}

      {finding.evidence ? <EvidenceBlock evidence={finding.evidence} /> : null}
    </li>
  );
}

export function ReportHeader({
  hostname,
  grade,
  score,
  scannedAt,
  passCount,
  warnCount,
  failCount,
  durationMs,
}: {
  hostname: string;
  grade: string;
  score: number;
  scannedAt: Date;
  passCount: number;
  warnCount: number;
  failCount: number;
  durationMs: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-6 border border-rule bg-surface p-6">
      <GradeBadge grade={grade} size="xl" />
      <div className="min-w-0">
        <p className="font-mono text-[13px] text-slate">{hostname}</p>
        <p className="font-display text-4xl font-extrabold">
          {score}
          <span className="text-slate">/100</span>
        </p>
        <p className="mt-1 text-[14px] text-slate">
          {passCount} passed · {warnCount} need attention · {failCount} failed
        </p>
        <p className="mt-2 font-mono text-[11px] text-slate">
          {scannedAt.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
        </p>
      </div>
    </div>
  );
}

export function ReportBody({
  findings,
  categories,
  summary,
  summaryNote,
}: {
  findings: FindingRow[];
  categories: CategoryScore[];
  summary?: string | null;
  summaryNote?: string | null;
}) {
  const needsWork = findings.filter(
    (finding) => finding.status === 'fail' || finding.status === 'warn',
  );
  const passing = findings.filter((finding) => finding.status === 'pass');
  const informational = findings.filter((finding) => finding.status === 'info');

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
      <div className="order-2 lg:order-1">
        {summary ? (
          <section className="border border-rule bg-surface p-6">
            <h2 className="font-display text-lg font-bold">What to do about it</h2>
            <div className="prose-report mt-3 max-w-[70ch] text-[14px]">
              <SummaryMarkdown markdown={summary} />
            </div>
            {summaryNote ? (
              <p className="mt-3 font-mono text-[11px] text-slate">{summaryNote}</p>
            ) : null}
          </section>
        ) : null}

        {needsWork.length > 0 ? (
          <section className={summary ? 'mt-6' : ''}>
            <h2 className="font-display text-lg font-bold">
              Findings ({needsWork.length})
            </h2>
            <ul className="mt-3 divide-y divide-rule border border-rule bg-surface">
              {needsWork.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </ul>
          </section>
        ) : null}

        {passing.length > 0 ? (
          <section className="mt-6">
            <h2 className="font-display text-lg font-bold">
              Passing ({passing.length})
            </h2>
            <ul className="mt-3 divide-y divide-rule border border-rule bg-surface">
              {passing.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </ul>
          </section>
        ) : null}

        {informational.length > 0 ? (
          <section className="mt-6">
            <ul className="divide-y divide-rule border border-rule bg-surface">
              {informational.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="order-1 border border-rule bg-surface p-5 lg:order-2 lg:sticky lg:top-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Score breakdown
        </h2>
        <div className="mt-3">
          <CategoryTable categories={categories} />
        </div>
      </aside>
    </div>
  );
}

/**
 * Minimal Markdown renderer for the AI summary.
 *
 * Deliberately not a Markdown library and deliberately never
 * dangerouslySetInnerHTML. This text is model-generated, which means it is
 * untrusted input as far as the browser is concerned. Parsing a small known
 * subset into React elements makes script injection structurally impossible
 * rather than something we have to sanitise our way out of.
 *
 * Supported: ## headings, ordered and unordered lists, paragraphs, **bold**
 * and `code`. Anything else renders as plain text, which is a safe failure.
 */
function renderInline(text: string, keyPrefix: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${index}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<code key={`${keyPrefix}-c${index}`}>{token.slice(1, -1)}</code>);
    }
    lastIndex = match.index + token.length;
    index += 1;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function SummaryMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const blocks: React.ReactNode[] = [];

  let listItems: string[] = [];
  let listOrdered = false;
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, index) => (
      <li key={index}>{renderInline(item, `li${blocks.length}-${index}`)}</li>
    ));
    blocks.push(
      listOrdered ? (
        <ol key={`block-${blocks.length}`}>{items}</ol>
      ) : (
        <ul key={`block-${blocks.length}`}>{items}</ul>
      ),
    );
    listItems = [];
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(
      <p key={`block-${blocks.length}`}>{renderInline(text, `p${blocks.length}`)}</p>,
    );
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{2,3}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`block-${blocks.length}`}>
          {renderInline(heading[1], `h${blocks.length}`)}
        </h2>,
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (!listOrdered) flushList();
      listOrdered = true;
      listItems.push(ordered[1]);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <>{blocks}</>;
}
