import styles from "../../css/CabinetPage.module.css";
import {
  formatAttemptDate,
  formatDurationSeconds,
  formatSessionPeriod,
  getResultBadgeClass,
} from "./utils";

describe("organizer-cabinet/utils", () => {
  test("formatAttemptDate returns localized date string and empty string for invalid input", () => {
    const value = "2025-03-12T10:20:30.000Z";

    expect(formatAttemptDate(value)).toBe(new Date(value).toLocaleString("ru-RU"));
    expect(formatAttemptDate("invalid-date")).toBe("");
  });

  test("formatSessionPeriod returns empty, start-only and full period labels", () => {
    const startedAt = "2025-03-12T10:20:30.000Z";
    const finishedAt = "2025-03-12T10:50:30.000Z";
    const startedLabel = new Date(startedAt).toLocaleString("ru-RU");
    const finishedLabel = new Date(finishedAt).toLocaleString("ru-RU");

    expect(formatSessionPeriod("invalid", "invalid")).toBe("");
    expect(formatSessionPeriod(startedAt, "invalid")).toBe(`Старт: ${startedLabel}`);
    expect(formatSessionPeriod(startedAt, finishedAt)).toBe(
      `Старт: ${startedLabel} • Финиш: ${finishedLabel}`
    );
  });

  test("getResultBadgeClass returns css badge class by percentage threshold", () => {
    expect(getResultBadgeClass(85)).toBe(styles.resultBadgeHigh);
    expect(getResultBadgeClass(50)).toBe(styles.resultBadgeMedium);
    expect(getResultBadgeClass(20)).toBe(styles.resultBadgeLow);
  });

  test("formatDurationSeconds formats minutes and padded seconds", () => {
    expect(formatDurationSeconds(0)).toBe("0м 00с");
    expect(formatDurationSeconds(125)).toBe("2м 05с");
    expect(formatDurationSeconds(-5)).toBe("0м 00с");
  });
});
