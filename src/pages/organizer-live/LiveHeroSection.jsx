import { memo } from "react";
import styles from "../../css/CabinetPage.module.css";

function LiveHeroSection({
  quizTitle,
  joinCode,
  participantsCount,
  statusLabel,
  wsStatus,
  lastWsEvent,
  progressValue,
  progressText,
}) {
  return (
    <section className={styles.liveHeroPanel}>
      <div className={styles.liveHeroCopy}>
        <h1 className={styles.title}>{quizTitle}</h1>
        <p className={styles.sectionLead}>
          Управляйте стартом, паузой и переходом между вопросами, а также наблюдайте за тем, как участники отвечают
          в реальном времени.
        </p>
      </div>

      <div className={styles.liveMetricGrid}>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Комната</p>
          <p className={styles.liveMetricValue}>{joinCode}</p>
          <p className={styles.liveMetricText}>Код подключения для участников текущего эфира.</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Участники</p>
          <p className={styles.liveMetricValue}>{participantsCount}</p>
          <p className={styles.liveMetricText}>Подключенные игроки в комнате прямо сейчас.</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Статус</p>
          <p className={styles.liveMetricValue}>{statusLabel}</p>
          <p className={styles.liveMetricText}>WS: {wsStatus} • Событие: {lastWsEvent}</p>
        </article>
        <article className={styles.liveMetricCard}>
          <p className={styles.liveMetricLabel}>Прогресс</p>
          <p className={styles.liveMetricValue}>{progressValue}</p>
          <p className={styles.liveMetricText}>{progressText}</p>
        </article>
      </div>
    </section>
  );
}

export default memo(LiveHeroSection);
