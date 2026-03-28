import { memo } from "react";
import styles from "../../css/CabinetPage.module.css";

function FinishedLeaderboardPanel({ leaderboard }) {
  return (
    <div className={styles.liveResultBoard}>
      <div className={styles.liveResultHeader}>
        <h2 className={styles.liveStageTitle}>Итоговый рейтинг эфира</h2>
        <p className={styles.liveStateText}>
          Live-сессия завершена. Рейтинг сохранен и доступен в архиве кабинета организатора.
        </p>
      </div>

      {!leaderboard && <p className={styles.text}>Загружаем рейтинг...</p>}
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
  );
}

export default memo(FinishedLeaderboardPanel);
