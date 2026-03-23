const { DEFAULT_QUIZ_QUESTION_TIME_SECONDS } = require("../config/env");
const MANAGED_QUESTION_UPLOADS_PREFIX = "/uploads/questions/";

function normalizeManagedQuestionImageUrl(rawValue) {
  const imageUrl = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!imageUrl) {
    return "";
  }

  if (imageUrl.startsWith(MANAGED_QUESTION_UPLOADS_PREFIX)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    if (!parsed.pathname.startsWith(MANAGED_QUESTION_UPLOADS_PREFIX)) {
      return imageUrl;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return imageUrl;
  }
}

function mapDbUser(row) {
  return {
    id: row.id,
    name: row.name,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    middleName: row.middle_name || "",
    email: row.email,
    role: row.role,
    avatarDataUrl: row.avatar_data_url || "",
  };
}

function normalizeNamePart(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function buildDisplayName({ firstName, lastName, middleName }) {
  return [lastName, firstName, middleName].filter(Boolean).join(" ");
}

function mapDbQuiz(row) {
  const rawQuestions = Array.isArray(row.questions_json) ? row.questions_json : [];
  const questions = rawQuestions
    .map((question, questionIndex) => {
      if (typeof question === "string") {
        return {
          id: questionIndex + 1,
          type: "text",
          prompt: question,
          imageUrl: "",
          answerMode: "single",
          options: [
            { id: 1, text: "Да", isCorrect: true },
            { id: 2, text: "Нет", isCorrect: false },
          ],
        };
      }
      if (!question || typeof question !== "object") {
        return null;
      }
      const type = question.type === "image" ? "image" : "text";
      const prompt = typeof question.prompt === "string" ? question.prompt : "";
      const imageUrl = normalizeManagedQuestionImageUrl(question.imageUrl);
      const answerMode = question.answerMode === "multiple" ? "multiple" : "single";
      const options = Array.isArray(question.options)
        ? question.options
            .map((option, optionIndex) => {
              if (!option || typeof option !== "object") {
                return null;
              }
              const text = typeof option.text === "string" ? option.text : "";
              const isCorrect = Boolean(option.isCorrect);
              return {
                id: optionIndex + 1,
                text,
                isCorrect,
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: questionIndex + 1,
        type,
        prompt,
        imageUrl,
        answerMode,
        options,
      };
    })
    .filter(Boolean);

  const rawRules = row.rules_json && typeof row.rules_json === "object" ? row.rules_json : {};
  const rules = {
    allowBackNavigation: Boolean(rawRules.allowBackNavigation),
    showCorrectAfterAnswer: Boolean(rawRules.showCorrectAfterAnswer),
    shuffleQuestions: Boolean(rawRules.shuffleQuestions),
  };
  const durationMinutes = Number(row.time_limit_minutes || 0);
  const questionCount = questions.length;
  const fallbackQuestionTimeSeconds =
    questionCount > 0
      ? Math.max(1, Math.ceil((Math.max(1, durationMinutes) * 60) / questionCount))
      : DEFAULT_QUIZ_QUESTION_TIME_SECONDS;
  const rawQuestionTimeSeconds = Number(row.question_time_seconds || 0);
  const questionTimeSeconds =
    Number.isFinite(rawQuestionTimeSeconds) && rawQuestionTimeSeconds > 0
      ? Math.floor(rawQuestionTimeSeconds)
      : fallbackQuestionTimeSeconds;
  const maxAttemptsPerParticipant = Number(row.max_attempts_per_participant || 1);
  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    description: row.description || "",
    category: row.category || "general",
    joinCode: row.join_code,
    isActive: row.is_active,
    durationMinutes,
    questionTimeSeconds,
    maxAttemptsPerParticipant,
    questionCount,
    questions,
    rules,
    createdAt: row.created_at,
  };
}

function mapQuizForParticipant(row) {
  const quiz = mapDbQuiz(row);
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    joinCode: quiz.joinCode,
    isActive: quiz.isActive,
    durationMinutes: quiz.durationMinutes,
    questionTimeSeconds: quiz.questionTimeSeconds,
    maxAttemptsPerParticipant: quiz.maxAttemptsPerParticipant,
    questionCount: quiz.questionCount,
    rules: quiz.rules,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      imageUrl: question.imageUrl,
      answerMode: question.answerMode,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
      })),
    })),
  };
}

function mapLiveQuizFromRow(row) {
  return mapDbQuiz({
    id: row.quiz_id,
    organizer_id: row.quiz_organizer_id,
    title: row.quiz_title,
    description: row.quiz_description,
    category: row.quiz_category,
    join_code: row.quiz_join_code,
    is_active: row.quiz_is_active,
    time_limit_minutes: row.quiz_time_limit_minutes,
    question_time_seconds: row.quiz_question_time_seconds,
    max_attempts_per_participant: row.quiz_max_attempts_per_participant,
    rules_json: row.quiz_rules_json,
    questions_json: row.quiz_questions_json,
    created_at: row.quiz_created_at,
  });
}

function mapLiveSessionFromRow(row) {
  const rawQuestionOrder = Array.isArray(row.question_order_json) ? row.question_order_json : [];
  const questionOrder = rawQuestionOrder
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);
  return {
    id: row.session_id,
    quizId: row.session_quiz_id,
    organizerId: row.organizer_id,
    status: row.session_status,
    isLiveStarted: Boolean(row.is_live_started),
    isPaused: Boolean(row.is_paused),
    currentQuestionIndex: Number(row.current_question_index ?? -1),
    questionOrder,
    currentQuestionStartedAt: row.current_question_started_at || row.started_at,
    pausedAt: row.paused_at || null,
    pausedRemainingSeconds: Math.max(0, Number(row.paused_remaining_seconds || 0)),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapAttemptCommon(row) {
  const maxScore = Number(row.max_score || 0);
  const score = Number(row.score || 0);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const answers = Array.isArray(row.answers_json) ? row.answers_json : [];
  const answeredQuestionsCount = answers.filter(
    (answer) => Array.isArray(answer?.optionIds) && answer.optionIds.length > 0
  ).length;
  const liveSessionId =
    typeof row.live_session_id === "number" || typeof row.live_session_id === "string"
      ? Number(row.live_session_id)
      : null;

  return {
    id: row.id,
    score,
    maxScore,
    percentage,
    answers,
    answeredQuestionsCount,
    timeSpentSeconds: Number(row.time_spent_seconds || 0),
    liveSessionId: Number.isInteger(liveSessionId) && liveSessionId > 0 ? liveSessionId : null,
    isLive: Number.isInteger(liveSessionId) && liveSessionId > 0,
    createdAt: row.created_at,
  };
}

module.exports = {
  mapDbUser,
  normalizeNamePart,
  buildDisplayName,
  mapDbQuiz,
  mapQuizForParticipant,
  mapLiveQuizFromRow,
  mapLiveSessionFromRow,
  mapAttemptCommon,
};
