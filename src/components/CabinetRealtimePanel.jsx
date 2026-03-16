import { useEffect, useRef, useState } from "react";
import styles from "../css/CabinetPage.module.css";
import { buildWebSocketUrl, parseWebSocketMessage } from "../lib/websocket";

function formatLastEvent(event) {
  if (!event || typeof event.type !== "string") {
    return "Нет событий";
  }
  if (event.type === "ws:auth-ok") {
    return "WebSocket авторизован";
  }
  if (event.type === "ws:pong") {
    return `PONG ${event.ts || ""}`.trim();
  }
  if (event.type === "quiz:update") {
    return `quiz:update (${event.quizId || "без quizId"})`;
  }
  if (event.type === "quiz:joined") {
    return `Подключились к комнате ${event.quizId || ""}`.trim();
  }
  if (event.type === "quiz:left") {
    return `Вышли из комнаты ${event.quizId || ""}`.trim();
  }
  if (event.type === "profile:avatar-updated") {
    return "Аватар обновлен на сервере";
  }
  if (event.type === "ws:error") {
    return event.message || "Ошибка сокета";
  }
  return event.type;
}

export default function CabinetRealtimePanel({ role }) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState("Подключаемся...");
  const [lastEvent, setLastEvent] = useState("Нет событий");
  const [quizId, setQuizId] = useState("demo");
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setStatus("Нет токена");
      setIsAuthed(false);
      return undefined;
    }

    let socket = null;
    let handleOpen = null;
    let handleMessage = null;
    let handleClose = null;
    let handleError = null;

    const connectTimer = window.setTimeout(() => {
      socket = new WebSocket(buildWebSocketUrl());
      wsRef.current = socket;
      setStatus("Подключение...");

      handleOpen = () => {
        setStatus("Соединение открыто, авторизация...");
        socket.send(
          JSON.stringify({
            type: "auth",
            token,
          })
        );
      };

      handleMessage = (event) => {
        const message = parseWebSocketMessage(event.data);
        if (!message) {
          return;
        }
        setLastEvent(formatLastEvent(message));

        if (message.type === "ws:auth-ok") {
          setIsAuthed(true);
          setStatus("Онлайн");
          return;
        }
        if (message.type === "ws:error") {
          setStatus(message.message || "Ошибка WebSocket");
        }
      };

      handleClose = (event) => {
        setIsAuthed(false);
        setStatus(`Отключено (${event.code})`);
      };

      handleError = () => {
        setStatus("Ошибка WebSocket");
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);

      if (socket && handleOpen) {
        socket.removeEventListener("open", handleOpen);
      }
      if (socket && handleMessage) {
        socket.removeEventListener("message", handleMessage);
      }
      if (socket && handleClose) {
        socket.removeEventListener("close", handleClose);
      }
      if (socket && handleError) {
        socket.removeEventListener("error", handleError);
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close(1000, "Page navigation");
      }
      wsRef.current = null;
    };
  }, []);

  const sendMessage = (payload) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("Сокет не подключен");
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  const handlePing = () => {
    sendMessage({ type: "ws:ping" });
  };

  const handleJoinQuiz = () => {
    const nextQuizId = quizId.trim();
    if (!nextQuizId) {
      return;
    }
    sendMessage({ type: "quiz:join", quizId: nextQuizId });
  };

  const handleLeaveQuiz = () => {
    const nextQuizId = quizId.trim();
    if (!nextQuizId) {
      return;
    }
    sendMessage({ type: "quiz:leave", quizId: nextQuizId });
  };

  const handleSendQuizUpdate = () => {
    const nextQuizId = quizId.trim();
    if (!nextQuizId) {
      return;
    }
    sendMessage({
      type: "quiz:update",
      quizId: nextQuizId,
      payload: {
        message: "Обновление от организатора",
        updatedAt: new Date().toISOString(),
      },
    });
  };

  return (
    <section className={styles.wsPanel}>
      <h2 className={styles.wsTitle}>WebSocket realtime</h2>
      <p className={styles.wsMeta}>
        Статус: <strong>{status}</strong>
      </p>
      <p className={styles.wsMeta}>
        Последнее событие: <strong>{lastEvent}</strong>
      </p>
      <div className={styles.wsControls}>
        <input
          type="text"
          value={quizId}
          onChange={(event) => setQuizId(event.target.value)}
          className={styles.wsInput}
          placeholder="ID комнаты"
        />
        <button type="button" className={styles.wsButton} onClick={handlePing} disabled={!isAuthed}>
          Ping
        </button>
        <button type="button" className={styles.wsButton} onClick={handleJoinQuiz} disabled={!isAuthed}>
          Join
        </button>
        <button type="button" className={styles.wsButton} onClick={handleLeaveQuiz} disabled={!isAuthed}>
          Leave
        </button>
        {role === "organizer" && (
          <button
            type="button"
            className={styles.wsButton}
            onClick={handleSendQuizUpdate}
            disabled={!isAuthed}
          >
            Send update
          </button>
        )}
      </div>
      <p className={styles.wsHint}>
        Участник получает события из комнаты, организатор может отправлять обновления.
      </p>
    </section>
  );
}
