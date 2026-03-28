import { memo } from "react";
import styles from "../../css/CabinetPage.module.css";

function LiveQueuePanel() {
  return (
    <div className={styles.liveStatePanel}>
      <h2 className={styles.liveStageTitle}>Ожидайте следующий вопрос.</h2>
      <p className={styles.liveStateText}>
        Новый вопрос появится автоматически, как только организатор переключит эфир.
      </p>
    </div>
  );
}

export default memo(LiveQueuePanel);
