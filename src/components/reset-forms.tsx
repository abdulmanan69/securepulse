'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button, Callout, Field, inputClass } from '@/components/primitives';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: String(form.get('email') ?? '') }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? 'That could not be sent.');
      return;
    }
    setSent(data.message);
  }

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold">Check your email</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">{sent}</p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-slate">
          Nothing arrived? Check spam, then try again. For your security we
          give the same answer whether or not an account exists at that
          address.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-[14px] font-medium text-signal hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">Reset your password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate">
        We will email you a link. It works once and expires in an hour.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className={inputClass}
          />
        </Field>

        {error ? <Callout tone="alert">{error}</Callout> : null}

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-[14px] text-slate">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-signal hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        password: String(form.get('password') ?? ''),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setPending(false);
      setError(data.error ?? 'That could not be changed.');
      setFields(data.fields ?? {});
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (!token) {
    return (
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold">Link incomplete</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          This page needs the token from your reset email. Open the link from
          that email directly, or request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-[14px] font-medium text-signal hover:underline"
        >
          Request a new link →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">Choose a new password</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-slate">
        Setting it signs out every other session on this account.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <Field
          label="New password"
          error={fields.password}
          hint="At least 12 characters. A short phrase you can remember beats a short complicated string."
        >
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            className={inputClass}
          />
        </Field>

        {error ? (
          <Callout tone="alert">
            {error}{' '}
            <Link href="/forgot-password" className="font-medium underline">
              Request a new link
            </Link>
          </Callout>
        ) : null}

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? 'Setting password…' : 'Set password and sign in'}
        </Button>
      </form>
    </div>
  );
}
