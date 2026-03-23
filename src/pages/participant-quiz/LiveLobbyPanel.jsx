import styles from "../../css/CabinetPage.module.css";

export default function LiveLobbyPanel() {
  return (
    <div className={styles.liveStatePanel}>
      <h2 className={styles.liveStageTitle}>Комната открыта, эфир еще не начался.</h2>
      <p className={styles.liveStateText}>
        Дождитесь, пока организатор нажмет «Начать квиз». После этого вопрос появится автоматически.
      </p>
    </div>
  );
}
