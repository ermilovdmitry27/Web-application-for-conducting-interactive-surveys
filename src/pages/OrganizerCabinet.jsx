import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";
import FeatureDeckSection from "./organizer-cabinet/FeatureDeckSection";
import QuizAnalyticsSection from "./organizer-cabinet/QuizAnalyticsSection";
import WorkspaceHeroSection from "./organizer-cabinet/WorkspaceHeroSection";
import {
  AUTH_USER_UPDATED_EVENT,
  ORGANIZER_NOTES,
  ORGANIZER_SIGNALS,
} from "./organizer-cabinet/constants";
import {
  formatAttemptDate,
  formatDurationSeconds,
  formatSessionPeriod,
  getResultBadgeClass,
  getStoredUser,
} from "./organizer-cabinet/utils";

export default function OrganizerCabinet() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const firstName = String(user?.firstName || user?.name || "Организатор").trim().split(/\s+/)[0] || "Организатор";
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAttemptsLoading, setIsAttemptsLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attemptsError, setAttemptsError] = useState("");
  const [sessionsError, setSessionsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [deletingQuizId, setDeletingQuizId] = useState(null);
  const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:4000";

  useEffect(() => {
    const handleAuthUserUpdated = (event) => {
      setUser(event?.detail?.user || getStoredUser());
    };

    window.addEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    return () => {
      window.removeEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    };
  }, []);

  const activeCount = useMemo(() => quizzes.filter((quiz) => quiz.isActive).length, [quizzes]);
  const totalQuestions = useMemo(
    () => quizzes.reduce((sum, quiz) => sum + Number(quiz.questionCount || 0), 0),
    [quizzes]
  );
  const uniqueParticipantsCount = useMemo(
    () => new Set(attempts.map((attempt) => Number(attempt.participantId))).size,
    [attempts]
  );
  const averagePercentage = useMemo(() => {
    if (attempts.length === 0) {
      return 0;
    }
    return Math.round(
      attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / attempts.length
    );
  }, [attempts]);
  const finishedLiveCount = useMemo(
    () => liveSessions.filter((session) => session.status === "finished").length,
    [liveSessions]
  );
  const quizPerformance = useMemo(() => {
    return quizzes
      .map((quiz) => {
        const quizAttempts = attempts.filter((attempt) => Number(attempt.quizId) === Number(quiz.id));
        const quizSessions = liveSessions.filter((session) => Number(session.quizId) === Number(quiz.id));
        const participantsCount = new Set(
          quizAttempts.map((attempt) => Number(attempt.participantId))
        ).size;
        const averageQuizPercentage =
          quizAttempts.length > 0
            ? Math.round(
                quizAttempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) /
                  quizAttempts.length
              )
            : 0;
        const bestAttempt = quizAttempts.reduce((best, attempt) => {
          if (!best) {
            return attempt;
          }
          return Number(attempt.percentage || 0) > Number(best.percentage || 0) ? attempt : best;
        }, null);
        const activityDates = [
          ...quizAttempts.map((attempt) => attempt.createdAt),
          ...quizSessions.map((session) => session.finishedAt || session.startedAt),
        ]
          .filter(Boolean)
          .map((value) => new Date(value).getTime())
          .filter((value) => Number.isFinite(value) && value > 0);
        const lastActivityAt =
          activityDates.length > 0 ? new Date(Math.max(...activityDates)).toISOString() : "";

        return {
          quizId: quiz.id,
          title: quiz.title,
          attemptsCount: quizAttempts.length,
          participantsCount,
          averageQuizPercentage,
          liveSessionsCount: quizSessions.length,
          bestScore: Number(bestAttempt?.score || 0),
          bestMaxScore: Number(bestAttempt?.maxScore || 0),
          lastActivityAt,
        };
      })
      .sort((left, right) => {
        if (right.attemptsCount !== left.attemptsCount) {
          return right.attemptsCount - left.attemptsCount;
        }
        return String(left.title || "").localeCompare(String(right.title || ""), "ru");
      });
  }, [attempts, liveSessions, quizzes]);

  const requestWithAuth = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Сессия истекла. Войдите заново.");
    }

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    } catch (_error) {
      throw new Error("Нет связи с API. Запустите сервер: npm run server");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("API квизов не найден. Перезапустите backend: npm run server");
      }
      throw new Error(data.message || `Ошибка запроса (${response.status}).`);
    }
    return data;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setIsAttemptsLoading(true);
        setIsSessionsLoading(true);
        setLoadError("");
        setAttemptsError("");
        setSessionsError("");

        const [quizzesResult, attemptsResult, sessionsResult] = await Promise.allSettled([
          requestWithAuth(`${apiBaseUrl}/api/quizzes/mine`, { method: "GET" }),
          requestWithAuth(`${apiBaseUrl}/api/quizzes/mine/attempts?limit=150`, { method: "GET" }),
          requestWithAuth(`${apiBaseUrl}/api/live-sessions/mine?limit=20`, { method: "GET" }),
        ]);

        if (!isMounted) {
          return;
        }

        if (quizzesResult.status === "fulfilled") {
          setQuizzes(Array.isArray(quizzesResult.value?.quizzes) ? quizzesResult.value.quizzes : []);
        } else {
          setLoadError(
            quizzesResult.reason?.message || "Не удалось загрузить квизы."
          );
        }

        if (attemptsResult.status === "fulfilled") {
          setAttempts(
            Array.isArray(attemptsResult.value?.attempts) ? attemptsResult.value.attempts : []
          );
        } else {
          setAttemptsError(
            attemptsResult.reason?.message || "Не удалось загрузить попытки участников."
          );
        }

        if (sessionsResult.status === "fulfilled") {
          setLiveSessions(
            Array.isArray(sessionsResult.value?.sessions) ? sessionsResult.value.sessions : []
          );
        } else {
          setSessionsError(
            sessionsResult.reason?.message || "Не удалось загрузить историю live-сессий."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsAttemptsLoading(false);
          setIsSessionsLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, requestWithAuth]);

  const handleDeleteQuiz = useCallback(
    async (quiz) => {
      const quizTitle = String(quiz?.title || "").trim();
      const isConfirmed = window.confirm(
        `Удалить квиз "${quizTitle || "Без названия"}"? Это действие нельзя отменить.`
      );
      if (!isConfirmed) {
        return;
      }

      try {
        setActionError("");
        setDeletingQuizId(quiz.id);
        await requestWithAuth(`${apiBaseUrl}/api/quizzes/${quiz.id}`, { method: "DELETE" });
        setQuizzes((prev) => prev.filter((item) => item.id !== quiz.id));
      } catch (error) {
        setActionError(error.message || "Не удалось удалить квиз.");
      } finally {
        setDeletingQuizId(null);
      }
    },
    [apiBaseUrl, requestWithAuth]
  );

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  };

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

      <section className={styles.workspaceShell}>
        <WorkspaceHeroSection
          firstName={firstName}
          quizzesCount={quizzes.length}
          uniqueParticipantsCount={uniqueParticipantsCount}
          liveSessionsCount={liveSessions.length}
          notes={ORGANIZER_NOTES}
          onCreateQuiz={() => navigate("/organizer/quizzes/new")}
        />

        <FeatureDeckSection signals={ORGANIZER_SIGNALS} />
      </section>

      <section className={styles.blocks}>
        <div className={styles.sectionBlock}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Quiz library</p>
              <h1 className={styles.title}>Мои квизы</h1>
              <p className={styles.sectionLead}>
                Конструктор сценариев, параметры комнаты, лимиты попыток и быстрый переход к live-режиму находятся в одном списке.
              </p>
            </div>

            {isLoading && <p className={styles.text}>Загрузка квизов...</p>}
            {loadError && <p className={styles.formError}>{loadError}</p>}
            {actionError && <p className={styles.formError}>{actionError}</p>}
            {!isLoading && !loadError && quizzes.length === 0 && (
              <p className={styles.text}>Пока нет созданных квизов.</p>
            )}

            <ul className={styles.quizList}>
              {quizzes.map((quiz) => (
                <li key={quiz.id} className={styles.quizItem}>
                  <div className={styles.quizItemText}>
                    <span className={styles.quizItemLabel}>{quiz.title}</span>
                  </div>
                  <div className={styles.quizMetaWrap}>
                    <span className={styles.quizCode}>Код: {quiz.joinCode}</span>
                    <span className={styles.quizParam}>Категория: {quiz.category}</span>
                    <span className={styles.quizParam}>Вопросов: {quiz.questionCount}</span>
                    <span className={styles.quizParam}>Время: {quiz.durationMinutes} мин</span>
                    <span className={styles.quizParam}>
                      На вопрос: {Number(quiz.questionTimeSeconds || 0) > 0 ? `${quiz.questionTimeSeconds} сек` : "—"}
                    </span>
                    <span className={styles.quizParam}>
                      Попыток: {quiz.maxAttemptsPerParticipant}
                    </span>
                    <span
                      className={`${styles.quizStateBadge} ${
                        quiz.isActive ? styles.quizStateActive : styles.quizStateDraft
                      }`}
                    >
                      {quiz.isActive ? "Активен" : "Черновик"}
                    </span>
                    <button
                      type="button"
                      className={styles.quizEditButton}
                      onClick={() => navigate(`/organizer/quizzes/${quiz.id}/edit`)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className={styles.quizLiveButton}
                      onClick={() => navigate(`/organizer/live/${quiz.id}`)}
                    >
                      Запустить live
                    </button>
                    <button
                      type="button"
                      className={styles.quizDeleteButton}
                      disabled={deletingQuizId === quiz.id}
                      onClick={() => handleDeleteQuiz(quiz)}
                    >
                      {deletingQuizId === quiz.id ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <QuizAnalyticsSection
            quizzesCount={quizzes.length}
            activeCount={activeCount}
            totalQuestions={totalQuestions}
            attemptsCount={attempts.length}
            uniqueParticipantsCount={uniqueParticipantsCount}
            averagePercentage={averagePercentage}
            finishedLiveCount={finishedLiveCount}
            quizPerformance={quizPerformance}
          />
        </div>

        <div className={styles.sectionBlock}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Participants</p>
              <h1 className={styles.title}>Кто прошел квизы</h1>
              <p className={styles.sectionLead}>
                Здесь видны последние попытки участников, их проценты, баллы и длительность прохождения.
              </p>
            </div>
            {isAttemptsLoading && <p className={styles.text}>Загрузка попыток...</p>}
            {attemptsError && <p className={styles.formError}>{attemptsError}</p>}
            {!isAttemptsLoading && !attemptsError && attempts.length === 0 && (
              <p className={styles.text}>Пока никто не прошел ваши квизы.</p>
            )}

            <ul className={styles.resultList}>
              {attempts.map((attempt) => {
                const participantName = String(attempt.participantName || "Участник").trim();
                const avatarChar = participantName.charAt(0).toUpperCase() || "U";
                return (
                  <li key={attempt.id} className={styles.resultItem}>
                    <div className={styles.resultMain}>
                      <span className={styles.resultAvatar} aria-hidden="true">
                        {attempt.participantAvatarDataUrl ? (
                          <img
                            className={styles.resultAvatarImage}
                            src={attempt.participantAvatarDataUrl}
                            alt=""
                          />
                        ) : (
                          avatarChar
                        )}
                      </span>
                      <div className={styles.resultInfo}>
                        <p className={styles.resultName}>{participantName}</p>
                        <p className={styles.resultScore}>
                          {attempt.quizTitle}
                          {attempt.isLive ? " • Live" : ""}
                          {` • ${attempt.score}/${attempt.maxScore}`}
                          {Number.isInteger(attempt.answeredQuestionsCount)
                            ? ` • Ответов: ${attempt.answeredQuestionsCount}/${attempt.maxScore}`
                            : ""}
                          {attempt.timeSpentSeconds > 0
                            ? ` • ${formatDurationSeconds(attempt.timeSpentSeconds)}`
                            : ""}
                          {attempt.createdAt ? ` • ${formatAttemptDate(attempt.createdAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`${styles.resultBadge} ${getResultBadgeClass(attempt.percentage)}`}>
                      {attempt.percentage}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>Broadcast archive</p>
              <h1 className={styles.title}>Проведенные live-сессии</h1>
              <p className={styles.sectionLead}>
                История эфиров показывает период проведения, количество участников и итоговых победителей по каждой сессии.
              </p>
            </div>
            {isSessionsLoading && <p className={styles.text}>Загрузка live-сессий...</p>}
            {sessionsError && <p className={styles.formError}>{sessionsError}</p>}
            {!isSessionsLoading && !sessionsError && liveSessions.length === 0 && (
              <p className={styles.text}>Пока нет проведенных live-сессий.</p>
            )}

            <ul className={styles.liveSessionList}>
              {liveSessions.map((session) => (
                <li key={session.id} className={styles.liveSessionItem}>
                  <div className={styles.liveSessionHead}>
                    <h3 className={styles.liveSessionTitle}>{session.quizTitle}</h3>
                    <span
                      className={`${styles.quizStateBadge} ${
                        session.status === "finished" ? styles.quizStateActive : styles.quizStateDraft
                      }`}
                    >
                      {session.status === "finished" ? "Завершен" : "Идет"}
                    </span>
                  </div>

                  <p className={styles.liveSessionMeta}>
                    Код: {session.quizJoinCode} • Участников: {session.participantsCount} • Вопросов: {session.questionCount}
                  </p>
                  <p className={styles.liveSessionMeta}>
                    {formatSessionPeriod(session.startedAt, session.finishedAt)}
                  </p>

                  {Array.isArray(session.winners) && session.winners.length > 0 && (
                    <ul className={styles.liveWinnerList}>
                      {session.winners.map((winner) => (
                        <li key={`${session.id}-${winner.participantId}-${winner.place}`} className={styles.liveWinnerItem}>
                          <span>#{winner.place}</span>
                          <span>{winner.participantName}</span>
                          <span>
                            {winner.score}/{winner.maxScore} ({winner.percentage}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
