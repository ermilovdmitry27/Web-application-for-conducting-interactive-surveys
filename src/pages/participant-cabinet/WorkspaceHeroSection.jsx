import styles from "../../css/CabinetPage.module.css";

export default function WorkspaceHeroSection({
  firstName,
  attemptsTotal,
  liveAttemptsTotal,
  bestPercentage,
  joinCode,
  joinError,
  notes,
  onJoinCodeChange,
  onJoin,
}) {
  return (
    <section className={styles.workspaceHero}>
      <div className={styles.workspaceHeroMain}>
        <h1 className={styles.workspaceTitle}>
          {firstName}, подключайтесь к live-квизам и сохраняйте каждую попытку в одном личном пространстве.
        </h1>
        <p className={styles.workspaceLead}>
          Код комнаты, история результатов, процент успешности и подробный разбор ответов теперь
          собраны в одном аккуратном кабинете без лишних экранов.
        </p>

        <div className={styles.workspacePillRow}>
          <span className={styles.workspacePill}>Попыток {attemptsTotal}</span>
          <span className={styles.workspacePill}>Live {liveAttemptsTotal}</span>
          <span className={styles.workspacePill}>Лучший результат {bestPercentage}%</span>
        </div>
      </div>

      <aside className={styles.workspaceHeroAside}>
        <section className={styles.commandCard}>
          <div className={styles.commandHeader}>
            <h2 className={styles.commandTitle}>Войти по коду комнаты</h2>
            <p className={styles.commandText}>
              Введите код комнаты и сразу перейдите в эфир, где вопросы и таймер синхронизируются в
              реальном времени.
            </p>
          </div>

          <form className={styles.commandForm} onSubmit={onJoin}>
            <input
              className={styles.commandInput}
              type="text"
              value={joinCode}
              onChange={onJoinCodeChange}
              placeholder="Например A1B2C3"
              maxLength={20}
            />
            <button type="submit" className={styles.commandButton}>
              Открыть live-квиз
            </button>
          </form>
          {joinError && <p className={styles.formError}>{joinError}</p>}
        </section>

        <div className={styles.noteStack}>
          {notes.map((note) => (
            <article key={note.label} className={styles.utilityNote}>
              <p className={styles.utilityNoteLabel}>{note.label}</p>
              <p className={styles.utilityNoteText}>{note.text}</p>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}
