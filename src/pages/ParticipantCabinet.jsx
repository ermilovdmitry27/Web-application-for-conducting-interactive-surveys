import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import AsyncStateNotice from "../components/AsyncStateNotice";
import CabinetTopMenu from "../components/CabinetTopMenu";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithAuth as sharedRequestWithAuth } from "../lib/api/requestWithAuth";
import FeatureDeckSection from "./participant-cabinet/FeatureDeckSection";
import WorkspaceHeroSection from "./participant-cabinet/WorkspaceHeroSection";
import {
  AUTH_USER_UPDATED_EVENT,
  PARTICIPANT_SIGNALS,
  SHOWCASE_NOTES,
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
  const [expandedAttemptIds, setExpandedAttemptIds] = useState({});
  const [expandedQuizGroupIds, setExpandedQuizGroupIds] = useState({});

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

  const toggleAttemptExpanded = (attemptId) => {
    setExpandedAttemptIds((prev) => ({
      ...prev,
      [attemptId]: !prev[attemptId],
    }));
  };

  const toggleQuizGroupExpanded = (groupId) => {
    setExpandedQuizGroupIds((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const renderAttemptItem = (attempt, attemptIndex) => {
    const attemptLabel = attempt.createdAt
      ? `Попытка • ${formatAttemptDate(attempt.createdAt)}`
      : `Попытка ${attemptIndex + 1}`;
    const isExpanded = Boolean(expandedAttemptIds[attempt.id]);
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];

    return (
      <li key={attempt.id} className={`${styles.resultItem} ${styles.resultItemStack}`}>
        <div className={styles.resultHeadRow}>
          <div className={styles.resultMain}>
            <div className={styles.resultInfo}>
              <p className={styles.resultName}>{attemptLabel}</p>
              <p className={styles.resultScore}>
                {attempt.isLive ? "Live • " : ""}
                {attempt.score}/{attempt.maxScore} баллов
                {Number.isInteger(attempt.answeredQuestionsCount)
                  ? ` • Ответов: ${attempt.answeredQuestionsCount}/${attempt.maxScore}`
                  : ""}
                {attempt.timeSpentSeconds > 0 ? ` • ${formatDurationSeconds(attempt.timeSpentSeconds)}` : ""}
              </p>
            </div>
          </div>
          <div className={styles.resultAside}>
            <span className={`${styles.resultBadge} ${getResultBadgeClass(attempt.percentage)}`}>
              {attempt.percentage}%
            </span>
            <button
              type="button"
              className={styles.resultToggleButton}
              onClick={() => toggleAttemptExpanded(attempt.id)}
            >
              {isExpanded ? "Скрыть" : "Подробнее"}
            </button>
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

          return (
            <li key={group.key} className={styles.resultGroupItem}>
              <button
                type="button"
                className={styles.resultGroupButton}
                onClick={() => toggleQuizGroupExpanded(group.key)}
                aria-expanded={isGroupExpanded}
              >
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
                  <span className={styles.resultGroupCount}>{group.attempts.length}</span>
                  <span
                    className={`${styles.resultGroupChevron} ${
                      isGroupExpanded ? styles.resultGroupChevronOpen : ""
                    }`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </div>
              </button>

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
          notes={SHOWCASE_NOTES}
          onJoinCodeChange={(event) => setJoinCode(event.target.value)}
          onJoin={handleJoinQuiz}
        />

        <FeatureDeckSection signals={PARTICIPANT_SIGNALS} />

        <section className={styles.archiveSection}>
          <div className={styles.archiveHeader}>
            <div className={styles.archiveHeaderCopy}>
              <h1 className={styles.title}>Результаты и история прохождений</h1>
              <p className={styles.sectionLead}>
                Вся история хранится в одном месте: live-квизы, самостоятельные попытки и детали по каждому ответу.
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
            <div className={styles.archiveColumns}>
              <section className={styles.archiveLane}>
                <div className={styles.archiveLaneHeader}>
                  <h2 className={styles.sectionSubtitle}>Live-квизы</h2>
                  <p className={styles.archiveLaneText}>Подключения по коду комнаты и результаты из live-эфира.</p>
                </div>
                {renderAttempts(liveAttempts, "Live-прохождений пока нет.", "live")}
              </section>

              <section className={styles.archiveLane}>
                <div className={styles.archiveLaneHeader}>
                  <h2 className={styles.sectionSubtitle}>Самостоятельные попытки</h2>
                  <p className={styles.archiveLaneText}>Обычные прохождения с сохранением баллов и скорости ответа.</p>
                </div>
                {renderAttempts(classicAttempts, "Обычных прохождений пока нет.", "classic")}
              </section>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
