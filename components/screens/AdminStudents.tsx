'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { institutionLabel } from '@/lib/institutions';
import { plural, timeAgo } from '@/lib/utils';
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_LABEL,
  type AdminStudentDTO,
  type InstitutionOption,
  type StudentStatus,
} from '@/lib/types';

type VerificationFilter = 'ALL' | 'VERIFIED' | 'UNVERIFIED';

/**
 * Студенты для HR: кто откуда и чья учёба подтверждена.
 *
 * Фильтры на клиенте: на пилоте студентов сотни, и перерисовать список
 * быстрее, чем ходить за ним на сервер при каждой букве поиска.
 *
 * Изменения оптимистичные — кнопка реагирует сразу, а при ошибке сервера
 * значение возвращается назад с объяснением.
 */
export function AdminStudents({
  students: initial,
  institutions,
}: {
  students: AdminStudentDTO[];
  institutions: InstitutionOption[];
}) {
  const toast = useToast();
  const [students, setStudents] = useState(initial);
  const [query, setQuery] = useState('');
  const [school, setSchool] = useState('ALL');
  const [verification, setVerification] = useState<VerificationFilter>('ALL');
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter(
      (s) =>
        (school === 'ALL' || (school === 'OTHER' ? !s.institutionId : s.institutionId === school)) &&
        (verification === 'ALL' || (verification === 'VERIFIED') === s.studyVerified) &&
        (!q || s.fullName.toLowerCase().includes(q) || s.university.toLowerCase().includes(q)),
    );
  }, [students, query, school, verification]);

  async function update(student: AdminStudentDTO, change: { status?: StudentStatus; studyVerified?: boolean }) {
    setBusy(student.id);
    setStudents((list) => list.map((s) => (s.id === student.id ? { ...s, ...change } : s)));
    try {
      const response = await fetch('/api/admin/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, ...change }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success(
        change.studyVerified === undefined
          ? 'Статус обновлён'
          : change.studyVerified
            ? 'Учёба подтверждена'
            : 'Подтверждение снято',
        student.fullName,
      );
    } catch (error) {
      setStudents((list) => list.map((s) => (s.id === student.id ? student : s)));
      toast.error('Не удалось сохранить', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const verifiedCount = students.filter((s) => s.studyVerified).length;

  return (
    <>
      <header className="mb-8">
        <p className="text-eyebrow uppercase text-accent-300">HR-менеджер</p>
        <h1 className="mt-3 text-display-md text-paper">Студенты</h1>
        <p className="mt-2.5 text-[14px] text-paper-dim">
          {students.length} {plural(students.length, 'студент', 'студента', 'студентов')} · учёба подтверждена у{' '}
          {verifiedCount}
        </p>
      </header>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <TextField label="Поиск по имени или вузу" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField
          label="Учебное заведение"
          value={school}
          options={[
            { value: 'ALL', label: 'Все' },
            ...institutions.map((i) => ({ value: i.id, label: institutionLabel(i) })),
            { value: 'OTHER', label: 'Не из справочника' },
          ]}
          onChange={(e) => setSchool(e.target.value)}
        />
        <SelectField
          label="Подтверждение учёбы"
          value={verification}
          options={[
            { value: 'ALL', label: 'Все' },
            { value: 'VERIFIED', label: 'Подтверждена' },
            { value: 'UNVERIFIED', label: 'Не подтверждена' },
          ]}
          onChange={(e) => setVerification(e.target.value as VerificationFilter)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="surface rounded-3xl px-6 py-12 text-center text-[14.5px] text-paper-dim">
          {students.length === 0 ? 'Студентов пока нет.' : 'Под фильтры никто не подходит.'}
        </div>
      ) : (
        <ul className="surface divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {visible.map((student) => {
            const isBusy = busy === student.id;
            return (
              <li key={student.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <div className="flex min-w-0 grow basis-64 items-center gap-3">
                  <Avatar name={student.fullName} src={student.photoUrl} size={40} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] font-medium text-paper">
                      <span className="min-w-0 break-words">{student.fullName}</span>
                      {student.studyVerified && (
                        <Tag tone="accent">
                          <ShieldCheck className="size-3" aria-hidden />
                          Учёба подтверждена
                        </Tag>
                      )}
                    </p>
                    <p className="mt-0.5 break-words text-[12.5px] text-paper-faint">
                      {student.university}
                      {student.institutionId ? '' : ' (не из справочника)'} · {student.studyYear} курс ·{' '}
                      {student.applications} {plural(student.applications, 'отклик', 'отклика', 'откликов')} ·{' '}
                      {timeAgo(student.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Статус: ${student.fullName}`}
                    value={student.status}
                    disabled={isBusy}
                    onChange={(e) => void update(student, { status: e.target.value as StudentStatus })}
                    className="h-9 rounded-xl border border-[var(--hairline)] bg-graphite-900/60 px-2.5 text-[13px] text-paper outline-none transition-colors hover:border-paper/25 focus:border-accent-400/70 disabled:opacity-50 [&>option]:bg-graphite-900"
                  >
                    {STUDENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STUDENT_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant={student.studyVerified ? 'outline' : 'accent'}
                    icon={<ShieldCheck />}
                    disabled={isBusy}
                    onClick={() => void update(student, { studyVerified: !student.studyVerified })}
                  >
                    {student.studyVerified ? 'Снять подтверждение' : 'Подтвердить учёбу'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
