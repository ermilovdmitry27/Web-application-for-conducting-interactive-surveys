import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import AsyncStateNotice from "../components/AsyncStateNotice";
import CabinetTopMenu from "../components/CabinetTopMenu";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth } from "../lib/api/requestWithAuth";
import { buildWebSocketUrl, parseWebSocketMessage } from "../lib/websocket";
import ActiveQuestionPanel from "./organizer-live/ActiveQuestionPanel";
import FinishedLeaderboardPanel from "./organizer-live/FinishedLeaderboardPanel";
import LiveHeroSection from "./organizer-live/LiveHeroSection";
import LiveLobbyPanel from "./organizer-live/LiveLobbyPanel";
import { getLiveStatusLabel, getStoredUser } from "./organizer-live/utils";

function mergeOrganizerWsSession(prevSession, nextSession, { preserveAnswered = false } = {}) {
  if (!nextSession) {
    return prevSession;
  }
  if (!prevSession) {
    return nextSession;
  }

  return {
    ...prevSession,
    ...nextSession,
    participants: Array.isArray(prevSession.participants) ? prevSession.participants : [],
    currentQuestionAnsweredParticipants: preserveAnswered
      ? Array.isArray(prevSession.currentQuestionAnsweredParticipants)
        ? prevSession.currentQuestionAnsweredParticipants
        : []
      : Array.isArray(nextSession.currentQuestionAnsweredParticipants)
        ? nextSession.currentQuestionAnsweredParticipants
        : [],
    currentQuestionAnswersCount: preserveAnswered
      ? Math.max(0, Number(prevSession.currentQuestionAnswersCount || 0))
      : Math.max(0, Number(nextSession.currentQuestionAnswersCount || 0)),
  };
}

function applyOrganizerAnswerEvent(prevSession, message) {
  if (!prevSession) {
    return { nextSession: prevSession, shouldRefresh: false };
  }

  const messageSessionId = Number(message?.sessionId);
  const messageQuestionIndex = Number(message?.questionIndex);
  const participantId = Number(message?.participantId);
  if (
    !Number.isInteger(messageSessionId) ||
    !Number.isInteger(messageQuestionIndex) ||
    !Number.isInteger(participantId) ||
    messageSessionId !== Number(prevSession.sessionId) ||
    messageQuestionIndex !== Number(prevSession.currentQuestionIndex) ||
    prevSession.status !== "running" ||
    !prevSession.isLiveStarted
  ) {
    return { nextSession: prevSession, shouldRefresh: false };
  }

  const participants = Array.isArray(prevSession.participants) ? prevSession.participants : [];
  const participant = participants.find((item) => Number(item.participantId) === participantId);
  if (!participant) {
    return { nextSession: prevSession, shouldRefresh: true };
  }

  const answeredParticipants = Array.isArray(prevSession.currentQuestionAnsweredParticipants)
    ? prevSession.currentQuestionAnsweredParticipants
    : [];
  const nextAnsweredEntry = {
    participantId,
    participantName: participant.participantName,
    participantAvatarDataUrl: participant.participantAvatarDataUrl || "",
    submittedAt: message?.submittedAt || new Date().toISOString(),
    submittedAfterSeconds: Math.max(0, Number(message?.submittedAfterSeconds || 0)),
  };
  const existingIndex = answeredParticipants.findIndex(
    (item) => Number(item.participantId) === participantId
  );
  const nextAnsweredParticipants =
    existingIndex >= 0
      ? answeredParticipants.map((item, index) =>
          index === existingIndex ? { ...item, ...nextAnsweredEntry } : item
        )
      : [...answeredParticipants, nextAnsweredEntry];

  nextAnsweredParticipants.sort((left, right) => {
    const leftTime = new Date(left.submittedAt || "").getTime();
    const rightTime = new Date(right.submittedAt || "").getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return Number(left.participantId || 0) - Number(right.participantId || 0);
  });

  return {
    nextSession: {
      ...prevSession,
      currentQuestionAnsweredParticipants: nextAnsweredParticipants,
      currentQuestionAnswersCount: nextAnsweredParticipants.length,
    },
    shouldRefresh: false,
  };
}

