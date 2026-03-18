import styles from "../../css/CabinetPage.module.css";
import { formatSeconds } from "./utils";

export default function ActiveQuestionForm({
  currentQuestion,
  isPaused,
  questionRemainingSeconds,
  questionTimeLimitSeconds,
  selectedOptionIds,
  canSubmitAnswer,
  isQuestionExpired,
  isSubmitting,
  isQuestionAnswered,
  allowAnswerChanges,
  onOptionToggle,
  onSubmit,
}) {
  const statusCallout = isPaused
    ? "Организатор поставил эфир на паузу. Таймер остановлен, новые ответы временно не принимаются."
    : isQuestionAnswered
      ? allowAnswerChanges
        ? "Ответ сохранен. До смены вопроса можно изменить выбор и отправить его заново."
        : "Ответ принят. Ожидайте следующий вопрос от организатора."
      : !isQuestionExpired
        ? "Выберите вариант и отправьте ответ до окончания таймера."
        : "";

  return (
    <form className={styles.liveQuestionForm} onSubmit={onSubmit}>
      <div className={styles.liveQuestionHeader}>
        <div className={styles.liveQuestionMeta}>
          <p className={styles.liveStateEyebrow}>Question {currentQuestion.index + 1}</p>
          <h2 className={styles.liveStageTitle}>{currentQuestion.prompt}</h2>
        </div>
        <div className={styles.liveTimerWrap}>
          <span
            className={`${styles.quizTimer} ${
              !isPaused && questionRemainingSeconds <= 5 ? styles.quizTimerWarning : ""
            }`}
          >
            {isPaused
              ? `Пауза: ${formatSeconds(questionRemainingSeconds)}`
              : `Осталось: ${formatSeconds(questionRemainingSeconds)}`}
          </span>
          <p className={styles.liveHelperText}>
            {isPaused
              ? "Квиз на паузе. Ответы временно заблокированы."
              : `На вопрос: ${formatSeconds(questionTimeLimitSeconds)}`}
          </p>
        </div>
      </div>

      {currentQuestion.type === "image" && currentQuestion.imageUrl && (
        <img
          className={styles.participantQuestionImage}
          src={currentQuestion.imageUrl}
          alt={`Иллюстрация к вопросу ${currentQuestion.index + 1}`}
        />
      )}

      <div className={styles.liveAnswerGrid}>
        {currentQuestion.options.map((option) => (
          <label key={option.id} className={styles.liveAnswerCard}>
            <input
              type={currentQuestion.answerMode === "single" ? "radio" : "checkbox"}
              name={`live-question-${currentQuestion.index}`}
              checked={selectedOptionIds.includes(option.id)}
              disabled={!canSubmitAnswer}
              onChange={(event) => onOptionToggle(option.id, event.target.checked)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>

      {statusCallout && (
        <div className={styles.liveResultCallout}>{statusCallout}</div>
      )}

      {isQuestionExpired && (
        <p className={styles.formError}>Время на этот вопрос вышло. Ожидайте следующий вопрос.</p>
      )}

      <div className={styles.participantQuizActions}>
        <button type="submit" className={styles.formSubmitButton} disabled={!canSubmitAnswer}>
          {isSubmitting
            ? "Отправка..."
            : isQuestionAnswered
              ? allowAnswerChanges
                ? "Изменить ответ"
                : "Ответ отправлен"
              : "Ответить"}
        </button>
      </div>
    </form>
  );
}
