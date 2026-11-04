'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Callout, Field, inputClass } from '@/components/primitives';

export function ProfileForm({
  email,
  name,
}: {
  email: string;
  name: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: value }),
    });
    setPending(false);

    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? 'That could not be saved.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email" hint="Changing your email is not supported yet.">
        <input value={email} disabled className={`${inputClass} bg-paper text-slate`} />
      </Field>

      <Field label="Name" hint="Used to address the emails we send you.">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={inputClass}
          autoComplete="name"
        />
      </Field>

      {error ? <Callout tone="alert">{error}</Callout> : null}
      {saved ? <Callout tone="pass">Saved.</Callout> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    setDone(false);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: String(form.get('currentPassword') ?? ''),
        newPassword: String(form.get('newPassword') ?? ''),
      }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? 'That could not be changed.');
      setFields(data.fields ?? {});
      return;
    }

    setDone(true);
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password" error={fields.currentPassword}>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="New password"
        error={fields.newPassword}
        hint="At least 12 characters. A short phrase you can remember beats a short complicated string."
      >
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      {error ? <Callout tone="alert">{error}</Callout> : null}
      {done ? (
        <Callout tone="pass" title="Password changed">
          Every other session has been signed out. You are still signed in here.
        </Callout>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);

    const response = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmEmail: confirm }),
    });
    setPending(false);

    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? 'The account could not be deleted.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Delete account
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <Field
        label={`Type ${email} to confirm`}
        hint="This deletes every site, scan and report. It cannot be undone."
      >
        <input
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={`${inputClass} font-mono`}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      {error ? <Callout tone="alert">{error}</Callout> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="danger"
          size="sm"
          onClick={remove}
          disabled={pending || confirm.trim().toLowerCase() !== email}
        >
          {pending ? 'Deleting…' : 'Delete my account permanently'}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] text-slate hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
