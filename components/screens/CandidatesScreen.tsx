'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Clock, Filter, GraduationCap, MapPin, Search, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Chip, Tag } from '@/components/ui/Chip';
import { SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { SwipeControls } from '@/components/swipe/SwipeControls';
import { CubeMark } from '@/components/brand/CubeMark';
import { SWIPE, springDeck, springSoft } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  GENDERS,
  WEEKDAY_LABEL,
  WEEKDAYS,
  type EmployerVacancyDTO,
  type Gender,
  type StudentProfileDTO,
  type Weekday,
} from '@/lib/types';

const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Женский',
  MALE: 'Мужской',
  UNSPECIFIED: 'Не указан',
};

/**
 * Раздел «Кандидаты» — обратная сторона ленты студента.
 *
 * Там студент листает вакансии и решает сам; здесь работодатель листает
 * студентов, подтверждённых агентством, и сам решает, кого позвать.
 * Решение привязано к вакансии: «пригласить» без вакансии в этом продукте
 * не бывает — отклик всегда на что-то конкретное.
 */
export function CandidatesScreen({ vacancies }: { vacancies: EmployerVacancyDTO[] }) {
  const toast = useToast();
  const [vacancyId, setVacancyId] = useState(vacancies[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<StudentProfileDTO[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [days, setDays] = useState<Weekday[]>([]);
  const [genders, setGenders] = useState<Gender[]>([]);
  const [invited, setInvited] = useState(0);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    if (!vacancyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDecided(new Set());
    setInvited(0);
    setSkipped(0);
    fetch(`/api/employer/candidates/${vacancyId}`)
      .then((r) => r.json())
      .then((data: { candidates?: StudentProfileDTO[] }) => {
        if (!cancelled) setPool(data.candidates ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Не удалось загрузить кандидатов');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacancyId]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pool.filter((s) => {
        if (decided.has(s.id)) return false;
        if (days.length > 0 && !s.workDays.some((d) => days.includes(d))) return false;
        if (genders.length > 0 && !genders.includes(s.gender)) return false;
        if (!query) return true;
        const haystack = `${s.fullName} ${s.university} ${s.speciality} ${s.skills.join(' ')}`.toLowerCase();
        return haystack.includes(query);
      }),
    [pool, decided, days, genders, query],
  );

  const current = filtered[0] ?? null;
  const next = filtered[1] ?? null;
  const progress = useMotionValue(0);

  const decide = useCallback(
    (direction: 'LEFT' | 'RIGHT', student: StudentProfileDTO) => {
      setDecided((prev) => new Set(prev).add(student.id));
      progress.set(0);
      if (direction === 'LEFT') {
        setSkipped((n) => n + 1);
        return;
      }
      setInvited((n) => n + 1);
      void fetch(`/api/employer/candidates/${vacancyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id }),
      })
        .then((r) => r.json())
        .then((data: { invited?: boolean; reason?: string }) => {
          if (!data.invited && data.reason === 'ALREADY_DECIDED') {
            toast.success('Уже не в колоде', 'Студент уже откликнулся или приглашён на эту вакансию');
          } else {
            toast.success('Приглашение отправлено', student.fullName);
          }
        })
        .catch(() => {
          setDecided((prev) => {
            const restored = new Set(prev);
            restored.delete(student.id);
            return restored;
          });
          setInvited((n) => Math.max(0, n - 1));
          toast.error('Не удалось пригласить', 'Проверьте соединение и попробуйте ещё раз');
        });
    },
    [progress, toast, vacancyId],
  );

  const activeFilters = days.length + genders.length;

  if (vacancies.length === 0) {
    return (
      <div className="glass mx-auto flex max-w-[26rem] flex-col items-center gap-4 rounded-4xl p-10 text-center">
        <Users className="size-10 text-paper-faint" aria-hidden />
        <div>
          <h1 className="text-display-sm text-paper">Пока нет вакансий</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
            Кандидатов подбираем под конкретную вакансию — создайте её в разделе «Вакансии», и здесь
            появится колода студентов.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col items-center pb-16">
      <header className="w-full">
        <h1 className="text-display-md text-paper">Кандидаты</h1>
        <p className="mt-1.5 text-[14px] text-paper-dim">
          Свайп вправо — пригласить на вакансию, влево — пропустить.
        </p>
      </header>

      <div className="mt-6 w-full">
        <SelectField
          label="Вакансия"
          value={vacancyId}
          onChange={(e) => setVacancyId(e.target.value)}
          options={vacancies.map((v) => ({ value: v.id, label: v.title }))}
        />
      </div>

      <div className="mt-3 flex w-full items-center gap-2">
        <div className="relative flex-1">
          <TextField label="Поиск: имя, вуз, навык" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-paper-faint" aria-hidden />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label="Фильтр"
          className={cn(
            'relative grid size-[62px] shrink-0 place-items-center rounded-xl border transition-colors',
            filtersOpen || activeFilters > 0
              ? 'border-accent-400/70 bg-accent-500/15 text-accent-200'
              : 'border-[var(--hairline)] bg-graphite-900/55 text-paper/70 hover:border-paper/25 hover:text-paper',
          )}
        >
          <Filter className="size-[18px]" aria-hidden />
          {activeFilters > 0 && (
            <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-accent-500 text-[10.5px] font-semibold text-ink">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSoft}
            className="w-full overflow-hidden"
          >
            <div className="glass mt-3 space-y-4 rounded-3xl p-4">
              <div>
                <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-paper-faint">День работы</p>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => (
                    <Chip
                      key={day}
                      size="sm"
                      selected={days.includes(day)}
                      onToggle={() =>
                        setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
                      }
                    >
                      {WEEKDAY_LABEL[day]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[12px] uppercase tracking-[0.1em] text-paper-faint">Пол</p>
                <div className="flex flex-wrap gap-1.5">
                  {GENDERS.map((gender) => (
                    <Chip
                      key={gender}
                      size="sm"
                      selected={genders.includes(gender)}
                      onToggle={() =>
                        setGenders((prev) =>
                          prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender],
                        )
                      }
                    >
                      {GENDER_LABEL[gender]}
                    </Chip>
                  ))}
                </div>
              </div>
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDays([]);
                    setGenders([]);
                  }}
                  className="text-[12.5px] text-paper-faint underline-offset-4 hover:text-paper hover:underline"
                >
                  Сбросить фильтр
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mt-6 h-[clamp(440px,60dvh,560px)] w-full">
        <AnimatePresence>
          {!loading && current && (
            <CandidateCard key={current.id} student={current} isTop onDecide={(dir) => decide(dir, current)} onProgress={(v) => progress.set(v)} />
          )}
          {!loading && next && <CandidateCard key={next.id} student={next} isTop={false} onDecide={() => {}} />}
        </AnimatePresence>

        {loading && (
          <div className="glass-card flex h-full items-center justify-center rounded-4xl text-paper-faint">
            Загружаем кандидатов…
          </div>
        )}

        {!loading && !current && <EmptyDeck invited={invited} hasFilters={activeFilters > 0 || query.length > 0} />}
      </div>

      <div className="mt-7 w-full">
        <SwipeControls
          progress={progress}
          onSkip={() => current && decide('LEFT', current)}
          onApply={() => current && decide('RIGHT', current)}
          onUndo={() => {}}
          canUndo={false}
          disabled={!current}
          labels={{ skip: 'Пропустить кандидата', undo: 'Отменить', apply: 'Пригласить кандидата' }}
        />
      </div>

      <p className="mt-5 text-[12.5px] tabular-nums text-paper-faint">
        Приглашено: {invited} · Пропущено: {skipped}
      </p>
    </div>
  );
}

function CandidateCard({
  student,
  isTop,
  onDecide,
  onProgress,
}: {
  student: StudentProfileDTO;
  isTop: boolean;
  onDecide: (direction: 'LEFT' | 'RIGHT') => void;
  onProgress?: (value: number) => void;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-SWIPE.distanceThreshold / 8, SWIPE.distanceThreshold / 8]);
  const yesOpacity = useTransform(x, [28, 132], [0, 1]);
  const noOpacity = useTransform(x, [-132, -28], [1, 0]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const fast = Math.abs(info.velocity.x) > SWIPE.velocityThreshold;
    const far = Math.abs(info.offset.x) > SWIPE.distanceThreshold;
    if (!fast && !far) {
      animate(x, 0, springSoft);
      onProgress?.(0);
      return;
    }
    const sign = fast ? Math.sign(info.velocity.x) : Math.sign(info.offset.x);
    onDecide(sign > 0 ? 'RIGHT' : 'LEFT');
  }

  return (
    <motion.div
      className={cn(
        'absolute inset-0 will-change-transform',
        isTop ? 'cursor-grab touch-pan-y-only active:cursor-grabbing' : 'pointer-events-none',
      )}
      style={{ x: isTop ? x : 0, rotate: isTop ? rotate : 0, zIndex: isTop ? 2 : 1 }}
      drag={isTop && !reduced ? 'x' : false}
      dragMomentum={false}
      dragElastic={1}
      onDrag={(_, info) => onProgress?.(Math.max(-1, Math.min(1, info.offset.x / 180)))}
      onDragEnd={handleDragEnd}
      initial={{ scale: isTop ? 1 : 0.94, y: isTop ? 0 : 14, opacity: isTop ? 1 : 0.7 }}
      animate={{ scale: isTop ? 1 : 0.94, y: isTop ? 0 : 14, opacity: isTop ? 1 : 0.7 }}
      exit={{ x: x.get() > 0 ? 420 : x.get() < 0 ? -420 : 0, opacity: 0, transition: { duration: 0.24 } }}
      transition={springDeck}
    >
      <article className={cn('glass-card relative flex h-full w-full flex-col overflow-hidden rounded-4xl p-6 sm:p-7', isTop && 'shadow-lift')}>
        {isTop && (
          <>
            <motion.div
              aria-hidden
              style={{ opacity: yesOpacity }}
              className="pointer-events-none absolute inset-0 rounded-4xl ring-2 ring-inset ring-yes-glow/70 shadow-glow-yes"
            />
            <motion.div
              aria-hidden
              style={{ opacity: noOpacity }}
              className="pointer-events-none absolute inset-0 rounded-4xl bg-ink/75 ring-1 ring-inset ring-paper/10"
            />
          </>
        )}

        <header className="flex items-start gap-3.5">
          <Avatar name={student.fullName} src={student.photoUrl} size={56} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[17px] font-semibold text-paper">{student.fullName}</p>
            {student.university && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-paper-dim">
                <GraduationCap className="size-3.5 shrink-0" aria-hidden />
                {student.university}
                {student.studyYear > 0 ? `, ${student.studyYear} курс` : ''}
              </p>
            )}
            {student.city && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-paper-faint">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {student.city}
              </p>
            )}
          </div>
        </header>

        {student.about && (
          <p className="mt-5 line-clamp-4 text-[14px] leading-relaxed text-paper-dim">{student.about}</p>
        )}

        {student.skills.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {student.skills.slice(0, 8).map((skill) => (
              <Tag key={skill}>{skill}</Tag>
            ))}
          </div>
        )}

        {student.workDays.length > 0 && (
          <div className="mt-5 flex items-center gap-2">
            <Clock className="size-3.5 shrink-0 text-paper-faint" aria-hidden />
            <div className="flex flex-wrap gap-1">
              {student.workDays.map((day) => (
                <span key={day} className="rounded-md bg-paper/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-paper/70">
                  {WEEKDAY_LABEL[day]}
                </span>
              ))}
              {student.hoursPerWeek && (
                <span className="px-1 py-0.5 text-[11px] text-paper-faint">· до {student.hoursPerWeek} ч/нед</span>
              )}
            </div>
          </div>
        )}

        {isTop && (
          <>
            <motion.div
              aria-hidden
              style={{ opacity: yesOpacity }}
              className="pointer-events-none absolute left-6 top-8 -rotate-[14deg] rounded-xl border-[3px] border-yes-glow px-3.5 py-1.5 text-[15px] font-bold uppercase tracking-[0.1em] text-yes-glow"
            >
              Позвать
            </motion.div>
            <motion.div
              aria-hidden
              style={{ opacity: noOpacity }}
              className="pointer-events-none absolute right-6 top-8 rotate-[14deg] rounded-xl border-[3px] border-paper/45 px-3.5 py-1.5 text-[15px] font-bold uppercase tracking-[0.1em] text-paper/70"
            >
              Позже
            </motion.div>
          </>
        )}
      </article>
    </motion.div>
  );
}

function EmptyDeck({ invited, hasFilters }: { invited: number; hasFilters: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springSoft, delay: 0.1 }}
      className="glass absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-4xl p-8 text-center"
    >
      <CubeMark className="h-16 w-16 text-paper/25" />
      <div className="space-y-2">
        <h3 className="text-display-sm text-paper">
          {hasFilters ? 'По фильтру никого нет' : 'Кандидаты закончились'}
        </h3>
        <p className="mx-auto max-w-[22rem] text-[14px] leading-relaxed text-paper-dim">
          {hasFilters
            ? 'Смягчите фильтр или поиск — подходящие студенты появятся снова.'
            : invited > 0
              ? `Вы пригласили ${invited} ${invited === 1 ? 'кандидата' : 'кандидатов'}. Ответ появится в разделе «Отклики».`
              : 'Новые подтверждённые студенты появляются по мере регистрации — загляните позже.'}
        </p>
      </div>
    </motion.div>
  );
}
