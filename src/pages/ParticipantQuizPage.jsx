import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth } from "../lib/api/requestWithAuth";
import { buildWebSocketUrl, parseWebSocketMessage } from "../lib/websocket";
import ActiveQuestionForm from "./participant-quiz/ActiveQuestionForm";
import FinishedLeaderboardPanel from "./participant-quiz/FinishedLeaderboardPanel";
import LiveHeroSection from "./participant-quiz/LiveHeroSection";
import LiveLobbyPanel from "./participant-quiz/LiveLobbyPanel";
import LiveQueuePanel from "./participant-quiz/LiveQueuePanel";
import LiveSidebar from "./participant-quiz/LiveSidebar";
import { formatSeconds, getLiveStatusLabel, getStoredUser } from "./participant-quiz/utils";

export default function ParticipantQuizPage() {
  const navigate = useNavigate();
  const { joinCode: rawJoinCode = "" } = useParams();
  const joinCode = String(rawJoinCode).trim().toUpperCase();
  const user = getStoredUser();
  const apiBaseUrl = getApiBaseUrl();

  const [session, setSession] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [attemptsInfo, setAttemptsInfo] = useState(null);

  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const [submittedQuestionIndex, setSubmittedQuestionIndex] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [questionRemainingSeconds, setQuestionRemainingSeconds] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wsStatus, setWsStatus] = useState("Подключение...");
  const [wsReconnectVersion, setWsReconnectVersion] = useState(0);

  const wsRef = useRef(null);

  const refreshLeaderboard = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return;
      }
      try {
        const data = await requestWithAuth(
          `${apiBaseUrl}/api/live-sessions/${sessionId}/leaderboard`,
          { method: "GET" }
        );
        setLeaderboard(data?.leaderboard || null);
      } catch (_error) {
        // silent fallback: leaderboard may arrive via websocket event
      }
    },
    [apiBaseUrl]
  );

  const refreshSessionState = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return;
      }
      const data = await requestWithAuth(`${apiBaseUrl}/api/live-sessions/${sessionId}/state`, {
        method: "GET",
      });
      if (data?.session) {
        setSession(data.session);
      }
      if (data?.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    },
    [apiBaseUrl]
  );

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!joinCode) {
        setLoadError("Некорректный код комнаты.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setLoadError("");
        setActionError("");
        setActionSuccess("");
        const data = await requestWithAuth(`${apiBaseUrl}/api/live/join`, {
          method: "POST",
          body: JSON.stringify({ joinCode }),
        });
        const nextSession = data?.session || null;
        if (!nextSession) {
          throw new Error("Live-сессия недоступна.");
        }

        if (isMounted) {
          setSession(nextSession);
          setAttemptsInfo({
            used: Number(data?.attemptsUsed || 0),
            limit: Number(data?.attemptsLimit || 0),
            remaining: Number(data?.attemptsRemaining || 0),
          });
          setSelectedOptionIds([]);
          setSubmittedQuestionIndex(null);
          if (nextSession.status === "finished") {
            await refreshLeaderboard(nextSession.sessionId);
          }
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || "Не удалось подключиться к live-сессии.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, joinCode, refreshLeaderboard]);

  const sessionStartedAt = session?.startedAt;
  const sessionStatus = session?.status;
  const sessionIsPaused = Boolean(session?.isPaused);
  const sessionCurrentQuestionIndex = Number(session?.currentQuestionIndex ?? -1);
  const questionTimeLimitSeconds = Math.max(0, Number(session?.questionTimeLimitSeconds || 0));
  const questionStartedAt = session?.currentQuestionStartedAt;
  const serverReportedRemainingSeconds = Math.max(0, Number(session?.questionRemainingSeconds || 0));

  useEffect(() => {
    if (sessionStatus !== "running") {
      return undefined;
    }
    const startedAt = new Date(sessionStartedAt || "").getTime();
    const base = Number.isFinite(startedAt) && startedAt > 0 ? startedAt : Date.now();

    const update = () => {
      setElapsedSeconds(Math.max(0, Math.round((Date.now() - base) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [sessionStartedAt, sessionStatus]);

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

    const startedAtMs = new Date(questionStartedAt || "").getTime();
    const update = () => {
      if (Number.isFinite(startedAtMs) && startedAtMs > 0) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
        setQuestionRemainingSeconds(Math.max(0, questionTimeLimitSeconds - elapsedSeconds));
        return;
      }
      setQuestionRemainingSeconds(serverReportedRemainingSeconds);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [
    questionStartedAt,
    questionTimeLimitSeconds,
    serverReportedRemainingSeconds,
    sessionCurrentQuestionIndex,
    sessionIsPaused,
    sessionStatus,
  ]);

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
              }
            : prev
        );
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
        setSession(message.session);
        if (message.type === "live:question-changed" || message.type === "live:session-started") {
          setSelectedOptionIds([]);
          setSubmittedQuestionIndex(null);
        }
        setActionError("");
        if (message.type === "live:question-changed" || message.type === "live:session-started") {
          setActionSuccess("");
        }
        return;
      }

      if (message.type === "live:session-finished") {
        if (Number(message?.session?.sessionId) !== sessionId) {
          return;
        }
        setSession(message.session);
        setLeaderboard(message.leaderboard || null);
        setSelectedOptionIds([]);
        setSubmittedQuestionIndex(null);
        setActionSuccess("");
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

  const currentQuestion = session?.currentQuestion || null;
  const isRunning = session?.status === "running";
  const isLiveStarted = Boolean(session?.isLiveStarted);
  const allowAnswerChanges = Boolean(session?.rules?.allowBackNavigation);
  const currentQuestionPosition =
    isRunning && isLiveStarted ? Math.max(0, Number(session?.currentQuestionIndex || 0) + 1) : 0;
  const isQuestionAnswered =
    currentQuestion && submittedQuestionIndex === Number(currentQuestion.index);
  const isQuestionExpired = Boolean(
    isRunning && currentQuestion && questionRemainingSeconds <= 0
  );
  const canSubmitAnswer = Boolean(
    isRunning &&
      isLiveStarted &&
      currentQuestion &&
      !sessionIsPaused &&
      !isSubmitting &&
      !isQuestionExpired &&
      (allowAnswerChanges || !isQuestionAnswered)
  );
  const progressValue =
    isRunning && isLiveStarted ? `${currentQuestionPosition}/${session.questionCount}` : "Lobby";
  const progressText =
    isRunning && isLiveStarted
      ? sessionIsPaused
        ? "Квиз поставлен на паузу организатором."
        : "Сейчас открыт текущий вопрос."
      : "Ожидание запуска от организатора.";
  const elapsedLabel = formatSeconds(elapsedSeconds);
  const elapsedText = attemptsInfo
    ? `Осталось попыток: ${attemptsInfo.remaining}`
    : `WS: ${wsStatus}`;

  const handleOptionToggle = (optionId, checked) => {
    if (!currentQuestion || !isRunning) {
      return;
    }
    if (currentQuestion.answerMode === "single") {
      setSelectedOptionIds([optionId]);
      return;
    }

    setSelectedOptionIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, optionId]));
      }
      return prev.filter((value) => value !== optionId);
    });
  };

  const handleSubmitAnswer = async (event) => {
    event.preventDefault();
    if (!currentQuestion || !session?.sessionId) {
      return;
    }
    if (selectedOptionIds.length === 0) {
      setActionError("Выберите вариант ответа.");
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError("");
      setActionSuccess("");
      const isResubmission = Boolean(allowAnswerChanges && isQuestionAnswered);
      const data = await requestWithAuth(`${apiBaseUrl}/api/live-sessions/${session.sessionId}/answer`, {
        method: "POST",
        body: JSON.stringify({
          questionIndex: currentQuestion.index,
          optionIds: selectedOptionIds,
        }),
      });
      setSubmittedQuestionIndex(currentQuestion.index);
      const canShowResult =
        Boolean(data?.showCorrectAfterAnswer) && typeof data?.isCorrect === "boolean";
      if (canShowResult) {
        setActionSuccess(
          data.isCorrect
            ? `${isResubmission ? "Ответ обновлен" : "Ответ принят"}: верно. Ожидайте следующий вопрос.`
            : `${isResubmission ? "Ответ обновлен" : "Ответ принят"}: неверно. Ожидайте следующий вопрос.`
        );
      } else {
        setActionSuccess(
          isResubmission
            ? "Ответ обновлен. Ожидайте следующий вопрос."
            : "Ответ принят. Ожидайте следующий вопрос."
        );
      }
    } catch (error) {
      setActionError(error.message || "Не удалось отправить ответ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  };

  const myLeaderboardPlace = useMemo(() => {
    if (!leaderboard || !Array.isArray(leaderboard.entries)) {
      return null;
    }
    const myId = Number(user?.id);
    if (!Number.isInteger(myId) || myId < 1) {
      return null;
    }
    return leaderboard.entries.find((entry) => Number(entry.participantId) === myId) || null;
  }, [leaderboard, user?.id]);

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
            onClick={() => navigate("/participant")}
          >
            Назад в кабинет
          </button>
          <div className={styles.liveToolbarStatus}>
            <span
              className={`${styles.liveStatusBadge} ${
                session?.status === "finished" ? styles.liveStatusFinished : styles.liveStatusRunning
              }`}
            >
              {getLiveStatusLabel(session?.status, session?.isPaused)}
            </span>
            <span className={styles.liveWsStatus}>WS: {wsStatus}</span>
          </div>
        </div>

        {isLoading && <p className={styles.text}>Подключение к live-сессии...</p>}
        {loadError && <p className={styles.formError}>{loadError}</p>}

        {!isLoading && !loadError && session && (
          <>
            <LiveHeroSection
              quizTitle={session.quizTitle}
              joinCode={session.joinCode}
              participantsCount={session.participantsCount}
              progressValue={progressValue}
              progressText={progressText}
              elapsedLabel={elapsedLabel}
              elapsedText={elapsedText}
            />

            {actionError && <p className={styles.formError}>{actionError}</p>}
            {actionSuccess && <p className={styles.formSuccess}>{actionSuccess}</p>}

            <section className={styles.liveWorkspaceGrid}>
              <section className={styles.liveStageCard}>
                {isRunning && !isLiveStarted && (
                  <LiveLobbyPanel />
                )}

                {isRunning && isLiveStarted && !currentQuestion && (
                  <LiveQueuePanel />
                )}

                {isRunning && isLiveStarted && currentQuestion && (
                  <ActiveQuestionForm
                    currentQuestion={currentQuestion}
                    isPaused={sessionIsPaused}
                    questionRemainingSeconds={questionRemainingSeconds}
                    questionTimeLimitSeconds={session.questionTimeLimitSeconds}
                    selectedOptionIds={selectedOptionIds}
                    canSubmitAnswer={canSubmitAnswer}
                    isQuestionExpired={isQuestionExpired}
                    isSubmitting={isSubmitting}
                    isQuestionAnswered={isQuestionAnswered}
                    allowAnswerChanges={allowAnswerChanges}
                    onOptionToggle={handleOptionToggle}
                    onSubmit={handleSubmitAnswer}
                  />
                )}

                {session.status === "finished" && (
                  <FinishedLeaderboardPanel
                    leaderboard={leaderboard}
                    myLeaderboardPlace={myLeaderboardPlace}
                  />
                )}
              </section>

              <LiveSidebar
                sessionStatus={session.status}
                isPaused={session.isPaused}
                wsStatus={wsStatus}
                attemptsInfo={attemptsInfo}
                isRunning={isRunning}
                isLiveStarted={isLiveStarted}
                myLeaderboardPlace={myLeaderboardPlace}
                onRefreshLeaderboard={() => refreshLeaderboard(session.sessionId)}
              />
            </section>
          </>
        )}
      </section>
    </main>
  );
}
