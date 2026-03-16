export function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function formatSeconds(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getLiveStatusLabel(status, isPaused) {
  if (status === "finished") {
    return "Завершен";
  }
  if (isPaused) {
    return "Пауза";
  }
  return "Идет";
}
