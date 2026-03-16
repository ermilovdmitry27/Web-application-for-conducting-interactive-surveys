const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocketLib = require("ws");
const WebSocketServer = WebSocketLib.WebSocketServer || WebSocketLib.Server;
const multer = require("multer");
const {
  port,
  corsOrigin,
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
} = require("./config/env");
const {
  EMAIL_RE,
  ALLOWED_ROLES,
  AVATAR_DATA_URL_RE,
  QUESTION_IMAGE_MIME_TO_EXTENSION,
} = require("./constants");
const {
  createAuthToken,
  verifyAuthToken,
  authenticate,
  requireRole,
} = require("./auth/helpers");
const { pool, dbConfig } = require("./db");
const {
  ensureUsersTable,
  ensureQuizzesTable,
  ensureQuizAttemptsTable,
  ensureLiveSessionsTable,
  ensureLiveSessionParticipantsTable,
  ensureLiveSessionAnswersTable,
} = require("./db-init");
const { getStartupWarnings, formatStartupError } = require("./startup");
const {
  sendWsJson,
  parseWsMessage,
  createWsRoomHelpers,
} = require("./websocket/helpers");
const {
  buildDefaultQuestionOrder,
  normalizeQuestionOrder,
  createLiveQuestionOrder,
  getLiveQuestionBySessionIndex,
  getLiveQuestionTimeLimitSeconds,
  getLiveQuestionRemainingSeconds,
  getLiveQuestionResponseSeconds,
  toLiveQuestionPayload,
  buildLiveSessionState,
  buildLiveAttemptAnswers,
  getLiveAttemptTimeSpentSeconds,
  buildLiveStatePair,
} = require("./live/helpers");
const {
  getLiveParticipants,
  getLiveAnsweredParticipants,
  getLiveRuntimeData,
} = require("./live/runtime");
const {
  getLiveSessionContextById,
  getRunningSessionContextByJoinCode,
} = require("./live/context");
const { sanitizeSubmittedAnswers, scoreQuizAnswers } = require("./quiz/helpers");
const { sanitizeQuizRules, sanitizeQuizQuestions } = require("./quiz/sanitizers");
const {
  mapDbUser,
  normalizeNamePart,
  buildDisplayName,
  mapDbQuiz,
  mapQuizForParticipant,
  mapAttemptCommon,
} = require("./mappers");

const app = express();
const server = http.createServer(app);
const uploadsRootDir = path.join(__dirname, "uploads");
const questionUploadsDir = path.join(uploadsRootDir, "questions");

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
fs.mkdirSync(questionUploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsRootDir));
app.use(express.json({ limit: jsonBodyLimit }));

const wsRooms = new Map();
const { joinWsRoom, leaveWsRoom, leaveAllWsRooms, broadcastToRoom } =
  createWsRoomHelpers(wsRooms);
let isLiveAutoTickInProgress = false;
let isServerReady = false;
let isShutdownInProgress = false;

const questionImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, questionUploadsDir);
    },
    filename: (_req, file, callback) => {
      const extension =
        QUESTION_IMAGE_MIME_TO_EXTENSION.get(file.mimetype) ||
        path.extname(file.originalname || "").toLowerCase() ||
        ".bin";
      callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_QUESTION_IMAGE_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!QUESTION_IMAGE_MIME_TO_EXTENSION.has(file.mimetype)) {
      callback(new Error("Допустимы только изображения PNG, JPG, WEBP или GIF."));
      return;
    }
    callback(null, true);
  },
});

