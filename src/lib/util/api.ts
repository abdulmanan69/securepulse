import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { LimitExceededError } from '@/lib/billing/usage';
import {
  BlockedHostError,
  InvalidHostnameError,
} from '@/lib/scanner/hostname';
import { WeakPasswordError } from '@/lib/auth/password';

/**
 * One place that turns a thrown error into a response.
 *
 * The rule: a client gets a message only when that message was written for
 * them. Anything unrecognised becomes a generic 500 and is logged server-side,
 * because internal error text routinely contains table names, file paths and
 * query fragments that an attacker can use.
 */

export interface ApiErrorBody {
  error: string;
  code?: string;
  upgradeHint?: boolean;
  fields?: Record<string, string>;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(
  status: number,
  error: string,
  extra: Omit<ApiErrorBody, 'error'> = {},
) {
  return NextResponse.json({ error, ...extra } satisfies ApiErrorBody, {
    status,
  });
}

export function handleApiError(error: unknown, context: string) {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form';
      fields[key] ??= issue.message;
    }
    return fail(400, 'Please check the highlighted fields.', { fields });
  }

  if (error instanceof LimitExceededError) {
    return fail(402, error.message, {
      code: error.code,
      upgradeHint: error.upgradeHint,
    });
  }

  if (error instanceof InvalidHostnameError || error instanceof BlockedHostError) {
    return fail(400, error.message, { code: 'invalid_hostname' });
  }

  if (error instanceof WeakPasswordError) {
    return fail(400, error.message, { code: 'weak_password' });
  }

  // Unrecognised. Log the detail, return none of it.
  console.error(`[api:${context}]`, error);
  return fail(500, 'Something went wrong on our end. Please try again.');
}
