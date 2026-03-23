import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import AsyncStateNotice from "../components/AsyncStateNotice";
import CabinetTopMenu from "../components/CabinetTopMenu";
import EditIcon from "../components/EditIcon";
import LiveIcon from "../components/LiveIcon";
import PlusIcon from "../components/PlusIcon";
import TrashIcon from "../components/TrashIcon";
import { getApiBaseUrl } from "../lib/api/config";
import QuizAnalyticsSection from "./organizer-cabinet/QuizAnalyticsSection";
import WorkspaceHeroSection from "./organizer-cabinet/WorkspaceHeroSection";
import {
  AUTH_USER_UPDATED_EVENT,
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
  const [deletingAttemptGroupKey, setDeletingAttemptGroupKey] = useState("");
  const [deletingLiveGroupKey, setDeletingLiveGroupKey] = useState("");
  const [showAllQuizzes, setShowAllQuizzes] = useState(false);
  const [collapsedAttemptGroupKeys, setCollapsedAttemptGroupKeys] = useState({});
  const [expandedLiveGroupKeys, setExpandedLiveGroupKeys] = useState({});
  const apiBaseUrl = getApiBaseUrl();

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
  const quizzesById = useMemo(
    () => new Map(quizzes.map((quiz) => [Number(quiz.id), quiz])),
    [quizzes]
  );
  const visibleQuizzes = useMemo(
    () => (showAllQuizzes ? quizzes : quizzes.slice(0, 1)),
    [quizzes, showAllQuizzes]
  );
  const attemptGroups = useMemo(() => {
    const groups = new Map();

    attempts.forEach((attempt) => {
      const rawQuizId = Number(attempt.quizId);
      const quizId = Number.isFinite(rawQuizId) && rawQuizId > 0 ? rawQuizId : null;
      const quizTitle = String(attempt.quizTitle || "Без названия").trim() || "Без названия";
      const key = quizId ? `quiz:${quizId}` : `title:${quizTitle}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          quizId,
          quizTitle,
          attempts: [],
          participantIds: new Set(),
        });
      }

      const group = groups.get(key);
      group.attempts.push(attempt);

      const participantId = Number(attempt.participantId);
      if (Number.isFinite(participantId) && participantId > 0) {
        group.participantIds.add(participantId);
      }
    });

    return Array.from(groups.values()).map((group) => ({
      key: group.key,
      quizId: group.quizId,
      quizTitle: group.quizTitle,
      attempts: group.attempts,
      participantsCount: group.participantIds.size,
      quiz:
        group.quizId != null
          ? quizzesById.get(group.quizId) || { id: group.quizId, title: group.quizTitle }
          : null,
    }));
  }, [attempts, quizzesById]);
  const liveSessionGroups = useMemo(() => {
    const groups = new Map();

    liveSessions.forEach((session) => {
      const rawQuizId = Number(session.quizId);
      const quizId = Number.isFinite(rawQuizId) && rawQuizId > 0 ? rawQuizId : null;
      const quizTitle = String(session.quizTitle || "Без названия").trim() || "Без названия";
      const key = quizId ? `quiz:${quizId}` : `title:${quizTitle}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          quizId,
          quizTitle,
          sessions: [],
        });
      }

      groups.get(key).sessions.push(session);
    });

    return Array.from(groups.values()).map((group) => {
      const latestSession = group.sessions[0] || null;
      const latestStatusLabel =
        latestSession?.status === "finished" ? "Завершен" : latestSession ? "Идет" : "";

      return {
        key: group.key,
        quizId: group.quizId,
        quizTitle: group.quizTitle,
        sessions: group.sessions,
        latestStatusLabel,
        quiz:
          group.quizId != null
            ? quizzesById.get(group.quizId) || { id: group.quizId, title: group.quizTitle }
            : null,
      };
    });
  }, [liveSessions, quizzesById]);

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
      throw new Error("Нет связи с API. Проверьте, что backend запущен и адрес сервера доступен.");
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

  const loadDashboardData = useCallback(
    async ({ isCancelled = () => false } = {}) => {
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

        if (isCancelled()) {
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
        if (!isCancelled()) {
          setIsLoading(false);
          setIsAttemptsLoading(false);
          setIsSessionsLoading(false);
        }
      }
    },
    [apiBaseUrl, requestWithAuth]
  );

  useEffect(() => {
    let isCancelled = false;
    loadDashboardData({
      isCancelled: () => isCancelled,
    });
    return () => {
      isCancelled = true;
    };
  }, [loadDashboardData]);

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
  const toggleAttemptGroup = useCallback((groupKey) => {
    setCollapsedAttemptGroupKeys((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }, []);
  const toggleLiveGroup = useCallback((groupKey) => {
    setExpandedLiveGroupKeys((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }, []);

  const handleDeleteAttemptGroup = useCallback(
    async (group) => {
      if (!Number.isInteger(group?.quizId) || group.quizId < 1) {
        setActionError("Не удалось определить квиз для удаления попыток.");
        return;
      }

      const quizTitle = String(group.quizTitle || "Без названия").trim() || "Без названия";
      const isConfirmed = window.confirm(
        `Удалить все попытки участников для квиза "${quizTitle}"? Это действие нельзя отменить.`
      );
      if (!isConfirmed) {
        return;
      }

      try {
        setActionError("");
        setDeletingAttemptGroupKey(group.key);
        await requestWithAuth(`${apiBaseUrl}/api/quizzes/${group.quizId}/attempts`, {
          method: "DELETE",
        });
        setAttempts((prev) => prev.filter((attempt) => Number(attempt.quizId) !== Number(group.quizId)));
        setCollapsedAttemptGroupKeys((prev) => {
          const next = { ...prev };
          delete next[group.key];
          return next;
        });
      } catch (error) {
        setActionError(error.message || "Не удалось удалить попытки.");
      } finally {
        setDeletingAttemptGroupKey("");
      }
    },
    [apiBaseUrl, requestWithAuth]
  );

  const handleDeleteLiveGroup = useCallback(
    async (group) => {
      if (!Number.isInteger(group?.quizId) || group.quizId < 1) {
        setActionError("Не удалось определить квиз для удаления live-сессий.");
        return;
      }

      const quizTitle = String(group.quizTitle || "Без названия").trim() || "Без названия";
      const isConfirmed = window.confirm(
        `Удалить все live-сессии для квиза "${quizTitle}"? Это действие нельзя отменить.`
      );
      if (!isConfirmed) {
        return;
      }

      try {
        setActionError("");
        setDeletingLiveGroupKey(group.key);
        await requestWithAuth(`${apiBaseUrl}/api/quizzes/${group.quizId}/live-sessions`, {
          method: "DELETE",
        });
        setLiveSessions((prev) => prev.filter((session) => Number(session.quizId) !== Number(group.quizId)));
        setExpandedLiveGroupKeys((prev) => {
          const next = { ...prev };
          delete next[group.key];
          return next;
        });
      } catch (error) {
        setActionError(error.message || "Не удалось удалить live-сессии.");
      } finally {
        setDeletingLiveGroupKey("");
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
          signals={ORGANIZER_SIGNALS}
        />
      </section>

      <section className={styles.blocks}>
        <div className={`${styles.sectionBlock} ${styles.sectionBlockTopOffset}`}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderTop}>
                <h1 className={styles.title}>Мои квизы</h1>
              </div>
              <p className={styles.sectionLead}>
                Конструктор сценариев, параметры комнаты, лимиты попыток и быстрый переход к live-режиму находятся в одном списке.
              </p>
              <div className={styles.sectionHeaderActions}>
                <button
                  type="button"
                  className={`${styles.createQuizButton} ${styles.createActionButton}`}
                  onClick={() => navigate("/organizer/quizzes/new")}
                  aria-label="Создать квиз"
                  title="Создать квиз"
                >
                  <PlusIcon className={styles.actionIconGlyph} />
                  <span>Создать квиз</span>
                </button>
              </div>
            </div>

            {isLoading && (
              <AsyncStateNotice variant="loading" message="Загрузка квизов..." />
            )}
            {!isLoading && loadError && (
              <AsyncStateNotice
                variant="error"
                message={loadError}
                actionLabel="Повторить"
                onAction={() => loadDashboardData()}
              />
            )}
            {actionError && <p className={styles.formError}>{actionError}</p>}
            {!isLoading && !loadError && quizzes.length === 0 && (
              <p className={styles.text}>Пока нет созданных квизов.</p>
            )}

            <ul className={styles.quizList}>
              {visibleQuizzes.map((quiz) => (
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
                      className={`${styles.actionIconButton} ${styles.editIconButton}`}
                      onClick={() => navigate(`/organizer/quizzes/${quiz.id}/edit`)}
                      aria-label="Редактировать квиз"
                      title="Редактировать квиз"
                    >
                      <EditIcon className={styles.actionIconGlyph} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionIconButton} ${styles.liveIconButton}`}
                      onClick={() => navigate(`/organizer/live/${quiz.id}`)}
                      aria-label="Запустить live"
                      title="Запустить live"
                    >
                      <LiveIcon className={styles.actionIconGlyph} />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteIconButton}
                      disabled={deletingQuizId === quiz.id}
                      onClick={() => handleDeleteQuiz(quiz)}
                      aria-label={deletingQuizId === quiz.id ? "Удаление квиза..." : "Удалить квиз"}
                      title="Удалить квиз"
                    >
                      <TrashIcon className={styles.deleteIconGlyph} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {!isLoading && !loadError && quizzes.length > 1 && (
              <div className={`${styles.topActions} ${styles.quizListActions}`}>
                <button
                  type="button"
                  className={styles.participantSecondaryButton}
                  onClick={() => setShowAllQuizzes((prev) => !prev)}
                  aria-expanded={showAllQuizzes}
                >
                  {showAllQuizzes ? "Свернуть список" : `Показать все квизы (${quizzes.length})`}
                </button>
              </div>
            )}
          </section>

          <QuizAnalyticsSection
            quizzesCount={quizzes.length}
            activeCount={activeCount}
            totalQuestions={totalQuestions}
            attemptsCount={attempts.length}
            uniqueParticipantsCount={uniqueParticipantsCount}
            averagePercentage={averagePercentage}
            finishedLiveCount={finishedLiveCount}
          />
        </div>

        <div className={styles.sectionBlock}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h1 className={styles.title}>Кто прошел квизы</h1>
              <p className={styles.sectionLead}>
                Здесь видны последние попытки участников, их проценты, баллы и длительность прохождения.
              </p>
            </div>
            {isAttemptsLoading && (
              <AsyncStateNotice variant="loading" message="Загрузка попыток..." />
            )}
            {!isAttemptsLoading && attemptsError && (
              <AsyncStateNotice
                variant="error"
                message={attemptsError}
                actionLabel="Повторить"
                onAction={() => loadDashboardData()}
              />
            )}
            {!isAttemptsLoading && !attemptsError && attempts.length === 0 && (
              <p className={styles.text}>Пока никто не прошел ваши квизы.</p>
            )}

            <ul className={styles.resultGroupList}>
              {attemptGroups.map((group) => {
                const isGroupExpanded = !collapsedAttemptGroupKeys[group.key];
                const isDeleting = deletingAttemptGroupKey === group.key;

                return (
                  <li key={group.key} className={styles.resultGroupItem}>
                    <div className={`${styles.liveSessionHead} ${styles.resultGroupHeader}`}>
                      <div className={styles.resultGroupInfo}>
                        <h3 className={styles.resultGroupTitle}>{group.quizTitle}</h3>
                        <p className={styles.resultGroupMeta}>
                          Попыток: {group.attempts.length}
                          {group.participantsCount > 0
                            ? ` • Участников: ${group.participantsCount}`
                            : ""}
                        </p>
                      </div>
                      <div className={styles.resultGroupHeaderActions}>
                        <button
                          type="button"
                          className={styles.deleteIconButton}
                          disabled={isDeleting}
                          onClick={() => handleDeleteAttemptGroup(group)}
                          aria-label={isDeleting ? "Удаление попыток..." : "Удалить попытки"}
                          title="Удалить попытки"
                        >
                          <TrashIcon className={styles.deleteIconGlyph} />
                        </button>
                        <button
                          type="button"
                          className={styles.resultGroupIconButton}
                          onClick={() => toggleAttemptGroup(group.key)}
                          aria-expanded={isGroupExpanded}
                          aria-label={isGroupExpanded ? "Свернуть группу" : "Развернуть группу"}
                        >
                          <span
                            className={`${styles.resultGroupChevron} ${
                              isGroupExpanded ? styles.resultGroupChevronOpen : ""
                            }`}
                            aria-hidden="true"
                          >
                            ▾
                          </span>
                        </button>
                      </div>
                    </div>

                    {isGroupExpanded && (
                      <ul className={styles.resultGroupAttempts}>
                        {group.attempts.map((attempt) => {
                          const participantName = String(
                            attempt.participantName || "Участник"
                          ).trim();
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
                                    {attempt.isLive ? "Live • " : ""}
                                    {`${attempt.score}/${attempt.maxScore}`}
                                    {Number.isInteger(attempt.answeredQuestionsCount)
                                      ? ` • Ответов: ${attempt.answeredQuestionsCount}/${attempt.maxScore}`
                                      : ""}
                                    {attempt.timeSpentSeconds > 0
                                      ? ` • ${formatDurationSeconds(attempt.timeSpentSeconds)}`
                                      : ""}
                                    {attempt.createdAt
                                      ? ` • ${formatAttemptDate(attempt.createdAt)}`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`${styles.resultBadge} ${getResultBadgeClass(
                                  attempt.percentage
                                )}`}
                              >
                                {attempt.percentage}%
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h1 className={styles.title}>Проведенные live-сессии</h1>
              <p className={styles.sectionLead}>
                История эфиров показывает период проведения, количество участников и итоговых победителей по каждой сессии.
              </p>
            </div>
            {isSessionsLoading && (
              <AsyncStateNotice variant="loading" message="Загрузка live-сессий..." />
            )}
            {!isSessionsLoading && sessionsError && (
              <AsyncStateNotice
                variant="error"
                message={sessionsError}
                actionLabel="Повторить"
                onAction={() => loadDashboardData()}
              />
            )}
            {!isSessionsLoading && !sessionsError && liveSessions.length === 0 && (
              <p className={styles.text}>Пока нет проведенных live-сессий.</p>
            )}

            <ul className={styles.resultGroupList}>
              {liveSessionGroups.map((group) => {
                const isGroupExpanded = Boolean(expandedLiveGroupKeys[group.key]);
                const isDeleting = deletingLiveGroupKey === group.key;

                return (
                  <li key={group.key} className={styles.resultGroupItem}>
                    <div className={`${styles.liveSessionHead} ${styles.resultGroupHeader}`}>
                      <div className={styles.resultGroupInfo}>
                        <h3 className={styles.resultGroupTitle}>{group.quizTitle}</h3>
                        <p className={styles.resultGroupMeta}>
                          Сессий: {group.sessions.length}
                          {group.latestStatusLabel ? ` • Последняя: ${group.latestStatusLabel}` : ""}
                        </p>
                      </div>
                      <div className={styles.resultGroupHeaderActions}>
                        <button
                          type="button"
                          className={styles.deleteIconButton}
                          disabled={isDeleting}
                          onClick={() => handleDeleteLiveGroup(group)}
                          aria-label={isDeleting ? "Удаление live-сессий..." : "Удалить live-сессии"}
                          title="Удалить live-сессии"
                        >
                          <TrashIcon className={styles.deleteIconGlyph} />
                        </button>
                        <button
                          type="button"
                          className={styles.resultGroupIconButton}
                          onClick={() => toggleLiveGroup(group.key)}
                          aria-expanded={isGroupExpanded}
                          aria-label={isGroupExpanded ? "Свернуть группу" : "Развернуть группу"}
                        >
                          <span
                            className={`${styles.resultGroupChevron} ${
                              isGroupExpanded ? styles.resultGroupChevronOpen : ""
                            }`}
                            aria-hidden="true"
                          >
                            ▾
                          </span>
                        </button>
                      </div>
                    </div>

                    {isGroupExpanded && (
                      <ul className={styles.resultGroupAttempts}>
                        {group.sessions.map((session) => (
                          <li
                            key={session.id}
                            className={`${styles.liveSessionItem} ${styles.liveSessionPanel}`}
                          >
                            <div className={`${styles.liveSessionHead} ${styles.resultGroupHeader}`}>
                              <h3 className={styles.liveSessionTitle}>{session.quizTitle}</h3>
                              <span
                                className={`${styles.quizStateBadge} ${
                                  session.status === "finished"
                                    ? styles.quizStateActive
                                    : styles.quizStateDraft
                                }`}
                              >
                                {session.status === "finished" ? "Завершен" : "Идет"}
                              </span>
                            </div>

                            <div className={styles.liveSessionBody}>
                              <p className={styles.liveSessionMeta}>
                                Код: {session.quizJoinCode} • Участников: {session.participantsCount} •
                                Вопросов: {session.questionCount}
                              </p>
                              <p className={styles.liveSessionMeta}>
                                {formatSessionPeriod(session.startedAt, session.finishedAt)}
                              </p>

                              {Array.isArray(session.winners) && session.winners.length > 0 && (
                                <ul className={`${styles.liveWinnerList} ${styles.liveSessionWinners}`}>
                                  {session.winners.map((winner) => (
                                    <li
                                      key={`${session.id}-${winner.participantId}-${winner.place}`}
                                      className={styles.liveWinnerItem}
                                    >
                                      <span>#{winner.place}</span>
                                      <span>{winner.participantName}</span>
                                      <span>
                                        {winner.score}/{winner.maxScore} ({winner.percentage}%)
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
