const crypto = require("crypto");
const { DEFAULT_QUIZ_QUESTION_TIME_SECONDS } = require("../config/env");

function buildDefaultQuestionOrder(questionCount) {
  const safeCount = Number.isInteger(questionCount) && questionCount > 0 ? questionCount : 0;
  return Array.from({ length: safeCount }, (_value, index) => index);
}

function normalizeQuestionOrder(rawQuestionOrder, questionCount) {
  const fallback = buildDefaultQuestionOrder(questionCount);
  const source = Array.isArray(rawQuestionOrder) ? rawQuestionOrder : [];
  if (source.length !== questionCount) {
    return fallback;
  }

  const normalized = source
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < questionCount);
  if (normalized.length !== questionCount) {
    return fallback;
  }

  const uniqueSize = new Set(normalized).size;
  if (uniqueSize !== questionCount) {
    return fallback;
  }

  return normalized;
}

function createLiveQuestionOrder(quiz) {
  const questionCount = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const order = buildDefaultQuestionOrder(questionCount);
  if (!Boolean(quiz?.rules?.shuffleQuestions) || order.length <= 1) {
    return order;
  }

  for (let index = order.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(0, index + 1);
    [order[index], order[randomIndex]] = [order[randomIndex], order[index]];
  }

  return order;
}

function getLiveQuestionBySessionIndex(session, quiz, sessionQuestionIndex) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const questionCount = questions.length;
  const index = Number(sessionQuestionIndex);
  if (!Number.isInteger(index) || index < 0 || index >= questionCount) {
    return null;
  }

  const questionOrder = normalizeQuestionOrder(session?.questionOrder, questionCount);
  const actualQuestionIndex = questionOrder[index];
  const question = questions[actualQuestionIndex];
  if (!question) {
    return null;
  }

  return {
    question,
    actualQuestionIndex,
    questionOrder,
  };
}

function getLiveQuestionTimeLimitSeconds(quiz) {
  const explicitQuestionTimeSeconds = Number(quiz?.questionTimeSeconds || 0);
  if (Number.isFinite(explicitQuestionTimeSeconds) && explicitQuestionTimeSeconds > 0) {
    return Math.floor(explicitQuestionTimeSeconds);
  }

  const questionCount = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  if (questionCount < 1) {
    return DEFAULT_QUIZ_QUESTION_TIME_SECONDS;
  }

  const durationMinutes = Math.max(1, Number(quiz.durationMinutes || 0));
  const durationSeconds = durationMinutes * 60;
  return Math.max(1, Math.ceil(durationSeconds / questionCount));
}

function getLiveQuestionRemainingSeconds(session, questionTimeLimitSeconds) {
  if (!questionTimeLimitSeconds || session.status !== "running" || !session.isLiveStarted) {
    return 0;
  }
  if (session.isPaused) {
    return Math.max(0, Number(session.pausedRemainingSeconds || 0));
  }
  const startedAtRaw = session.currentQuestionStartedAt || session.startedAt;
  const startedAtMs = new Date(startedAtRaw || "").getTime();
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    return questionTimeLimitSeconds;
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  return Math.max(0, questionTimeLimitSeconds - elapsedSeconds);
}

function getLiveQuestionResponseSeconds(session, questionTimeLimitSeconds, submittedAt) {
  if (!questionTimeLimitSeconds) {
    return 0;
  }

  const startedAtRaw = session.currentQuestionStartedAt || session.startedAt;
  const startedAtMs = new Date(startedAtRaw || "").getTime();
  const submittedAtMs = new Date(submittedAt || "").getTime();
  if (
    !Number.isFinite(startedAtMs) ||
    startedAtMs <= 0 ||
    !Number.isFinite(submittedAtMs) ||
    submittedAtMs <= 0
  ) {
    return 0;
  }

  const elapsedSeconds = Math.max(0, Math.floor((submittedAtMs - startedAtMs) / 1000));
  return Math.max(0, Math.min(questionTimeLimitSeconds, elapsedSeconds));
}

function toLiveQuestionPayload(question, questionIndex, includeCorrect) {
  if (!question || typeof question !== "object") {
    return null;
  }
  return {
    index: questionIndex,
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.imageUrl,
    answerMode: question.answerMode,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      ...(includeCorrect ? { isCorrect: option.isCorrect } : {}),
    })),
  };
}

function buildLiveSessionState({
  session,
  quiz,
  participantsCount = 0,
  participants = [],
  answeredParticipants = [],
  includeCorrect = false,
}) {
  const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  const currentIndex = Number(session.currentQuestionIndex ?? -1);
  const hasCurrentQuestion =
    currentIndex >= 0 &&
    currentIndex < questionCount &&
    session.status === "running" &&
    Boolean(session.isLiveStarted);
  const liveQuestion = hasCurrentQuestion
    ? getLiveQuestionBySessionIndex(session, quiz, currentIndex)
    : null;
  const questionTimeLimitSeconds = getLiveQuestionTimeLimitSeconds(quiz);
  const questionRemainingSeconds = hasCurrentQuestion
    ? getLiveQuestionRemainingSeconds(session, questionTimeLimitSeconds)
    : 0;
  const currentQuestion = liveQuestion
    ? toLiveQuestionPayload(liveQuestion.question, currentIndex, includeCorrect)
    : null;

  return {
    sessionId: session.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    joinCode: quiz.joinCode,
    status: session.status,
    isLiveStarted: Boolean(session.isLiveStarted),
    isPaused: Boolean(session.isPaused),
    currentQuestionIndex: currentIndex,
    questionCount,
    rules: quiz.rules,
    participantsCount: Number(participantsCount || 0),
    participants: Array.isArray(participants) ? participants : [],
    currentQuestionAnswersCount: hasCurrentQuestion ? answeredParticipants.length : 0,
    currentQuestionAnsweredParticipants: hasCurrentQuestion && Array.isArray(answeredParticipants)
      ? answeredParticipants
      : [],
    currentQuestion,
    currentQuestionStartedAt: session.currentQuestionStartedAt,
    pausedAt: session.pausedAt,
    questionTimeLimitSeconds,
    questionRemainingSeconds,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  };
}

module.exports = {
  buildDefaultQuestionOrder,
  normalizeQuestionOrder,
  createLiveQuestionOrder,
  getLiveQuestionBySessionIndex,
  getLiveQuestionTimeLimitSeconds,
  getLiveQuestionRemainingSeconds,
  getLiveQuestionResponseSeconds,
  toLiveQuestionPayload,
  buildLiveSessionState,
};
