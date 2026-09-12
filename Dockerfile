# Образы платформы для студентов.
#
#   docker build --target runner -t fhr-students-app .
#   docker build --target tools  -t fhr-students-tools .
#
# Два образа, а не один. `runner` — только то, что нужно для работы:
# собранный standalone-сервер без исходников, dev-зависимостей и
# Prisma CLI. `tools` — полный набор для миграций и служебных команд.
# Смешать их значит тащить компилятор и CLI базы в каждый рабочий
# контейнер, а заодно дать ему больше, чем нужно для обслуживания
# запросов.
#
# Debian slim, а не Alpine: движок Prisma на musl собирается под
# отдельную цель и ломается при малейшем расхождении версий OpenSSL.
# Выигрыш в размере того не стоит.

ARG NODE_IMAGE=node:20-bookworm-slim

# ---------- База: общая для всех стадий ----------
FROM ${NODE_IMAGE} AS base
# OpenSSL нужен движку Prisma, сертификаты — исходящим HTTPS-запросам
# (синхронизация с CRM)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Зависимости ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
# Клиент генерируется здесь, внутри Linux-образа: сгенерированный на
# машине разработчика содержит движок под его ОС и в контейнере не
# запустится
RUN npx prisma generate

# ---------- Сборка ----------
FROM deps AS build
COPY . .
ENV NODE_ENV=production
RUN npm run build

# ---------- Рабочий образ ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

# Не root: уязвимость в приложении не должна давать права на весь
# контейнер. Каталог загрузок заранее принадлежит пользователю
# приложения — иначе первая же загрузка фото упадёт с EACCES.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /data/uploads \
  && chown -R nextjs:nodejs /data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# В slim-образе нет ни curl, ни wget — проверяем тем, что есть
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ---------- Служебный образ ----------
# Миграции, заведение администратора, коды работодателей, ротация ключа.
FROM deps AS tools
COPY . .
USER node
CMD ["npx", "prisma", "migrate", "deploy"]
