import styles from "../../css/CreateQuizPage.module.css";
import {
  MAX_ATTEMPTS_PER_PARTICIPANT,
  MAX_DURATION_MINUTES,
  MAX_QUESTION_TIME_SECONDS,
  MAX_QUESTIONS,
  MIN_QUESTION_TIME_SECONDS,
  MIN_QUESTIONS,
} from "./constants";

export default function QuizTimingSection({
  durationMinutes,
  questionTimeSeconds,
  questionCount,
  maxAttempts,
  onDurationMinutesChange,
  onQuestionTimeSecondsChange,
  onQuestionCountChange,
  onMaxAttemptsChange,
}) {
  return (
    <section className={styles.sectionPanel}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Темп прохождения</h2>
        <p className={styles.sectionText}>
          Эти параметры определяют длительность квиза, лимит попыток и число карточек вопросов в
          сценарии.
        </p>
      </div>

      <div className={styles.gridTwo}>
        <label className={styles.label}>
          Время на прохождение (мин)
          <input
            className={styles.input}
            type="number"
            min={1}
            max={MAX_DURATION_MINUTES}
            value={durationMinutes}
            onChange={onDurationMinutesChange}
            required
          />
        </label>

        <label className={styles.label}>
          Время на 1 вопрос (сек)
          <input
            className={styles.input}
            type="number"
            min={MIN_QUESTION_TIME_SECONDS}
            max={MAX_QUESTION_TIME_SECONDS}
            value={questionTimeSeconds}
            onChange={onQuestionTimeSecondsChange}
            required
          />
        </label>

        <label className={styles.label}>
          Количество вопросов
          <input
            className={styles.input}
            type="number"
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            value={questionCount}
            onChange={onQuestionCountChange}
            required
          />
        </label>

        <label className={styles.label}>
          Лимит попыток на участника
          <input
            className={styles.input}
            type="number"
            min={1}
            max={MAX_ATTEMPTS_PER_PARTICIPANT}
            value={maxAttempts}
            onChange={onMaxAttemptsChange}
            required
          />
        </label>
      </div>
    </section>
  );
}
