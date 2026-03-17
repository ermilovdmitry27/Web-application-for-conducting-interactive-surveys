import { formatSeconds, getLiveStatusLabel } from "./utils";

describe("participant-quiz/utils", () => {
  test("formatSeconds pads minutes and seconds and clamps invalid values to zero", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(-10)).toBe("00:00");
    expect(formatSeconds("invalid")).toBe("00:00");
  });

  test("getLiveStatusLabel prefers finished over paused and uses running label otherwise", () => {
    expect(getLiveStatusLabel("finished", false)).toBe("Завершен");
    expect(getLiveStatusLabel("running", true)).toBe("Пауза");
    expect(getLiveStatusLabel("running", false)).toBe("Идет");
  });
});
