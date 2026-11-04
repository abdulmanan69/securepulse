'use client';

import { useState } from 'react';

import { Button } from '@/components/primitives';

export function CheckoutButton({
  plan,
  label,
  disabled,
}: {
  plan: 'pro' | 'agency';
  label: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await response.json();

    if (!response.ok || !data.url) {
      setError(data.error ?? 'Checkout could not be started.');
      setPending(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div>
      <Button onClick={start} disabled={pending || disabled} className="w-full">
        {pending ? 'Opening checkout…' : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PortalButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);

    const response = await fetch('/api/billing/portal', { method: 'POST' });
    const data = await response.json();

    if (!response.ok || !data.url) {
      setError(data.error ?? 'The billing portal could not be opened.');
      setPending(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div>
      <Button variant="outline" onClick={open} disabled={pending}>
        {pending ? 'Opening…' : 'Manage billing'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
