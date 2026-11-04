import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ResetPasswordForm } from '@/components/reset-forms';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false },
};
export const runtime = 'nodejs';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
