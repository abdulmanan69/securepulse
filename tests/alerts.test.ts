import { desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import {
  sendCertificateExpiryEmail,
  sendGradeDropEmail,
  sendWelcomeEmail,
} from '@/lib/email/send';
import { isGradeRegression } from '@/lib/scheduler';
import { clearAllTables } from './helpers/db';
import { createUser } from './helpers/factories';

beforeEach(async () => {
  await clearAllTables();
});

describe('isGradeRegression', () => {
  it('detects a drop', () => {
    expect(isGradeRegression('A', 'B')).toBe(true);
    expect(isGradeRegression('A+', 'A')).toBe(true);
    expect(isGradeRegression('C', 'F')).toBe(true);
  });

  it('ignores an improvement or no change', () => {
    expect(isGradeRegression('B', 'A')).toBe(false);
    expect(isGradeRegression('B', 'B')).toBe(false);
    expect(isGradeRegression('F', 'A+')).toBe(false);
  });

  it('does not alert on a first-ever scan', () => {
    // No previous grade means nothing regressed. Alerting here would send
    // every new domain a "your grade dropped" email on day one.
    expect(isGradeRegression(null, 'F')).toBe(false);
  });

  it('ignores an unrecognised grade rather than guessing', () => {
    expect(isGradeRegression('Z', 'A')).toBe(false);
    expect(isGradeRegression('A', 'Z')).toBe(false);
  });
});

describe('transactional email', () => {
  it('records a welcome email even with no provider configured', async () => {
    const { user } = await createUser();
    const result = await sendWelcomeEmail(user.id, user.email, user.name);

    // No RESEND_API_KEY in tests, so nothing is transmitted and the product
    // says so rather than reporting a delivery that did not happen.
    expect(result.delivered).toBe(false);
    expect(result.provider).toBe('logged');

    const db = await getDb();
    const [row] = await db.select().from(emails).where(eq(emails.userId, user.id));
    expect(row.template).toBe('welcome');
    expect(row.to).toBe(user.email);
    expect(row.body).toContain('SecurePulse');
    expect(row.error).toBeNull();
  });

  it('writes a grade-drop alert naming both grades and the issues', async () => {
    const { user } = await createUser();
    await sendGradeDropEmail({
      userId: user.id,
      to: user.email,
      hostname: 'client-site.example-test.com',
      previousGrade: 'A',
      newGrade: 'C',
      newScore: 72,
      topIssues: ['HSTS is not enabled', 'No Content-Security-Policy'],
      scanId: '00000000-0000-0000-0000-000000000000',
    });

    const db = await getDb();
    const [row] = await db.select().from(emails).where(eq(emails.userId, user.id));
    expect(row.subject).toContain('A to C');
    expect(row.body).toContain('HSTS is not enabled');
    expect(row.body).toContain('72/100');
  });

  it('writes a certificate expiry warning with the day count', async () => {
    const { user } = await createUser();
    await sendCertificateExpiryEmail({
      userId: user.id,
      to: user.email,
      hostname: 'expiring.example-test.com',
      daysUntilExpiry: 9,
    });

    const db = await getDb();
    const [row] = await db
      .select()
      .from(emails)
      .orderBy(desc(emails.createdAt))
      .limit(1);
    expect(row.template).toBe('cert_expiry');
    expect(row.subject).toContain('9 days');
  });
});
