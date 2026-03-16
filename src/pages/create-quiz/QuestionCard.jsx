import styles from "../../css/CreateQuizPage.module.css";

import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  QUESTION_IMAGE_ACCEPT,
} from "./constants";

export default function QuestionCard({
  questionIndex,
  question,
  uploadState,
  isSubmitting,
  onQuestionField,
  onAnswerModeChange,
  onQuestionImageSelected,
  onQuestionImageRemove,
  onOptionTextChange,
  onOptionCorrectToggle,
  onAddOption,
  onRemoveOption,
}) {
  const isUploadingImage = Boolean(uploadState?.isUploading);
  const uploadError = String(uploadState?.error || "");

  return (
    <article className={styles.questionCard}>
      <div className={styles.questionHead}>
        <h2 className={styles.questionTitle}>Вопрос {questionIndex + 1}</h2>
        <div className={styles.inlineControls}>
          <select
            className={styles.inputCompact}
            value={question.type}
            onChange={(event) =>
              onQuestionField(questionIndex, "type", event.target.value)
            }
          >
            <option value="text">Текстовый</option>
            <option value="image">С изображением</option>
          </select>

          <select
            className={styles.inputCompact}
            value={question.answerMode}
            onChange={(event) =>
              onAnswerModeChange(questionIndex, event.target.value)
            }
          >
            <option value="single">Один верный</option>
            <option value="multiple">Несколько верных</option>
          </select>
        </div>
      </div>

      <label className={styles.label}>
        Текст вопроса
        <input
          className={styles.input}
          type="text"
          value={question.prompt}
          onChange={(event) =>
            onQuestionField(questionIndex, "prompt", event.target.value)
          }
          placeholder="Введите вопрос"
          maxLength={300}
          required
        />
      </label>

      {question.type === "image" && (
        <div className={styles.imageUploadCard}>
          <div className={styles.imageUploadHead}>
            <div>
              <p className={styles.imageUploadTitle}>Изображение вопроса</p>
              <p className={styles.imageUploadMeta}>Поддерживаются PNG, JPG, WEBP и GIF.</p>
            </div>
            <label className={styles.uploadButton}>
              <input
                className={styles.hiddenFileInput}
                type="file"
                accept={QUESTION_IMAGE_ACCEPT}
                onChange={(event) => onQuestionImageSelected(questionIndex, event)}
                disabled={isUploadingImage || isSubmitting}
              />
              {isUploadingImage
                ? "Загрузка..."
                : question.imageUrl
                  ? "Заменить изображение"
                  : "Загрузить изображение"}
            </label>
          </div>

          {question.imageUrl ? (
            <div className={styles.imagePreviewWrap}>
              <img
                className={styles.imagePreview}
                src={question.imageUrl}
                alt={`Иллюстрация для вопроса ${questionIndex + 1}`}
              />
              <button
                type="button"
                className={styles.optionDelete}
                onClick={() => onQuestionImageRemove(questionIndex)}
              >
                Удалить изображение
              </button>
            </div>
          ) : (
            <p className={styles.imageUploadMeta}>Файл еще не загружен.</p>
          )}

          {uploadError && <p className={styles.errorText}>{uploadError}</p>}
        </div>
      )}

      <div className={styles.optionList}>
        {question.options.map((option, optionIndex) => (
          <div key={optionIndex} className={styles.optionRow}>
            <label className={styles.optionCheck}>
              <input
                type="checkbox"
                checked={option.isCorrect}
                onChange={() => onOptionCorrectToggle(questionIndex, optionIndex)}
              />
              <span>Верный</span>
            </label>
            <input
              className={styles.input}
              type="text"
              value={option.text}
              onChange={(event) =>
                onOptionTextChange(questionIndex, optionIndex, event.target.value)
              }
              placeholder={`Вариант ${optionIndex + 1}`}
              maxLength={180}
              required
            />
            <button
              type="button"
              className={styles.optionDelete}
              onClick={() => onRemoveOption(questionIndex, optionIndex)}
              disabled={question.options.length <= MIN_OPTIONS}
              aria-label="Удалить вариант"
            >
              Удалить
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={styles.optionAdd}
        onClick={() => onAddOption(questionIndex)}
        disabled={question.options.length >= MAX_OPTIONS}
      >
        + Добавить вариант
      </button>
    </article>
  );
}
