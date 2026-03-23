import styles from "../../css/CabinetPage.module.css";
import { getLiveStatusLabel } from "./utils";

export default function FinishedLeaderboardPanel({
  leaderboard,
  myLeaderboardPlace,
  sessionStatus,
  isPaused,
  wsStatus,
  attemptsInfo,
  onRefreshLeaderboard,
}) {
  return (
    <div className={styles.liveResultBoard}>
      <div className={styles.liveResultLayout}>
        <div className={styles.liveResultMain}>
          <div className={styles.liveResultHeader}>
            <h2 className={styles.liveStageTitle}>Итоговый рейтинг участников</h2>
            <p className={styles.liveStateText}>
              Квиз завершен. Итоговые баллы и места уже сохранены в истории результатов.
            </p>
          </div>

          {myLeaderboardPlace && (
            <div className={styles.liveResultCallout}>
              Ваш результат: #{myLeaderboardPlace.place} • {myLeaderboardPlace.score}/
              {myLeaderboardPlace.maxScore}
            </div>
          )}

          {!leaderboard && <p className={styles.text}>Считаем победителей...</p>}
          {leaderboard && (
            <ul className={styles.resultList}>
              {leaderboard.entries.map((entry) => {
                const name = String(entry.participantName || "Участник").trim();
                const avatarChar = name.charAt(0).toUpperCase() || "U";
                return (
                  <li key={`${entry.participantId}-${entry.place}`} className={styles.resultItem}>
                    <div className={styles.resultMain}>
                      <span className={styles.resultAvatar} aria-hidden="true">
                        {entry.participantAvatarDataUrl ? (
                          <img className={styles.resultAvatarImage} src={entry.participantAvatarDataUrl} alt="" />
                        ) : (
                          avatarChar
                        )}
                      </span>
                      <div className={styles.resultInfo}>
                        <p className={styles.resultName}>
                          #{entry.place} {name}
                        </p>
                        <p className={styles.resultScore}>
                          {entry.score}/{entry.maxScore} баллов
                        </p>
                      </div>
                    </div>
                    <span className={`${styles.resultBadge} ${styles.resultBadgeHigh}`}>
                      {entry.percentage}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className={styles.liveResultAside}>
          <div className={styles.liveResultMetaCard}>
            <p className={styles.liveSidebarText}>
              Статус: {getLiveStatusLabel(sessionStatus, isPaused)} • WS: {wsStatus}
            </p>
            {attemptsInfo && (
              <p className={styles.liveSidebarText}>
                Попыток: {attemptsInfo.used}/{attemptsInfo.limit}. Осталось: {attemptsInfo.remaining}
              </p>
            )}
            <p className={styles.liveSidebarText}>
              Рейтинг уже сохранен. Можно вернуться в кабинет и открыть историю прохождений.
            </p>
          </div>

          {myLeaderboardPlace && (
            <div className={styles.liveResultMetaCard}>
              <p className={styles.liveSidebarValue}>#{myLeaderboardPlace.place}</p>
              <p className={styles.liveSidebarText}>
                {myLeaderboardPlace.score}/{myLeaderboardPlace.maxScore} баллов •{" "}
                {myLeaderboardPlace.percentage}%
              </p>
            </div>
          )}

          <button type="button" className={styles.formSubmitButton} onClick={onRefreshLeaderboard}>
            Обновить рейтинг
          </button>
        </aside>
      </div>
    </div>
  );
}
