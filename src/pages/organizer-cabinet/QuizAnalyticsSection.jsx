import styles from "../../css/CabinetPage.module.css";

export default function QuizAnalyticsSection({
  quizzesCount,
  activeCount,
  totalQuestions,
  attemptsCount,
  uniqueParticipantsCount,
  averagePercentage,
  finishedLiveCount,
}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Статистика по квизам</h1>
        <p className={styles.sectionLead}>
          Смотрите общую картину по платформе и ключевые метрики по вашим квизам.
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Всего квизов</p>
          <p className={styles.statValue}>{quizzesCount}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Активных</p>
          <p className={styles.statValue}>{activeCount}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Всего вопросов</p>
          <p className={styles.statValue}>{totalQuestions}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Всего попыток</p>
          <p className={styles.statValue}>{attemptsCount}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Участников</p>
          <p className={styles.statValue}>{uniqueParticipantsCount}</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Средний результат</p>
          <p className={styles.statValue}>{averagePercentage}%</p>
        </div>

        <div className={styles.statCard}>
          <p className={styles.statLabel}>Завершенных live</p>
          <p className={styles.statValue}>{finishedLiveCount}</p>
        </div>
      </div>
    </section>
  );
}
