import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import AsyncStateNotice from "../components/AsyncStateNotice";
import CabinetTopMenu from "../components/CabinetTopMenu";
import TrashIcon from "../components/TrashIcon";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth as sharedRequestWithAuth } from "../lib/api/requestWithAuth";
import WorkspaceHeroSection from "./participant-cabinet/WorkspaceHeroSection";
import {
  AUTH_USER_UPDATED_EVENT,
} from "./participant-cabinet/constants";
import {
  formatAttemptDate,
  formatDurationSeconds,
  formatAttemptsCount,
  getAttemptAnswerMeta,
  getAttemptAnswerTitle,
  getGroupedAttempts,
  getResultBadgeClass,
  getStoredUser,
} from "./participant-cabinet/utils";

export default function ParticipantCabinet() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const firstName = String(user?.firstName || user?.name || "Участник").trim().split(/\s+/)[0] || "Участник";
  const apiBaseUrl = getApiBaseUrl();

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const [attempts, setAttempts] = useState([]);
  const [isAttemptsLoading, setIsAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingGroupKey, setDeletingGroupKey] = useState("");
  const [expandedAttemptIds, setExpandedAttemptIds] = useState({});
  const [expandedQuizGroupIds, setExpandedQuizGroupIds] = useState({});
  const [liveLeaderboardsBySessionId, setLiveLeaderboardsBySessionId] = useState({});
  const [liveLeaderboardLoadingBySessionId, setLiveLeaderboardLoadingBySessionId] = useState({});
  const [liveLeaderboardErrorsBySessionId, setLiveLeaderboardErrorsBySessionId] = useState({});

  useEffect(() => {
    const handleAuthUserUpdated = (event) => {
      setUser(event?.detail?.user || getStoredUser());
    };

    window.addEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    return () => {
      window.removeEventListener(AUTH_USER_UPDATED_EVENT, handleAuthUserUpdated);
    };
  }, []);

  const requestWithAuth = useCallback(async (url, options = {}) => {
    try {
      return await sharedRequestWithAuth(url, options);
    } catch (error) {
      if (error?.message === "Ошибка запроса (404).") {
        throw new Error("Ресурс не найден.");
      }
      throw error;
    }
  }, []);

  const loadAttempts = useCallback(async () => {
    try {
      setIsAttemptsLoading(true);
      setAttemptsError("");
      setDeleteError("");
      const data = await requestWithAuth(`${apiBaseUrl}/api/attempts/mine`, { method: "GET" });
      setAttempts(Array.isArray(data.attempts) ? data.attempts : []);
    } catch (error) {
      setAttemptsError(error.message || "Не удалось загрузить историю участия.");
    } finally {
      setIsAttemptsLoading(false);
    }
  }, [apiBaseUrl, requestWithAuth]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  const attemptsStats = useMemo(() => {
    const total = attempts.length;
    const liveTotal = attempts.filter((attempt) => attempt.isLive).length;
    const averagePercentage =
      total > 0
        ? Math.round(
            attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / total
          )
        : 0;
    const bestPercentage = attempts.reduce(
      (best, attempt) => Math.max(best, Number(attempt.percentage || 0)),
      0
    );
    return {
      total,
      liveTotal,
      averagePercentage,
      bestPercentage,
    };
  }, [attempts]);

  const liveAttempts = useMemo(
    () => attempts.filter((attempt) => attempt.isLive),
    [attempts]
  );
  const classicAttempts = useMemo(
    () => attempts.filter((attempt) => !attempt.isLive),
    [attempts]
  );
  const hasClassicAttempts = classicAttempts.length > 0;

  const handleJoinQuiz = (event) => {
    event.preventDefault();
    const normalizedJoinCode = joinCode.trim().toUpperCase();
    if (!normalizedJoinCode) {
      setJoinError("Введите код комнаты.");
      return;
    }
    setJoinError("");
    navigate(`/participant/quiz/${normalizedJoinCode}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
  };

  const loadLiveLeaderboard = useCallback(async (sessionId) => {
    if (!Number.isInteger(sessionId) || sessionId < 1) {
      return;
    }

    try {
      setLiveLeaderboardLoadingBySessionId((prev) => ({
        ...prev,
        [sessionId]: true,
      }));
      setLiveLeaderboardErrorsBySessionId((prev) => ({
        ...prev,
        [sessionId]: "",
      }));

      const data = await requestWithAuth(`${apiBaseUrl}/api/live-sessions/${sessionId}/leaderboard`, {
        method: "GET",
      });
      setLiveLeaderboardsBySessionId((prev) => ({
        ...prev,
        [sessionId]: data?.leaderboard || null,
      }));
    } catch (error) {
      setLiveLeaderboardErrorsBySessionId((prev) => ({
        ...prev,
        [sessionId]: error.message || "Не удалось загрузить итоговый рейтинг.",
      }));
    } finally {
      setLiveLeaderboardLoadingBySessionId((prev) => ({
        ...prev,
        [sessionId]: false,
      }));
    }
  }, [apiBaseUrl, requestWithAuth]);

  const toggleAttemptExpanded = (attempt) => {
    const attemptId = Number(attempt?.id);
    const liveSessionId = Number(attempt?.liveSessionId);
    const shouldRequestLeaderboard =
      Boolean(attempt?.isLive) &&
      Number.isInteger(liveSessionId) &&
      liveSessionId > 0 &&
      !liveLeaderboardsBySessionId[liveSessionId] &&
      !liveLeaderboardLoadingBySessionId[liveSessionId];

    setExpandedAttemptIds((prev) => ({
      ...prev,
      [attemptId]: !prev[attemptId],
    }));

    if (shouldRequestLeaderboard) {
      loadLiveLeaderboard(liveSessionId);
    }
  };

  const toggleQuizGroupExpanded = (groupId) => {
    setExpandedQuizGroupIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleDeleteGroup = async (group) => {
    if (!Number.isInteger(group?.quizId) || group.quizId < 1) {
      setDeleteError("Не удалось определить квиз для удаления попыток.");
      return;
    }

    const quizTitle = String(group.title || "Квиз").trim() || "Квиз";
    const isConfirmed = window.confirm(
      `Удалить все ваши попытки по квизу "${quizTitle}"? Это действие нельзя отменить.`
    );
    if (!isConfirmed) {
      return;
    }

    try {
      setDeleteError("");
      setDeletingGroupKey(group.key);
      await requestWithAuth(`${apiBaseUrl}/api/attempts/mine/${group.quizId}`, {
        method: "DELETE",
      });
      setAttempts((prev) => prev.filter((attempt) => Number(attempt.quizId) !== Number(group.quizId)));
      setExpandedQuizGroupIds((prev) => {
        const next = { ...prev };
        delete next[group.key];
        return next;
      });
    } catch (error) {
      setDeleteError(error.message || "Не удалось удалить попытки.");
    } finally {
      setDeletingGroupKey("");
    }
  };

  const renderAttemptItem = (attempt, attemptIndex) => {
    const attemptLabel = attempt.createdAt
      ? `Попытка • ${formatAttemptDate(attempt.createdAt)}`
      : `Попытка ${attemptIndex + 1}`;
    const isExpanded = Boolean(expandedAttemptIds[attempt.id]);
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    const liveSessionId = Number(attempt?.liveSessionId);
    const hasLiveLeaderboard = Boolean(attempt?.isLive) && Number.isInteger(liveSessionId) && liveSessionId > 0;
    const liveLeaderboard = hasLiveLeaderboard ? liveLeaderboardsBySessionId[liveSessionId] || null : null;
    const liveLeaderboardError =
      hasLiveLeaderboard ? liveLeaderboardErrorsBySessionId[liveSessionId] || "" : "";
    const isLiveLeaderboardLoading = hasLiveLeaderboard
      ? Boolean(liveLeaderboardLoadingBySessionId[liveSessionId])
      : false;
    const myParticipantId = Number(user?.id);
    const myLeaderboardEntry =
      liveLeaderboard && Array.isArray(liveLeaderboard.entries)
        ? liveLeaderboard.entries.find((entry) => Number(entry.participantId) === myParticipantId) || null
        : null;

    return (
      <li key={attempt.id} className={`${styles.resultItem} ${styles.resultItemStack}`}>
        <div className={`${styles.resultHeadRow} ${styles.resultHeadRowStack}`}>
          <p className={styles.resultName}>{attemptLabel}</p>
          <div className={styles.resultFootRow}>
            <p className={styles.resultScore}>
              {attempt.isLive ? "Live • " : ""}
              {attempt.score}/{attempt.maxScore} баллов
              {Number.isInteger(attempt.answeredQuestionsCount)
                ? ` • Ответов: ${attempt.answeredQuestionsCount}/${attempt.maxScore}`
                : ""}
              {attempt.timeSpentSeconds > 0 ? ` • ${formatDurationSeconds(attempt.timeSpentSeconds)}` : ""}
            </p>
            <div className={styles.resultAside}>
              <span className={`${styles.resultBadge} ${getResultBadgeClass(attempt.percentage)}`}>
                {attempt.percentage}%
              </span>
              <button
                type="button"
                className={styles.resultToggleButton}
                onClick={() => toggleAttemptExpanded(attempt)}
              >
                {isExpanded ? "Скрыть" : "Подробнее"}
              </button>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className={styles.attemptDetailCard}>
            {answers.length > 0 ? (
              <ul className={styles.attemptAnswerList}>
                {answers.map((answer, index) => (
                  <li
                    key={`${attempt.id}-${answer.questionId || answer.questionPosition || index}`}
                    className={styles.attemptAnswerItem}
                  >
                    <p className={styles.attemptAnswerTitle}>{getAttemptAnswerTitle(answer, index)}</p>
                    <p className={styles.attemptAnswerMeta}>{getAttemptAnswerMeta(answer)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.text}>Подробные ответы для этой попытки не сохранены.</p>
            )}

            {hasLiveLeaderboard && (
              <div className={styles.attemptSupplement}>
                <div className={styles.sectionHeaderTop}>
                  <p className={styles.attemptSupplementTitle}>Итоговый лидерборд live-сессии</p>
                  {myLeaderboardEntry && (
                    <span className={styles.liveResultCallout}>
                      Ваше место: #{myLeaderboardEntry.place}
                    </span>
                  )}
                </div>

                {isLiveLeaderboardLoading && <p className={styles.text}>Загружаем рейтинг...</p>}

                {!isLiveLeaderboardLoading && liveLeaderboardError && (
                  <AsyncStateNotice
                    variant="error"
                    message={liveLeaderboardError}
                    actionLabel="Повторить"
                    onAction={() => loadLiveLeaderboard(liveSessionId)}
                  />
                )}

                {!isLiveLeaderboardLoading &&
                  !liveLeaderboardError &&
                  liveLeaderboard &&
                  Array.isArray(liveLeaderboard.entries) &&
                  liveLeaderboard.entries.length > 0 && (
                    <ul className={`${styles.resultList} ${styles.attemptLeaderboardList}`}>
                      {liveLeaderboard.entries.map((entry) => {
                        const participantName =
                          String(entry?.participantName || "Участник").trim() || "Участник";
                        const avatarChar = participantName.charAt(0).toUpperCase() || "U";
                        const isCurrentUser = Number(entry.participantId) === myParticipantId;

                        return (
                          <li
                            key={`${attempt.id}-${entry.participantId}-${entry.place}`}
                            className={`${styles.resultItem} ${
                              isCurrentUser ? styles.attemptLeaderboardItemActive : ""
                            }`}
                          >
                            <div className={styles.resultMain}>
                              <span className={styles.resultAvatar} aria-hidden="true">
                                {entry.participantAvatarDataUrl ? (
                                  <img
                                    className={styles.resultAvatarImage}
                                    src={entry.participantAvatarDataUrl}
                                    alt=""
                                  />
                                ) : (
                                  avatarChar
                                )}
                              </span>
                              <div className={styles.resultInfo}>
                                <p className={styles.resultName}>
                                  #{entry.place} {participantName}
                                </p>
                                <p className={styles.resultScore}>
                                  {entry.score}/{entry.maxScore} баллов
                                </p>
                              </div>
                            </div>
                            <span className={`${styles.resultBadge} ${getResultBadgeClass(entry.percentage)}`}>
                              {entry.percentage}%
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                {!isLiveLeaderboardLoading &&
                  !liveLeaderboardError &&
                  (!liveLeaderboard ||
                    !Array.isArray(liveLeaderboard.entries) ||
                    liveLeaderboard.entries.length === 0) && (
                    <p className={styles.text}>Итоговый рейтинг для этой live-сессии пока недоступен.</p>
                  )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const renderAttempts = (list, emptyText, groupPrefix) => {
    if (list.length === 0) {
      return <p className={styles.text}>{emptyText}</p>;
    }

    const groupedAttempts = getGroupedAttempts(list, groupPrefix);

    return (
      <ul className={styles.resultGroupList}>
        {groupedAttempts.map((group) => {
          const isGroupExpanded = Boolean(expandedQuizGroupIds[group.key]);
          const bestPercentage = group.attempts.reduce(
            (best, attempt) => Math.max(best, Number(attempt.percentage || 0)),
            0
          );
          const isDeleting = deletingGroupKey === group.key;

          return (
            <li key={group.key} className={styles.resultGroupItem}>
              <div className={styles.resultGroupButton}>
                <div className={styles.resultGroupMain}>
                  <span className={styles.resultAvatar} aria-hidden="true">
                    {group.avatarChar}
                  </span>
                  <div className={styles.resultGroupInfo}>
                    <p className={styles.resultGroupTitle}>{group.title}</p>
                    <p className={styles.resultGroupMeta}>
                      {formatAttemptsCount(group.attempts.length)} • Лучший результат {bestPercentage}%
                    </p>
                  </div>
                </div>
                <div className={styles.resultGroupAside}>
                  <button
                    type="button"
                    className={styles.deleteIconButton}
                    disabled={isDeleting}
                    onClick={() => handleDeleteGroup(group)}
                    aria-label={isDeleting ? "Удаление попыток..." : "Удалить попытки"}
                    title="Удалить попытки"
                  >
                    <TrashIcon className={styles.deleteIconGlyph} />
                  </button>
                  <button
                    type="button"
                    className={styles.resultGroupIconButton}
                    onClick={() => toggleQuizGroupExpanded(group.key)}
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
                  {group.attempts.map((attempt, index) => renderAttemptItem(attempt, index))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    );
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
          attemptsTotal={attemptsStats.total}
          liveAttemptsTotal={attemptsStats.liveTotal}
          bestPercentage={attemptsStats.bestPercentage}
          joinCode={joinCode}
          joinError={joinError}
          onJoinCodeChange={(event) => setJoinCode(event.target.value)}
          onJoin={handleJoinQuiz}
        />

        <section className={styles.archiveSection}>
          <div className={styles.archiveHeader}>
            <div className={styles.archiveHeaderCopy}>
              <h1 className={`${styles.title} ${styles.archiveSectionTitle}`}>
                Результаты и история прохождений
              </h1>
              <p className={styles.sectionLead}>
                Здесь хранится история live-квизов и детали по каждому ответу.
              </p>
            </div>

            {!isAttemptsLoading && !attemptsError && attempts.length > 0 && (
              <div className={styles.archiveStatsRow}>
                <div className={styles.archiveStatCard}>
                  <p className={styles.archiveStatLabel}>Всего попыток</p>
                  <p className={styles.archiveStatValue}>{attemptsStats.total}</p>
                </div>
                <div className={styles.archiveStatCard}>
                  <p className={styles.archiveStatLabel}>Средний результат</p>
                  <p className={styles.archiveStatValue}>{attemptsStats.averagePercentage}%</p>
                </div>
                <div className={styles.archiveStatCard}>
                  <p className={styles.archiveStatLabel}>Лучший результат</p>
                  <p className={styles.archiveStatValue}>{attemptsStats.bestPercentage}%</p>
                </div>
              </div>
            )}
          </div>

          {isAttemptsLoading && (
            <AsyncStateNotice variant="loading" message="Загрузка результатов..." />
          )}
          {!isAttemptsLoading && attemptsError && (
            <AsyncStateNotice
              variant="error"
              message={attemptsError}
              actionLabel="Повторить"
              onAction={() => loadAttempts()}
            />
          )}
          {!isAttemptsLoading && !attemptsError && attempts.length === 0 && (
            <p className={styles.text}>История пока пустая.</p>
          )}

          {!isAttemptsLoading && !attemptsError && attempts.length > 0 && (
            <div
              className={`${styles.archiveColumns} ${!hasClassicAttempts ? styles.archiveColumnsSingle : ""}`}
            >
              <section className={styles.archiveLane}>
                <div className={styles.archiveLaneHeader}>
                  <h2 className={styles.sectionSubtitle}>
                    {hasClassicAttempts ? "Live-квизы" : "История live-квизов"}
                  </h2>
                  <p className={styles.archiveLaneText}>Подключения по коду комнаты и результаты из live-эфира.</p>
                </div>
                {deleteError && <p className={styles.formError}>{deleteError}</p>}
                {renderAttempts(liveAttempts, "Live-прохождений пока нет.", "live")}
              </section>

              {hasClassicAttempts && (
                <section className={styles.archiveLane}>
                  <div className={styles.archiveLaneHeader}>
                    <h2 className={styles.sectionSubtitle}>Самостоятельные попытки</h2>
                    <p className={styles.archiveLaneText}>
                      Архив обычных прохождений с сохранением баллов и скорости ответа.
                    </p>
                  </div>
                  {renderAttempts(classicAttempts, "Обычных прохождений пока нет.", "classic")}
                </section>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
