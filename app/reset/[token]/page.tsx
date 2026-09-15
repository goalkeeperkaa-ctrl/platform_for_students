import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/screens/ResetPasswordForm';
import { checkResetToken } from '@/lib/account-email';

export const metadata: Metadata = { title: 'Новый пароль', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ params }: { params: { token: string } }) {
  const state = await checkResetToken(params.token);
  return <ResetPasswordForm token={params.token} state={state} />;
}
