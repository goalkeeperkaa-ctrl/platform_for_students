'use client';

import { useMemo, useState } from 'react';
import { Check, FileText, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
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

type VerificationFilter = 'ALL' | 'PENDING_DOC' | 'VERIFIED' | 'UNVERIFIED';
type Decision = 'APPROVE' | 'REJECT';

/**
 * Студенты для HR: кто откуда, чья учёба подтверждена, чья справка ждёт.
 *
 * Справки на проверке — первыми: пока HR не решил, отклики этих студентов
 * не уходят работодателям, и каждый час ожидания — это студент, который
 * думает, что его игнорируют.
 *
 * Фильтры на клиенте: на пилоте студентов сотни, и перерисовать список
 * быстрее, чем ходить за ним на сервер при каждой букве поиска.
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
  const [verification, setVerification] = useState<VerificationFilter>(
    initial.some((s) => s.study === 'PENDING') ? 'PENDING_DOC' : 'ALL',
  );
  // Занятые строки — множеством: общий флаг снимался первым же ответом и
  // открывал повторное нажатие в строке, чей запрос ещё идёт
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter(
        (s) =>
          (school === 'ALL' || (school === 'OTHER' ? !s.institutionId : s.institutionId === school)) &&
          (verification === 'ALL' ||
            (verification === 'PENDING_DOC' ? s.study === 'PENDING' : (verification === 'VERIFIED') === s.studyVerified)) &&
          (!q || s.fullName.toLowerCase().includes(q) || s.university.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(b.study === 'PENDING') - Number(a.study === 'PENDING'));
  }, [students, query, school, verification]);

  function markBusy(id: string, value: boolean) {
    setBusy((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function send(student: AdminStudentDTO, body: Record<string, unknown>) {
    const response = await fetch('/api/admin/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id, ...body }),
    });
    const data = (await response.json()) as { error?: string; released?: number; fields?: Record<string, string> };
    if (!response.ok) throw new Error(data.fields?.note ?? data.error);
    return data;
  }

  async function update(student: AdminStudentDTO, change: { status?: StudentStatus; studyVerified?: boolean }) {
    markBusy(student.id, true);
    setStudents((list) =>
      list.map((s) => {
        if (s.id !== student.id) return s;
        const next = { ...s, ...change };
        if (change.studyVerified !== undefined) {
          next.study = change.studyVerified ? 'VERIFIED' : 'NONE';
          if (change.studyVerified) Object.assign(next, { studyDocUrl: null, studyDocName: null, studyDocAt: null, studyReviewNote: null });
        }
        return next;
      }),
    );
    try {
      const data = await send(student, change);
      toast.success(
        change.studyVerified === undefined
          ? 'Статус обновлён'
          : change.studyVerified
            ? 'Учёба подтверждена'
            : 'Подтверждение снято',
        data.released ? `Ушло откликов работодателям: ${data.released}` : student.fullName,
      );
    } catch (error) {
      setStudents((list) => list.map((s) => (s.id === student.id ? student : s)));
      toast.error('Не удалось сохранить', error instanceof Error ? error.message : undefined);
    } finally {
      markBusy(student.id, false);
    }
  }

  async function review(student: AdminStudentDTO, decision: Decision, note?: string): Promise<boolean> {
    markBusy(student.id, true);
    try {
      const data = await send(student, { studyDecision: decision, note });
      setStudents((list) =>
        list.map((s) =>
          s.id !== student.id
            ? s
            : decision === 'APPROVE'
              ? { ...s, studyVerified: true, study: 'VERIFIED', studyDocUrl: null, studyDocName: null, studyDocAt: null, studyReviewNote: null }
              : { ...s, study: 'REJECTED', studyDocUrl: null, studyDocName: null, studyDocAt: null, studyReviewNote: note ?? null },
        ),
      );
      toast.success(
        decision === 'APPROVE' ? 'Учёба подтверждена' : 'Справка возвращена студенту',
        decision === 'APPROVE' && data.released ? `Ушло откликов работодателям: ${data.released}` : student.fullName,
      );
      return true;
    } catch (error) {
      toast.error('Не удалось сохранить решение', error instanceof Error ? error.message : undefined);
      return false;
    } finally {
      markBusy(student.id, false);
    }
  }

  const verifiedCount = students.filter((s) => s.studyVerified).length;
  const pendingDocs = students.filter((s) => s.study === 'PENDING').length;

  return (
    <>
      <header className="mb-8">
        <p className="text-eyebrow uppercase text-accent-300">HR-менеджер</p>
        <h1 className="mt-3 text-display-md text-paper">Студенты</h1>
        <p className="mt-2.5 text-[14px] text-paper-dim">
          {students.length} {plural(students.length, 'студент', 'студента', 'студентов')} · учёба подтверждена у{' '}
          {verifiedCount}
          {pendingDocs > 0 && ` · справок на проверке: ${pendingDocs}`}
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
            { value: 'PENDING_DOC', label: 'Справка на проверке' },
            { value: 'VERIFIED', label: 'Подтверждена' },
            { value: 'UNVERIFIED', label: 'Не подтверждена' },
          ]}
          onChange={(e) => setVerification(e.target.value as VerificationFilter)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="surface rounded-3xl px-6 py-12 text-center text-[14.5px] text-paper-dim">
          {students.length === 0
            ? 'Студентов пока нет.'
            : verification === 'PENDING_DOC'
              ? 'Справок на проверке нет.'
              : 'Под фильтры никто не подходит.'}
        </div>
      ) : (
        <ul className="surface divide-y divide-[var(--hairline)] overflow-hidden rounded-3xl">
          {visible.map((student) => {
            const isBusy = busy.has(student.id);
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
                      {student.study === 'PENDING' && <Tag tone="hot">Справка на проверке</Tag>}
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
                  {student.study !== 'PENDING' && (
                    <Button
                      size="sm"
                      variant={student.studyVerified ? 'outline' : 'ghost'}
                      icon={<ShieldCheck />}
                      disabled={isBusy}
                      onClick={() => void update(student, { studyVerified: !student.studyVerified })}
                    >
                      {student.studyVerified ? 'Снять подтверждение' : 'Подтвердить учёбу'}
                    </Button>
                  )}
                </div>

                {student.study === 'PENDING' && student.studyDocUrl && (
                  <StudyReview
                    student={student}
                    busy={isBusy}
                    onDecide={(decision, note) => review(student, decision, note)}
                  />
                )}
                {student.study === 'REJECTED' && student.studyReviewNote && (
                  <p className="basis-full break-words text-[12.5px] text-paper-faint">
                    Справка возвращена: {student.studyReviewNote}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function StudyReview({
  student,
  busy,
  onDecide,
}: {
  student: AdminStudentDTO;
  busy: boolean;
  onDecide: (decision: Decision, note?: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  async function reject() {
    if (note.trim().length < 5) {
      setError('Напишите причину — студент увидит её в профиле');
      return;
    }
    const done = await onDecide('REJECT', note.trim());
    if (done) {
      setRejecting(false);
      setNote('');
    }
  }

  return (
    <div className="basis-full rounded-2xl border border-accent-400/30 bg-accent-500/[0.06] p-3.5">
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        <a
          href={student.studyDocUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 text-paper underline-offset-4 hover:underline"
        >
          <FileText className="size-4 shrink-0 text-accent-200" aria-hidden />
          <span className="min-w-0 break-all">{student.studyDocName ?? 'Справка'}</span>
        </a>
        {student.studyDocAt && <span className="text-[12px] text-paper-faint">загружена {timeAgo(student.studyDocAt)}</span>}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-paper-faint">
        Сверьте ФИО, учебное заведение и дату выдачи. После решения файл удаляется.
      </p>

      {rejecting ? (
        <div className="mt-3 space-y-3">
          <TextAreaField
            label="Причина"
            value={note}
            maxCount={500}
            error={error}
            hint="Студент увидит её в профиле."
            onChange={(e) => {
              setNote(e.target.value);
              setError(undefined);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" icon={<X />} loading={busy} onClick={() => void reject()}>
              Вернуть справку
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="accent" size="sm" icon={<Check />} loading={busy} onClick={() => void onDecide('APPROVE')}>
            Подтвердить учёбу
          </Button>
          <Button variant="outline" size="sm" icon={<X />} disabled={busy} onClick={() => setRejecting(true)}>
            Вернуть с причиной
          </Button>
        </div>
      )}
    </div>
  );
}
