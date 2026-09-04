# Fruct CRM

Мультитенантная CRM для розничного продавца компьютерных кресел (продажи через Авито): лиды,
сделки, склад, расчёт доставки, зарплата менеджеров, аналитика. Backend на NestJS + PostgreSQL
(Prisma) + Redis (BullMQ). Публичной регистрации нет — первый аккаунт (OWNER) создаётся только
через `prisma/seed.ts`.

Этот README описывает два независимых сценария:

1. [Локальная разработка](#1-локальная-разработка) — без Docker для самого приложения.
2. [Production на VPS](#2-production-на-vps) — полностью в Docker Compose + Caddy.

Технологический стек (см. `package.json`): NestJS 11, Prisma 6.19.3 / PostgreSQL 16,
`@nestjs/bullmq` + `ioredis` (Redis 7), `nestjs-cls` (мультитенантность), `nodemailer`
(почта через BullMQ-очередь), `telegraf` (Telegram-уведомления), DeepSeek API (расчёт
стоимости доставки, опционально).

---

## 1. Локальная разработка

### 1.1. Что нужно установить

- **Node.js 22.x** и **npm** (в комплекте с Node) — версия зафиксирована только в `Dockerfile` /
  `Dockerfile.dev` (`node:22-bookworm-slim`), отдельного `.nvmrc` или `engines` в `package.json`
  в репозитории нет, поэтому используйте Node 22, чтобы поведение совпадало с Docker-образом.
- **Docker** и **Docker Compose v2** (команда `docker compose`, не устаревшая `docker-compose`) —
  нужны, чтобы поднять PostgreSQL и Redis, не устанавливая их на хост напрямую.
- **git**.
- Компилятор C/C++ (`python3`, `make`, `g++`) — нужен, только если ваша платформа не имеет
  прекомпилированного бинарника для `bcrypt` (в `Dockerfile.dev` он ставится явно для Debian).
  Обычно `npm install` проходит без этого на macOS/Linux/Windows+WSL из коробки; если `bcrypt`
  не соберётся — установите эти три пакета и повторите `npm install`.

### 1.2. Клонирование репозитория

```bash
# Клонировать репозиторий и перейти в его директорию
git clone <URL_РЕПОЗИТОРИЯ> fruct
cd fruct
```

### 1.3. Установка зависимостей

```bash
# Установить все зависимости из package-lock.json
npm install
```

### 1.4. Создание `.env`

```bash
# Скопировать шаблон переменных окружения
cp .env.example .env
```

Откройте `.env` и заполните значения — см. таблицу ниже. `.env` уже в `.gitignore`, коммитить
его нельзя.

### 1.5. Переменные окружения

Валидация происходит в `src/common/config/env.validation.ts` при старте приложения: если
обязательная переменная пуста, приложение падает сразу с понятной ошибкой
`Некорректная конфигурация окружения: ...`.

**Обязательные (без них приложение не стартует):**

| Переменная | Для чего | Для локальной разработки |
|---|---|---|
| `DATABASE_URL` | строка подключения Prisma к PostgreSQL | `postgresql://fruct:fruct@localhost:5432/fruct_dev` (см. п. 1.6) |
| `REDIS_URL` | подключение BullMQ + кэша | `redis://localhost:6379` (см. п. 1.6) |
| `JWT_ACCESS_SECRET` | секрет для подписи access-токенов | любая непустая строка, например `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | секрет для подписи refresh-токенов | любая непустая строка (отличная от access-секрета) |
| `ADMIN_EMAIL` | email первого OWNER, создаётся `prisma/seed.ts` | ваш тестовый email |
| `SMTP_HOST` | хост SMTP-сервера | `localhost` — реальная отправка не обязательна, см. ниже |
| `SMTP_PORT` | порт SMTP-сервера | `1025` (произвольный, недоступность SMTP не мешает запуску) |
| `MAIL_FROM` | адрес отправителя писем | `noreply@localhost` |

Приложение стартует и обслуживает HTTP-запросы даже если SMTP реально недоступен — соединение
не проверяется при старте (`src/mailer/nodemailer-transport.factory.ts` создаёт транспорт лениво,
без `.verify()`), падают только письма, которые реально пытаются отправиться (сброс пароля,
seed-письмо с паролем и т.д.).

**Есть значение по умолчанию (можно оставить пустыми):**

| Переменная | Значение по умолчанию |
|---|---|
| `NODE_ENV` | `development` |
| `PORT` | `3001` |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |
| `TENANT_NAME` | `Магазин компьютерных кресел` (используется только `prisma/seed.ts`) |
| `ADMIN_FULL_NAME` | `Иванов Иван Иванович` (используется только `prisma/seed.ts`) |
| `SMTP_SECURE` | `false` |

**Можно оставить пустыми — функциональность просто деградирует:**

| Переменная | Что произойдёт, если пусто |
|---|---|
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` | `POST /delivery-calc/quote` вернёт `503` с понятным сообщением, что DeepSeek не сконфигурирован (`src/delivery-calc/deepseek-delivery-estimator.service.ts`). `POST /delivery-calc/manual-quote` работает без них. |
| `TELEGRAM_BOT_TOKEN` | Уведомления менеджерам уходят сразу на email вместо Telegram (`src/notifications/notifications.service.ts`). |
| `ADMIN_INITIAL_PASSWORD` | `prisma/seed.ts` сгенерирует случайный пароль и попробует отправить его на `ADMIN_EMAIL` по SMTP — см. п. 1.8. |
| `SMTP_USER`, `SMTP_PASS` | ок для локального SMTP-заглушки без авторизации. |
| `PASSWORD_RESET_URL_BASE` | ссылка в письме сброса пароля соберётся из `DOMAIN`, а если и он пуст — из `http://localhost:<PORT>`. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | **не используются** локальным сценарием вообще — `docker-compose.dev.yml` хардкодит свои `fruct`/`fruct`/`fruct_dev`; эти три переменные нужны только для `docker-compose.prod.yml` (см. раздел 2). |
| `DOMAIN`, `ACME_EMAIL` | не используются вне `docker-compose.prod.yml` / `Caddyfile`. |

### 1.6. PostgreSQL и Redis локально

В репозитории есть `docker-compose.dev.yml` с тремя сервисами: `postgres`, `redis`, `api`. Для
локальной разработки без Docker для самого NestJS-приложения поднимите только БД и Redis:

```bash
# Поднять только postgres и redis из docker-compose.dev.yml в фоне
docker compose -f docker-compose.dev.yml up -d postgres redis
```

Это создаёт Postgres с учётными данными `fruct`/`fruct`/`fruct_dev` на `localhost:5432` и Redis
на `localhost:6379` (хардкод в файле, не зависит от `.env`) — отсюда значения `DATABASE_URL` /
`REDIS_URL` в таблице выше.

```bash
# Проверить, что оба контейнера healthy
docker compose -f docker-compose.dev.yml ps
```

**Альтернатива:** можно поднять и NestJS-приложение внутри Docker (со сборкой из
`Dockerfile.dev`, hot-reload через bind mount):

```bash
# Поднять всё, включая api, с пересборкой образа
docker compose -f docker-compose.dev.yml up --build
```

В этом случае шаги 1.3, 1.9 не нужны — `Dockerfile.dev` сам делает `npm install`,
`prisma generate`, `prisma migrate deploy`, `prisma db seed` и `npm run start:dev` внутри
контейнера (см. `CMD` в `Dockerfile.dev`). Дальше в этом README описан вариант «БД в Docker,
приложение на хосте», как более быстрый для разработки.

### 1.7. Применение миграций Prisma

```bash
# Применить существующие миграции (prisma/migrations) к базе из DATABASE_URL
npx prisma migrate deploy
```

В репозитории сейчас одна миграция: `prisma/migrations/20260904175943_init`. Эта же команда
безопасна для повторного запуска (Prisma просто увидит, что применять нечего).

### 1.8. Seed (создание первого OWNER)

```bash
# Выполнить prisma/seed.ts (пропишется в package.json как "prisma": { "seed": ... })
npx prisma db seed
```

Условия успешного выполнения (см. `prisma/seed.ts`):

- Миграции уже применены (иначе таблиц не будет).
- `ADMIN_EMAIL` задан — иначе скрипт сразу падает с понятной ошибкой.
- Скрипт идемпотентен: если в базе уже есть хотя бы один `Tenant`, он просто выведет
  `[seed] Tenant уже существует — пропускаем бутстрап` и завершится успешно (код 0).
- **Если `ADMIN_INITIAL_PASSWORD` не задан:** генерируется случайный пароль, тенант и OWNER
  создаются в БД, и скрипт пытается отправить пароль на `ADMIN_EMAIL` по SMTP. Если SMTP
  недоступен — тенант/OWNER **уже созданы** (транзакция закоммичена), но скрипт завершится с
  кодом 1 и сообщением о том, что пароль нужно будет восстановить через `/auth/forgot-password`
  либо пересоздать тенант с явным `ADMIN_INITIAL_PASSWORD`. Пароль никогда не пишется в лог.
- **Для локальной разработки проще всего** явно задать `ADMIN_INITIAL_PASSWORD` в `.env` —
  тогда письмо не отправляется вообще, и рабочий SMTP для первого запуска не нужен.

### 1.9. Запуск в development-режиме

```bash
# Запустить NestJS с watch-режимом (пересборка при изменении файлов)
npm run start:dev
```

При успешном старте в логе будет строка `API запущено на порту 3001 (Swagger: /api/docs)`.

### 1.10. Локальные адреса

(Порт `3001` — если вы не меняли `PORT` в `.env`.)

| Адрес | Что это |
|---|---|
| `http://localhost:3001` | база для всех API-роутов, без общего префикса (`/leads`, `/deals`, `/auth/login` и т.д. — `setGlobalPrefix` не используется) |
| `http://localhost:3001/api/docs` | Swagger UI (`SwaggerModule.setup('api/docs', ...)` в `src/main.ts`) |
| `http://localhost:3001/api/docs-json` | тот же документ в формате OpenAPI JSON |
| `http://localhost:3001/health` | healthcheck (`src/app.controller.ts`), публичный, без авторизации, возвращает `{"status":"ok"}` |
| `http://localhost:3001/auth/login` | вход по email/паролю — единственный способ получить токен (публичной регистрации нет) |

### 1.11. Build, lint, тесты, Prisma-команды

Все команды ниже — реальные скрипты из `package.json`.

```bash
# Собрать проект (nest build) в dist/
npm run build

# Прогнать ESLint с автофиксом по src/apps/libs/test
npm run lint

# Отформатировать код prettier'ом (src/ и test/)
npm run format
```

**Юнит-тестов в проекте пока нет** (`*.spec.ts` вне `test/` отсутствуют) — `npm test` честно
завершится с кодом 1 и сообщением `No tests found, exiting with code 1`, это ожидаемо, не
баг. Всё тестовое покрытие — e2e-тесты в `test/*.e2e-spec.ts`.

```bash
# E2E-тесты поднимают весь Nest-модуль (guards, tenant-extension, BullMQ) против реальных
# Postgres/Redis. pretest:e2e сам выполнит `prisma migrate deploy` на DATABASE_URL из окружения.
# Используйте ОТДЕЛЬНУЮ базу данных, а не ту, где ваши рабочие данные — тесты создают и удаляют
# тестовые тенанты.

# Один раз создать отдельную тестовую базу в уже поднятом контейнере postgres:
docker compose -f docker-compose.dev.yml exec postgres psql -U fruct -d fruct_dev \
  -c "CREATE DATABASE fruct_test OWNER fruct;"

# Экспортировать переменные окружения именно для тестового прогона (не путать с dev .env)
export DATABASE_URL="postgresql://fruct:fruct@localhost:5432/fruct_test"
export REDIS_URL="redis://localhost:6379"
export JWT_ACCESS_SECRET="e2e-access-secret"
export JWT_REFRESH_SECRET="e2e-refresh-secret"
export ADMIN_EMAIL="e2e-admin@example.com"
export SMTP_HOST="127.0.0.1"
export SMTP_PORT="2525"
export MAIL_FROM="crm@example.com"
export NODE_ENV="test"

# Запустить полный e2e-набор (test/*.e2e-spec.ts)
npm run test:e2e
```

Сейчас в `test/` четыре набора: `users.e2e-spec.ts`, `tenant-isolation.e2e-spec.ts`,
`catalog-and-deals.e2e-spec.ts`, `payouts-and-analytics.e2e-spec.ts` (плюс `test/support/` с
общими хелперами, это не тест-файл).

```bash
# Сгенерировать Prisma Client заново (обычно не нужно вручную — делает npm install через postinstall
# в @prisma/client, но полезно после смены схемы)
npx prisma generate

# Создать новую миграцию из изменений в prisma/schema.prisma (диалоговый режим, для разработки)
npx prisma migrate dev

# Применить существующие миграции без создания новых (то же, что и в п. 1.7)
npx prisma migrate deploy

# Открыть Prisma Studio — визуальный браузер данных на http://localhost:5555
npx prisma studio
```

(Эти же команды продублированы в `package.json` как `npm run prisma:generate`,
`npm run prisma:migrate:dev`, `npm run prisma:migrate:deploy`, `npm run prisma:seed`,
`npm run prisma:studio` — можно использовать любую форму.)

### 1.12. Полная остановка и очистка

```bash
# Остановить NestJS-процесс — Ctrl+C в терминале, где выполнялся npm run start:dev

# Остановить и удалить контейнеры postgres/redis вместе с volume (все локальные данные удалятся)
docker compose -f docker-compose.dev.yml down -v
```

`down -v` удаляет именованные volume'ы `postgres_dev_data` и `api_node_modules` — после этого
следующий `docker compose -f docker-compose.dev.yml up -d postgres redis` начнёт с пустой базы,
и миграции/seed (п. 1.7–1.8) нужно будет выполнить заново.

---

## 2. Production на VPS

Инструкция для чистого Ubuntu VPS. Весь production-стек (`postgres`, `redis`, `api`, `caddy`)
работает через `docker-compose.prod.yml` — Node.js на сам VPS ставить не нужно, только Docker.

### 2.1. Подготовка VPS

```bash
# Обновить пакеты системы
sudo apt update && sudo apt upgrade -y

# Открыть в файрволе только то, что реально нужно: SSH, HTTP, HTTPS
# (порты postgres/redis/api в docker-compose.prod.yml наружу не публикуются вообще —
# наружу торчит только caddy на 80/443, см. комментарии в самом файле)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Также в облачной панели (если она есть, помимо `ufw` на самой машине) откройте порты 80 и 443
для входящего трафика.

### 2.2. Установка Docker и Docker Compose

Если Docker ещё не установлен на VPS:

```bash
# Официальный скрипт установки Docker Engine (включает плагин docker compose v2)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Разрешить запускать docker без sudo текущему пользователю (перелогиньтесь после этого)
sudo usermod -aG docker $USER
```

```bash
# Проверить версии
docker --version
docker compose version
```

### 2.3. Клонирование репозитория

```bash
git clone <URL_РЕПОЗИТОРИЯ> fruct
cd fruct
```

### 2.4. Production `.env`

```bash
cp .env.example .env
```

`docker-compose.prod.yml` объявляет `env_file: - .env` для сервиса `api` — этот файл должен
лежать рядом с `docker-compose.prod.yml` на VPS. Не коммитьте его.

### 2.5. Обязательные production-переменные — что и откуда

| Переменная | Откуда взять | Комментарий |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | придумываете сами | из них `docker-compose.prod.yml` сам собирает `DATABASE_URL` (`postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`) — **само поле `DATABASE_URL` в `.env` оставьте пустым**, это явно прокомментировано в `.env.example` |
| `REDIS_URL` | не задавайте — `docker-compose.prod.yml` жёстко прописывает `redis://redis:6379` для сервиса `api` | можно оставить пустым в `.env` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | сгенерировать самостоятельно, см. п. 2.6 | обязательны, любые два разных секрета |
| `ADMIN_EMAIL` | реальный email владельца магазина | на него `prisma/seed.ts` создаст первого OWNER |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | от вашего почтового провайдера (SMTP-релей, например Yandex/Mailgun/Postmark и т.п.) | `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` обязательны для старта приложения; без рабочего SMTP письма (сброс пароля, seed-письмо, уведомления) не будут доставляться, но само приложение стартует |
| `DOMAIN` | ваш домен, указывающий на VPS (см. п. 2.7) | **обязателен для Caddy** — без него `Caddyfile` не парсится вообще (проверено `caddy validate`, см. п. 2.9) |
| `ACME_EMAIL` | ваш email для Let's Encrypt | **обязателен для Caddy** по той же причине — `email {$ACME_EMAIL}` в `Caddyfile` не проходит валидацию с пустым значением |

### 2.6. Секреты, которые нужно сгенерировать самостоятельно

```bash
# JWT-секреты — два разных случайных значения
openssl rand -hex 32   # -> вставить в JWT_ACCESS_SECRET
openssl rand -hex 32   # -> вставить в JWT_REFRESH_SECRET

# Пароль для PostgreSQL
openssl rand -base64 24   # -> вставить в POSTGRES_PASSWORD
```

`POSTGRES_USER`/`POSTGRES_DB` не обязаны быть секретными — просто осмысленные имена
(например `fruct_prod` / `fruct`).

`ADMIN_INITIAL_PASSWORD` — не обязателен, но рекомендуется задать явно на первом запуске
production (см. п. 2.14), чтобы не зависеть от того, что SMTP уже настроен правильно к моменту
первого `docker compose up`.

### 2.7. DNS

Создайте A-запись (и AAAA, если у VPS есть IPv6) для домена из `DOMAIN`, указывающую на
публичный IP-адрес VPS:

```
A     example.com     ->   <IP вашего VPS>
```

Дайте записи распространиться (обычно от пары минут до часа) и проверьте перед запуском Caddy:

```bash
# Должен вернуть IP вашего VPS
dig +short example.com
```

### 2.8. Как Caddy получает HTTPS

`Caddyfile` в репозитории:

```caddyfile
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	reverse_proxy api:3001
}
```

Это стандартный автоматический HTTPS Caddy: при первом запросе на 443 Caddy сам запрашивает
сертификат Let's Encrypt для `{$DOMAIN}` через ACME HTTP-01/TLS-ALPN-01 challenge (для этого и
нужны открытые 80/443 из п. 2.1) и дальше проксирует весь трафик на `api:3001` — имя `api`
разрешается внутри Docker-сети `docker-compose.prod.yml` в контейнер сервиса `api`. Сертификаты
и состояние ACME хранятся в volume'ах `caddy_data`/`caddy_config`, поэтому переживают рестарт
контейнера.

### 2.9. Проверка `Caddyfile` перед запуском

```bash
# Скачать образ caddy и провалидировать синтаксис файла реальным бинарником Caddy,
# подставив DOMAIN/ACME_EMAIL так же, как их подставит docker-compose.prod.yml
docker run --rm --env-file .env \
  -v "$(pwd)/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ожидаемый вывод заканчивается строкой `Valid configuration`. Если `DOMAIN` или `ACME_EMAIL` в
`.env` пустые — валидация упадёт с ошибкой парсинга (это проверено: пустой `ACME_EMAIL` даёт
`wrong argument count`, пустой `DOMAIN` — `server block without any key is global
configuration`), так что эта команда заодно проверяет, что оба поля заполнены.

### 2.10. Проверка `docker-compose.prod.yml`

```bash
# Проверить синтаксис compose-файла и то, как подставятся переменные из .env,
# без реального запуска контейнеров
docker compose -f docker-compose.prod.yml config
```

Убедитесь, что в выводе `DATABASE_URL` собрался из ваших `POSTGRES_*` значений
(`postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>`), а не остался
пустым или с плейсхолдером `${...}`.

### 2.11. Первый Docker build

```bash
# Собрать образ сервиса api (многостадийный Dockerfile: build -> runtime-deps -> runtime)
docker compose -f docker-compose.prod.yml build api
```

Сборка тянет `node:22-bookworm-slim`, ставит `python3`/`make`/`g++`/`openssl`, делает
`npm ci`, `npx prisma generate`, `npm run build`, затем отдельно пересобирает
production-only `node_modules` и копирует `dist/` в финальный образ под непривилегированным
пользователем `appuser` (см. `Dockerfile`).

> **Честное ограничение этой инструкции:** в песочнице, где готовился этот README, исходящий
> трафик контейнеров идёт через политику-фильтрующий прокси, который возвращает `403` именно на
> `apt-get update` внутри контейнера (подтверждено напрямую, это не проблема сертификатов или
> `--network host`) — то есть **реальный `docker build` в этой конкретной песочнице выполнить
> нельзя**, и это не было выполнено как часть проверки README. `Dockerfile` был проверен только
> статически (чтение, синтаксис, соответствие compose-файлу). На обычном VPS с обычным доступом
> в интернет `apt-get`/`npm ci` внутри `docker build` отработают штатно — но именно эту команду
> нужно один раз реально прогнать на VPS перед первым запуском.

### 2.12. Запуск production stack

```bash
# Поднять все 4 сервиса (postgres, redis, api, caddy) в фоне
docker compose -f docker-compose.prod.yml up -d
```

Порядок старта управляется `depends_on: condition: service_healthy` в самом файле:
`api` ждёт healthy `postgres` и `redis`, `caddy` ждёт healthy `api`.

Первый запуск `api`-контейнера сам выполняет `npx prisma migrate deploy && npx prisma db seed &&
node dist/main.js` (это `CMD` в `Dockerfile`) — отдельно эти два шага руками на VPS выполнять не
нужно, если вас устраивает автоматический бутстрап на старте. Ручные варианты — в п. 2.13–2.14,
если нужно применить миграции без пересоздания контейнера (например, после обновления, см. п. 2.21).

### 2.13. Миграции Prisma в production вручную

```bash
# Выполнить migrate deploy внутри уже собранного образа api, не трогая работающий контейнер
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

### 2.14. Production seed вручную

```bash
# Тот же принцип — одноразовый запуск, не сам работающий контейнер
docker compose -f docker-compose.prod.yml run --rm api npx prisma db seed
```

Все условия из п. 1.8 (обязателен `ADMIN_EMAIL`, идемпотентность, поведение при недоступном
SMTP) справедливы и здесь. Для первого production-запуска разумно явно задать
`ADMIN_INITIAL_PASSWORD` в `.env` перед первым `docker compose up`, чтобы не зависеть от того,
успеет ли SMTP заработать к этому моменту — а затем сменить пароль через
`/auth/reset-password` после первого входа.

### 2.15. Проверка состояния контейнеров

```bash
# Статус и healthcheck каждого сервиса
docker compose -f docker-compose.prod.yml ps
```

Все четыре сервиса (`postgres`, `redis`, `api`, `caddy`) должны быть `running`/`healthy`
(healthcheck описан прямо в `docker-compose.prod.yml` для `postgres`/`redis`/`api`; у `caddy`
явного healthcheck нет, ориентируйтесь на его логи, см. п. 2.19).

### 2.16. Проверка `/health`

```bash
# Изнутри VPS, в обход Caddy, напрямую до контейнера api
docker compose -f docker-compose.prod.yml exec api \
  node -e "require('http').get('http://localhost:3001/health', r => { console.log(r.statusCode); r.pipe(process.stdout); })"
```

Ожидаемо: код `200` и тело `{"status":"ok"}`. Это тот же самый вызов, что использует
`HEALTHCHECK` в `Dockerfile`.

### 2.17. Проверка API через домен

```bash
# Снаружи, через Caddy и HTTPS
curl -i https://<ваш DOMAIN>/health
```

Ожидаемо: `200 OK`, `{"status":"ok"}`, и валидный TLS-сертификат (curl не должен ругаться на
сертификат при штатной установке `curl` без флагов вроде `-k`).

### 2.18. Swagger в production

```
https://<ваш DOMAIN>/api/docs        — Swagger UI
https://<ваш DOMAIN>/api/docs-json   — OpenAPI JSON
```

Пути идентичны локальным (см. п. 1.10) — Caddy просто проксирует весь трафик на `api:3001`, не
меняя маршруты.

> Swagger включён без ограничений и в production-сборке (в коде нет условия
> `NODE_ENV === 'production'`, отключающего `SwaggerModule.setup`). Если для вашего деплоя это
> нежелательно (публичная документация всех эндпоинтов), это отдельное архитектурное решение,
> которое здесь сознательно не принимается — README только описывает то, что есть в репозитории.

### 2.19. Логи

```bash
# Логи приложения (NestJS), в реальном времени
docker compose -f docker-compose.prod.yml logs -f api

# Логи PostgreSQL
docker compose -f docker-compose.prod.yml logs -f postgres

# Логи Redis
docker compose -f docker-compose.prod.yml logs -f redis

# Логи Caddy (в т.ч. получение сертификатов, ACME challenge)
docker compose -f docker-compose.prod.yml logs -f caddy

# Логи всех сервисов сразу
docker compose -f docker-compose.prod.yml logs -f
```

### 2.20. Перезапуск приложения

```bash
# Перезапустить только сервис api, не трогая postgres/redis/caddy
docker compose -f docker-compose.prod.yml restart api
```

Учтите: `restart` заново выполняет `CMD` из `Dockerfile`, то есть снова прогонит
`prisma migrate deploy && prisma db seed` перед стартом Node — это безопасно и идемпотентно
(миграции уже применены — Prisma просто это увидит; seed увидит существующий `Tenant` и
пропустит бутстрап).

### 2.21. Обновление проекта после `git push`

```bash
# 1. Забрать новые изменения
git pull

# 2. Пересобрать образ api с учётом новых зависимостей/кода
docker compose -f docker-compose.prod.yml build api

# 3. Пересоздать контейнер api новым образом (миграции применятся автоматически через CMD)
docker compose -f docker-compose.prod.yml up -d api

# Проверить, что всё поднялось штатно
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

Если в новом коммите добавлена новая Prisma-миграция — она применится сама на шаге 3 (через
`CMD` в `Dockerfile`), отдельно вызывать `migrate deploy` не нужно. `postgres`/`redis`/`caddy`
трогать не нужно, если их конфигурация не менялась.

### 2.22. Безопасная остановка production

```bash
# Остановить все контейнеры, СОХРАНИВ данные (volume'ы postgres_prod_data/redis_prod_data/
# caddy_data/caddy_config остаются на диске)
docker compose -f docker-compose.prod.yml down
```

**Не используйте `down -v` на production** без осознанного намерения — флаг `-v` удаляет
volume'ы, то есть безвозвратно удалит базу данных, если у вас нет свежего бэкапа (см. п. 2.23).

### 2.23. Backup и restore PostgreSQL

```bash
# Backup: pg_dump внутри контейнера postgres, используя его собственные POSTGRES_USER/POSTGRES_DB
# (они уже есть в окружении контейнера — не нужно дублировать значения из .env в команде)
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

```bash
# Restore: залить дамп обратно в ту же базу
# ВНИМАНИЕ: это накатывает поверх существующих данных — на пустую/новую базу применять безопаснее
cat backup_YYYYMMDD_HHMMSS.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Разумная практика — регулярно копировать файлы `backup_*.sql` за пределы VPS (например, `scp`
на другую машину или в объектное хранилище), а не хранить только на самом сервере.

### 2.24. Типичные проблемы

**Контейнер `api` не стартует / постоянно перезапускается**

```bash
docker compose -f docker-compose.prod.yml logs api
```

Самая частая причина именно в этом проекте — первый запуск `prisma db seed` упал из-за
недоступного SMTP (см. п. 1.8/2.14): ищите в логе строку `[seed] Владелец создан, но письмо с
временным паролем не удалось отправить...`. **Важно:** тенант и OWNER в этом случае уже
созданы в базе — исправьте `SMTP_*` в `.env`, затем либо сбросьте пароль через
`/auth/forgot-password` (после исправления SMTP), либо (если тенант ещё не нужен) удалите его
из БД и пересоздайте `docker compose ... run --rm api npx prisma db seed` с явным
`ADMIN_INITIAL_PASSWORD`.

**Миграция не применяется**

```bash
# Прогнать migrate deploy отдельно от общего CMD, чтобы увидеть чистый вывод Prisma
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

Частые причины: `postgres` ещё не healthy на момент старта `api` (проверьте
`docker compose -f docker-compose.prod.yml ps postgres`), либо `DATABASE_URL` не собрался
(проверьте `docker compose -f docker-compose.prod.yml config`, см. п. 2.10).

**База (`postgres`) недоступна**

```bash
docker compose -f docker-compose.prod.yml ps postgres
docker compose -f docker-compose.prod.yml logs postgres
```

Если контейнер `postgres` не healthy — смотрите его лог напрямую. Отдельный частый случай:
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` поменяли в `.env` **после** первого запуска —
официальный образ `postgres` применяет эти переменные только к пустому `data`-каталогу, при
существующем volume `postgres_prod_data` смена `.env` ничего не изменит в уже созданной роли/
базе, и `api` начнёт получать ошибку аутентификации. Либо верните старые значения в `.env`,
либо меняйте пользователя/пароль штатным способом внутри Postgres (`ALTER USER ... PASSWORD
...` через `psql`), а не через переменные окружения задним числом.

**Redis недоступен**

```bash
docker compose -f docker-compose.prod.yml ps redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

Ожидаемый ответ — `PONG`. Если контейнер не healthy — смотрите
`docker compose -f docker-compose.prod.yml logs redis`.

**Caddy не получает сертификат**

```bash
docker compose -f docker-compose.prod.yml logs caddy
```

Типичные причины (в порядке вероятности): DNS ещё не указывает на этот VPS (проверьте
`dig +short <DOMAIN>` — см. п. 2.7), порты 80/443 закрыты файрволом хостинг-провайдера или
`ufw` (см. п. 2.1), либо `DOMAIN`/`ACME_EMAIL` в `.env` пустые или неверные (см. п. 2.9 —
`caddy validate` ловит это ещё до запуска). Let's Encrypt также ограничивает число попыток
выпуска сертификата на домен в единицу времени — при частых перезапусках с неверным DNS можно
временно упереться в rate limit, тогда придётся подождать (детали — в логе `caddy`).

**Домен не открывается**

Проверяйте по порядку: `dig +short <DOMAIN>` (DNS дошёл?) → `docker compose -f
docker-compose.prod.yml ps` (все контейнеры healthy?) → `docker compose -f
docker-compose.prod.yml logs caddy` (получен ли сертификат?) → `sudo ufw status` (порты 80/443
открыты?).

**Приложение возвращает 500**

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Прежде всего проверяйте `PrismaExceptionFilter` (`src/common/filters/prisma-exception.filter.ts`) —
он превращает ожидаемые ошибки Prisma в осмысленные HTTP-коды (404/409 и т.п.); настоящий 500
в логе `api` будет содержать полный стектрейс исходной ошибки — начинайте с него, а не гадайте.

---

## Известные ограничения этого README

- Реальная сборка `docker build` / `docker compose build` для этого проекта не была выполнена в
  среде, где готовилась документация (см. п. 2.11) — только статическая проверка `Dockerfile`,
  `docker-compose.prod.yml` (`docker compose config`) и `Caddyfile` (`caddy validate`). Перед
  первым продакшн-деплоем обязательно реально выполните `docker compose -f
  docker-compose.prod.yml build api` и `up -d` на самом VPS и убедитесь, что все шаги раздела 2
  проходят на практике.
