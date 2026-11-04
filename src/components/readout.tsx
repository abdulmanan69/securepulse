import type { Finding } from '@/lib/scanner/types';

/**
 * The response-header readout.
 *
 * This is the product thesis rendered literally. A security posture is mostly
 * defined by what a server does NOT send, so the readout lists the headers
 * that should be present and draws the absent ones as ghost rows. A visitor
 * understands the gap without reading a word of explanation.
 */

interface ReadoutRow {
  header: string;
  state: 'present' | 'weak' | 'absent';
  value: string;
}

/** Headers shown in the readout, in the order a response would list them. */
const TRACKED: Array<{ checkId: string; header: string; whenAbsent: string }> = [
  {
    checkId: 'headers.hsts',
    header: 'strict-transport-security',
    whenAbsent: 'not sent — first visit can be downgraded to HTTP',
  },
  {
    checkId: 'headers.csp',
    header: 'content-security-policy',
    whenAbsent: 'not sent — no defence against injected scripts',
  },
  {
    checkId: 'headers.frame_ancestors',
    header: 'x-frame-options',
    whenAbsent: 'not sent — page can be framed for clickjacking',
  },
  {
    checkId: 'headers.x_content_type_options',
    header: 'x-content-type-options',
    whenAbsent: 'not sent — browser may guess the content type',
  },
  {
    checkId: 'headers.referrer_policy',
    header: 'referrer-policy',
    whenAbsent: 'not sent — full URLs leak to other sites',
  },
  {
    checkId: 'headers.permissions_policy',
    header: 'permissions-policy',
    whenAbsent: 'not sent — camera, mic and location unrestricted',
  },
];

function truncate(value: string, max = 58): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function findingsToReadout(findings: Finding[]): ReadoutRow[] {
  return TRACKED.map(({ checkId, header, whenAbsent }) => {
    const finding = findings.find((item) => item.checkId === checkId);

    if (!finding || finding.status === 'fail') {
      return { header, state: 'absent' as const, value: whenAbsent };
    }

    const observed =
      typeof finding.evidence?.header === 'string'
        ? finding.evidence.header
        : ((finding.evidence?.cspFrameAncestors as string | undefined) ??
          (finding.evidence?.xFrameOptions as string | undefined) ??
          'present');

    return {
      header,
      state: finding.status === 'warn' ? ('weak' as const) : ('present' as const),
      value: truncate(observed),
    };
  });
}

/** Illustrative rows for the idle hero, before anyone has scanned anything. */
export const SAMPLE_READOUT: ReadoutRow[] = [
  {
    header: 'strict-transport-security',
    state: 'present',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    header: 'content-security-policy',
    state: 'absent',
    value: 'not sent — no defence against injected scripts',
  },
  { header: 'x-frame-options', state: 'present', value: 'SAMEORIGIN' },
  { header: 'x-content-type-options', state: 'present', value: 'nosniff' },
  { header: 'referrer-policy', state: 'weak', value: 'unsafe-url' },
  {
    header: 'permissions-policy',
    state: 'absent',
    value: 'not sent — camera, mic and location unrestricted',
  },
];

export function Readout({
  rows,
  hostname,
  caption,
}: {
  rows: ReadoutRow[];
  hostname: string;
  caption?: string;
}) {
  const absent = rows.filter((row) => row.state === 'absent').length;

  return (
    <div className="border border-rule bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <p className="truncate font-mono text-[11px] text-slate">
          <span className="text-muted">GET</span> {hostname}
        </p>
        <p className="shrink-0 font-mono text-[11px] text-slate">
          {rows.length - absent}/{rows.length} sent
        </p>
      </div>

      <div className="py-1">
        {rows.map((row, index) => (
          <div
            key={row.header}
            className={`readout-row readout-row--${row.state === 'absent' ? 'missing' : row.state}`}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <span aria-hidden="true" className="select-none">
              {row.state === 'present' ? '✓' : row.state === 'weak' ? '!' : '—'}
            </span>
            <span className="min-w-0">
              <span className={row.state === 'absent' ? '' : 'font-medium'}>
                {row.header}:
              </span>{' '}
              <span className={row.state === 'absent' ? 'italic' : ''}>
                {row.value}
              </span>
            </span>
          </div>
        ))}
      </div>

      {caption ? (
        <p className="border-t border-rule px-3 py-2 text-[12px] text-slate">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