async function shutdown(signal) {
  if (isShutdownInProgress) {
    return;
  }
  isShutdownInProgress = true;
  isServerReady = false;
  clearInterval(wsHeartbeatTimer);
  clearInterval(liveAutoTickTimer);
  console.log(`Received ${signal}. Shutting down API server...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Forced shutdown: resources did not close in time.");
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  try {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    await pool.end();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("Shutdown failed:", error);
    process.exit(1);
  }
}

function isAllowedOrigin(origin) {
  if (!origin || allowAnyOrigin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

const wss = new WebSocketServer({
  server,
  path: wsPath,
});

wss.on("connection", (ws, request) => {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    ws.close(1008, "Origin is not allowed.");
    return;
  }

  ws.isAlive = true;
  ws.isAuthenticated = false;
  ws.auth = null;
  ws.rooms = new Set();

  const authTimeout = setTimeout(() => {
    if (!ws.isAuthenticated) {
      sendWsJson(ws, { type: "ws:error", message: "Требуется авторизация сокета." });
      ws.close(4401, "Unauthorized");
    }
  }, 10_000);

  sendWsJson(ws, {
    type: "ws:welcome",
    message: "Подключение установлено. Отправьте событие auth с JWT-токеном.",
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (rawMessage) => {
    const message = parseWsMessage(rawMessage);
    if (!message || typeof message.type !== "string") {
      sendWsJson(ws, { type: "ws:error", message: "Неверный формат сообщения." });
      return;
    }

    if (!ws.isAuthenticated) {
      if (message.type !== "auth") {
        sendWsJson(ws, { type: "ws:error", message: "Сначала выполните авторизацию сокета." });
        return;
      }

      const token = typeof message.token === "string" ? message.token : "";
      try {
        const decoded = verifyAuthToken(token);
        ws.auth = decoded;
        ws.isAuthenticated = true;
        clearTimeout(authTimeout);

        const userRoom = `user:${decoded.sub}`;
        const roleRoom = `role:${decoded.role}`;
        joinWsRoom(ws, userRoom);
        joinWsRoom(ws, roleRoom);

        sendWsJson(ws, {
          type: "ws:auth-ok",
          user: {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
          },
        });
      } catch (_error) {
        sendWsJson(ws, { type: "ws:error", message: "Недействительный токен для WebSocket." });
        ws.close(4401, "Unauthorized");
      }
      return;
    }

    if (message.type === "ws:ping") {
      sendWsJson(ws, { type: "ws:pong", ts: new Date().toISOString() });
      return;
    }

    if (message.type === "quiz:join") {
      const quizId = String(message.quizId || "").trim();
      if (!quizId) {
        sendWsJson(ws, { type: "ws:error", message: "Для quiz:join нужен quizId." });
        return;
      }
      joinWsRoom(ws, `quiz:${quizId}`);
      sendWsJson(ws, { type: "quiz:joined", quizId });
      return;
    }

    if (message.type === "quiz:leave") {
      const quizId = String(message.quizId || "").trim();
      if (!quizId) {
        sendWsJson(ws, { type: "ws:error", message: "Для quiz:leave нужен quizId." });
        return;
      }
      leaveWsRoom(ws, `quiz:${quizId}`);
      sendWsJson(ws, { type: "quiz:left", quizId });
      return;
    }

    if (message.type === "live:join") {
      const sessionId = String(message.sessionId || "").trim();
      if (!sessionId) {
        sendWsJson(ws, { type: "ws:error", message: "Для live:join нужен sessionId." });
        return;
      }
      joinWsRoom(ws, `live:${sessionId}`);
      sendWsJson(ws, { type: "live:joined", sessionId });
      return;
    }

    if (message.type === "live:leave") {
      const sessionId = String(message.sessionId || "").trim();
      if (!sessionId) {
        sendWsJson(ws, { type: "ws:error", message: "Для live:leave нужен sessionId." });
        return;
      }
      leaveWsRoom(ws, `live:${sessionId}`);
      sendWsJson(ws, { type: "live:left", sessionId });
      return;
    }

    if (message.type === "quiz:update") {
      if (ws.auth?.role !== "organizer") {
        sendWsJson(ws, { type: "ws:error", message: "Только организатор может отправлять quiz:update." });
        return;
      }

      const quizId = String(message.quizId || "").trim();
      if (!quizId) {
        sendWsJson(ws, { type: "ws:error", message: "Для quiz:update нужен quizId." });
        return;
      }

      const payload =
        message.payload && typeof message.payload === "object" ? message.payload : {};

      broadcastToRoom(`quiz:${quizId}`, {
        type: "quiz:update",
        quizId,
        payload,
        sentAt: new Date().toISOString(),
        by: {
          id: ws.auth.sub,
          role: ws.auth.role,
        },
      });
      return;
    }

    sendWsJson(ws, { type: "ws:error", message: `Неизвестный тип события: ${message.type}` });
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    leaveAllWsRooms(ws);
  });

  ws.on("error", () => {
    clearTimeout(authTimeout);
    leaveAllWsRooms(ws);
  });
});

const wsHeartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) {
      client.terminate();
      return;
    }
    client.isAlive = false;
    client.ping();
  });
}, wsHeartbeatMs);

const liveAutoTickTimer = setInterval(() => {
  if (!isServerReady || isLiveAutoTickInProgress) {
    return;
  }
  isLiveAutoTickInProgress = true;
  processLiveAutoAdvanceTick()
    .catch((error) => {
      console.error("Live auto-advance tick failed:", error);
    })
    .finally(() => {
      isLiveAutoTickInProgress = false;
    });
}, liveAutoTickMs);

async function getLiveLeaderboard(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  const participantsResult = await pool.query(
    `
    SELECT
      p.participant_id,
      p.joined_at,
      u.name AS participant_name,
      u.avatar_data_url AS participant_avatar_data_url
    FROM quiz_session_participants p
    JOIN users u ON u.id = p.participant_id
    WHERE p.session_id = $1
    ORDER BY p.joined_at ASC, p.participant_id ASC;
    `,
    [sessionId]
  );

  const scoreResult = await pool.query(
    `
    SELECT
      participant_id,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS score
    FROM quiz_session_answers
    WHERE session_id = $1
    GROUP BY participant_id;
    `,
    [sessionId]
  );
  const scoreMap = new Map(
    scoreResult.rows.map((row) => [Number(row.participant_id), Number(row.score || 0)])
  );

  const maxScore = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
  const entries = participantsResult.rows
    .map((row) => {
      const participantId = Number(row.participant_id);
      const score = scoreMap.get(participantId) || 0;
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return {
        participantId,
        participantName: row.participant_name,
        participantAvatarDataUrl: row.participant_avatar_data_url || "",
        score,
        maxScore,
        percentage,
        joinedAt: row.joined_at,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const timeA = new Date(a.joinedAt).getTime();
      const timeB = new Date(b.joinedAt).getTime();
      return timeA - timeB;
    })
    .map((entry, index) => ({
      ...entry,
      place: index + 1,
    }));

  return {
    sessionId,
    quizId: context.quiz.id,
    quizTitle: context.quiz.title,
    maxScore,
    totalParticipants: entries.length,
    entries,
  };
}

async function saveFinishedLiveSessionResults(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return;
  }
  const leaderboard = await getLiveLeaderboard(sessionId);
  if (!leaderboard || leaderboard.entries.length === 0) {
    return;
  }

  const participantList = await getLiveParticipants(sessionId);
  const participantMap = new Map(
    participantList.map((participant) => [participant.participantId, participant])
  );
  const answerRowsResult = await pool.query(
    `
    SELECT
      participant_id,
      question_index,
      selected_option_ids_json,
      is_correct,
      submitted_at,
      submitted_after_seconds
    FROM quiz_session_answers
    WHERE session_id = $1
    ORDER BY participant_id ASC, question_index ASC, submitted_at ASC;
    `,
    [sessionId]
  );
  const answerRowsByParticipant = new Map();
  answerRowsResult.rows.forEach((row) => {
    const participantId = Number(row.participant_id);
    if (!answerRowsByParticipant.has(participantId)) {
      answerRowsByParticipant.set(participantId, []);
    }
    answerRowsByParticipant.get(participantId).push(row);
  });

  const totalQuestionCount = leaderboard.maxScore;
  for (const entry of leaderboard.entries) {
    const participant = participantMap.get(entry.participantId) || null;
    const participantAnswerRows = answerRowsByParticipant.get(entry.participantId) || [];
    const answersForStorage = buildLiveAttemptAnswers(context, participantAnswerRows);
    const timeSpentSeconds = getLiveAttemptTimeSpentSeconds(
      context,
      participant?.joinedAt,
      participantAnswerRows
    );

    await pool.query(
      `
      INSERT INTO quiz_attempts (
        quiz_id,
        participant_id,
        answers_json,
        score,
        max_score,
        time_spent_seconds,
        live_session_id
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
      ON CONFLICT (live_session_id, participant_id)
      WHERE live_session_id IS NOT NULL
      DO UPDATE
      SET
        answers_json = EXCLUDED.answers_json,
        score = EXCLUDED.score,
        max_score = EXCLUDED.max_score,
        time_spent_seconds = EXCLUDED.time_spent_seconds;
      `,
      [
        context.quiz.id,
        entry.participantId,
        JSON.stringify(answersForStorage),
        entry.score,
        totalQuestionCount,
        timeSpentSeconds,
        sessionId,
      ]
    );
  }
}

async function startLiveSessionAndGetPayload(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  if (context.session.status !== "running") {
    const leaderboard = await getLiveLeaderboard(sessionId);
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      leaderboard,
      wasUpdated: false,
    };
  }

  if (context.session.isLiveStarted) {
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      leaderboard: null,
      wasUpdated: false,
    };
  }

  const questionCount = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
  if (questionCount === 0) {
    return finishLiveSessionAndGetPayload(sessionId);
  }
  const questionOrder = createLiveQuestionOrder(context.quiz);

  const startResult = await pool.query(
    `
    UPDATE quiz_sessions
    SET
      is_live_started = TRUE,
      is_paused = FALSE,
      current_question_index = 0,
      question_order_json = $2::jsonb,
      paused_at = NULL,
      paused_remaining_seconds = 0,
      current_question_started_at = NOW()
    WHERE id = $1 AND status = 'running' AND is_live_started = FALSE
    RETURNING id;
    `,
    [sessionId, JSON.stringify(questionOrder)]
  );
  const wasUpdated = startResult.rows.length > 0;

  const refreshedContext = await getLiveSessionContextById(sessionId);
  if (!refreshedContext) {
    return null;
  }
  const runtime = await getLiveRuntimeData(refreshedContext);
  const states = buildLiveStatePair(
    refreshedContext,
    runtime.participants,
    runtime.answeredParticipants
  );

  if (wasUpdated) {
    broadcastToRoom(`live:${sessionId}`, {
      type: "live:session-started",
      session: states.participantState,
    });
  }

  return {
    ...states,
    context: refreshedContext,
    leaderboard: null,
    wasUpdated,
  };
}

async function pauseLiveSessionAndGetPayload(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  if (
    context.session.status !== "running" ||
    !context.session.isLiveStarted ||
    context.session.currentQuestionIndex < 0
  ) {
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      wasUpdated: false,
    };
  }

  if (context.session.isPaused) {
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      wasUpdated: false,
    };
  }

  const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(context.quiz);
  const questionRemainingSeconds = getLiveQuestionRemainingSeconds(
    context.session,
    questionTimeLimitSeconds
  );
  const updateResult = await pool.query(
    `
    UPDATE quiz_sessions
    SET
      is_paused = TRUE,
      paused_at = NOW(),
      paused_remaining_seconds = $2
    WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND is_paused = FALSE
    RETURNING id;
    `,
    [sessionId, questionRemainingSeconds]
  );
  const wasUpdated = updateResult.rows.length > 0;

  const refreshedContext = await getLiveSessionContextById(sessionId);
  if (!refreshedContext) {
    return null;
  }

  const runtime = await getLiveRuntimeData(refreshedContext);
  const states = buildLiveStatePair(
    refreshedContext,
    runtime.participants,
    runtime.answeredParticipants
  );

  if (wasUpdated) {
    broadcastToRoom(`live:${sessionId}`, {
      type: "live:session-paused",
      session: states.participantState,
    });
  }

  return {
    ...states,
    context: refreshedContext,
    wasUpdated,
  };
}

async function resumeLiveSessionAndGetPayload(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  if (
    context.session.status !== "running" ||
    !context.session.isLiveStarted ||
    context.session.currentQuestionIndex < 0
  ) {
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      wasUpdated: false,
    };
  }

  if (!context.session.isPaused) {
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);
    return {
      ...states,
      context,
      wasUpdated: false,
    };
  }

  const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(context.quiz);
  const pausedRemainingSeconds = Math.max(0, Number(context.session.pausedRemainingSeconds || 0));
  const elapsedBeforePause = Math.max(0, questionTimeLimitSeconds - pausedRemainingSeconds);
  const updateResult = await pool.query(
    `
    UPDATE quiz_sessions
    SET
      is_paused = FALSE,
      paused_at = NULL,
      paused_remaining_seconds = 0,
      current_question_started_at = NOW() - ($2 * INTERVAL '1 second')
    WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND is_paused = TRUE
    RETURNING id;
    `,
    [sessionId, elapsedBeforePause]
  );
  const wasUpdated = updateResult.rows.length > 0;

  const refreshedContext = await getLiveSessionContextById(sessionId);
  if (!refreshedContext) {
    return null;
  }

  const runtime = await getLiveRuntimeData(refreshedContext);
  const states = buildLiveStatePair(
    refreshedContext,
    runtime.participants,
    runtime.answeredParticipants
  );

  if (wasUpdated) {
    broadcastToRoom(`live:${sessionId}`, {
      type: "live:session-resumed",
      session: states.participantState,
    });
  }

  return {
    ...states,
    context: refreshedContext,
    wasUpdated,
  };
}

async function finishLiveSessionAndGetPayload(sessionId) {
  const finishResult = await pool.query(
    `
    UPDATE quiz_sessions
    SET status = 'finished', finished_at = NOW()
    WHERE id = $1 AND status = 'running'
    RETURNING id;
    `,
    [sessionId]
  );
  const wasUpdated = finishResult.rows.length > 0;

  if (wasUpdated) {
    await saveFinishedLiveSessionResults(sessionId);
  }

  const finishedContext = await getLiveSessionContextById(sessionId);
  if (!finishedContext) {
    return null;
  }

  const leaderboard = await getLiveLeaderboard(sessionId);
  const runtime = await getLiveRuntimeData(finishedContext);
  const states = buildLiveStatePair(
    finishedContext,
    runtime.participants,
    runtime.answeredParticipants
  );

  if (wasUpdated) {
    broadcastToRoom(`live:${sessionId}`, {
      type: "live:session-finished",
      session: states.participantState,
      leaderboard,
    });
  }

  return {
    ...states,
    context: finishedContext,
    leaderboard,
    wasUpdated,
  };
}

async function advanceLiveSessionQuestion(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  if (context.session.status !== "running") {
    return finishLiveSessionAndGetPayload(sessionId);
  }

  const questionCount = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
  if (questionCount === 0) {
    return finishLiveSessionAndGetPayload(sessionId);
  }

  if (!context.session.isLiveStarted) {
    return startLiveSessionAndGetPayload(sessionId);
  }

  const nextQuestionIndex = context.session.currentQuestionIndex + 1;
  if (nextQuestionIndex >= questionCount) {
    return finishLiveSessionAndGetPayload(sessionId);
  }

  const updateResult = await pool.query(
    `
    UPDATE quiz_sessions
    SET
      is_paused = FALSE,
      paused_at = NULL,
      paused_remaining_seconds = 0,
      current_question_index = $2,
      current_question_started_at = NOW()
    WHERE id = $1 AND status = 'running' AND is_live_started = TRUE AND current_question_index = $3
    RETURNING id;
    `,
    [sessionId, nextQuestionIndex, context.session.currentQuestionIndex]
  );

  const refreshedContext = await getLiveSessionContextById(sessionId);
  if (!refreshedContext) {
    return null;
  }

  const runtime = await getLiveRuntimeData(refreshedContext);
  const states = buildLiveStatePair(
    refreshedContext,
    runtime.participants,
    runtime.answeredParticipants
  );
  const wasUpdated = updateResult.rows.length > 0;

  if (wasUpdated) {
    broadcastToRoom(`live:${sessionId}`, {
      type: "live:question-changed",
      session: states.participantState,
    });
  }

  return {
    ...states,
    context: refreshedContext,
    leaderboard: null,
    wasUpdated,
  };
}

async function processLiveAutoAdvanceTick() {
  const runningResult = await pool.query(
    `
    SELECT
      s.id AS session_id,
      s.is_live_started,
      s.is_paused,
      s.current_question_started_at,
      s.started_at,
      q.time_limit_minutes,
      q.question_time_seconds,
      q.questions_json
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.status = 'running'
    ORDER BY s.id ASC;
    `
  );

  for (const row of runningResult.rows) {
    try {
      const sessionId = Number(row.session_id);
      if (!Number.isInteger(sessionId) || sessionId < 1) {
        continue;
      }
      if (!Boolean(row.is_live_started)) {
        continue;
      }
      if (Boolean(row.is_paused)) {
        continue;
      }

      const questions = Array.isArray(row.questions_json) ? row.questions_json : [];
      const questionCount = questions.length;
      if (questionCount < 1) {
        await finishLiveSessionAndGetPayload(sessionId);
        continue;
      }

      const rawQuestionTimeSeconds = Number(row.question_time_seconds || 0);
      const questionTimeLimitSeconds =
        Number.isFinite(rawQuestionTimeSeconds) && rawQuestionTimeSeconds > 0
          ? Math.floor(rawQuestionTimeSeconds)
          : Math.max(1, Math.ceil((Math.max(1, Number(row.time_limit_minutes || 0)) * 60) / questionCount));
      const startedAtMs = new Date(row.current_question_started_at || row.started_at || "").getTime();
      if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
        continue;
      }
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      if (elapsedSeconds < questionTimeLimitSeconds) {
        continue;
      }

      await advanceLiveSessionQuestion(sessionId);
    } catch (error) {
      console.error("Live auto-advance failed for session row:", error);
    }
  }
}

function generateQuizJoinCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < length; index += 1) {
    const charIndex = crypto.randomInt(0, alphabet.length);
    code += alphabet[charIndex];
  }
  return code;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ready: isServerReady });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const rawName = req.body?.name;
    const rawFirstName = req.body?.firstName;
    const rawLastName = req.body?.lastName;
    const rawMiddleName = req.body?.middleName;
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const rawRole = req.body?.role;

    const legacyName = normalizeNamePart(rawName);
    const firstName = normalizeNamePart(rawFirstName);
    const lastName = normalizeNamePart(rawLastName);
    const middleName = normalizeNamePart(rawMiddleName);
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";
    const role = typeof rawRole === "string" ? rawRole.trim() : "";
    const hasStructuredName = Boolean(firstName || lastName || middleName);
    const name = hasStructuredName
      ? buildDisplayName({ firstName, lastName, middleName })
      : legacyName;

    if (!email || !password || !role || !name) {
      return res.status(400).json({ message: "Заполните все обязательные поля." });
    }
    if (hasStructuredName && (!firstName || !lastName)) {
      return res.status(400).json({ message: "Укажите как минимум имя и фамилию." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Некорректный e-mail." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Пароль должен быть не короче 8 символов." });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ message: "Некорректная роль пользователя." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const insertSql = `
      INSERT INTO users (name, first_name, last_name, middle_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, first_name, last_name, middle_name, email, role, avatar_data_url, created_at;
    `;

    const { rows } = await pool.query(insertSql, [
      name,
      hasStructuredName ? firstName : name,
      hasStructuredName ? lastName : "",
      hasStructuredName ? middleName : "",
      email,
      passwordHash,
      role,
    ]);
    return res.status(201).json({
      user: mapDbUser(rows[0]),
      createdAt: rows[0].created_at,
    });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ message: "Пользователь с таким e-mail уже существует." });
    }
    console.error("POST /api/auth/register failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;

    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    if (!email || !password) {
      return res.status(400).json({ message: "Введите e-mail и пароль." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Некорректный e-mail." });
    }

    const selectSql = `
      SELECT id, name, first_name, last_name, middle_name, email, password_hash, role, avatar_data_url
      FROM users
      WHERE email = $1
      LIMIT 1;
    `;
    const result = await pool.query(selectSql, [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Неверный e-mail или пароль." });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Неверный e-mail или пароль." });
    }

    const authUser = mapDbUser(user);
    const token = createAuthToken(authUser);

    return res.json({
      token,
      role: authUser.role,
      user: authUser,
    });
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const userResult = await pool.query(
      `
      SELECT id, name, first_name, last_name, middle_name, email, role, avatar_data_url
      FROM users
      WHERE id = $1
      LIMIT 1;
      `,
      [req.auth.sub]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Пользователь не найден." });
    }

    return res.json({
      user: mapDbUser(userResult.rows[0]),
    });
  } catch (error) {
    console.error("GET /api/auth/me failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.put("/api/users/me/profile", authenticate, async (req, res) => {
  try {
    const firstName = normalizeNamePart(req.body?.firstName);
    const lastName = normalizeNamePart(req.body?.lastName);
    const middleName = normalizeNamePart(req.body?.middleName);
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const name = buildDisplayName({ firstName, lastName, middleName });

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: "Заполните имя, фамилию и логин." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Некорректный логин. Используйте формат e-mail." });
    }

    const updateResult = await pool.query(
      `
      UPDATE users
      SET
        name = $2,
        first_name = $3,
        last_name = $4,
        middle_name = $5,
        email = $6
      WHERE id = $1
      RETURNING id, name, first_name, last_name, middle_name, email, role, avatar_data_url;
      `,
      [req.auth.sub, name, firstName, lastName, middleName, email]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден." });
    }

    return res.json({
      user: mapDbUser(updateResult.rows[0]),
    });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ message: "Пользователь с таким логином уже существует." });
    }
    console.error("PUT /api/users/me/profile failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.put("/api/users/me/avatar", authenticate, async (req, res) => {
  try {
    const rawAvatar = req.body?.avatarDataUrl;
    const avatarDataUrl = typeof rawAvatar === "string" ? rawAvatar.trim() : "";

    if (
      avatarDataUrl &&
      (!AVATAR_DATA_URL_RE.test(avatarDataUrl) ||
        avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH)
    ) {
      return res.status(400).json({
        message: "Некорректное изображение. Поддерживается только base64 data URL.",
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE users
      SET avatar_data_url = $2
      WHERE id = $1
      RETURNING id, name, first_name, last_name, middle_name, email, role, avatar_data_url;
      `,
      [req.auth.sub, avatarDataUrl]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден." });
    }

    const updatedUser = mapDbUser(updateResult.rows[0]);
    broadcastToRoom(`user:${req.auth.sub}`, {
      type: "profile:avatar-updated",
      user: updatedUser,
    });

    return res.json({
      user: updatedUser,
    });
  } catch (error) {
    console.error("PUT /api/users/me/avatar failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/uploads/question-image", authenticate, requireRole("organizer"), (req, res) => {
  questionImageUpload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `Размер изображения не должен превышать ${MAX_QUESTION_IMAGE_FILE_SIZE_MB} МБ.`,
        });
      }
      return res.status(400).json({ message: "Не удалось обработать загруженный файл." });
    }

    if (error) {
      return res.status(400).json({
        message: error.message || "Не удалось загрузить изображение вопроса.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Выберите файл изображения." });
    }

    const publicPath = `/uploads/questions/${req.file.filename}`;
    const imageUrl = `${req.protocol}://${req.get("host")}${publicPath}`;
    return res.status(201).json({
      imageUrl,
      fileName: req.file.filename,
      originalName: req.file.originalname,
    });
  });
});

