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
    fetch('/api/tour', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ role: Role }>) : null))
      .then((data) => {
        if (!cancelled && data) setRole(data.role);
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
