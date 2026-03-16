import styles from "../../css/CabinetPage.module.css";
import { getLiveStatusLabel } from "./utils";

export default function LiveSidebar({
  sessionStatus,
  isPaused,
  wsStatus,
  attemptsInfo,
  isRunning,
  isLiveStarted,
  myLeaderboardPlace,
  onRefreshLeaderboard,
}) {
  return (
    <aside className={styles.liveSidebar}>
      <article className={styles.liveSidebarCard}>
        <p className={styles.liveSidebarLabel}>Session brief</p>
        <p className={styles.liveSidebarText}>
          Статус: {getLiveStatusLabel(sessionStatus, isPaused)} • WS: {wsStatus}
        </p>
        {attemptsInfo && (
          <p className={styles.liveSidebarText}>
            Попыток: {attemptsInfo.used}/{attemptsInfo.limit}. Осталось: {attemptsInfo.remaining}
          </p>
        )}
      </article>

      <article className={styles.liveSidebarCard}>
        <p className={styles.liveSidebarLabel}>Что дальше</p>
        <p className={styles.liveSidebarText}>
          {sessionStatus === "finished"
            ? "Рейтинг уже сохранен. Можно вернуться в кабинет и открыть историю прохождений."
            : isRunning && isLiveStarted
              ? "Держите окно открытым: следующий вопрос придет автоматически через общий эфир."
              : "Организатор пока собирает участников в лобби перед стартом квиза."}
        </p>
      </article>

      {myLeaderboardPlace && sessionStatus === "finished" && (
        <article className={styles.liveSidebarCard}>
          <p className={styles.liveSidebarLabel}>Ваше место</p>
          <p className={styles.liveSidebarValue}>#{myLeaderboardPlace.place}</p>
          <p className={styles.liveSidebarText}>
            {myLeaderboardPlace.score}/{myLeaderboardPlace.maxScore} баллов •{" "}
            {myLeaderboardPlace.percentage}%
          </p>
        </article>
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
    </aside>
  );
}
