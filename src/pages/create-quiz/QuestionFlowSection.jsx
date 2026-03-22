import styles from "../../css/CreateQuizPage.module.css";
import QuestionCard from "./QuestionCard";

export default function QuestionFlowSection({
  questions,
  questionUploadStates,
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
  return (
    <section className={styles.sectionPanel}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Сценарий вопросов</h2>
        <p className={styles.sectionText}>
          Для каждого шага можно выбрать тип вопроса, режим ответа, изображение и набор правильных вариантов.
        </p>
      </div>

      <div className={styles.questionsWrap}>
        {questions.map((question, questionIndex) => {
          return (
            <QuestionCard
              key={questionIndex}
              questionIndex={questionIndex}
              question={question}
              uploadState={questionUploadStates[questionIndex]}
              isSubmitting={isSubmitting}
              onQuestionField={onQuestionField}
              onAnswerModeChange={onAnswerModeChange}
              onQuestionImageSelected={onQuestionImageSelected}
              onQuestionImageRemove={onQuestionImageRemove}
              onOptionTextChange={onOptionTextChange}
              onOptionCorrectToggle={onOptionCorrectToggle}
              onAddOption={onAddOption}
              onRemoveOption={onRemoveOption}
            />
          );
        })}
      </div>
    </section>
  );
}
