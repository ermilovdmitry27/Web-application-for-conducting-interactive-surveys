import styles from "../../css/CabinetPage.module.css";
import { formatAttemptDate, getResultBadgeClass } from "./utils";

export default function QuizAnalyticsSection({
  quizzesCount,
  activeCount,
  totalQuestions,
  attemptsCount,
  uniqueParticipantsCount,
  averagePercentage,
  finishedLiveCount,
  quizPerformance,
}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.title}>Статистика по квизам</h1>
        <p className={styles.sectionLead}>
          Смотрите общую картину по платформе и отдельно оценивайте эффективность каждого сценария.
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

      <div className={styles.attemptGroup}>
        <h2 className={styles.sectionSubtitle}>По каждому квизу</h2>
        {quizPerformance.length === 0 && (
          <p className={styles.text}>Статистика появится после первых квизов.</p>
        )}
        {quizPerformance.length > 0 && (
          <ul className={styles.liveSessionList}>
            {quizPerformance.map((quizStat) => (
              <li key={quizStat.quizId} className={styles.liveSessionItem}>
                <div className={styles.liveSessionHead}>
                  <h3 className={styles.liveSessionTitle}>{quizStat.title}</h3>
                  <span
                    className={`${styles.resultBadge} ${getResultBadgeClass(
                      quizStat.averageQuizPercentage
                    )}`}
                  >
                    Ср. {quizStat.averageQuizPercentage}%
                  </span>
                </div>
                <p className={styles.liveSessionMeta}>
                  Попыток: {quizStat.attemptsCount} • Участников: {quizStat.participantsCount} •
                  Live-сессий: {quizStat.liveSessionsCount}
                </p>
                <p className={styles.liveSessionMeta}>
                  Лучший результат:{" "}
                  {quizStat.bestMaxScore > 0
                    ? `${quizStat.bestScore}/${quizStat.bestMaxScore}`
                    : "—"}{" "}
                  • Последняя активность:{" "}
                  {quizStat.lastActivityAt ? formatAttemptDate(quizStat.lastActivityAt) : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
