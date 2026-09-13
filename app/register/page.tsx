import type { Metadata } from 'next';
import { RegistrationWizard } from '@/components/screens/RegistrationWizard';
import { listInstitutionOptions } from '@/lib/services';

export const metadata: Metadata = {
  title: 'Регистрация студента',
  description: 'Шесть коротких шагов — и лента вакансий собирается под ваш график.',
};

// Справочник вузов читается на запросе: собранная заранее страница не
// увидела бы вуз, добавленный после сборки
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  // Без справочника регистрация всё равно работает — вуз вписывается вручную
  const institutions = await listInstitutionOptions().catch(() => []);
  return <RegistrationWizard institutions={institutions} />;
}
