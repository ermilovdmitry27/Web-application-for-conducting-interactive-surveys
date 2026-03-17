# quiz-app

`quiz-app` — локальное веб-приложение для создания и прохождения квизов.  
Frontend написан на React, backend — на Express, данные хранятся в PostgreSQL, live-режим работает через WebSocket.

## Возможности

### Organizer
- регистрация и вход с ролью организатора
- создание и редактирование квизов
- настройка правил, лимитов и вопросов
- загрузка изображений для вопросов
- просмотр статистики, попыток и live-сессий

### Participant
- регистрация и вход с ролью участника
- прохождение обычных квизов
- вход в live-комнату по коду
- просмотр истории попыток и результатов

### Live quiz
- запуск live-сессии организатором
- подключение участников в реальном времени
- старт, пауза, продолжение, переход к следующему вопросу
- финальный leaderboard

### Profile / avatar
- редактирование профиля
- загрузка аватара
- синхронизация профиля между страницами

## Стек

- React
- Express
- PostgreSQL
- WebSocket (`ws`)

Дополнительно используются:
- `react-router-dom`
- `pg`
- `multer`
- `cors`
- `bcryptjs`

## Требования

Перед запуском должны быть установлены:

- Node.js
- npm
- PostgreSQL

Проверка:

```bash
node -v
npm -v
psql --version
```

## Переменные окружения

Скопируйте шаблон:

```bash
cp .env.example .env
```

Минимальный пример `.env`:

```env
API_PORT=4000
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=change-me-to-long-random-secret
JWT_EXPIRES_IN=7d
JSON_BODY_LIMIT=6mb
MAX_AVATAR_DATA_URL_LENGTH=4194304
MAX_QUIZ_TITLE_LENGTH=120
MAX_QUIZ_DESCRIPTION_LENGTH=1000
MAX_QUIZ_CATEGORY_LENGTH=80
MAX_QUIZ_QUESTIONS=50
MAX_QUIZ_DURATION_MINUTES=240
MIN_QUIZ_QUESTION_TIME_SECONDS=5
MAX_QUIZ_QUESTION_TIME_SECONDS=600
MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT=10
MAX_QUESTION_TEXT_LENGTH=300
MAX_OPTION_TEXT_LENGTH=180
MAX_QUESTION_OPTIONS=8
MAX_QUESTION_IMAGE_FILE_SIZE=5242880
WS_PATH=/ws
WS_HEARTBEAT_MS=30000
LIVE_AUTO_TICK_MS=1000

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=quiz_app

REACT_APP_API_URL=http://localhost:4000
REACT_APP_WS_PATH=/ws
REACT_APP_MAX_AVATAR_SIZE=2097152
```

Примечания:

- backend читает настройки из `.env` через `dotenv`
- frontend использует `REACT_APP_API_URL`, `REACT_APP_WS_PATH` и `REACT_APP_MAX_AVATAR_SIZE`
- `REACT_APP_MAX_AVATAR_SIZE` задает лимит размера для avatar upload на странице профиля
- таблицы в PostgreSQL создаются backend-ом автоматически при старте

## Локальный PostgreSQL

### 1. Поднимите PostgreSQL

Пример для Ubuntu/Debian:

```bash
sudo systemctl start postgresql
```

Если у вас PostgreSQL установлен как cluster-based service:

```bash
sudo pg_ctlcluster 16 main start
```

Проверка доступности:

```bash
pg_isready -h 127.0.0.1 -p 5432
```

### 2. Создайте базу `quiz_app`

```bash
psql -U postgres -c "CREATE DATABASE quiz_app;"
```

Если база уже существует, шаг можно пропустить.

## Установка и запуск

### 1. Установите зависимости

```bash
npm install
```

### 2. Проверьте проект

```bash
npm run verify
```

`verify` выполняет:

- `node --check server/index.js`
- `node --check server/db.js`
- production build frontend-а

### 3. Запустите frontend и backend вместе

```bash
npm run dev
```

Эта команда запускает:

- backend: `npm run server`
- frontend: `npm start`

Если нужен раздельный запуск:

```bash
npm run server
npm start
```

## Dev seed

Чтобы быстро получить локальные тестовые данные:

```bash
npm run seed:dev
```

Seed создаёт:

