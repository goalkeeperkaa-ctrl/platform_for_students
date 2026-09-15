/**
 * Тексты писем.
 *
 * Все в одном месте, иначе в письмах заведётся разнобой. Модуль чистый:
 * получает готовые строки и ссылки, в базу не ходит — так тексты
 * проверяются модульными тестами.
 *
 * В письмах нет ни переписки, ни чужих персональных данных: письмо лежит
 * в почтовом ящике вне платформы, и ФИО студента или текст сообщения
 * там не нужны. Письмо говорит, что случилось, и ведёт на сайт.
 */

import type { ApplicationStatus } from '@/lib/types';

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND = 'Fattakhov HR Agency';

interface Layout {
  subject: string;
  title: string;
  paragraphs: string[];
  /** Крупно, для кода подтверждения */
  code?: string;
  action?: { label: string; url: string };
  footnote?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const AUTO_NOTE = 'Письмо отправлено автоматически, отвечать на него не нужно.';

/**
 * Письмо целиком: текстовая версия и HTML.
 *
 * Разметка таблицами и стили в атрибутах — почтовые клиенты вырезают
 * <style> и не знают ни flex, ни grid. Текстовая версия обязательна:
 * без неё письмо чаще уходит в спам.
 */
export function renderMail(layout: Layout): MailContent {
  const lines = [layout.title, '', ...layout.paragraphs];
  if (layout.code) lines.push('', `Код: ${layout.code}`);
  if (layout.action) lines.push('', `${layout.action.label}: ${layout.action.url}`);
  if (layout.footnote) lines.push('', layout.footnote);
  lines.push('', '—', BRAND, AUTO_NOTE);

  const paragraphs = layout.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2b2f33">${escapeHtml(p)}</p>`)
    .join('');
  const code = layout.code
    ? `<p style="margin:6px 0 18px;font-size:30px;font-weight:700;letter-spacing:8px;color:#14181c;font-family:Consolas,Menlo,monospace">${escapeHtml(layout.code)}</p>`
    : '';
  const action = layout.action
    ? `<p style="margin:8px 0 18px"><a href="${escapeHtml(layout.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#14181c;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(layout.action.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12.5px;line-height:1.5;color:#6b7278">Если кнопка не открывается, скопируйте ссылку: ${escapeHtml(layout.action.url)}</p>`
    : '';
  const footnote = layout.footnote
    ? `<p style="margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#6b7278">${escapeHtml(layout.footnote)}</p>`
    : '';

  const html =
    '<!doctype html><html lang="ru"><body style="margin:0;padding:0;background:#eef1f4">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:28px 26px;font-family:Arial,Helvetica,sans-serif">' +
    `<tr><td><p style="margin:0 0 18px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7278">${BRAND}</p>` +
    `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#14181c">${escapeHtml(layout.title)}</h1>` +
    paragraphs +
    code +
    action +
    footnote +
    `<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #e3e7eb;font-size:12px;line-height:1.5;color:#8a939c">${AUTO_NOTE}</p>` +
    '</td></tr></table></td></tr></table></body></html>';

  return { subject: layout.subject, text: lines.join('\n'), html };
}

const REMINDERS_NOTE = 'Напоминания и сводки можно отключить в профиле, в разделе «Вход и согласие».';

export function emailCodeMail(input: { code: string; minutes: number }): MailContent {
  return renderMail({
    subject: `Код подтверждения почты: ${input.code}`,
    title: 'Подтвердите почту',
    paragraphs: [
      'Введите этот код на платформе, чтобы подтвердить адрес.',
      `Код действует ${input.minutes} минут. Если вы не регистрировались, просто удалите письмо.`,
    ],
    code: input.code,
  });
}

export function passwordResetMail(input: { url: string; minutes: number }): MailContent {
  return renderMail({
    subject: 'Восстановление пароля',
    title: 'Задайте новый пароль',
    paragraphs: [
      'Кто-то запросил восстановление пароля для этой почты. Если это были вы, откройте ссылку и задайте новый пароль.',
      `Ссылка работает ${input.minutes} минут и только один раз. Если вы ничего не запрашивали, удалите письмо — пароль останется прежним.`,
    ],
    action: { label: 'Задать новый пароль', url: input.url },
  });
}

export function studyApprovedMail(input: { released: number; url: string }): MailContent {
  return renderMail({
    subject: 'Учёба подтверждена',
    title: 'HR-менеджер подтвердил вашу учёбу',
    paragraphs: [
      input.released > 0
        ? `Отклики, которые ждали подтверждения, отправлены работодателям: ${input.released}.`
        : 'Теперь отклики уходят работодателям сразу.',
      'Работодатели видят в вашем профиле отметку «учёба подтверждена».',
    ],
    action: { label: 'Открыть ленту', url: input.url },
  });
}

export function studyRejectedMail(input: { note: string; url: string }): MailContent {
  return renderMail({
    subject: 'Справку об обучении нужно загрузить заново',
    title: 'HR-менеджер не принял справку',
    paragraphs: [`Причина: ${input.note}`, 'Загрузите новую справку в профиле — отклики пока ждут.'],
    action: { label: 'Загрузить справку', url: input.url },
  });
}

export function companyDecisionMail(input: {
  company: string;
  approved: boolean;
  note: string | null;
  url: string;
}): MailContent {
  return input.approved
    ? renderMail({
        subject: 'Компания прошла проверку',
        title: `«${input.company}» проверена агентством`,
        paragraphs: [
          'Страница компании опубликована. Вакансии, которые пройдут проверку, увидят студенты.',
        ],
        action: { label: 'Открыть кабинет', url: input.url },
      })
    : renderMail({
        subject: 'Компанию вернули на доработку',
        title: `«${input.company}»: нужны правки`,
        paragraphs: [
          input.note ? `Причина: ${input.note}` : 'Агентство вернуло страницу компании на доработку.',
          'Поправьте страницу и сохраните — она снова уйдёт на проверку.',
        ],
        action: { label: 'Открыть страницу компании', url: input.url },
      });
}

export function vacancyDecisionMail(input: {
  title: string;
  approved: boolean;
  note: string | null;
  url: string;
}): MailContent {
  return input.approved
    ? renderMail({
        subject: `Вакансия опубликована: ${input.title}`,
        title: 'Вакансия прошла проверку',
        paragraphs: [`«${input.title}» опубликована — студенты видят её в ленте.`],
        action: { label: 'Открыть вакансии', url: input.url },
      })
    : renderMail({
        subject: `Вакансию вернули на доработку: ${input.title}`,
        title: 'Вакансию нужно поправить',
        paragraphs: [
          input.note ? `«${input.title}». Причина: ${input.note}` : `«${input.title}» вернули на доработку.`,
          'Исправьте вакансию и отправьте на проверку снова.',
        ],
        action: { label: 'Открыть вакансии', url: input.url },
      });
}

/** Что сделал работодатель — словами для студента. NEW писем не вызывает. */
const STATUS_LINES: Partial<Record<ApplicationStatus, { subject: string; line: string }>> = {
  VIEWED: { subject: 'Ваш отклик посмотрели', line: 'посмотрела ваш профиль' },
  INVITED: { subject: 'Вас приглашают', line: 'приглашает вас на следующий шаг' },
  INTERVIEW: { subject: 'Собеседование', line: 'назначила собеседование' },
  HIRED: { subject: 'Вас готовы взять на работу', line: 'готова взять вас на работу' },
  REJECTED: { subject: 'Ответ по отклику', line: 'пока не готова продолжить — лента подберёт другие вакансии' },
};

export function hasStatusMail(status: ApplicationStatus): boolean {
  return Boolean(STATUS_LINES[status]);
}

export function applicationStatusMail(input: {
  status: ApplicationStatus;
  company: string;
  title: string;
  url: string;
}): MailContent | null {
  const copy = STATUS_LINES[input.status];
  if (!copy) return null;
  return renderMail({
    subject: `${copy.subject}: ${input.title}`,
    title: copy.subject,
    paragraphs: [`Компания «${input.company}» ${copy.line}. Вакансия: «${input.title}».`],
    action: { label: 'Открыть отклики', url: input.url },
  });
}

export function newApplicationMail(input: { title: string; url: string }): MailContent {
  return renderMail({
    subject: `Новый отклик: ${input.title}`,
    title: 'Новый отклик на вакансию',
    paragraphs: [`На «${input.title}» откликнулся студент с подтверждённой учёбой.`, 'Профиль и контакты — в кабинете.'],
    action: { label: 'Открыть отклики', url: input.url },
  });
}

export function studyDeadlineMail(input: { daysText: string; url: string }): MailContent {
  return renderMail({
    subject: 'Загрузите справку об обучении',
    title: 'Срок загрузки справки подходит к концу',
    paragraphs: [
      `${input.daysText}, чтобы загрузить справку об обучении. Без подтверждённой учёбы отклики не уходят работодателям.`,
      'Справку выдают в деканате или в личном кабинете вуза.',
    ],
    action: { label: 'Загрузить справку', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}

export function pendingExpiryMail(input: { count: number; url: string }): MailContent {
  return renderMail({
    subject: 'Отклики скоро удалятся',
    title: 'Отклики ждут подтверждения учёбы',
    paragraphs: [
      `Откликов, которые удалятся в ближайшие два дня: ${input.count}.`,
      'Подтвердите учёбу — загрузите справку, и отклики уйдут работодателям.',
    ],
    action: { label: 'Открыть отклики', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}

export function messagesDigestMail(input: { count: number; title: string; url: string }): MailContent {
  return renderMail({
    subject: `Новое сообщение: ${input.title}`,
    title: 'Вам написали',
    paragraphs: [`Непрочитанных сообщений в переписке по вакансии «${input.title}»: ${input.count}.`],
    action: { label: 'Открыть сообщения', url: input.url },
    footnote: REMINDERS_NOTE,
  });
}
