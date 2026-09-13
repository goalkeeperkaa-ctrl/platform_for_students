import type { Metadata } from 'next';
import { CompanyRegistrationForm } from '@/components/screens/CompanyRegistrationForm';

export const metadata: Metadata = {
  title: 'Регистрация компании',
  description: 'Кабинет работодателя: страница компании, вакансии и отклики студентов.',
};

export default function CompanyRegisterPage() {
  return <CompanyRegistrationForm />;
}
