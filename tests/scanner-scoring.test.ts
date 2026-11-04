import { describe, expect, it } from 'vitest';

import { evaluate } from '@/lib/scanner/engine';
import { gradeFor } from '@/lib/scanner/score';
import { perfectEvidence, terribleEvidence } from './helpers/evidence';

describe('gradeFor', () => {
  it('maps scores to the documented boundaries', () => {
    expect(gradeFor(100)).toBe('A+');
    expect(gradeFor(97)).toBe('A+');
    expect(gradeFor(96)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89)).toBe('B');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(79)).toBe('C');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(69)).toBe('D');
    expect(gradeFor(60)).toBe('D');
    expect(gradeFor(59)).toBe('F');
    expect(gradeFor(0)).toBe('F');
  });
});

describe('evaluate', () => {
  it('gives a fully hardened site a perfect score', () => {
    const result = evaluate(perfectEvidence());
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A+');
    expect(result.failCount).toBe(0);
    expect(result.warnCount).toBe(0);
  });

  it('fails a site that is unreachable over HTTPS', () => {
    const result = evaluate(terribleEvidence());
    expect(result.grade).toBe('F');
    expect(result.score).toBeLessThan(20);
    expect(result.failCount).toBeGreaterThan(5);
  });

  it('keeps the denominator fixed so an unreachable site cannot out-score a working one', () => {
    const working = evaluate(perfectEvidence());
    const broken = evaluate(terribleEvidence());

    const total = (r: typeof working) =>
      r.findings.reduce((sum, f) => sum + f.pointsPossible, 0);

    // Same points available in both cases: nothing is quietly skipped.
    expect(total(working)).toBe(total(broken));
    expect(total(working)).toBe(100);
    expect(broken.score).toBeLessThan(working.score);
  });

  it('sorts findings worst-first', () => {
    const result = evaluate(terribleEvidence());
    const statuses = result.findings.map((f) => f.status);
    const firstPass = statuses.indexOf('pass');
    const lastFail = statuses.lastIndexOf('fail');
    if (firstPass !== -1 && lastFail !== -1) {
      expect(lastFail).toBeLessThan(firstPass);
    }
  });
});
