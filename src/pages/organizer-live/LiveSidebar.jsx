import styles from "../../css/CabinetPage.module.css";

export default function LiveSidebar({
  joinCode,
  participantsCount,
  sessionStatus,
  isLiveStarted,
  isPaused,
  currentQuestionPosition,
  questionCount,
  isActionLoading,
  actionType,
  wsStatus,
  lastWsEvent,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onNextQuestion,
  onFinishSession,
  onRefreshLeaderboard,
}) {
  return (
    <aside className={styles.liveSidebar}>
      <article className={styles.liveSidebarCard}>
        <p className={styles.liveSidebarText}>Комната: {joinCode}</p>
        <p className={styles.liveSidebarText}>Участников: {participantsCount}</p>
        <p className={styles.liveSidebarText}>
          {sessionStatus === "running" && isLiveStarted
            ? `Вопрос ${currentQuestionPosition} из ${questionCount}`
            : "Эфир еще не запущен"}
        </p>
      </article>

      <article className={styles.liveSidebarCard}>
        <div className={styles.liveActionStack}>
          {sessionStatus === "running" && !isLiveStarted && (
            <button
              type="button"
              className={styles.formSubmitButton}
              onClick={onStartSession}
              disabled={isActionLoading}
            >
              {isActionLoading && actionType === "start" ? "Запускаем..." : "Начать квиз"}
            </button>
          )}
          {sessionStatus === "running" && isLiveStarted && !isPaused && (
            <button
              type="button"
              className={styles.formSubmitButton}
              onClick={onPauseSession}
              disabled={isActionLoading}
            >
              {isActionLoading && actionType === "pause" ? "Ставим на паузу..." : "Пауза"}
            </button>
          )}
          {sessionStatus === "running" && isLiveStarted && isPaused && (
            <button
              type="button"
              className={styles.formSubmitButton}
              onClick={onResumeSession}
              disabled={isActionLoading}
            >
              {isActionLoading && actionType === "resume" ? "Возобновляем..." : "Продолжить"}
            </button>
          )}
          {sessionStatus === "running" && isLiveStarted && (
            <button
              type="button"
              className={styles.formSubmitButton}
              onClick={onNextQuestion}
              disabled={isActionLoading}
            >
              {isActionLoading && actionType === "next" ? "Обновление..." : "Следующий вопрос"}
            </button>
          )}
          {sessionStatus === "running" && (
            <button
              type="button"
              className={styles.quizDeleteButton}
              onClick={onFinishSession}
              disabled={isActionLoading}
            >
              {isActionLoading && actionType === "finish" ? "Завершаем..." : "Завершить эфир"}
            </button>
          )}
          {sessionStatus === "finished" && (
            <button
              type="button"
              className={styles.formSubmitButton}
              onClick={onRefreshLeaderboard}
            >
              Обновить рейтинг
            </button>
          )}
        </div>
      </article>

      <article className={styles.liveSidebarCard}>
        <p className={styles.liveSidebarText}>WS: {wsStatus}</p>
        <p className={styles.liveSidebarText}>Последнее событие: {lastWsEvent}</p>
      </article>
    </aside>
  );
}
