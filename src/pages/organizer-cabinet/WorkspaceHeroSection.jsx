import styles from "../../css/CabinetPage.module.css";

export default function WorkspaceHeroSection({
  firstName,
  quizzesCount,
  uniqueParticipantsCount,
  liveSessionsCount,
  signals,
}) {
  return (
    <section className={`${styles.workspaceHero} ${styles.workspaceHeroSingle}`}>
      <div className={styles.workspaceHeroMain}>
        <div className={styles.workspaceHeroLayout}>
          <div className={styles.workspaceHeroCopy}>
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

          <div className={styles.workspaceHeroSignalGrid}>
            {signals.map((item) => (
              <article key={item.title} className={styles.workspaceHeroSignalCard}>
                <h2 className={styles.workspaceHeroSignalTitle}>{item.title}</h2>
                <p className={styles.workspaceHeroSignalText}>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