export default function OrganizerLivePage() {
  const navigate = useNavigate();
  const { quizId: rawQuizId = "" } = useParams();
  const quizId = Number(rawQuizId);
  const [user] = useState(() => getStoredUser());
  const apiBaseUrl = getApiBaseUrl();

  const [session, setSession] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [questionRemainingSeconds, setQuestionRemainingSeconds] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionType, setActionType] = useState("");
  const [actionError, setActionError] = useState("");
  const [wsReconnectVersion, setWsReconnectVersion] = useState(0);

  const [wsStatus, setWsStatus] = useState("Подключение...");
  const [lastWsEvent, setLastWsEvent] = useState("Нет событий");

  const wsRef = useRef(null);
  const isMountedRef = useRef(true);
  const leaderboardRefreshVersionRef = useRef(0);
  const stateRefreshControlRef = useRef({
    inFlight: false,
    pendingSessionId: null,
    requestVersion: 0,
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshLeaderboard = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return;
      }
      const requestVersion = ++leaderboardRefreshVersionRef.current;
      try {
        const data = await requestWithAuth(
          `${apiBaseUrl}/api/live-sessions/${sessionId}/leaderboard`,
          { method: "GET" }
        );
        if (
          isMountedRef.current &&
          requestVersion === leaderboardRefreshVersionRef.current
        ) {
          setLeaderboard(data?.leaderboard || null);
        }
      } catch (_error) {
        // silent: leaderboard can already be delivered by websocket
      }
    },
    [apiBaseUrl]
  );

  const refreshSessionState = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return;
      }
      const control = stateRefreshControlRef.current;
      control.pendingSessionId = sessionId;

      if (control.inFlight) {
        return;
      }

      control.inFlight = true;
      try {
        while (control.pendingSessionId) {
          const nextSessionId = control.pendingSessionId;
          control.pendingSessionId = null;
          const requestVersion = ++control.requestVersion;
          const data = await requestWithAuth(
            `${apiBaseUrl}/api/live-sessions/${nextSessionId}/state`,
            {
              method: "GET",
            }
          );

          if (!isMountedRef.current || requestVersion !== control.requestVersion) {
            continue;
          }
          if (data?.session) {
            setSession(data.session);
          }
          if (data?.leaderboard) {
            setLeaderboard(data.leaderboard);
          }
        }
      } finally {
        control.inFlight = false;
      }
    },
    [apiBaseUrl]
  );

  const loadLiveSession = useCallback(
    async ({ isCancelled = () => false } = {}) => {
      if (!Number.isInteger(quizId) || quizId < 1) {
        if (!isCancelled()) {
          setLoadError("Некорректный id квиза.");
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setLoadError("");
        setActionError("");

        const data = await requestWithAuth(`${apiBaseUrl}/api/quizzes/${quizId}/live/start`, {
          method: "POST",
        });
        const nextSession = data?.session || null;
        if (!nextSession) {
          throw new Error("Не удалось запустить live-сессию.");
        }

        if (nextSession.status === "finished") {
          await refreshLeaderboard(nextSession.sessionId);
        }

        if (!isCancelled()) {
          setSession(nextSession);
        }
      } catch (error) {
        if (!isCancelled()) {
          setLoadError(error.message || "Не удалось открыть live-сессию.");
        }
      } finally {
        if (!isCancelled()) {
          setIsLoading(false);
        }
      }
    },
    [apiBaseUrl, quizId, refreshLeaderboard]
  );

  useEffect(() => {
    let isCancelled = false;
    loadLiveSession({
      isCancelled: () => isCancelled,
    });
    return () => {
      isCancelled = true;
    };
  }, [loadLiveSession]);

  useEffect(() => {
    const sessionId = Number(session?.sessionId);
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return undefined;
    }

    const token = localStorage.getItem("auth_token");
    if (!token) {
      setWsStatus("Нет токена");
      return undefined;
    }

    let socket = null;
    let isUnmounted = false;
    let reconnectTimer = null;

    try {
      socket = new WebSocket(buildWebSocketUrl());
      wsRef.current = socket;
      setWsStatus("Подключение...");
    } catch (_error) {
      setWsStatus("Ошибка подключения");
      return undefined;
    }

    socket.addEventListener("open", () => {
      if (isUnmounted) {
        return;
      }
      setWsStatus("Авторизация...");
      socket.send(
        JSON.stringify({
          type: "auth",
          token,
        })
      );
    });

    socket.addEventListener("message", (event) => {
      const message = parseWebSocketMessage(event.data);
      if (!message || typeof message.type !== "string") {
        return;
      }
      setLastWsEvent(message.type);

      if (message.type === "ws:auth-ok") {
        setWsStatus("Онлайн");
        socket.send(
          JSON.stringify({
            type: "live:join",
            sessionId,
          })
        );
        refreshSessionState(sessionId).catch(() => {
          // ignore transient sync errors
        });
        return;
      }

      if (message.type === "ws:error") {
        setWsStatus(message.message || "Ошибка WebSocket");
        return;
      }

      if (message.type === "live:participants-updated") {
        if (Number(message.sessionId) !== sessionId) {
          return;
        }
        setSession((prev) =>
          prev
            ? {
                ...prev,
                participantsCount: Number(message.participantsCount || 0),
                participants: Array.isArray(message.participants) ? message.participants : prev.participants,
              }
            : prev
        );
        return;
      }

      if (message.type === "live:answer-received") {
        if (Number(message.sessionId) !== sessionId) {
          return;
        }
        let shouldRefresh = false;
        setSession((prev) => {
          const result = applyOrganizerAnswerEvent(prev, message);
          shouldRefresh = result.shouldRefresh;
          return result.nextSession;
        });
        if (shouldRefresh) {
          refreshSessionState(sessionId).catch(() => {
            // ignore transient sync errors
          });
        }
        return;
      }

      if (
        message.type === "live:question-changed" ||
        message.type === "live:session-started" ||
        message.type === "live:session-paused" ||
        message.type === "live:session-resumed"
      ) {
        if (Number(message?.session?.sessionId) !== sessionId) {
          return;
        }
        setSession((prev) =>
          mergeOrganizerWsSession(prev, message.session, {
            preserveAnswered:
              message.type === "live:session-paused" || message.type === "live:session-resumed",
          })
        );
        if (message.type === "live:question-changed" || message.type === "live:session-started") {
          setLeaderboard(null);
        }
        setActionError("");
        return;
      }

      if (message.type === "live:session-finished") {
        if (Number(message?.session?.sessionId) !== sessionId) {
          return;
        }
        setSession(message.session);
        setLeaderboard(message.leaderboard || null);
      }
    });

    socket.addEventListener("close", () => {
      if (!isUnmounted) {
        setWsStatus("Отключено");
        reconnectTimer = setTimeout(() => {
          if (!isUnmounted) {
            setWsReconnectVersion((value) => value + 1);
          }
        }, 1500);
      }
    });

    socket.addEventListener("error", () => {
      if (!isUnmounted) {
        setWsStatus("Ошибка WebSocket");
      }
    });

    return () => {
      isUnmounted = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      const current = wsRef.current;
      if (current && current.readyState === WebSocket.OPEN) {
        current.send(
          JSON.stringify({
            type: "live:leave",
            sessionId,
          })
        );
        current.close(1000, "Leave live session");
      } else if (
        current &&
        (current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.CLOSING)
      ) {
        current.close(1000, "Leave live session");
      }
      wsRef.current = null;
    };
  }, [refreshSessionState, session?.sessionId, wsReconnectVersion]);

  const sessionStatus = session?.status;
  const sessionIsPaused = Boolean(session?.isPaused);
  const sessionCurrentQuestionIndex = Number(session?.currentQuestionIndex ?? -1);
  const questionTimeLimitSeconds = Math.max(0, Number(session?.questionTimeLimitSeconds || 0));
  const serverReportedRemainingSeconds = Math.max(0, Number(session?.questionRemainingSeconds || 0));

  useEffect(() => {
    if (
      sessionStatus !== "running" ||
      sessionCurrentQuestionIndex < 0 ||
      questionTimeLimitSeconds < 1
    ) {
      setQuestionRemainingSeconds(0);
      return undefined;
    }
    if (sessionIsPaused) {
      setQuestionRemainingSeconds(serverReportedRemainingSeconds);
      return undefined;
    }

    const syncedAtMs = Date.now();
    const initialRemainingSeconds = serverReportedRemainingSeconds;
    const update = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - syncedAtMs) / 1000));
      setQuestionRemainingSeconds(Math.max(0, initialRemainingSeconds - elapsedSeconds));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [
    questionTimeLimitSeconds,
    serverReportedRemainingSeconds,
    sessionCurrentQuestionIndex,
    sessionIsPaused,
    sessionStatus,
  ]);

  const handleStartSession = async () => {
    if (!session?.sessionId || isActionLoading) {
      return;
    }
    try {
      setIsActionLoading(true);
      setActionType("start");
      setActionError("");
      const data = await requestWithAuth(
        `${apiBaseUrl}/api/live-sessions/${session.sessionId}/start`,
        { method: "POST" }
      );
      if (!isMountedRef.current) {
        return;
      }
      if (data?.session) {
        setSession(data.session);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(error.message || "Не удалось запустить live-квиз.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionLoading(false);
        setActionType("");
      }
    }
  };

  const handleNextQuestion = async () => {
    if (!session?.sessionId || isActionLoading) {
      return;
    }
    try {
      setIsActionLoading(true);
      setActionType("next");
      setActionError("");
      const data = await requestWithAuth(
        `${apiBaseUrl}/api/live-sessions/${session.sessionId}/next`,
        { method: "POST" }
      );
      if (!isMountedRef.current) {
        return;
      }
      if (data?.session) {
        setSession(data.session);
      }
      if (data?.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(error.message || "Не удалось переключить вопрос.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionLoading(false);
        setActionType("");
      }
    }
  };

  const handlePauseSession = async () => {
    if (!session?.sessionId || isActionLoading) {
      return;
    }
    try {
      setIsActionLoading(true);
      setActionType("pause");
      setActionError("");
      const data = await requestWithAuth(
        `${apiBaseUrl}/api/live-sessions/${session.sessionId}/pause`,
        { method: "POST" }
      );
      if (!isMountedRef.current) {
        return;
      }
      if (data?.session) {
        setSession(data.session);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(error.message || "Не удалось поставить квиз на паузу.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionLoading(false);
        setActionType("");
      }
    }
  };

  const handleResumeSession = async () => {
    if (!session?.sessionId || isActionLoading) {
      return;
    }
    try {
      setIsActionLoading(true);
      setActionType("resume");
      setActionError("");
      const data = await requestWithAuth(
        `${apiBaseUrl}/api/live-sessions/${session.sessionId}/resume`,
        { method: "POST" }
      );
      if (!isMountedRef.current) {
        return;
      }
      if (data?.session) {
        setSession(data.session);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(error.message || "Не удалось возобновить квиз.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionLoading(false);
        setActionType("");
      }
    }
  };

  const handleFinishSession = async () => {
    if (!session?.sessionId || isActionLoading) {
      return;
    }
    try {
      setIsActionLoading(true);
      setActionType("finish");
      setActionError("");
      const data = await requestWithAuth(
        `${apiBaseUrl}/api/live-sessions/${session.sessionId}/finish`,
        { method: "POST" }
      );
      if (!isMountedRef.current) {
        return;
      }
      if (data?.session) {
        setSession(data.session);
      }
      setLeaderboard(data?.leaderboard || null);
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(error.message || "Не удалось завершить live-сессию.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsActionLoading(false);
        setActionType("");
      }
    }
  };

  const currentQuestionPosition = useMemo(() => {
    if (!session || session.status !== "running" || !session.isLiveStarted) {
      return 0;
    }
    return Number(session.currentQuestionIndex || 0) + 1;
  }, [session]);
  const statusLabel = getLiveStatusLabel(session?.status, session?.isPaused);
  const progressValue =
    session?.status === "running" && session?.isLiveStarted
      ? `${currentQuestionPosition}/${session.questionCount}`
      : "Lobby";
  const progressText =
    session?.status === "running" && session?.isLiveStarted
      ? "Текущая позиция в сценарии live-квиза."
      : "Участники могут подключаться до начала эфира.";

  const handleLogout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <main className={styles.page}>
      <header className={styles.headerWeb}>
        <h1 className={styles.logo}>
          <span className={styles.wordColor}>Опрос</span>Мастер
        </h1>
        <CabinetTopMenu
          userName={user?.name}
          userFirstName={user?.firstName}
          userLastName={user?.lastName}
          userMiddleName={user?.middleName}
          userEmail={user?.email}
          initialAvatar={user?.avatarDataUrl}
          onLogout={handleLogout}
        />
      </header>

      <section className={styles.liveWorkspaceShell}>
        <div className={styles.liveToolbar}>
          <button
            type="button"
            className={styles.participantSecondaryButton}
            onClick={() => navigate("/organizer")}
          >
            Назад в кабинет
          </button>
          <div className={styles.liveToolbarStatus}>
            <span
              className={`${styles.liveStatusBadge} ${
                session?.status === "finished" ? styles.liveStatusFinished : styles.liveStatusRunning
              }`}
            >
              {statusLabel}
            </span>
            <span className={styles.liveWsStatus}>WS: {wsStatus}</span>
          </div>
        </div>

        {isLoading && (
          <AsyncStateNotice variant="loading" message="Подготовка live-сессии..." />
        )}
        {!isLoading && loadError && (
          <AsyncStateNotice
            variant="error"
            message={loadError}
            actionLabel="Повторить"
            onAction={() => loadLiveSession()}
          />
        )}

        {!isLoading && !loadError && session && (
          <>
            <LiveHeroSection
              quizTitle={session.quizTitle}
              joinCode={session.joinCode}
              participantsCount={session.participantsCount}
              statusLabel={statusLabel}
              wsStatus={wsStatus}
              lastWsEvent={lastWsEvent}
              progressValue={progressValue}
              progressText={progressText}
            />

            {actionError && <p className={styles.formError}>{actionError}</p>}

            <section className={styles.liveWorkspaceGrid}>
              <section className={styles.liveStageCard}>
                {session.status === "running" && !session.isLiveStarted && (
                  <LiveLobbyPanel participants={session.participants} />
                )}

                {session.status === "running" && session.isLiveStarted && session.currentQuestion && (
                  <ActiveQuestionPanel
                    currentQuestion={session.currentQuestion}
                    isPaused={session.isPaused}
                    questionRemainingSeconds={questionRemainingSeconds}
                    questionTimeLimitSeconds={session.questionTimeLimitSeconds}
                    currentQuestionAnswersCount={session.currentQuestionAnswersCount}
                    participantsCount={session.participantsCount}
                    answeredParticipants={session.currentQuestionAnsweredParticipants}
                  />
                )}

                {session.status === "finished" && (
                  <FinishedLeaderboardPanel leaderboard={leaderboard} />
                )}

                <div className={styles.liveStageControlPanel}>
                  <div className={styles.liveStageMetaCard}>
                    <div className={styles.liveStageMetaList}>
                      <p className={styles.liveSidebarText}>Комната: {session.joinCode}</p>
                      <p className={styles.liveSidebarText}>Участников: {session.participantsCount}</p>
                      <p className={styles.liveSidebarText}>
                        {session.status === "running" && session.isLiveStarted
                          ? `Вопрос ${currentQuestionPosition} из ${session.questionCount}`
                          : "Эфир еще не запущен"}
                      </p>
                      <p className={styles.liveSidebarText}>WS: {wsStatus}</p>
                      <p className={styles.liveSidebarText}>Последнее событие: {lastWsEvent}</p>
                    </div>

                    <div className={styles.liveActionStack}>
                      {session.status === "running" && !session.isLiveStarted && (
                        <button
                          type="button"
                          className={styles.formSubmitButton}
                          onClick={handleStartSession}
                          disabled={isActionLoading}
                        >
                          {isActionLoading && actionType === "start" ? "Запускаем..." : "Начать квиз"}
                        </button>
                      )}
                      {session.status === "running" && session.isLiveStarted && !session.isPaused && (
                        <button
                          type="button"
                          className={styles.formSubmitButton}
                          onClick={handlePauseSession}
                          disabled={isActionLoading}
                        >
                          {isActionLoading && actionType === "pause" ? "Ставим на паузу..." : "Пауза"}
                        </button>
                      )}
                      {session.status === "running" && session.isLiveStarted && session.isPaused && (
                        <button
                          type="button"
                          className={styles.formSubmitButton}
                          onClick={handleResumeSession}
                          disabled={isActionLoading}
                        >
                          {isActionLoading && actionType === "resume" ? "Возобновляем..." : "Продолжить"}
                        </button>
                      )}
                      {session.status === "running" && session.isLiveStarted && (
                        <button
                          type="button"
                          className={styles.formSubmitButton}
                          onClick={handleNextQuestion}
                          disabled={isActionLoading}
                        >
                          {isActionLoading && actionType === "next" ? "Обновление..." : "Следующий вопрос"}
                        </button>
                      )}
                      {session.status === "running" && (
                        <button
                          type="button"
                          className={styles.quizDeleteButton}
                          onClick={handleFinishSession}
                          disabled={isActionLoading}
                        >
                          {isActionLoading && actionType === "finish" ? "Завершаем..." : "Завершить эфир"}
                        </button>
                      )}
                      {session.status === "finished" && (
                        <button
                          type="button"
                          className={styles.formSubmitButton}
                          onClick={() => refreshLeaderboard(session.sessionId)}
                        >
                          Обновить рейтинг
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
