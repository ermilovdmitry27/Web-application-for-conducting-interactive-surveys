import { memo } from "react";
import styles from "../../css/CabinetPage.module.css";

function LiveHeroSection({
  quizTitle,
  joinCode,
  participantsCount,
  progressValue,
  progressText,
  elapsedLabel,
  elapsedText,
}) {
  return (
    <section className={styles.liveHeroPanel}>
      <div className={styles.liveHeroCopy}>
        <h1 className={styles.title}>{quizTitle}</h1>
        <p className={styles.sectionLead}>
          Подключение держится через WebSocket, вопросы переключаются синхронно для всех участников, а результат
          фиксируется сразу после завершения квиза.
        </p>
      </div>

      <div className={styles.liveMetricGrid}>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Комната</p>
          <p className={styles.liveMetricValue}>{joinCode}</p>
          <p className={styles.liveMetricText}>Код можно использовать для повторного входа.</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Участники</p>
          <p className={styles.liveMetricValue}>{participantsCount}</p>
          <p className={styles.liveMetricText}>Подключенные игроки в текущем эфире.</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Прогресс</p>
          <p className={styles.liveMetricValue}>{progressValue}</p>
          <p className={styles.liveMetricText}>{progressText}</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Эфир</p>
          <p className={styles.liveMetricValue}>{elapsedLabel}</p>
          <p className={styles.liveMetricText}>{elapsedText}</p>
        </article>
      </div>
    </section>
  );
}

export default memo(LiveHeroSection);
