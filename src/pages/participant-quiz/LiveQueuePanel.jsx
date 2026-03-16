import styles from "../../css/CabinetPage.module.css";

export default function LiveQueuePanel() {
  return (
    <div className={styles.liveStatePanel}>
      <p className={styles.liveStateEyebrow}>Queue</p>
      <h2 className={styles.liveStageTitle}>Ожидайте следующий вопрос.</h2>
      <p className={styles.liveStateText}>
        Новый вопрос появится автоматически, как только организатор переключит эфир.
      </p>
    </div>
  );
}
