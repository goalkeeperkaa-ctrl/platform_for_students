/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Автономная сборка для контейнера: в .next/standalone попадает сервер
  // и ровно те модули, которые он импортирует. Образ не тянет исходники,
  // dev-зависимости и Prisma CLI. На `next dev` и `next start` не влияет.
  output: 'standalone',
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Prisma и ioredis тянут нативные бинарники — они не должны попадать
    // в бандл серверных компонентов.
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'ioredis'],
    // Включает instrumentation.ts — проверку конфигурации при старте
    instrumentationHook: true,
  },
};

export default nextConfig;
