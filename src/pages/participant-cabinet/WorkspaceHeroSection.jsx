import styles from "../../css/CabinetPage.module.css";

export default function WorkspaceHeroSection({
  firstName,
  attemptsTotal,
  liveAttemptsTotal,
  bestPercentage,
  joinCode,
  joinError,
  onJoinCodeChange,
  onJoin,
}) {
  return (
    <section className={`${styles.workspaceHero} ${styles.workspaceHeroSingle}`}>
      <div className={styles.workspaceHeroMain}>
        <div className={`${styles.workspaceHeroLayout} ${styles.participantWorkspaceHeroLayout}`}>
          <h1 className={`${styles.workspaceTitle} ${styles.participantWorkspaceTitle}`}>
            {firstName}, подключайтесь к live-квизам и сохраняйте каждую попытку в одном личном пространстве.
          </h1>

          <div className={`${styles.workspaceHeroCopy} ${styles.participantWorkspaceHeroCopy}`}>
            <p className={styles.workspaceLead}>
              Код комнаты, история результатов, процент успешности и подробный разбор ответов теперь
              собраны в одном аккуратном кабинете без лишних экранов.
            </p>

            <div className={styles.workspacePillRow}>
              <span className={styles.workspacePill}>Попыток {attemptsTotal}</span>
              <span className={styles.workspacePill}>Live {liveAttemptsTotal}</span>
              <span className={`${styles.workspacePill} ${styles.workspacePillWide}`}>
                Лучший результат {bestPercentage}%
              </span>
            </div>
          </div>

          <section
            className={`${styles.workspaceHeroCommandCard} ${styles.participantWorkspaceHeroCommandCard}`}
          >
            <div className={styles.workspaceHeroCommandHeader}>
              <p className={styles.workspaceHeroCommandText}>
                Введите код комнаты и сразу перейдите в эфир, где вопросы и таймер синхронизируются в
                реальном времени.
              </p>
            </div>

            <form className={styles.commandForm} onSubmit={onJoin}>
              <input
                className={styles.workspaceHeroCommandInput}
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
        </div>
      </div>
    </section>
  );
}
