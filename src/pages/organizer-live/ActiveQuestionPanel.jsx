import { memo } from "react";
import styles from "../../css/CabinetPage.module.css";
import { resolveApiAssetUrl } from "../../lib/api/config";
import { formatSeconds } from "./utils";

function ActiveQuestionPanel({
  currentQuestion,
  isPaused,
  questionRemainingSeconds,
  questionTimeLimitSeconds,
  currentQuestionAnswersCount,
  participantsCount,
  answeredParticipants,
}) {
  const statusCallout = isPaused
    ? "Эфир на паузе. Таймер остановлен, новые ответы временно не принимаются."
    : questionRemainingSeconds > 0
      ? `Вопрос открыт. До автоперехода осталось ${formatSeconds(questionRemainingSeconds)}.`
      : "Время на текущий вопрос вышло. Можно дождаться автоперехода или переключить эфир вручную.";

  return (
    <div className={styles.liveQuestionForm}>
      <div className={styles.liveQuestionHeader}>
        <div className={styles.liveQuestionMeta}>
          <p className={styles.liveStateEyebrow}>Question {currentQuestion.index + 1}</p>
          <h2 className={styles.liveStageTitle}>{currentQuestion.prompt}</h2>
        </div>
        <div className={styles.liveTimerWrap}>
          <span
            className={`${styles.quizTimer} ${
              questionRemainingSeconds <= 5 ? styles.quizTimerWarning : ""
            }`}
          >
            {isPaused
              ? `Пауза: ${formatSeconds(questionRemainingSeconds)}`
              : `До следующего вопроса: ${formatSeconds(questionRemainingSeconds)}`}
          </span>
          <p className={styles.liveHelperText}>
            {isPaused
              ? "Таймер остановлен. Участники временно не могут отвечать."
              : `Автопереход каждые ${formatSeconds(questionTimeLimitSeconds)}.`}
          </p>
        </div>
      </div>

      {currentQuestion.type === "image" && currentQuestion.imageUrl && (
        <img
          className={styles.participantQuestionImage}
          src={resolveApiAssetUrl(currentQuestion.imageUrl)}
          alt={`Иллюстрация к вопросу ${currentQuestion.index + 1}`}
        />
      )}

      <div className={styles.participantOptionList}>
        {currentQuestion.options.map((option) => (
          <p key={option.id} className={styles.liveOptionRow}>
            <span>{option.text}</span>
            {option.isCorrect && <strong className={styles.liveCorrectMarker}>верный</strong>}
          </p>
        ))}
      </div>

      <div className={styles.liveResultCallout}>{statusCallout}</div>

      <div className={styles.liveResultCallout}>
        Ответов на текущий вопрос: {currentQuestionAnswersCount}/{participantsCount}
      </div>

      {Array.isArray(answeredParticipants) && answeredParticipants.length > 0 ? (
        <ul className={styles.liveWinnerList}>
          {answeredParticipants.map((participant) => (
            <li
              key={`${participant.participantId}-${participant.submittedAt}`}
              className={styles.liveWinnerItem}
            >
              <span>{participant.participantName}</span>
              <span>{formatSeconds(participant.submittedAfterSeconds)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.text}>Пока никто не ответил на текущий вопрос.</p>
      )}
    </div>
  );
}

export default memo(ActiveQuestionPanel);
