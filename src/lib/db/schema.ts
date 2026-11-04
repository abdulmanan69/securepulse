import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ enums */

export const planEnum = pgEnum('plan', ['free', 'pro', 'agency']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'unpaid',
]);

export const scanStatusEnum = pgEnum('scan_status', [
  'queued',
  'running',
  'complete',
  'failed',
]);

export const scanTriggerEnum = pgEnum('scan_trigger', [
  'manual',
  'scheduled',
  'public',
]);

export const findingStatusEnum = pgEnum('finding_status', [
  'pass',
  'warn',
  'fail',
  'info',
]);

export const severityEnum = pgEnum('severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

export const scanFrequencyEnum = pgEnum('scan_frequency', [
  'manual',
  'weekly',
  'daily',
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Always stored lower-cased and trimmed. Uniqueness is enforced on it.
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

// Opaque, server-side sessions. The raw token is never stored, only an HMAC of
// it, so a database leak does not hand an attacker live sessions.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/* ---------------------------------------------------------- subscriptions */

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: planEnum('plan').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_user_id_unique').on(t.userId),
    index('subscriptions_stripe_customer_idx').on(t.stripeCustomerId),
    index('subscriptions_stripe_subscription_idx').on(t.stripeSubscriptionId),
  ],
);

/* ---------------------------------------------------------------- domains */

export const domains = pgTable(
  'domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Registrable hostname: lower-cased, no scheme, no path, no port.
    hostname: text('hostname').notNull(),
    label: text('label'),
    // Ownership proof. Until verifiedAt is set the domain is limited to the
    // passive check set, with no sensitive-path discovery.
    verificationToken: text('verification_token').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    scanFrequency: scanFrequencyEnum('scan_frequency')
      .notNull()
      .default('manual'),
    alertsEnabled: boolean('alerts_enabled').notNull().default(true),
    // Grade of the most recent completed scan, kept here for regression alerts.
    lastGrade: text('last_grade'),
    lastScore: integer('last_score'),
    lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('domains_user_hostname_unique').on(t.userId, t.hostname),
    index('domains_user_id_idx').on(t.userId),
    index('domains_scan_frequency_idx').on(t.scanFrequency),
  ],
);

/* ------------------------------------------------------------------ scans */

export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null for anonymous public scans run from the marketing site.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // Null for public scans, which are not tied to a saved domain.
    domainId: uuid('domain_id').references(() => domains.id, {
      onDelete: 'cascade',
    }),
    // Denormalised so a report stays readable after its domain is deleted.
    hostname: text('hostname').notNull(),
    status: scanStatusEnum('status').notNull().default('queued'),
    trigger: scanTriggerEnum('trigger').notNull().default('manual'),
    // 0-100 weighted posture score. Null until the scan completes.
    score: integer('score'),
    grade: text('grade'),
    // Counts by finding status, denormalised for cheap list rendering.
    passCount: integer('pass_count').notNull().default(0),
    warnCount: integer('warn_count').notNull().default(0),
    failCount: integer('fail_count').notNull().default(0),
    durationMs: integer('duration_ms'),
    error: text('error'),
    // AI remediation write-up. Generated at most once, then cached here.
    summary: text('summary'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('scans_user_started_idx').on(t.userId, t.startedAt),
    index('scans_domain_started_idx').on(t.domainId, t.startedAt),
    index('scans_hostname_idx').on(t.hostname),
  ],
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    // Stable identifier of the check that produced this, e.g. headers.hsts
    checkId: text('check_id').notNull(),
    category: text('category').notNull(),
    status: findingStatusEnum('status').notNull(),
    severity: severityEnum('severity').notNull(),
    title: text('title').notNull(),
    // Plain-English explanation of what was found and why it matters.
    detail: text('detail').notNull(),
    // What was actually observed: header value, cert dates, DNS record.
    evidence: jsonb('evidence').$type<Record<string, unknown>>(),
    remediation: text('remediation'),
    // Points earned out of points available, used for the overall score.
    pointsEarned: integer('points_earned').notNull().default(0),
    pointsPossible: integer('points_possible').notNull().default(0),
  },
  (t) => [index('findings_scan_id_idx').on(t.scanId)],
);

/* --------------------------------------------------------- password reset */

/**
 * Single-use password reset tokens.
 *
 * Same discipline as sessions: only an HMAC of the token is stored, so a
 * database leak cannot be turned into account takeover. Short-lived and
 * marked used on redemption, because a reset link that still works a week
 * later is a standing key to the account sitting in an inbox.
 */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    requestedIp: text('requested_ip'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('password_resets_token_hash_unique').on(t.tokenHash),
    index('password_resets_user_id_idx').on(t.userId),
    index('password_resets_expires_at_idx').on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------- api access */

/**
 * Read-only API keys for the Agency plan.
 *
 * Same storage discipline as sessions and reset tokens: only an HMAC of the
 * key is kept, so a database leak yields nothing usable. `prefix` is the first
 * few visible characters, kept in the clear purely so a customer can tell two
 * keys apart in the UI after the full value has been shown once and discarded.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('api_keys_key_hash_unique').on(t.keyHash),
    index('api_keys_user_id_idx').on(t.userId),
  ],
);

/* ------------------------------------------------------- ops & guardrails */

// Durable rate limiting. An in-process map is per-instance on serverless and
// therefore not a limit at all, so the counter lives in the database.
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull().default(0),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_limits_reset_at_idx').on(t.resetAt)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('audit_log_user_created_idx').on(t.userId, t.createdAt),
    index('audit_log_action_idx').on(t.action),
  ],
);

// Every transactional email, recorded before dispatch. Doubles as the dev
// inbox when no email provider is configured, keeping the flows testable.
export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    to: text('to').notNull(),
    subject: text('subject').notNull(),
    template: text('template').notNull(),
    body: text('body').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('emails_created_at_idx').on(t.createdAt)],
);

/* ------------------------------------------------------------------ types */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Scan = typeof scans.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type Plan = (typeof planEnum.enumValues)[number];
export type FindingStatus = (typeof findingStatusEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type ScanFrequency = (typeof scanFrequencyEnum.enumValues)[number];
