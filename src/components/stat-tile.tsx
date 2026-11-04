import type { ReactNode } from 'react';

/**
 * A stat tile, not a chart. Four exact numbers whose value is the number
 * itself; plotting them would add ink without adding information.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'pass' | 'caution' | 'alert';
}) {
  const tones = {
    neutral: 'text-ink',
    pass: 'text-pass',
    caution: 'text-caution',
    alert: 'text-alert',
  } as const;

  return (
    <div className="bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
        {label}
      </p>
      <p
        className={`font-display mt-1.5 text-3xl leading-none font-extrabold tabular-nums ${tones[tone]}`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[12.5px] text-slate">{sub}</p> : null}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  action,
  description,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[17px] font-bold">
          {title}
          {typeof count === 'number' ? (
            <span className="ml-2 font-mono text-[12px] font-normal text-slate">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-0.5 max-w-[62ch] text-[13px] text-slate">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-rule-strong bg-surface p-8 text-center">
      <p className="font-display text-[15px] font-bold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-slate">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
