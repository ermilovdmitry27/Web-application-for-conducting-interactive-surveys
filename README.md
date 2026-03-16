# quiz-app

Веб-приложение для квизов с frontend на React и backend на Express/PostgreSQL.

## Стек

### Frontend
- React
- React Router
- CSS / CSS Modules
- react-scripts (Create React App)

### Backend
- Express
- PostgreSQL
- WebSocket (`ws`)
- Multer
- bcryptjs
- dotenv

## Архитектура проекта

Проект состоит из двух частей:

- **frontend** — React-приложение, запускается на `http://localhost:3000`
- **backend** — Express API + WebSocket, запускается на `http://localhost:4000`

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