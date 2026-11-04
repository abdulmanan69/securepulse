import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/components/auth-form';
import { getAuth } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Free plan, one domain, no card required. Start monitoring a site in under a minute.',
};
export const runtime = 'nodejs';

export default async function SignupPage() {
  if (await getAuth()) redirect('/dashboard');

  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
