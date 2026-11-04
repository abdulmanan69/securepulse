import type { CheckCategory, Finding } from './types';

/**
 * Turns findings into one number and one letter.
 *
 * Design rules, because a score nobody trusts is worse than no score:
 *
 *  - The denominator is fixed. Every check contributes its `pointsPossible`
 *    whether it passed, failed, or could not be assessed. If an unreachable
 *    site silently shrank the denominator it could out-score a working one.
 *  - Penalties are applied after the weighted total, not inside a category.
 *    A publicly downloadable .env is not a "category" problem, and must sink
 *    the grade no matter how tidy the rest of the configuration is.
 *  - Scores are comparable across scans and across sites. That is what makes
 *    the trend line and the regression alert meaningful.
 */

export const CATEGORY_LABELS: Record<CheckCategory, string> = {
  transport: 'Encryption & certificates',
  headers: 'Security headers',
  cookies: 'Cookies',
  disclosure: 'Information disclosure',
  content: 'Page content',
  email_dns: 'Email & DNS',
  policy: 'Disclosure policy',
  exposure: 'Exposed files',
};

export interface CategoryScore {
  category: CheckCategory;
  label: string;
  earned: number;
  possible: number;
  /** 0-100 within this category, or null when the category is not scored. */
  percent: number | null;
}

export interface ScoreResult {
  score: number;
  grade: string;
  categories: CategoryScore[];
  passCount: number;
  warnCount: number;
  failCount: number;
  penaltyApplied: number;
}

/**
 * Grade boundaries. A+ is reserved: it requires a clean sweep, so it stays
 * worth putting on a report.
 */
export function gradeFor(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function scoreFindings(findings: Finding[]): ScoreResult {
  const byCategory = new Map<CheckCategory, { earned: number; possible: number }>();

  let earned = 0;
  let possible = 0;
  let penaltyApplied = 0;

  for (const finding of findings) {
    earned += finding.pointsEarned;
    possible += finding.pointsPossible;
    penaltyApplied += finding.penalty ?? 0;

    const current = byCategory.get(finding.category) ?? { earned: 0, possible: 0 };
    current.earned += finding.pointsEarned;
    current.possible += finding.pointsPossible;
    byCategory.set(finding.category, current);
  }

  // Guard against a configuration with no scored checks at all, which would
  // otherwise divide by zero and report a meaningless 0.
  const weighted = possible > 0 ? (earned / possible) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(weighted - penaltyApplied)));

  const categories: CategoryScore[] = [...byCategory.entries()].map(
    ([category, totals]) => ({
      category,
      label: CATEGORY_LABELS[category],
      earned: totals.earned,
      possible: totals.possible,
      percent:
        totals.possible > 0
          ? Math.round((totals.earned / totals.possible) * 100)
          : null,
    }),
  );

  return {
    score,
    grade: gradeFor(score),
    categories,
    passCount: findings.filter((f) => f.status === 'pass').length,
    warnCount: findings.filter((f) => f.status === 'warn').length,
    failCount: findings.filter((f) => f.status === 'fail').length,
    penaltyApplied,
  };
}

/** Order used everywhere findings are listed: worst first. */
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
const STATUS_ORDER = ['fail', 'warn', 'info', 'pass'] as const;

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const statusDelta =
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (statusDelta !== 0) return statusDelta;
    const severityDelta =
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (severityDelta !== 0) return severityDelta;
    return a.checkId.localeCompare(b.checkId);
  });
}
