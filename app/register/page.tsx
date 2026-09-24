import type { Metadata } from 'next';
import { RegistrationWizard } from '@/components/screens/RegistrationWizard';

export const metadata: Metadata = {
  title: 'Регистрация студента',
  description: 'Пять коротких шагов — и лента вакансий собирается под ваш график.',
};

export default function RegisterPage() {
  return <RegistrationWizard />;
}
