'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, inputClass } from '@/components/primitives';

/**
 * Sign-in and sign-up share a form because they share a shape. The copy and
 * the endpoint differ; nothing else does.
 */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSignup = mode === 'signup';
  // Carried through from the landing page so a visitor who just scanned a
  // domain lands on their dashboard with it prefilled.
  const domain = params.get('domain');
  const plan = params.get('plan');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      ...(isSignup ? { name: String(form.get('name') ?? '') } : {}),
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'That did not work. Try again.');
        setFieldErrors(data.fields ?? {});
        setPending(false);
        return;
      }

      const next = new URLSearchParams();
      if (domain) next.set('domain', domain);
      if (plan) next.set('plan', plan);
      const query = next.toString();

      router.push(query ? `/dashboard?${query}` : '/dashboard');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection.');
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">
        {isSignup ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate">
        {isSignup
          ? 'Free plan, one domain, no card. Upgrade when you need more.'
          : 'Welcome back.'}
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        {isSignup ? (
          <Field label="Name" hint="Optional. Used to address emails.">
            <input name="name" autoComplete="name" className={inputClass} />
          </Field>
        ) : null}

        <Field label="Email" error={fieldErrors.email}>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
          />
        </Field>

        <Field
          label="Password"
          error={fieldErrors.password}
          hint={isSignup ? 'At least 12 characters. A short phrase works well.' : undefined}
        >
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            className={inputClass}
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="border border-alert/30 bg-alert-soft px-3 py-2.5 text-[13px] text-alert"
          >
            {error}
          </p>
        ) : null}

        {!isSignup ? (
          <p className="-mt-1 text-right">
            <Link
              href="/forgot-password"
              className="text-[13px] text-slate hover:text-ink hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending
            ? isSignup
              ? 'Creating account…'
              : 'Signing in…'
            : isSignup
              ? 'Create account'
              : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-[14px] text-slate">
        {isSignup ? 'Already have an account? ' : 'No account yet? '}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-signal hover:underline"
        >
          {isSignup ? 'Sign in' : 'Create one free'}
        </Link>
      </p>
    </div>
  );
}
