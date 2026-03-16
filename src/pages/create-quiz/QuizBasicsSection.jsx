import styles from "../../css/CreateQuizPage.module.css";

export default function QuizBasicsSection({
  title,
  description,
  category,
  categoryOptions,
  onTitleChange,
  onCategoryChange,
  onDescriptionChange,
}) {
  return (
    <section className={styles.sectionPanel}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>Base setup</p>
        <h2 className={styles.sectionTitle}>Основа квиза</h2>
        <p className={styles.sectionText}>
          Название, категория и описание формируют карточку квиза в кабинете и помогают отличать сценарии друг от друга.
        </p>
      </div>

      <div className={styles.gridTwo}>
        <label className={styles.label}>
          Название квиза
          <input
            className={styles.input}
            type="text"
            value={title}
            onChange={onTitleChange}
            maxLength={120}
            placeholder="Например: История России"
            required
          />
        </label>

        <label className={styles.label}>
          Категория
          <select className={styles.input} value={category} onChange={onCategoryChange}>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.label}>
        Описание
        <textarea
          className={styles.textarea}
          value={description}
          onChange={onDescriptionChange}
          rows={3}
          maxLength={1000}
          placeholder="Кратко опишите, о чем квиз и для кого он"
        />
      </label>
    </section>
  );
}
