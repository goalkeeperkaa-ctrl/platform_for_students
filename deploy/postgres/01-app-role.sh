#!/bin/sh
# Роль приложения в своей базе — при первом запуске на пустом томе.
#
# То же, что npm run db:provision, но для контейнера: скрипты из
# /docker-entrypoint-initdb.d выполняются один раз, когда PostgreSQL
# инициализирует пустой каталог данных.
#
# Роль умеет читать и писать строки — и только. Таблицы создают
# миграции, и ходят они администратором (DIRECT_DATABASE_URL). Права по
# умолчанию выданы заранее, поэтому таблицы из будущих миграций сразу
# видны приложению.
#
# Файл обязан храниться с переводами строк LF (см. .gitattributes):
# с CRLF sh внутри Linux-контейнера спотыкается на первой же строке.

set -eu

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD не задан}"

# Пароль подставляется в SQL литералом: параметры в CREATE ROLE
# PostgreSQL не принимает. Кавычка в пароле закрыла бы литерал,
# поэтому допускаются только буквы и цифры.
case "$APP_DB_PASSWORD" in
  *[!A-Za-z0-9]*)
    echo "APP_DB_PASSWORD: только латинские буквы и цифры" >&2
    exit 1
    ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
create role fhr_app with login password '$APP_DB_PASSWORD';

grant connect on database "$POSTGRES_DB" to fhr_app;
grant usage on schema public to fhr_app;

-- Таблицы создаст миграция от имени администратора: права на них
-- выдаются заранее, для объектов, которые он создаст потом
alter default privileges in schema public
  grant select, insert, update, delete on tables to fhr_app;
alter default privileges in schema public
  grant usage, select on sequences to fhr_app;

revoke create on schema public from public;
SQL

echo "роль fhr_app заведена"
