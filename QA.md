# QA

Короткий manual smoke-checklist для локальной проверки `quiz-app` после рефакторинга.  
Файл ориентирован на быстрый прогон основных пользовательских сценариев без изменения данных и без deep-dive тестирования.

## Перед началом

- [ ] PostgreSQL поднят, база `quiz_app` доступна
- [ ] `.env` настроен
- [ ] зависимости установлены: `npm install`
- [ ] базовая проверка прошла: `npm run verify`
- [ ] полный quality gate прошел: `npm run verify:ci`
- [ ] browser smoke прошел: `npm run test:e2e`
- [ ] приложение запущено: `npm run dev`
- [ ] доступны две учётные записи:
  - organizer
  - participant
- [ ] удобно открыть 2 браузерные сессии или обычное окно + private window

Используемые URL по умолчанию:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`

## Auth

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Открыть `/registration`, зарегистрировать organizer | Успешная регистрация, можно войти | [ ] | [ ] |
| Открыть `/registration`, зарегистрировать participant | Успешная регистрация, можно войти | [ ] | [ ] |
| Войти под organizer через `/login` | Редирект в `/organizer` | [ ] | [ ] |
| Выйти и войти под participant | Редирект в `/participant` | [ ] | [ ] |
| Открыть protected route без токена | Редирект на `/login` | [ ] | [ ] |

## Organizer cabinet

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Войти под organizer и открыть `/organizer` | Страница кабинета загружается без page error | [ ] | [ ] |
| Проверить hero, feature deck, analytics | Блоки рендерятся, без сломанной вёрстки | [ ] | [ ] |
| Убедиться, что список квизов загружается | Отображаются карточки квизов или пустое состояние | [ ] | [ ] |
| Нажать `Создать квиз` | Переход на `/organizer/quizzes/new` | [ ] | [ ] |

## Create/Edit quiz

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Открыть `/organizer/quizzes/new` | Страница создания квиза открывается без page error | [ ] | [ ] |
| Заполнить basics, timing, rules | Поля редактируются, значения сохраняются в UI | [ ] | [ ] |
| Изменить количество вопросов | Список вопросов перестраивается корректно | [ ] | [ ] |
| Заполнить минимум один валидный квиз и сохранить | Успешное сохранение, редирект в кабинет organizer | [ ] | [ ] |
| Из кабинета открыть `Редактировать` существующий квиз | Форма edit mode загружается с текущими данными | [ ] | [ ] |
| Изменить одно поле и сохранить | Изменения сохраняются без regressions | [ ] | [ ] |

## Image upload

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| В create/edit quiz выбрать тип вопроса `С изображением` | Появляется блок загрузки изображения | [ ] | [ ] |
| Загрузить валидный `png/jpg/webp/gif` | Файл успешно загружается | [ ] | [ ] |
| Проверить preview после upload | Показывается загруженное изображение | [ ] | [ ] |
| Обновить изображение через `Заменить изображение` | Preview обновляется новым файлом | [ ] | [ ] |
| Удалить изображение | Preview исчезает, `imageUrl` очищается в UI | [ ] | [ ] |
| Попробовать невалидный тип файла | Появляется понятная ошибка, страница не ломается | [ ] | [ ] |

Проверить отдельно:

- endpoint upload: `POST /api/uploads/question-image`
- поле файла: `image`

## Live quiz as organizer

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Из organizer cabinet открыть live-страницу квиза | Открывается `/organizer/live/:quizId` | [ ] | [ ] |
| До старта проверить lobby state | Показывается lobby / session brief / control rail | [ ] | [ ] |
| Нажать `Старт` | Сессия стартует, появляется active question panel | [ ] | [ ] |
| Нажать `Пауза` | Сессия переходит в paused state | [ ] | [ ] |
| Нажать `Продолжить` | Таймер и live flow продолжаются | [ ] | [ ] |
| Нажать `Следующий вопрос` | Переключение на следующий вопрос без ошибки | [ ] | [ ] |
| Дойти до завершения live или завершить вручную | Показывается final leaderboard | [ ] | [ ] |

## Live quiz as participant

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Под participant войти в кабинет и ввести join code | Переход на `/participant/quiz/:joinCode` | [ ] | [ ] |
| До старта организатором проверить экран ожидания | Показывается queue/lobby state | [ ] | [ ] |
| После старта live | Появляется active question form | [ ] | [ ] |
| Выбрать ответ и отправить | Ответ принимается, UI не ломается | [ ] | [ ] |
| При паузе организатором | Participant UI показывает paused/live wait state | [ ] | [ ] |
| После завершения сессии | Показывается final leaderboard и место участника | [ ] | [ ] |

## Participant cabinet

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Открыть `/participant` | Кабинет загружается без page error | [ ] | [ ] |
| Проверить hero и feature deck | Блоки отображаются корректно | [ ] | [ ] |
| Проверить архив попыток | Есть список попыток или корректное empty state | [ ] | [ ] |
| Развернуть группу/попытку | Expanded-state работает без поломки UI | [ ] | [ ] |
| Ввести некорректный join code | Появляется ожидаемая ошибка в UI | [ ] | [ ] |

## Profile

| Шаги | Ожидаемый результат | OK | FAIL |
|---|---|---|---|
| Открыть `/profile` под organizer | Профиль загружается | [ ] | [ ] |
| Изменить ФИО / display name и сохранить | Данные сохраняются и остаются после refresh | [ ] | [ ] |
| Загрузить валидный avatar image | Аватар обновляется в UI | [ ] | [ ] |
| Открыть `/profile` под participant | Профиль участника также работает | [ ] | [ ] |
| Вернуться из профиля в кабинет | Переход идёт в корректный кабинет по роли | [ ] | [ ] |

## Что смотреть в консоли и Network

### Browser console

- ошибки React render
- `NetworkError when attempting to fetch resource`
- ошибки WebSocket connect/auth
- ошибки загрузки изображений

### Backend terminal

- ошибки старта API и подключения к PostgreSQL
- `GET/POST/PUT` route failures с stack trace
- ошибки live transitions / leaderboard / results

### Network tab

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/quizzes/mine`
- `POST /api/quizzes`
- `PUT /api/quizzes/:quizId`
- `POST /api/uploads/question-image`
- `GET /api/live/...` и связанные live endpoints
- `PUT /api/users/me/profile`
- `PUT /api/users/me/avatar`

