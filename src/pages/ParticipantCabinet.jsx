import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/CabinetPage.module.css";
import CabinetTopMenu from "../components/CabinetTopMenu";

const AUTH_USER_UPDATED_EVENT = "auth-user-updated";

function getStoredUser() {
  try {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function formatAttemptDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ru-RU");
}

function getResultBadgeClass(percentage) {
  if (percentage >= 80) {
    return styles.resultBadgeHigh;
  }
  if (percentage >= 50) {
    return styles.resultBadgeMedium;
  }
  return styles.resultBadgeLow;
}

function formatDurationSeconds(value) {
  const totalSeconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${String(seconds).padStart(2, "0")}с`;
}

function getAttemptAnswerTitle(answer, index) {
  const questionPosition = Number(answer?.questionPosition || 0);
  if (typeof answer?.prompt === "string" && answer.prompt.trim()) {
    return `Вопрос ${questionPosition > 0 ? questionPosition : index + 1}. ${answer.prompt.trim()}`;
  }
  if (Number.isInteger(Number(answer?.questionId))) {
    return `Вопрос #${Number(answer.questionId)}`;
  }
  return `Вопрос ${index + 1}`;
}

function getAttemptAnswerMeta(answer) {
  const optionTexts = Array.isArray(answer?.optionTexts)
    ? answer.optionTexts.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const optionIds = Array.isArray(answer?.optionIds)
    ? answer.optionIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];

  const parts = [];
  if (optionTexts.length > 0) {
    parts.push(`Ответ: ${optionTexts.join(", ")}`);
  } else if (optionIds.length > 0) {
    parts.push(`Ответ: ${optionIds.map((value) => `#${value}`).join(", ")}`);
  } else {
    parts.push("Ответ не дан");
  }

  if (typeof answer?.isCorrect === "boolean") {
    parts.push(answer.isCorrect ? "Верно" : "Неверно");
  }

  const submittedAfterSeconds = Number(answer?.submittedAfterSeconds || 0);
  if (submittedAfterSeconds > 0) {
    parts.push(`Время ответа: ${formatDurationSeconds(submittedAfterSeconds)}`);
  }

  return parts.join(" • ");
}

function formatAttemptsCount(count) {
  const total = Math.max(0, Number(count) || 0);
  const remainder10 = total % 10;
  const remainder100 = total % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${total} попытка`;
  }
  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return `${total} попытки`;
  }
  return `${total} попыток`;
}

function getGroupedAttempts(list, groupPrefix) {
  const groups = new Map();

  list.forEach((attempt) => {
    const rawTitle = String(attempt?.quizTitle || "Квиз").trim();
    const title = rawTitle || "Квиз";
    const numericQuizId = Number(attempt?.quizId);
    const normalizedKey =
      Number.isInteger(numericQuizId) && numericQuizId > 0
        ? String(numericQuizId)
        : title.toLowerCase().replace(/\s+/g, "-");
    const groupKey = `${groupPrefix}-${normalizedKey}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        title,
        avatarChar: title.charAt(0).toUpperCase() || "Q",
        attempts: [],
      });
    }

    groups.get(groupKey).attempts.push(attempt);
  });

  return Array.from(groups.values());
}

const SHOWCASE_NOTES = [
  {
    label: "Быстрый вход",
    text: "Код комнаты сразу открывает live-сессию без дополнительных шагов.",
  },
  {
    label: "Единый архив",
    text: "Попытки, баллы и детали ответов сохраняются в одном месте.",
  },
];

const PARTICIPANT_SIGNALS = [
  {
    label: "Live",
    title: "Синхронный эфир",
    text: "Вопросы и таймер открываются одновременно для всех участников комнаты.",
  },
  {
    label: "Archive",
    title: "История попыток",
    text: "Каждое прохождение сохраняется с баллами, процентом и деталями по ответам.",
  },
  {
    label: "Review",
    title: "Разбор результата",
    text: "После квиза можно открыть сильные и слабые ответы по каждому вопросу.",
  },
];

export default function ParticipantCabinet() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const firstName = String(user?.firstName || user?.name || "Участник").trim().split(/\s+/)[0] || "Участник";
  const apiBaseUrl = process.env.REACT_APP_API_URL || "http://localhost:4000";

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
        throw new Error(data.message || "Ресурс не найден.");
      }
      throw new Error(data.message || `Ошибка запроса (${response.status}).`);
    }
    return data;
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
        <section className={styles.workspaceHero}>
          <div className={styles.workspaceHeroMain}>
            <h1 className={styles.workspaceTitle}>
              {firstName}, подключайтесь к live-квизам и сохраняйте каждую попытку в одном личном пространстве.
            </h1>
            <p className={styles.workspaceLead}>
              Код комнаты, история результатов, процент успешности и подробный разбор ответов теперь собраны
              в одном аккуратном кабинете без лишних экранов.
            </p>

            <div className={styles.workspacePillRow}>
              <span className={styles.workspacePill}>Попыток {attemptsStats.total}</span>
              <span className={styles.workspacePill}>Live {attemptsStats.liveTotal}</span>
              <span className={styles.workspacePill}>Лучший результат {attemptsStats.bestPercentage}%</span>
            </div>
          </div>

          <aside className={styles.workspaceHeroAside}>
            <section className={styles.commandCard}>
              <div className={styles.commandHeader}>
                <h2 className={styles.commandTitle}>Войти по коду комнаты</h2>
                <p className={styles.commandText}>
                  Введите код комнаты и сразу перейдите в эфир, где вопросы и таймер синхронизируются в реальном времени.
                </p>
              </div>

              <form className={styles.commandForm} onSubmit={handleJoinQuiz}>
                <input
                  className={styles.commandInput}
                  type="text"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder="Например A1B2C3"
                  maxLength={20}
                />
                <button type="submit" className={styles.commandButton}>
                  Открыть live-квиз
                </button>
              </form>
              {joinError && <p className={styles.formError}>{joinError}</p>}
            </section>

            <div className={styles.noteStack}>
              {SHOWCASE_NOTES.map((note) => (
                <article key={note.label} className={styles.utilityNote}>
                  <p className={styles.utilityNoteLabel}>{note.label}</p>
                  <p className={styles.utilityNoteText}>{note.text}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className={styles.featureDeck}>
          {PARTICIPANT_SIGNALS.map((item) => (
            <article key={item.title} className={styles.featureDeckCard}>
              <h2 className={styles.featureDeckTitle}>{item.title}</h2>
              <p className={styles.featureDeckText}>{item.text}</p>
            </article>
          ))}
        </section>

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

          {isAttemptsLoading && <p className={styles.text}>Загрузка результатов...</p>}
          {attemptsError && <p className={styles.formError}>{attemptsError}</p>}
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
