const { corsOrigin, isDefaultJwtSecret } = require("./config/env");
const { dbConfig } = require("./db");

function getStartupWarnings() {
  const warnings = [];

  if (!dbConfig.hasPassword) {
    warnings.push("DB_PASSWORD пустой. Если PostgreSQL требует пароль, сервер не подключится.");
  }
  if (isDefaultJwtSecret) {
    warnings.push("Используется JWT_SECRET по умолчанию. Перед деплоем его нужно заменить.");
  }
  if (!corsOrigin.trim()) {
    warnings.push("CORS_ORIGIN пустой. Будет использован fallback http://localhost:3000.");
  }

  return warnings;
}

function formatStartupError(error) {
  if (!error || typeof error !== "object") {
    return error;
  }

  if (error.code === "ECONNREFUSED") {
    return new Error(
      `Не удалось подключиться к PostgreSQL по ${dbConfig.host}:${dbConfig.port}. Проверьте, что сервер БД запущен.`
    );
  }
  if (error.code === "28P01") {
    return new Error(
      `PostgreSQL отклонил логин ${dbConfig.user}. Проверьте DB_USER и DB_PASSWORD в .env.`
    );
  }
  if (error.code === "3D000") {
    return new Error(
      `База данных ${dbConfig.database} не существует. Создайте ее или исправьте DB_NAME в .env.`
    );
  }
  if (error.code === "ENOTFOUND") {
    return new Error(
      `Не удалось найти PostgreSQL-хост ${dbConfig.host}. Проверьте DB_HOST в .env.`
    );
  }

  return error;
}

module.exports = {
  getStartupWarnings,
  formatStartupError,
};
