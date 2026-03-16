import styles from "../../css/CabinetPage.module.css";

export function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function formatAttemptDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ru-RU");
}

export function getResultBadgeClass(percentage) {
  if (percentage >= 80) {
    return styles.resultBadgeHigh;
  }
  if (percentage >= 50) {
    return styles.resultBadgeMedium;
  }
  return styles.resultBadgeLow;
}

export function formatDurationSeconds(value) {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${String(seconds).padStart(2, "0")}с`;
}

export function getAttemptAnswerTitle(answer, index) {
  const questionPosition = Number(answer?.questionPosition || 0);
  if (typeof answer?.prompt === "string" && answer.prompt.trim()) {
    return `Вопрос ${questionPosition > 0 ? questionPosition : index + 1}. ${answer.prompt.trim()}`;
  }
  if (Number.isInteger(Number(answer?.questionId))) {
    return `Вопрос #${Number(answer.questionId)}`;
  }
  return `Вопрос ${index + 1}`;
}

export function getAttemptAnswerMeta(answer) {
  const optionTexts = Array.isArray(answer?.optionTexts)
    ? answer.optionTexts.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const optionIds = Array.isArray(answer?.optionIds)
    ? answer.optionIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  const parts = [];
  if (optionTexts.length > 0) {
    parts.push(`Ответ: ${optionTexts.join(", ")}`);
  } else if (optionIds.length > 0) {
    parts.push(`Ответ: ${optionIds.map((value) => `#${value}`).join(", ")}`);
  } else {
    parts.push("Ответ не дан");
  }

  if (typeof answer?.isCorrect === "boolean") {
    parts.push(answer.isCorrect ? "Верно" : "Неверно");
  }

  const submittedAfterSeconds = Number(answer?.submittedAfterSeconds || 0);
  if (submittedAfterSeconds > 0) {
    parts.push(`Время ответа: ${formatDurationSeconds(submittedAfterSeconds)}`);
  }

  return parts.join(" • ");
}

export function formatAttemptsCount(count) {
  const total = Math.max(0, Number(count) || 0);
  const remainder10 = total % 10;
  const remainder100 = total % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${total} попытка`;
  }
  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return `${total} попытки`;
  }
  return `${total} попыток`;
}

export function getGroupedAttempts(list, groupPrefix) {
  const groups = new Map();

  list.forEach((attempt) => {
    const rawTitle = String(attempt?.quizTitle || "Квиз").trim();
    const title = rawTitle || "Квиз";
    const numericQuizId = Number(attempt?.quizId);
    const normalizedKey =
      Number.isInteger(numericQuizId) && numericQuizId > 0
        ? String(numericQuizId)
        : title.toLowerCase().replace(/\s+/g, "-");
    const groupKey = `${groupPrefix}-${normalizedKey}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        title,
        avatarChar: title.charAt(0).toUpperCase() || "Q",
        attempts: [],
      });
    }

    groups.get(groupKey).attempts.push(attempt);
  });

  return Array.from(groups.values());
}
