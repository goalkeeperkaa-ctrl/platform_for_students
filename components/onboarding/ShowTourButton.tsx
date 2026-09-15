'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TOURS } from '@/lib/tour';
import type { Role } from '@/lib/types';

/**
 * «Показать инструкцию» на странице помощи. Вошедшему — ведёт на главную его
 * кабинета и запускает тур там; гостю кнопка не нужна, вместо неё — вход.
 */
export function ShowTourButton() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    // /api/auth/me отвечает гостю пустой сессией, а не 401: страница помощи
    // открыта без входа, и ошибка в консоли на ней была бы ложной тревогой
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ session: { role: Role } | null }>) : null))
      .then((data) => {
        if (!cancelled && data?.session) setRole(data.session.role);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!role) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Compass />}
      onClick={() => {
        try {
          sessionStorage.setItem('fhr_tour_force', '1');
        } catch {
          /* без хранилища тур просто не стартует сам */
        }
        router.push(TOURS[role].home);
      }}
    >
      Показать инструкцию по кабинету
    </Button>
  );
}
