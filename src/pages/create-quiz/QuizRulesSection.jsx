import styles from "../../css/CreateQuizPage.module.css";

export default function QuizRulesSection({
  isActive,
  allowBackNavigation,
  showCorrectAfterAnswer,
  shuffleQuestions,
  onIsActiveChange,
  onAllowBackNavigationChange,
  onShowCorrectAfterAnswerChange,
  onShuffleQuestionsChange,
}) {
  return (
    <section className={styles.sectionPanel}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>Rules</p>
        <h2 className={styles.sectionTitle}>Поведение квиза</h2>
        <p className={styles.sectionText}>
          Управляйте активностью сценария, перемешиванием вопросов и тем, как участники видят свои ответы.
        </p>
      </div>

      <div className={styles.rulesRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={onIsActiveChange}
          />
          <span>Квиз активен сразу</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={allowBackNavigation}
            onChange={onAllowBackNavigationChange}
          />
          <span>Разрешить возврат к прошлым вопросам</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={showCorrectAfterAnswer}
            onChange={onShowCorrectAfterAnswerChange}
          />
          <span>Показывать правильный ответ сразу</span>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={shuffleQuestions}
            onChange={onShuffleQuestionsChange}
          />
          <span>Перемешать вопросы</span>
        </label>
      </div>
    </section>
  );
}
