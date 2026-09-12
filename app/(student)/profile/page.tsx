import type { Metadata } from 'next';
import { ProfileEditor } from '@/components/screens/ProfileEditor';
import { requireStudentPage } from '@/lib/security/guards';
import { decryptSafe } from '@/lib/security/crypto';

export const metadata: Metadata = { title: 'Профиль' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { student, store } = await requireStudentPage('/profile');
  const account = await store.accounts.findById(student.accountId);

  return (
    <ProfileEditor
      email={decryptSafe(account?.emailEnc, '')}
      consent={{
        version: student.consentVersion,
        at: student.consentAt.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }}
      initial={{
        fullName: decryptSafe(student.fullNameEnc, ''),
        phone: decryptSafe(student.phoneEnc, ''),
        gender: student.gender,
        birthYear: student.birthYear,
        photoUrl: student.photoUrl,
        resumeUrl: student.resumeUrl,
        resumeName: student.resumeName,
        university: student.university,
        speciality: student.speciality,
        studyYear: student.studyYear,
        city: student.city ?? '',
        workDays: student.workDays,
        hoursPerWeek: student.hoursPerWeek,
        skills: student.skills,
        about: student.about ?? '',
      }}
    />
  );
}
