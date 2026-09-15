/**
 * Рейтинг учебных заведений по трудоустройству через платформу.
 *
 * Считаются только студенты с подтверждённой учёбой: иначе любой мог бы
 * зарегистрироваться «студентом» нужного вуза и поднять его в рейтинге.
 *
 * Две границы. Меньше пяти студентов — цифры не публикуются вовсе: по
 * небольшому вузу число почти указывает на конкретных людей. Меньше десяти —
 * цифры видны, но места нет: одна удачная история у вуза из трёх студентов
 * дала бы ему первое место при доле 33%, и рейтинг читался бы как лотерея.
 *
 * Место — по доле трудоустроенных, а не по их числу: иначе первым всегда был
 * бы самый большой вуз. При равной доле выше тот, где трудоустроенных больше;
 * совсем одинаковые делят место.
 *
 * Модуль без зависимостей: правило одно для страницы и для проверок.
 */

export const RATING_MIN_PUBLIC = 5;
export const RATING_MIN_RANKED = 10;

export interface RatingInput {
  slug: string;
  label: string;
  name: string;
  /** Студенты с подтверждённой учёбой */
  students: number;
  applications: number;
  /** Студенты, которых позвали дальше: приглашение, собеседование или выход на работу */
  invited: number;
  /** Студенты, вышедшие на работу */
  hired: number;
}

/** Строка рейтинга для публикации. null — данных мало, число не показывается. */
export interface RatingRow {
  slug: string;
  label: string;
  name: string;
  place: number | null;
  students: number | null;
  applications: number | null;
  invited: number | null;
  hired: number | null;
  /** Доля трудоустроенных, 0–100 */
  share: number | null;
}

export function rankInstitutions(rows: RatingInput[]): RatingRow[] {
  const byLabel = (a: RatingInput, b: RatingInput) => a.label.localeCompare(b.label, 'ru');
  const share = (row: RatingInput) => Math.round((row.hired / row.students) * 100);

  const ranked = rows
    .filter((row) => row.students >= RATING_MIN_RANKED)
    .sort((a, b) => share(b) - share(a) || b.hired - a.hired || b.students - a.students || byLabel(a, b));

  const places = new Map<string, number>();
  ranked.forEach((row, i) => {
    const previous = ranked[i - 1];
    const tie = previous && share(previous) === share(row) && previous.hired === row.hired;
    places.set(row.slug, tie ? (places.get(previous.slug) as number) : i + 1);
  });

  const rest = rows
    .filter((row) => row.students < RATING_MIN_RANKED)
    .sort(
      (a, b) =>
        Number(b.students >= RATING_MIN_PUBLIC) - Number(a.students >= RATING_MIN_PUBLIC) ||
        b.students - a.students ||
        byLabel(a, b),
    );

  return [...ranked, ...rest].map((row) => {
    const visible = row.students >= RATING_MIN_PUBLIC;
    return {
      slug: row.slug,
      label: row.label,
      name: row.name,
      place: places.get(row.slug) ?? null,
      students: visible ? row.students : null,
      applications: visible ? row.applications : null,
      invited: visible ? row.invited : null,
      hired: visible ? row.hired : null,
      share: visible ? share(row) : null,
    };
  });
}
