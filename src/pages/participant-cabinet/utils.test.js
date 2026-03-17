import styles from "../../css/CabinetPage.module.css";
import {
  formatAttemptDate,
  formatAttemptsCount,
  formatDurationSeconds,
  getAttemptAnswerMeta,
  getAttemptAnswerTitle,
  getGroupedAttempts,
  getResultBadgeClass,
} from "./utils";

describe("participant-cabinet/utils", () => {
  test("formatAttemptDate returns localized date string and empty string for invalid input", () => {
    const value = "2025-03-12T10:20:30.000Z";

    expect(formatAttemptDate(value)).toBe(new Date(value).toLocaleString("ru-RU"));
    expect(formatAttemptDate("invalid-date")).toBe("");
  });

  test("getResultBadgeClass returns css badge class by percentage threshold", () => {
    expect(getResultBadgeClass(90)).toBe(styles.resultBadgeHigh);
    expect(getResultBadgeClass(60)).toBe(styles.resultBadgeMedium);
    expect(getResultBadgeClass(40)).toBe(styles.resultBadgeLow);
  });

  test("formatDurationSeconds formats minutes and padded seconds", () => {
    expect(formatDurationSeconds(0)).toBe("0м 00с");
    expect(formatDurationSeconds(75)).toBe("1м 15с");
    expect(formatDurationSeconds(-1)).toBe("0м 00с");
  });

  test("getAttemptAnswerTitle prefers prompt, then numeric questionId, then fallback index", () => {
    expect(
      getAttemptAnswerTitle(
        {
          questionPosition: 3,
          prompt: "  Столица Франции? ",
        },
        0
      )
    ).toBe("Вопрос 3. Столица Франции?");
    expect(getAttemptAnswerTitle({ questionId: "12" }, 1)).toBe("Вопрос #12");
    expect(getAttemptAnswerTitle({}, 2)).toBe("Вопрос 3");
  });

  test("getAttemptAnswerMeta uses option texts when available and appends correctness and response time", () => {
    expect(
      getAttemptAnswerMeta({
        optionTexts: [" Париж ", " Лион "],
        optionIds: [1, 2],
        isCorrect: true,
        submittedAfterSeconds: 75,
      })
    ).toBe("Ответ: Париж, Лион • Верно • Время ответа: 1м 15с");
  });

  test("getAttemptAnswerMeta falls back to option ids or unanswered label", () => {
    expect(
      getAttemptAnswerMeta({
        optionIds: ["2", "5"],
        isCorrect: false,
      })
    ).toBe("Ответ: #2, #5 • Неверно");
    expect(getAttemptAnswerMeta({})).toBe("Ответ не дан");
  });

  test("formatAttemptsCount uses Russian plural forms", () => {
    expect(formatAttemptsCount(1)).toBe("1 попытка");
    expect(formatAttemptsCount(2)).toBe("2 попытки");
    expect(formatAttemptsCount(5)).toBe("5 попыток");
    expect(formatAttemptsCount(21)).toBe("21 попытка");
  });

  test("getGroupedAttempts groups by numeric quiz id or normalized title and preserves attempts order", () => {
    const firstAttempt = { quizId: 10, quizTitle: "Science Quiz", score: 8 };
    const secondAttempt = { quizId: 10, quizTitle: "Science Quiz", score: 7 };
    const thirdAttempt = { quizTitle: "Live Session", score: 5 };

    expect(getGroupedAttempts([firstAttempt, secondAttempt, thirdAttempt], "classic")).toEqual([
      {
        key: "classic-10",
        title: "Science Quiz",
        avatarChar: "S",
        attempts: [firstAttempt, secondAttempt],
      },
      {
        key: "classic-live-session",
        title: "Live Session",
        avatarChar: "L",
        attempts: [thirdAttempt],
      },
    ]);
  });
});
