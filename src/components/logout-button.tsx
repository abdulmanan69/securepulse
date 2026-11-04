'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
      }}
      className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] text-slate transition-colors hover:bg-hover hover:text-ink disabled:opacity-55"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
