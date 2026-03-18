import styles from "../css/CabinetPage.module.css";

export default function AsyncStateNotice({ variant = "loading", message, actionLabel, onAction }) {
  const messageClass = variant === "error" ? styles.formError : styles.text;
  const noticeClass =
    variant === "error"
      ? `${styles.asyncStateNotice} ${styles.asyncStateNoticeError}`
      : styles.asyncStateNotice;

  return (
    <div className={noticeClass}>
      <p className={messageClass}>{message}</p>
      {actionLabel && typeof onAction === "function" && (
        <div className={styles.asyncStateNoticeActions}>
          <button
            type="button"
            className={styles.participantSecondaryButton}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