- organizer user
- participant user
- classic quiz
- live-ready quiz
- one classic attempt

Тестовые логины:

- `organizer.dev@example.com` / `Organizer123!`
- `participant.dev@example.com` / `Participant123!`

Доступные join codes:

- `CLASS1`
- `LIVE01`

Важно:

- live session заранее не создаётся
- для ручной проверки live flow её нужно запускать из UI organizer на seeded live-ready quiz

## Reset local DB

Для полного локального сброса состояния проекта:

```bash
npm run reset:db
```

Эта команда:

- удаляет только проектные таблицы `quiz-app`
- заново создаёт схему через текущий `server/db-init.js`

Чтобы после reset сразу получить предсказуемые dev-данные:

```bash
npm run seed:reset
```

Если нужен только seed поверх уже существующей схемы:

```bash
npm run seed:dev
```

Важно:

- `reset:db` и `seed:reset` это destructive dev-команды для текущей БД из `.env`
- удаляются данные только project tables: `users`, `quizzes`, `quiz_attempts`, `quiz_sessions`, `quiz_session_participants`, `quiz_session_answers`
- рабочее локальное состояние восстанавливается командой `npm run seed:dev` или `npm run seed:reset`

## Security baseline

Backend уже включает минимальный baseline security hardening:

- отключён `X-Powered-By`
- добавлены базовые security headers
- включён lightweight rate limiting для auth routes
- включён lightweight rate limiting для question image upload

Для локальной разработки это обычно незаметно, но при слишком частых запросах:

- к auth endpoints возможен `429`
- к question image upload route возможен `429`

## URL по умолчанию

- frontend: `http://localhost:3000`
- backend API: `http://localhost:4000`
- backend uploads: `http://localhost:4000/uploads/...`
- WebSocket path: `/ws`

## Структура проекта

### Frontend

- [src/pages](/home/user/quiz-app/src/pages)
  Основные страницы приложения: кабинеты, live-страницы, профиль, создание квиза, auth.
- [src/pages/create-quiz](/home/user/quiz-app/src/pages/create-quiz)
  UI-блоки страницы создания/редактирования квиза.
- [src/pages/organizer-live](/home/user/quiz-app/src/pages/organizer-live)
  UI-компоненты live-режима организатора.
- [src/pages/participant-quiz](/home/user/quiz-app/src/pages/participant-quiz)
  UI-компоненты live-режима участника.
- [src/lib/api](/home/user/quiz-app/src/lib/api)
  Общая API-конфигурация и helper для авторизованных запросов.
- [src/lib/websocket.js](/home/user/quiz-app/src/lib/websocket.js)
  Клиентская обвязка WebSocket.

### Backend

- [server/index.js](/home/user/quiz-app/server/index.js)
  Главный HTTP/WebSocket entrypoint.
- [server/live](/home/user/quiz-app/server/live)
  Live session helpers, runtime queries, context, leaderboard, results, transitions.
- [server/quiz](/home/user/quiz-app/server/quiz)
  Sanitize/score helpers для квизов и ответов.
- [server/auth](/home/user/quiz-app/server/auth)
  JWT auth helpers и middleware.
- [server/mappers](/home/user/quiz-app/server/mappers)
  Mappers для users, quizzes, attempts и live context.
- [server/db-init.js](/home/user/quiz-app/server/db-init.js)
  Автосоздание и поддержка схемы БД.
- [server/sql/init.sql](/home/user/quiz-app/server/sql/init.sql)
  SQL-схема проекта.

## Что проверить после запуска

Короткий smoke test:

1. Открыть `http://localhost:3000`.
2. Зарегистрировать organizer и participant.
3. Войти под organizer и создать квиз.
4. Загрузить изображение вопроса.
5. Сохранить квиз и убедиться, что он появился в кабинете организатора.
6. Запустить live-сессию и получить join code.
7. Войти под participant, подключиться по коду и ответить на вопросы.
8. Проверить финальный leaderboard.
9. Открыть профиль и обновить аватар.

## Полезные замечания

- Backend ожидает доступный PostgreSQL до старта `npm run server`.
- Если API не поднимается, сначала проверьте `.env` и подключение к БД.
- При первом старте backend сам создаёт необходимые таблицы, поэтому отдельного шага миграций в текущем проекте нет.
