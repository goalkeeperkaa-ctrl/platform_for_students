import type { Metadata } from 'next';
import { ProfileEditor } from '@/components/screens/ProfileEditor';
import { requireStudentPage } from '@/lib/security/guards';
import { decryptSafe } from '@/lib/security/crypto';
import { buildStudyState, listInstitutionOptions } from '@/lib/services';

export const metadata: Metadata = { title: 'Профиль' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { student, store } = await requireStudentPage('/profile');
  const [account, institutions] = await Promise.all([
    store.accounts.findById(student.accountId),
    // Без справочника профиль всё равно открывается — вуз вписывается вручную
    listInstitutionOptions().catch(() => []),
  ]);

  return (
    <ProfileEditor
      email={decryptSafe(account?.emailEnc, '')}
      institutions={institutions}
      studyVerified={student.studyVerified}
      study={buildStudyState(student)}
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
        birthDate: decryptSafe(student.birthDateEnc, ''),
        photoUrl: student.photoUrl,
        resumeUrl: student.resumeUrl,
        resumeName: student.resumeName,
        university: student.university,
        institutionId: student.institutionId,
        speciality: student.speciality,
        studyYear: student.studyYear,
        city: student.city ?? '',
        workDays: student.workDays,
        hoursPerWeek: student.hoursPerWeek,
        skills: student.skills,
        about: student.about ?? '',
        lookingFor: student.lookingFor,
        goals: student.goals ?? '',
        projects: student.projects,
        achievements: student.achievements,
        activities: student.activities,
        hobbies: student.hobbies ?? '',
        links: student.links,
        videoUrl: student.videoUrl ?? '',
      }}
    />
  );
}
