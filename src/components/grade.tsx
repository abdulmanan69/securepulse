import type { FindingStatus, Severity } from '@/lib/scanner/types';

/**
 * Grade and status display.
 *
 * Status is never carried by colour alone: every badge pairs its colour with a
 * word and a shape. That is a baseline accessibility requirement, and it also
 * means the report survives being printed in greyscale for a client, which is
 * exactly what agencies do with it.
 */

const GRADE_TONES: Record<string, string> = {
  'A+': 'border-pass bg-pass text-white',
  A: 'border-pass bg-pass text-white',
  B: 'border-pass/50 bg-pass-soft text-pass',
  C: 'border-caution/50 bg-caution-soft text-caution',
  D: 'border-alert/40 bg-alert-soft text-alert',
  F: 'border-alert bg-alert text-white',
};

export function GradeBadge({
  grade,
  size = 'md',
}: {
  grade: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-12 w-12 text-xl',
    lg: 'h-20 w-20 text-4xl',
    xl: 'h-28 w-28 text-6xl',
  } as const;

  return (
    <span
      className={`font-display inline-flex shrink-0 items-center justify-center border-2 font-extrabold tabular-nums ${sizes[size]} ${GRADE_TONES[grade] ?? GRADE_TONES.F}`}
      aria-label={`Grade ${grade}`}
    >
      {grade}
    </span>
  );
}

const STATUS_META: Record<
  FindingStatus,
  { label: string; mark: string; className: string }
> = {
  pass: { label: 'Pass', mark: '✓', className: 'text-pass bg-pass-soft border-pass/30' },
  warn: { label: 'Warn', mark: '!', className: 'text-caution bg-caution-soft border-caution/30' },
  fail: { label: 'Fail', mark: '✕', className: 'text-alert bg-alert-soft border-alert/30' },
  info: { label: 'Info', mark: 'i', className: 'text-slate bg-paper border-rule-strong' },
};

export function StatusTag({ status }: { status: FindingStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${meta.className}`}
    >
      <span aria-hidden="true">{meta.mark}</span>
      {meta.label}
    </span>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export function SeverityTag({ severity }: { severity: Severity }) {
  if (severity === 'info') return null;
  const tone =
    severity === 'critical' || severity === 'high'
      ? 'text-alert border-alert/30'
      : severity === 'medium'
        ? 'text-caution border-caution/30'
        : 'text-slate border-rule-strong';

  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${tone}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/**
 * Category breakdown. A precise table rather than a chart: these are eight
 * exact fractions out of a fixed 100, and the numbers themselves are the
 * point. The rule underneath is proportional so the shape is readable at a
 * glance without pretending to be a data visualisation.
 */
export function CategoryTable({
  categories,
}: {
  categories: Array<{ label: string; earned: number; possible: number; percent: number | null }>;
}) {
  const scored = categories.filter((category) => category.possible > 0);

  return (
    <dl className="divide-y divide-rule">
      {scored.map((category) => (
        <div key={category.label} className="py-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[13px] text-ink">{category.label}</dt>
            <dd className="font-mono text-[13px] tabular-nums text-slate">
              {category.earned}
              <span className="text-muted">/{category.possible}</span>
            </dd>
          </div>
          <div className="mt-1.5 h-[3px] w-full bg-rule" aria-hidden="true">
            <div
              className={
                (category.percent ?? 0) >= 90
                  ? 'h-full bg-pass'
                  : (category.percent ?? 0) >= 60
                    ? 'h-full bg-caution'
                    : 'h-full bg-alert'
              }
              style={{ width: `${category.percent ?? 0}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}
