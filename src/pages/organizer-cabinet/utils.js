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

export function formatSessionPeriod(startedAt, finishedAt) {
  const started = formatAttemptDate(startedAt);
  const finished = formatAttemptDate(finishedAt);
  if (!started && !finished) {
    return "";
  }
  if (!finished) {
    return `Старт: ${started}`;
  }
  return `Старт: ${started} • Финиш: ${finished}`;
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
