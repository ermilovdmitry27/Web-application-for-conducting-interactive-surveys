import styles from "../../css/CabinetPage.module.css";

export default function FinishedLeaderboardPanel({ leaderboard, myLeaderboardPlace }) {
  return (
    <div className={styles.liveResultBoard}>
      <div className={styles.liveResultHeader}>
        <p className={styles.liveStateEyebrow}>Final leaderboard</p>
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
  );
}
