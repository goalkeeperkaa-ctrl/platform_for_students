import { Logo } from '@/components/brand/Logo';
import { EmailVerifyBanner } from '@/components/account/EmailVerifyBanner';
import { NavTabs, type NavItem } from './NavTabs';
import { UserMenu } from './UserMenu';
import { PageTransition } from '@/components/motion/PageTransition';
import { maskEmail } from '@/lib/account-codes';
import { getStore } from '@/lib/db';
import { decryptSafe } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/guards';
import { cn } from '@/lib/utils';

/**
 * Каркас внутренних экранов.
 *
 * Шапка приклеена и стеклянная: контент проезжает под ней, а не
 * упирается в непрозрачную полосу. На телефоне вкладки уезжают под
 * шапку отдельной строкой — впихнуть их в один ряд с логотипом можно,
 * но тогда всё съедет в нечитаемые 11 пикселей.
 *
 * Плашка «подтвердите почту» живёт здесь, а не на каждой странице: каркас
 * есть у всех экранов кабинета, и забыть её на новой странице нельзя.
 */
export async function AppShell({
  nav,
  user,
  children,
  wide = false,
}: {
  nav?: NavItem[];
  user?: { name: string; subtitle?: string; href?: string };
  children: React.ReactNode;
  wide?: boolean;
}) {
  const unverifiedEmail = await pendingEmail();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-[var(--hairline)] bg-ink/70 backdrop-blur-glass">
        <div
          className={cn(
            'page-x mx-auto flex h-[var(--header-h)] items-center justify-between gap-4',
            wide ? 'max-w-[100rem]' : 'max-w-6xl',
          )}
        >
          <Logo href="/" />

          {nav && <NavTabs items={nav} className="hidden md:flex" />}

          {user ? (
            <UserMenu name={user.name} subtitle={user.subtitle} href={user.href} />
          ) : (
            <span className="text-[12.5px] text-paper-faint">Fattakhov HR Agency</span>
          )}
        </div>

        {nav && (
          <div className="page-x mx-auto max-w-6xl overflow-x-auto pb-3 no-scrollbar md:hidden">
            <NavTabs items={nav} className="w-max" />
          </div>
        )}
      </header>

      <main className={cn('page-x mx-auto w-full flex-1 pb-24 pt-8', wide ? 'max-w-[100rem]' : 'max-w-6xl')}>
        {unverifiedEmail && <EmailVerifyBanner email={unverifiedEmail} />}
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}

/** Почта студента или компании, которую ещё нужно подтвердить, — маской; null — нечего. */
async function pendingEmail(): Promise<string | null> {
  const session = await getSession();
  if (!session || session.role === 'ADMIN') return null;
  const account = await (await getStore()).accounts.findById(session.accountId);
  if (!account || account.emailVerifiedAt) return null;
  return maskEmail(decryptSafe(account.emailEnc));
}
