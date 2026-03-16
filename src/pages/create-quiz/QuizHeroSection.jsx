import styles from "../../css/CreateQuizPage.module.css";

export default function QuizHeroSection({
  isEditMode,
  selectedCategoryLabel,
  questionsCount,
  questionTimeSeconds,
  maxAttempts,
}) {
  return (
    <div className={styles.heroHeader}>
      <div className={styles.heroCopy}>
        <p className={styles.heroEyebrow}>{isEditMode ? "Quiz editor" : "Quiz builder"}</p>
        <p className={styles.heroLead}>
          Соберите сценарий квиза: задайте тему, темп прохождения, правила показа ответов и
          подготовьте блок вопросов для live-сессии.
        </p>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Категория</p>
          <p className={styles.summaryValue}>{selectedCategoryLabel || "—"}</p>
        </div>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Вопросы</p>
          <p className={styles.summaryValue}>{questionsCount}</p>
        </div>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Таймер</p>
          <p className={styles.summaryValue}>{questionTimeSeconds} c</p>
        </div>
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Попытки</p>
          <p className={styles.summaryValue}>{maxAttempts}</p>
        </div>
      </div>
    </div>
  );
}
