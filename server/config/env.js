const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const DEFAULT_JWT_SECRET = "dev-secret-change-me";

const rawPort = Number(process.env.API_PORT || 4000);
const port = Number.isFinite(rawPort) && rawPort > 0 ? Math.floor(rawPort) : 4000;
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "6mb";
const wsPath = process.env.WS_PATH || "/ws";
const rawWsHeartbeatMs = Number(process.env.WS_HEARTBEAT_MS || 30_000);
const wsHeartbeatMs = Number.isFinite(rawWsHeartbeatMs) && rawWsHeartbeatMs > 0 ? rawWsHeartbeatMs : 30_000;
const rawLiveAutoTickMs = Number(process.env.LIVE_AUTO_TICK_MS || 1000);
const liveAutoTickMs = Number.isFinite(rawLiveAutoTickMs) && rawLiveAutoTickMs > 0 ? rawLiveAutoTickMs : 1000;

function expandLoopbackOrigin(origin) {
  const normalizedOrigin = String(origin || "").trim();
  if (!normalizedOrigin) {
    return [];
  }
  if (normalizedOrigin === "*") {
    return [normalizedOrigin];
  }

  try {
    const parsed = new URL(normalizedOrigin);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return [normalizedOrigin, parsed.origin];
    }
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      return [normalizedOrigin, parsed.origin];
    }
  } catch (_error) {
    return [normalizedOrigin];
  }

  return [normalizedOrigin];
}

const allowedOrigins = Array.from(
  new Set(corsOrigin.split(",").flatMap((origin) => expandLoopbackOrigin(origin)))
);
const allowAnyOrigin = allowedOrigins.includes("*");
const MAX_AVATAR_DATA_URL_LENGTH = Number(
  process.env.MAX_AVATAR_DATA_URL_LENGTH || 4 * 1024 * 1024
);
const MAX_QUIZ_TITLE_LENGTH = Number(process.env.MAX_QUIZ_TITLE_LENGTH || 120);
const MAX_QUIZ_DESCRIPTION_LENGTH = Number(process.env.MAX_QUIZ_DESCRIPTION_LENGTH || 1000);
const MAX_QUIZ_CATEGORY_LENGTH = Number(process.env.MAX_QUIZ_CATEGORY_LENGTH || 80);
const MAX_QUIZ_QUESTIONS = Number(process.env.MAX_QUIZ_QUESTIONS || 50);
const MAX_QUIZ_DURATION_MINUTES = Number(process.env.MAX_QUIZ_DURATION_MINUTES || 240);
const rawMinQuizQuestionTimeSeconds = Number(process.env.MIN_QUIZ_QUESTION_TIME_SECONDS || 5);
const MIN_QUIZ_QUESTION_TIME_SECONDS =
  Number.isFinite(rawMinQuizQuestionTimeSeconds) && rawMinQuizQuestionTimeSeconds > 0
    ? Math.floor(rawMinQuizQuestionTimeSeconds)
    : 5;
const rawMaxQuizQuestionTimeSeconds = Number(process.env.MAX_QUIZ_QUESTION_TIME_SECONDS || 600);
const MAX_QUIZ_QUESTION_TIME_SECONDS =
  Number.isFinite(rawMaxQuizQuestionTimeSeconds) &&
  rawMaxQuizQuestionTimeSeconds >= MIN_QUIZ_QUESTION_TIME_SECONDS
    ? Math.floor(rawMaxQuizQuestionTimeSeconds)
    : Math.max(MIN_QUIZ_QUESTION_TIME_SECONDS, 600);
const DEFAULT_QUIZ_QUESTION_TIME_SECONDS = Math.min(
  MAX_QUIZ_QUESTION_TIME_SECONDS,
  Math.max(MIN_QUIZ_QUESTION_TIME_SECONDS, 30)
);
const rawMaxAttemptsPerParticipant = Number(
  process.env.MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT || 10
);
const MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT =
  Number.isFinite(rawMaxAttemptsPerParticipant) && rawMaxAttemptsPerParticipant > 0
    ? Math.floor(rawMaxAttemptsPerParticipant)
    : 10;
const MAX_QUESTION_TEXT_LENGTH = Number(process.env.MAX_QUESTION_TEXT_LENGTH || 300);
const MAX_OPTION_TEXT_LENGTH = Number(process.env.MAX_OPTION_TEXT_LENGTH || 180);
const MAX_QUESTION_OPTIONS = Number(process.env.MAX_QUESTION_OPTIONS || 8);
const rawMaxQuestionImageFileSize = Number(process.env.MAX_QUESTION_IMAGE_FILE_SIZE || 5 * 1024 * 1024);
const MAX_QUESTION_IMAGE_FILE_SIZE =
  Number.isFinite(rawMaxQuestionImageFileSize) && rawMaxQuestionImageFileSize > 0
    ? Math.floor(rawMaxQuestionImageFileSize)
    : 5 * 1024 * 1024;
const MAX_QUESTION_IMAGE_FILE_SIZE_MB =
  Math.round((MAX_QUESTION_IMAGE_FILE_SIZE / (1024 * 1024)) * 10) / 10;
const isDefaultJwtSecret = jwtSecret === DEFAULT_JWT_SECRET;

module.exports = {
  port,
  corsOrigin,
  jwtSecret,
  jwtExpiresIn,
  jsonBodyLimit,
  wsPath,
  wsHeartbeatMs,
  liveAutoTickMs,
  allowedOrigins,
  allowAnyOrigin,
  MAX_AVATAR_DATA_URL_LENGTH,
  MAX_QUIZ_TITLE_LENGTH,
  MAX_QUIZ_DESCRIPTION_LENGTH,
  MAX_QUIZ_CATEGORY_LENGTH,
  MAX_QUIZ_QUESTIONS,
  MAX_QUIZ_DURATION_MINUTES,
  MIN_QUIZ_QUESTION_TIME_SECONDS,
  MAX_QUIZ_QUESTION_TIME_SECONDS,
  DEFAULT_QUIZ_QUESTION_TIME_SECONDS,
  MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_OPTION_TEXT_LENGTH,
  MAX_QUESTION_OPTIONS,
  MAX_QUESTION_IMAGE_FILE_SIZE,
  MAX_QUESTION_IMAGE_FILE_SIZE_MB,
  isDefaultJwtSecret,
};