app.get("/api/quizzes/mine", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at
      FROM quizzes
      WHERE organizer_id = $1
      ORDER BY created_at DESC, id DESC;
      `,
      [req.auth.sub]
    );
    return res.json({
      quizzes: result.rows.map(mapDbQuiz),
    });
  } catch (error) {
    console.error("GET /api/quizzes/mine failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/quizzes/:quizId", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const quizId = Number(req.params?.quizId);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ message: "Некорректный id квиза." });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at
      FROM quizzes
      WHERE id = $1 AND organizer_id = $2
      LIMIT 1;
      `,
      [quizId, req.auth.sub]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Квиз не найден." });
    }

    return res.json({
      quiz: mapDbQuiz(result.rows[0]),
    });
  } catch (error) {
    console.error("GET /api/quizzes/:quizId failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/quizzes/:quizId/live/start", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const quizId = Number(req.params?.quizId);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ message: "Некорректный id квиза." });
    }

    const quizResult = await pool.query(
      `
      SELECT
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at
      FROM quizzes
      WHERE id = $1 AND organizer_id = $2
      LIMIT 1;
      `,
      [quizId, req.auth.sub]
    );
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: "Квиз не найден." });
    }

    const quiz = mapDbQuiz(quizResult.rows[0]);
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(400).json({ message: "Нельзя запустить live-квиз без вопросов." });
    }

    const runningResult = await pool.query(
      `
      SELECT id
      FROM quiz_sessions
      WHERE quiz_id = $1 AND status = 'running'
      ORDER BY started_at DESC, id DESC
      LIMIT 1;
      `,
      [quizId]
    );

    let sessionId = null;
    let isNewSession = false;
    if (runningResult.rows.length > 0) {
      sessionId = Number(runningResult.rows[0].id);
    } else {
      const questionOrder = createLiveQuestionOrder(quiz);
      const insertResult = await pool.query(
        `
        INSERT INTO quiz_sessions (
          quiz_id,
          organizer_id,
          status,
          is_live_started,
          current_question_index,
          question_order_json,
          current_question_started_at
        )
        VALUES ($1, $2, 'running', FALSE, -1, $3::jsonb, NOW())
        RETURNING id;
        `,
        [quizId, req.auth.sub, JSON.stringify(questionOrder)]
      );
      sessionId = Number(insertResult.rows[0].id);
      isNewSession = true;
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Не удалось получить состояние live-сессии." });
    }
    const runtime = await getLiveRuntimeData(context);
    const states = buildLiveStatePair(context, runtime.participants, runtime.answeredParticipants);

    return res.status(isNewSession ? 201 : 200).json({
      session: states.organizerState,
    });
  } catch (error) {
    if (error && error.code === "23505") {
      return res.status(409).json({ message: "Live-сессия для этого квиза уже запущена." });
    }
    console.error("POST /api/quizzes/:quizId/live/start failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/start", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.organizerId !== req.auth.sub) {
      return res.status(403).json({ message: "Недостаточно прав для управления этой live-сессией." });
    }

    const startPayload = await startLiveSessionAndGetPayload(sessionId);
    if (!startPayload) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }

    return res.json({
      session: startPayload.organizerState,
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/start failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/pause", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.organizerId !== req.auth.sub) {
      return res.status(403).json({ message: "Недостаточно прав для управления этой live-сессией." });
    }

    const pausePayload = await pauseLiveSessionAndGetPayload(sessionId);
    if (!pausePayload) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }

    return res.json({
      session: pausePayload.organizerState,
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/pause failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/resume", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.organizerId !== req.auth.sub) {
      return res.status(403).json({ message: "Недостаточно прав для управления этой live-сессией." });
    }

    const resumePayload = await resumeLiveSessionAndGetPayload(sessionId);
    if (!resumePayload) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }

    return res.json({
      session: resumePayload.organizerState,
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/resume failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live/join", authenticate, requireRole("participant"), async (req, res) => {
  try {
    const rawJoinCode = req.body?.joinCode;
    const joinCode = typeof rawJoinCode === "string" ? rawJoinCode.trim().toUpperCase() : "";
    if (!joinCode) {
      return res.status(400).json({ message: "Введите код комнаты." });
    }

    const context = await getRunningSessionContextByJoinCode(joinCode);
    if (!context) {
      return res.status(404).json({ message: "Активная live-сессия с таким кодом не найдена." });
    }

    const attemptsCountResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM quiz_attempts
      WHERE quiz_id = $1 AND participant_id = $2;
      `,
      [context.quiz.id, req.auth.sub]
    );
    const attemptsUsed = Number(attemptsCountResult.rows[0]?.total || 0);
    const attemptsLimit = Number(context.quiz.maxAttemptsPerParticipant || 1);
    if (attemptsUsed >= attemptsLimit) {
      return res.status(403).json({
        message: `Лимит попыток исчерпан (${attemptsLimit}).`,
      });
    }

    await pool.query(
      `
      INSERT INTO quiz_session_participants (session_id, participant_id)
      VALUES ($1, $2)
      ON CONFLICT (session_id, participant_id) DO NOTHING;
      `,
      [context.session.id, req.auth.sub]
    );

    const refreshedContext = await getLiveSessionContextById(context.session.id);
    if (!refreshedContext) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    const participants = await getLiveParticipants(refreshedContext.session.id);

    const participantSessionState = buildLiveSessionState({
      session: refreshedContext.session,
      quiz: refreshedContext.quiz,
      participantsCount: refreshedContext.participantsCount,
      participants: [],
      answeredParticipants: [],
      includeCorrect: false,
    });

    broadcastToRoom(`live:${refreshedContext.session.id}`, {
      type: "live:participants-updated",
      sessionId: refreshedContext.session.id,
      participantsCount: refreshedContext.participantsCount,
      participants,
    });

    return res.json({
      session: participantSessionState,
      attemptsUsed,
      attemptsLimit,
      attemptsRemaining: Math.max(0, attemptsLimit - attemptsUsed),
    });
  } catch (error) {
    console.error("POST /api/live/join failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/answer", authenticate, requireRole("participant"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.status !== "running") {
      return res.status(400).json({ message: "Live-сессия уже завершена." });
    }
    if (!context.session.isLiveStarted) {
      return res.status(400).json({
        message: "Live-квиз еще не начался. Ожидайте запуска организатором.",
      });
    }
    if (context.session.isPaused) {
      return res.status(400).json({
        message: "Live-квиз сейчас на паузе. Дождитесь возобновления.",
      });
    }

    const questionIndex = Number(req.body?.questionIndex);
    if (!Number.isInteger(questionIndex) || questionIndex < 0) {
      return res.status(400).json({ message: "Некорректный questionIndex." });
    }
    if (questionIndex !== context.session.currentQuestionIndex) {
      return res.status(400).json({
        message: "Можно ответить только на текущий демонстрируемый вопрос.",
      });
    }

    const attemptsCountResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM quiz_attempts
      WHERE quiz_id = $1 AND participant_id = $2;
      `,
      [context.quiz.id, req.auth.sub]
    );
    const attemptsUsed = Number(attemptsCountResult.rows[0]?.total || 0);
    const attemptsLimit = Number(context.quiz.maxAttemptsPerParticipant || 1);
    if (attemptsUsed >= attemptsLimit) {
      return res.status(403).json({
        message: `Лимит попыток исчерпан (${attemptsLimit}).`,
      });
    }

    await pool.query(
      `
      INSERT INTO quiz_session_participants (session_id, participant_id)
      VALUES ($1, $2)
      ON CONFLICT (session_id, participant_id) DO NOTHING;
      `,
      [sessionId, req.auth.sub]
    );

    const liveQuestion = getLiveQuestionBySessionIndex(context.session, context.quiz, questionIndex);
    const question = liveQuestion?.question || null;
    if (!question) {
      return res.status(400).json({ message: "Вопрос не найден в live-сессии." });
    }

    const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(context.quiz);
    const questionRemainingSeconds = getLiveQuestionRemainingSeconds(
      context.session,
      questionTimeLimitSeconds
    );
    if (questionRemainingSeconds <= 0) {
      return res.status(400).json({
        message: "Время на этот вопрос вышло. Ждите следующий вопрос.",
      });
    }

    const rawOptionIds = Array.isArray(req.body?.optionIds) ? req.body.optionIds : [];
    const optionIds = Array.from(
      new Set(
        rawOptionIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 1)
      )
    );
    if (optionIds.length === 0) {
      return res.status(400).json({ message: "Выберите хотя бы один вариант ответа." });
    }

    const allowedOptionIds = new Set(question.options.map((option) => option.id));
    for (const optionId of optionIds) {
      if (!allowedOptionIds.has(optionId)) {
        return res.status(400).json({ message: "Некорректный вариант ответа." });
      }
    }
    if (question.answerMode === "single" && optionIds.length > 1) {
      return res.status(400).json({ message: "Для этого вопроса разрешен только один вариант ответа." });
    }

    const correctOptionIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    const isCorrect =
      optionIds.length === correctOptionIds.length &&
      correctOptionIds.every((optionId) => optionIds.includes(optionId));
    const showCorrectAfterAnswer = Boolean(context.quiz.rules?.showCorrectAfterAnswer);
    const submittedAt = new Date().toISOString();
    const submittedAfterSeconds = getLiveQuestionResponseSeconds(
      context.session,
      questionTimeLimitSeconds,
      submittedAt
    );

    await pool.query(
      `
      INSERT INTO quiz_session_answers (
        session_id,
        participant_id,
        question_index,
        selected_option_ids_json,
        is_correct,
        submitted_after_seconds,
        submitted_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
      ON CONFLICT (session_id, participant_id, question_index)
      DO UPDATE
      SET
        selected_option_ids_json = EXCLUDED.selected_option_ids_json,
        is_correct = EXCLUDED.is_correct,
        submitted_after_seconds = EXCLUDED.submitted_after_seconds,
        submitted_at = EXCLUDED.submitted_at;
      `,
      [
        sessionId,
        req.auth.sub,
        questionIndex,
        JSON.stringify(optionIds),
        isCorrect,
        submittedAfterSeconds,
        submittedAt,
      ]
    );

    broadcastToRoom(`user:${context.session.organizerId}`, {
      type: "live:answer-received",
      sessionId,
      participantId: req.auth.sub,
      questionIndex,
      submittedAt: new Date().toISOString(),
    });

    return res.status(201).json({
      accepted: true,
      questionIndex,
      showCorrectAfterAnswer,
      ...(showCorrectAfterAnswer ? { isCorrect } : {}),
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/answer failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/next", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.organizerId !== req.auth.sub) {
      return res.status(403).json({ message: "Недостаточно прав для управления этой live-сессией." });
    }
    const advanceResult = await advanceLiveSessionQuestion(sessionId);
    if (!advanceResult) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    const responsePayload = {
      session: advanceResult.organizerState,
    };
    if (advanceResult.context.session.status === "finished") {
      responsePayload.leaderboard = advanceResult.leaderboard || null;
    }
    return res.json({
      ...responsePayload,
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/next failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/live-sessions/:sessionId/finish", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    if (context.session.organizerId !== req.auth.sub) {
      return res.status(403).json({ message: "Недостаточно прав для управления этой live-сессией." });
    }
    const finishPayload = await finishLiveSessionAndGetPayload(sessionId);
    if (!finishPayload) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }
    return res.json({
      session: finishPayload.organizerState,
      leaderboard: finishPayload.leaderboard || null,
    });
  } catch (error) {
    console.error("POST /api/live-sessions/:sessionId/finish failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/live-sessions/:sessionId/state", authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }

    if (req.auth.role === "organizer") {
      if (context.session.organizerId !== req.auth.sub) {
        return res.status(403).json({ message: "Недостаточно прав." });
      }
    } else if (req.auth.role === "participant") {
      const participantResult = await pool.query(
        `
        SELECT 1
        FROM quiz_session_participants
        WHERE session_id = $1 AND participant_id = $2
        LIMIT 1;
        `,
        [sessionId, req.auth.sub]
      );
      if (participantResult.rows.length === 0) {
        return res.status(403).json({ message: "Вы не подключены к этой live-сессии." });
      }
    } else {
      return res.status(403).json({ message: "Недостаточно прав." });
    }

    const includeCorrect = req.auth.role === "organizer";
    const participants =
      req.auth.role === "organizer" ? await getLiveParticipants(sessionId) : [];
    const answeredParticipants =
      req.auth.role === "organizer" &&
      context.session.status === "running" &&
      context.session.isLiveStarted &&
      Number.isInteger(context.session.currentQuestionIndex) &&
      context.session.currentQuestionIndex >= 0
        ? await getLiveAnsweredParticipants(sessionId, context.session.currentQuestionIndex)
        : [];
    const sessionState = buildLiveSessionState({
      session: context.session,
      quiz: context.quiz,
      participantsCount: context.participantsCount,
      participants,
      answeredParticipants,
      includeCorrect,
    });
    const leaderboard =
      context.session.status === "finished" ? await getLiveLeaderboard(sessionId) : null;

    return res.json({
      session: sessionState,
      ...(leaderboard ? { leaderboard } : {}),
    });
  } catch (error) {
    console.error("GET /api/live-sessions/:sessionId/state failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/live-sessions/:sessionId/leaderboard", authenticate, async (req, res) => {
  try {
    const sessionId = Number(req.params?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return res.status(400).json({ message: "Некорректный id live-сессии." });
    }

    const context = await getLiveSessionContextById(sessionId);
    if (!context) {
      return res.status(404).json({ message: "Live-сессия не найдена." });
    }

    if (req.auth.role === "organizer") {
      if (context.session.organizerId !== req.auth.sub) {
        return res.status(403).json({ message: "Недостаточно прав." });
      }
    } else if (req.auth.role === "participant") {
      const participantResult = await pool.query(
        `
        SELECT 1
        FROM quiz_session_participants
        WHERE session_id = $1 AND participant_id = $2
        LIMIT 1;
        `,
        [sessionId, req.auth.sub]
      );
      if (participantResult.rows.length === 0) {
        return res.status(403).json({ message: "Вы не подключены к этой live-сессии." });
      }
    } else {
      return res.status(403).json({ message: "Недостаточно прав." });
    }

    const leaderboard = await getLiveLeaderboard(sessionId);
    return res.json({
      leaderboard,
    });
  } catch (error) {
    console.error("GET /api/live-sessions/:sessionId/leaderboard failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/quizzes/join", authenticate, requireRole("participant"), async (req, res) => {
  try {
    const rawJoinCode = req.body?.joinCode;
    const joinCode = typeof rawJoinCode === "string" ? rawJoinCode.trim().toUpperCase() : "";
    if (!joinCode) {
      return res.status(400).json({ message: "Введите код квиза." });
    }

    const quizResult = await pool.query(
      `
      SELECT
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at
      FROM quizzes
      WHERE join_code = $1 AND is_active = TRUE
      LIMIT 1;
      `,
      [joinCode]
    );
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: "Активный квиз с таким кодом не найден." });
    }

    const quizForParticipant = mapQuizForParticipant(quizResult.rows[0]);
    const attemptsCountResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM quiz_attempts
      WHERE quiz_id = $1 AND participant_id = $2;
      `,
      [quizForParticipant.id, req.auth.sub]
    );
    const attemptsUsed = Number(attemptsCountResult.rows[0]?.total || 0);
    const attemptsLimit = Number(quizForParticipant.maxAttemptsPerParticipant || 1);
    if (attemptsUsed >= attemptsLimit) {
      return res.status(403).json({
        message: `Лимит попыток исчерпан (${attemptsLimit}).`,
      });
    }

    return res.json({
      quiz: quizForParticipant,
      attemptsUsed,
      attemptsLimit,
      attemptsRemaining: Math.max(0, attemptsLimit - attemptsUsed),
    });
  } catch (error) {
    console.error("POST /api/quizzes/join failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/quizzes/:quizId/submit", authenticate, requireRole("participant"), async (req, res) => {
  try {
    const quizId = Number(req.params?.quizId);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ message: "Некорректный id квиза." });
    }

    const quizResult = await pool.query(
      `
      SELECT
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at
      FROM quizzes
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1;
      `,
      [quizId]
    );
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: "Активный квиз не найден." });
    }

    const quiz = mapDbQuiz(quizResult.rows[0]);
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(400).json({ message: "В этом квизе нет вопросов." });
    }

    const attemptsCountResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM quiz_attempts
      WHERE quiz_id = $1 AND participant_id = $2;
      `,
      [quiz.id, req.auth.sub]
    );
    const attemptsUsed = Number(attemptsCountResult.rows[0]?.total || 0);
    const attemptsLimit = Number(quiz.maxAttemptsPerParticipant || 1);
    if (attemptsUsed >= attemptsLimit) {
      return res.status(403).json({
        message: `Лимит попыток исчерпан (${attemptsLimit}).`,
      });
    }

    let answerMap;
    try {
      answerMap = sanitizeSubmittedAnswers(req.body?.answers);
    } catch (validationError) {
      return res.status(400).json({
        message: validationError.message || "Некорректный формат ответов.",
      });
    }

    const questionById = new Map(quiz.questions.map((question) => [question.id, question]));
    for (const [questionId, optionIds] of answerMap.entries()) {
      const question = questionById.get(questionId);
      if (!question) {
        return res.status(400).json({
          message: `Вопрос с id=${questionId} отсутствует в этом квизе.`,
        });
      }
      const availableOptionIds = new Set(question.options.map((option) => option.id));
      for (const optionId of optionIds) {
        if (!availableOptionIds.has(optionId)) {
          return res.status(400).json({
            message: `Некорректный вариант ответа в вопросе id=${questionId}.`,
          });
        }
      }
      if (question.answerMode === "single" && optionIds.length > 1) {
        return res.status(400).json({
          message: `В вопросе id=${questionId} разрешен только один вариант ответа.`,
        });
      }
    }

    const scoring = scoreQuizAnswers(quiz.questions, answerMap);
    const rawSpentSeconds = Number(req.body?.spentSeconds);
    const maxAllowedSeconds = Math.max(1, Number(quiz.durationMinutes || 0)) * 60;
    const spentSeconds =
      Number.isFinite(rawSpentSeconds) && rawSpentSeconds >= 0
        ? Math.min(Math.round(rawSpentSeconds), maxAllowedSeconds)
        : 0;
    const answersForStorage = quiz.questions.map((question) => ({
      questionId: question.id,
      optionIds: Array.isArray(answerMap.get(question.id)) ? answerMap.get(question.id) : [],
    }));

    const insertResult = await pool.query(
      `
      INSERT INTO quiz_attempts (
        quiz_id,
        participant_id,
        answers_json,
        score,
        max_score,
        time_spent_seconds
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      RETURNING id, created_at;
      `,
      [
        quiz.id,
        req.auth.sub,
        JSON.stringify(answersForStorage),
        scoring.score,
        scoring.maxScore,
        spentSeconds,
      ]
    );

    return res.status(201).json({
      result: {
        attemptId: insertResult.rows[0].id,
        quizId: quiz.id,
        quizTitle: quiz.title,
        score: scoring.score,
        maxScore: scoring.maxScore,
        percentage: scoring.percentage,
        timeSpentSeconds: spentSeconds,
        createdAt: insertResult.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error("POST /api/quizzes/:quizId/submit failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/attempts/mine", authenticate, requireRole("participant"), async (req, res) => {
  try {
    const attemptsResult = await pool.query(
      `
      SELECT
        qa.id,
        qa.quiz_id,
        qa.answers_json,
        qa.score,
        qa.max_score,
        qa.time_spent_seconds,
        qa.live_session_id,
        qa.created_at,
        q.title AS quiz_title,
        q.category AS quiz_category
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.participant_id = $1
      ORDER BY qa.created_at DESC, qa.id DESC;
      `,
      [req.auth.sub]
    );

    const attempts = attemptsResult.rows.map((row) => ({
      ...mapAttemptCommon(row),
      quizId: row.quiz_id,
      quizTitle: row.quiz_title,
      quizCategory: row.quiz_category,
    }));

    return res.json({ attempts });
  } catch (error) {
    console.error("GET /api/attempts/mine failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/quizzes/mine/attempts", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const rawLimit = Number(req.query?.limit);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 300) : 100;

    const attemptsResult = await pool.query(
      `
      SELECT
        qa.id,
        qa.quiz_id,
        qa.participant_id,
        qa.answers_json,
        qa.score,
        qa.max_score,
        qa.time_spent_seconds,
        qa.live_session_id,
        qa.created_at,
        q.title AS quiz_title,
        q.category AS quiz_category,
        q.join_code AS quiz_join_code,
        u.name AS participant_name,
        u.email AS participant_email,
        u.avatar_data_url AS participant_avatar_data_url
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN users u ON u.id = qa.participant_id
      WHERE q.organizer_id = $1
      ORDER BY qa.created_at DESC, qa.id DESC
      LIMIT $2;
      `,
      [req.auth.sub, limit]
    );

    const attempts = attemptsResult.rows.map((row) => ({
      ...mapAttemptCommon(row),
      quizId: row.quiz_id,
      quizTitle: row.quiz_title,
      quizCategory: row.quiz_category,
      quizJoinCode: row.quiz_join_code,
      participantId: row.participant_id,
      participantName: row.participant_name,
      participantEmail: row.participant_email,
      participantAvatarDataUrl: row.participant_avatar_data_url || "",
    }));

    return res.json({ attempts });
  } catch (error) {
    console.error("GET /api/quizzes/mine/attempts failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.get("/api/live-sessions/mine", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const rawLimit = Number(req.query?.limit);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;

    const sessionsResult = await pool.query(
      `
      SELECT
        s.id,
        s.quiz_id,
        s.status,
        s.current_question_index,
        s.current_question_started_at,
        s.started_at,
        s.finished_at,
        q.title AS quiz_title,
        q.join_code AS quiz_join_code
      FROM quiz_sessions s
      JOIN quizzes q ON q.id = s.quiz_id
      WHERE s.organizer_id = $1
      ORDER BY COALESCE(s.finished_at, s.started_at) DESC, s.id DESC
      LIMIT $2;
      `,
      [req.auth.sub, limit]
    );

    const sessions = [];
    for (const row of sessionsResult.rows) {
      const sessionId = Number(row.id);
      const context = await getLiveSessionContextById(sessionId);
      if (!context) {
        continue;
      }
      const leaderboard =
        context.session.status === "finished"
          ? await getLiveLeaderboard(sessionId)
          : null;

      const topWinners = Array.isArray(leaderboard?.entries)
        ? leaderboard.entries.slice(0, 3).map((entry) => ({
            place: entry.place,
            participantId: entry.participantId,
            participantName: entry.participantName,
            participantAvatarDataUrl: entry.participantAvatarDataUrl || "",
            score: entry.score,
            maxScore: entry.maxScore,
            percentage: entry.percentage,
          }))
        : [];

      sessions.push({
        id: sessionId,
        quizId: Number(row.quiz_id),
        quizTitle: row.quiz_title,
        quizJoinCode: row.quiz_join_code,
        status: context.session.status,
        participantsCount: Number(context.participantsCount || 0),
        questionCount: Number(context.quiz.questionCount || 0),
        startedAt: context.session.startedAt,
        finishedAt: context.session.finishedAt,
        winners: topWinners,
      });
    }

    return res.json({
      sessions,
    });
  } catch (error) {
    console.error("GET /api/live-sessions/mine failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.put("/api/quizzes/:quizId", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const quizId = Number(req.params?.quizId);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ message: "Некорректный id квиза." });
    }

    const rawTitle = req.body?.title;
    const rawDescription = req.body?.description;
    const rawCategory = req.body?.category;
    const rawIsActive = req.body?.isActive;
    const rawDurationMinutes = req.body?.durationMinutes;
    const rawQuestionTimeSeconds = req.body?.questionTimeSeconds;
    const rawMaxAttempts = req.body?.maxAttempts;
    const rawRules = req.body?.rules;
    const rawQuestions = req.body?.questions;

    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    const category = typeof rawCategory === "string" ? rawCategory.trim() : "";
    const isActive = typeof rawIsActive === "boolean" ? rawIsActive : true;
    const durationMinutes = Number(rawDurationMinutes);
    const questionTimeSeconds =
      typeof rawQuestionTimeSeconds === "undefined"
        ? DEFAULT_QUIZ_QUESTION_TIME_SECONDS
        : Number(rawQuestionTimeSeconds);
    const maxAttempts =
      typeof rawMaxAttempts === "undefined" ? 1 : Number(rawMaxAttempts);
    const rules = sanitizeQuizRules(rawRules);

    if (!title) {
      return res.status(400).json({ message: "Введите название квиза." });
    }
    if (title.length > MAX_QUIZ_TITLE_LENGTH) {
      return res.status(400).json({
        message: `Название квиза не должно превышать ${MAX_QUIZ_TITLE_LENGTH} символов.`,
      });
    }
    if (description.length > MAX_QUIZ_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Описание квиза не должно превышать ${MAX_QUIZ_DESCRIPTION_LENGTH} символов.`,
      });
    }
    if (!category) {
      return res.status(400).json({ message: "Выберите категорию квиза." });
    }
    if (category.length > MAX_QUIZ_CATEGORY_LENGTH) {
      return res.status(400).json({
        message: `Категория не должна превышать ${MAX_QUIZ_CATEGORY_LENGTH} символов.`,
      });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      return res.status(400).json({ message: "Время прохождения должно быть целым числом от 1 минуты." });
    }
    if (durationMinutes > MAX_QUIZ_DURATION_MINUTES) {
      return res.status(400).json({
        message: `Время прохождения не должно превышать ${MAX_QUIZ_DURATION_MINUTES} минут.`,
      });
    }
    if (!Number.isInteger(questionTimeSeconds) || questionTimeSeconds < MIN_QUIZ_QUESTION_TIME_SECONDS) {
      return res.status(400).json({
        message: `Время на вопрос должно быть целым числом от ${MIN_QUIZ_QUESTION_TIME_SECONDS} секунд.`,
      });
    }
    if (questionTimeSeconds > MAX_QUIZ_QUESTION_TIME_SECONDS) {
      return res.status(400).json({
        message: `Время на вопрос не должно превышать ${MAX_QUIZ_QUESTION_TIME_SECONDS} секунд.`,
      });
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      return res.status(400).json({
        message: "Лимит попыток должен быть целым числом от 1.",
      });
    }
    if (maxAttempts > MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT) {
      return res.status(400).json({
        message: `Лимит попыток не должен превышать ${MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT}.`,
      });
    }

    let questions = [];
    try {
      questions = sanitizeQuizQuestions(rawQuestions);
    } catch (validationError) {
      return res.status(400).json({
        message: validationError.message || "Некорректные данные вопросов.",
      });
    }

    const updateResult = await pool.query(
      `
      UPDATE quizzes
      SET
        title = $3,
        description = $4,
        category = $5,
        is_active = $6,
        time_limit_minutes = $7,
        question_time_seconds = $8,
        max_attempts_per_participant = $9,
        rules_json = $10::jsonb,
        questions_json = $11::jsonb
      WHERE id = $1 AND organizer_id = $2
      RETURNING
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at;
      `,
      [
        quizId,
        req.auth.sub,
        title,
        description,
        category,
        isActive,
        durationMinutes,
        questionTimeSeconds,
        maxAttempts,
        JSON.stringify(rules),
        JSON.stringify(questions),
      ]
    );
    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Квиз не найден." });
    }

    const updatedQuiz = mapDbQuiz(updateResult.rows[0]);
    broadcastToRoom(`role:organizer`, {
      type: "quiz:updated",
      quiz: updatedQuiz,
    });
    broadcastToRoom(`quiz:${quizId}`, {
      type: "quiz:updated",
      quiz: updatedQuiz,
    });

    return res.json({
      quiz: updatedQuiz,
    });
  } catch (error) {
    console.error("PUT /api/quizzes/:quizId failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.delete("/api/quizzes/:quizId", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const quizId = Number(req.params?.quizId);
    if (!Number.isInteger(quizId) || quizId < 1) {
      return res.status(400).json({ message: "Некорректный id квиза." });
    }

    const deleteResult = await pool.query(
      `
      DELETE FROM quizzes
      WHERE id = $1 AND organizer_id = $2
      RETURNING id;
      `,
      [quizId, req.auth.sub]
    );
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ message: "Квиз не найден." });
    }

    const deletedQuizId = deleteResult.rows[0].id;
    broadcastToRoom(`role:organizer`, {
      type: "quiz:deleted",
      quizId: deletedQuizId,
    });
    broadcastToRoom(`quiz:${deletedQuizId}`, {
      type: "quiz:deleted",
      quizId: deletedQuizId,
    });

    return res.json({
      deleted: true,
      quizId: deletedQuizId,
    });
  } catch (error) {
    console.error("DELETE /api/quizzes/:quizId failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

app.post("/api/quizzes", authenticate, requireRole("organizer"), async (req, res) => {
  try {
    const rawTitle = req.body?.title;
    const rawDescription = req.body?.description;
    const rawCategory = req.body?.category;
    const rawIsActive = req.body?.isActive;
    const rawDurationMinutes = req.body?.durationMinutes;
    const rawQuestionTimeSeconds = req.body?.questionTimeSeconds;
    const rawMaxAttempts = req.body?.maxAttempts;
    const rawRules = req.body?.rules;
    const rawQuestions = req.body?.questions;

    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    const category = typeof rawCategory === "string" ? rawCategory.trim() : "";
    const isActive = typeof rawIsActive === "boolean" ? rawIsActive : true;
    const durationMinutes = Number(rawDurationMinutes);
    const questionTimeSeconds =
      typeof rawQuestionTimeSeconds === "undefined"
        ? DEFAULT_QUIZ_QUESTION_TIME_SECONDS
        : Number(rawQuestionTimeSeconds);
    const maxAttempts =
      typeof rawMaxAttempts === "undefined" ? 1 : Number(rawMaxAttempts);
    const rules = sanitizeQuizRules(rawRules);

    if (!title) {
      return res.status(400).json({ message: "Введите название квиза." });
    }
    if (title.length > MAX_QUIZ_TITLE_LENGTH) {
      return res.status(400).json({
        message: `Название квиза не должно превышать ${MAX_QUIZ_TITLE_LENGTH} символов.`,
      });
    }
    if (description.length > MAX_QUIZ_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Описание квиза не должно превышать ${MAX_QUIZ_DESCRIPTION_LENGTH} символов.`,
      });
    }
    if (!category) {
      return res.status(400).json({ message: "Выберите категорию квиза." });
    }
    if (category.length > MAX_QUIZ_CATEGORY_LENGTH) {
      return res.status(400).json({
        message: `Категория не должна превышать ${MAX_QUIZ_CATEGORY_LENGTH} символов.`,
      });
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      return res.status(400).json({ message: "Время прохождения должно быть целым числом от 1 минуты." });
    }
    if (durationMinutes > MAX_QUIZ_DURATION_MINUTES) {
      return res.status(400).json({
        message: `Время прохождения не должно превышать ${MAX_QUIZ_DURATION_MINUTES} минут.`,
      });
    }
    if (!Number.isInteger(questionTimeSeconds) || questionTimeSeconds < MIN_QUIZ_QUESTION_TIME_SECONDS) {
      return res.status(400).json({
        message: `Время на вопрос должно быть целым числом от ${MIN_QUIZ_QUESTION_TIME_SECONDS} секунд.`,
      });
    }
    if (questionTimeSeconds > MAX_QUIZ_QUESTION_TIME_SECONDS) {
      return res.status(400).json({
        message: `Время на вопрос не должно превышать ${MAX_QUIZ_QUESTION_TIME_SECONDS} секунд.`,
      });
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      return res.status(400).json({
        message: "Лимит попыток должен быть целым числом от 1.",
      });
    }
    if (maxAttempts > MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT) {
      return res.status(400).json({
        message: `Лимит попыток не должен превышать ${MAX_QUIZ_ATTEMPTS_PER_PARTICIPANT}.`,
      });
    }

    let questions = [];
    try {
      questions = sanitizeQuizQuestions(rawQuestions);
    } catch (validationError) {
      return res.status(400).json({
        message: validationError.message || "Некорректные данные вопросов.",
      });
    }

    let createdQuiz = null;
    const insertSql = `
      INSERT INTO quizzes (
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
      RETURNING
        id,
        organizer_id,
        title,
        description,
        category,
        join_code,
        is_active,
        time_limit_minutes,
        question_time_seconds,
        max_attempts_per_participant,
        rules_json,
        questions_json,
        created_at;
    `;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinCode = generateQuizJoinCode(6);
      try {
        const insertResult = await pool.query(insertSql, [
          req.auth.sub,
          title,
          description,
          category,
          joinCode,
          isActive,
          durationMinutes,
          questionTimeSeconds,
          maxAttempts,
          JSON.stringify(rules),
          JSON.stringify(questions),
        ]);
        createdQuiz = mapDbQuiz(insertResult.rows[0]);
        break;
      } catch (error) {
        if (error && error.code === "23505") {
          continue;
        }
        throw error;
      }
    }

    if (!createdQuiz) {
      return res.status(500).json({ message: "Не удалось создать квиз. Повторите попытку." });
    }

    broadcastToRoom(`role:organizer`, {
      type: "quiz:created",
      quiz: createdQuiz,
    });

    return res.status(201).json({
      quiz: createdQuiz,
    });
  } catch (error) {
    console.error("POST /api/quizzes failed:", error);
    return res.status(500).json({ message: "Внутренняя ошибка сервера." });
  }
});

async function start() {
  try {
    getStartupWarnings().forEach((warning) => {
      console.warn("Startup warning:", warning);
    });
    await ensureUsersTable();
    await ensureQuizzesTable();
    await ensureLiveSessionsTable();
    await ensureLiveSessionParticipantsTable();
    await ensureLiveSessionAnswersTable();
    await ensureQuizAttemptsTable();
    isServerReady = true;
    server.listen(port, () => {
      console.log(`API server started on http://localhost:${port}`);
    });
  } catch (error) {
    isServerReady = false;
    clearInterval(wsHeartbeatTimer);
    clearInterval(liveAutoTickTimer);
    console.error("Failed to start API server:", formatStartupError(error));
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

start();
