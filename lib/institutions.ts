import type { InstitutionOption } from '@/lib/types';

/**
 * Поиск вуза по вводу.
 *
 * Люди пишут вуз как угодно: «вшэ», «Бауманка», «мгту баум». Поэтому
 * сравнение без регистра, «ё» и кавычек, а запрос из нескольких слов
 * совпадает, когда каждое слово нашлось. Совпадение с начала короткого
 * названия выше остальных: «мг» должно поднять МГУ и МГТУ, а не вуз, где
 * эти буквы стоят в середине полного названия.
 */
export function normalizeSchool(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'.,()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchInstitutions(list: InstitutionOption[], query: string): InstitutionOption[] {
  const q = normalizeSchool(query);
  if (q.length < 2) return [];
  const tokens = q.split(' ');

  const scored = list.flatMap((item) => {
    const short = normalizeSchool(item.shortName ?? '');
    const haystack = normalizeSchool(`${item.shortName ?? ''} ${item.name} ${item.city}`);
    if (!tokens.every((token) => haystack.includes(token))) return [];
    const words = haystack.split(' ');
    const score = short.startsWith(q) ? 0 : words.some((word) => word.startsWith(tokens[0])) ? 1 : 2;
    return [{ item, score }];
  });

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.item.shortName ?? a.item.name).localeCompare(b.item.shortName ?? b.item.name, 'ru'),
    )
    .map((entry) => entry.item);
}

/** Вуз, название которого введено целиком, — без выбора из подсказок. */
export function exactInstitution(list: InstitutionOption[], value: string): InstitutionOption | null {
  const v = normalizeSchool(value);
  if (!v) return null;
  const found = list.filter((item) => normalizeSchool(item.name) === v || normalizeSchool(item.shortName ?? '') === v);
  return found.length === 1 ? found[0] : null;
}

/** Как вуз показывается в профиле, чатах и кабинете работодателя. */
export function institutionLabel(item: { name: string; shortName: string | null }): string {
  return item.shortName ?? item.name;
}
