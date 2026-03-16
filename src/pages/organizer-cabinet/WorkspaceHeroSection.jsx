import styles from "../../css/CabinetPage.module.css";

export default function WorkspaceHeroSection({
  firstName,
  quizzesCount,
  uniqueParticipantsCount,
  liveSessionsCount,
  notes,
  onCreateQuiz,
}) {
  return (
    <section className={styles.workspaceHero}>
      <div className={styles.workspaceHeroMain}>
        <p className={styles.workspaceEyebrow}>Organizer workspace</p>
        <h1 className={styles.workspaceTitle}>
          {firstName}, управляйте квизами, live-комнатами и аналитикой из одного кабинета.
        </h1>
        <p className={styles.workspaceLead}>
          Здесь собраны сценарии квизов, запуск эфира, история сессий и данные по участникам без
          лишних переходов между экранами.
        </p>

        <div className={styles.workspacePillRow}>
          <span className={styles.workspacePill}>Квизов {quizzesCount}</span>
          <span className={styles.workspacePill}>Участников {uniqueParticipantsCount}</span>
          <span className={styles.workspacePill}>Live-сессий {liveSessionsCount}</span>
        </div>
      </div>

      <aside className={styles.workspaceHeroAside}>
        <section className={styles.commandCard}>
          <div className={styles.commandHeader}>
            <p className={styles.commandEyebrow}>Control room</p>
            <h2 className={styles.commandTitle}>Создать новый квиз</h2>
            <p className={styles.commandText}>
              Запустите новый сценарий, настройте вопросы и подготовьте комнату для live-сессии.
            </p>
          </div>
          <button type="button" className={styles.commandButton} onClick={onCreateQuiz}>
            Создать квиз
          </button>
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
