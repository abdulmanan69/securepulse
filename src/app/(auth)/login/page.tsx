import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/components/auth-form';
import { getAuth } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign in' };
export const runtime = 'nodejs';

export default async function LoginPage() {
  if (await getAuth()) redirect('/dashboard');

  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
