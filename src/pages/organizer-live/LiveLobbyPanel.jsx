import styles from "../../css/CabinetPage.module.css";

export default function LiveLobbyPanel({ participants }) {
  return (
    <div className={styles.liveStatePanel}>
      <p className={styles.liveStateEyebrow}>Lobby</p>
      <h2 className={styles.liveStageTitle}>Комната открыта для участников.</h2>
      <p className={styles.liveStateText}>
        Игроки уже могут подключаться по коду комнаты. Когда все готовы, запускайте квиз из панели управления.
      </p>

      {Array.isArray(participants) && participants.length > 0 ? (
        <ul className={styles.liveWinnerList}>
          {participants.map((participant) => (
            <li
              key={`${participant.participantId}-${participant.joinedAt}`}
              className={styles.liveWinnerItem}
            >
              <span>{participant.participantName}</span>
              <span>{new Date(participant.joinedAt).toLocaleTimeString("ru-RU")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.text}>Пока никто не подключился.</p>
      )}
    </div>
  );
}
