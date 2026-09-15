import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/screens/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Восстановление пароля', robots: { index: false } };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