Для upload проверить отдельно:

- request идёт как `multipart/form-data`
- `Authorization` header присутствует
- поле файла называется `image`
- ответ содержит успешный JSON с `imageUrl`

Для live проверить отдельно:

- WebSocket подключается
- приходят realtime updates
- нет постоянных reconnect loops

## Типовые симптомы и где искать причину

| Симптом | Где смотреть |
|---|---|
| `401` / `403` на API | auth token, role checks, [server/auth/helpers.js](/home/user/quiz-app/server/auth/helpers.js) |
| Кабинет не загружается | page-specific request helper в соответствующей странице и backend route в [server/index.js](/home/user/quiz-app/server/index.js) |
| Не сохраняется квиз | sanitize/validation в [server/quiz/sanitizers.js](/home/user/quiz-app/server/quiz/sanitizers.js) и submit payload из [CreateQuizPage.jsx](/home/user/quiz-app/src/pages/CreateQuizPage.jsx) |
| Не работает upload question image | `POST /api/uploads/question-image`, поле `image`, CORS/env, route в [server/index.js](/home/user/quiz-app/server/index.js) |
| Live не стартует / не переключает вопросы | [server/live/transitions.js](/home/user/quiz-app/server/live/transitions.js), [server/live/context.js](/home/user/quiz-app/server/live/context.js), [server/live/runtime.js](/home/user/quiz-app/server/live/runtime.js) |
| Нет leaderboard или он пустой | [server/live/leaderboard.js](/home/user/quiz-app/server/live/leaderboard.js), [server/live/results.js](/home/user/quiz-app/server/live/results.js) |
| У participant не обновляется live UI | browser WS tab, [src/lib/websocket.js](/home/user/quiz-app/src/lib/websocket.js), participant live page |
| Не сохраняется профиль / аватар | [ProfilePage.jsx](/home/user/quiz-app/src/pages/ProfilePage.jsx), profile routes в [server/index.js](/home/user/quiz-app/server/index.js) |
