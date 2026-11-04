import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ForgotPasswordForm } from '@/components/reset-forms';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false },
};
export const runtime = 'nodejs';

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
