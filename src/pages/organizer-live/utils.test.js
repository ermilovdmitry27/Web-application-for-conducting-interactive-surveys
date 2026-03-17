import { formatSeconds, getLiveStatusLabel } from "./utils";

describe("organizer-live/utils", () => {
  test("formatSeconds pads minutes and seconds and clamps invalid values to zero", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(125)).toBe("02:05");
    expect(formatSeconds(-1)).toBe("00:00");
    expect(formatSeconds(undefined)).toBe("00:00");
  });

  test("getLiveStatusLabel returns finished, paused or running labels", () => {
    expect(getLiveStatusLabel("finished", false)).toBe("Завершен");
    expect(getLiveStatusLabel("running", true)).toBe("Пауза");
    expect(getLiveStatusLabel("running", false)).toBe("Идет");
  });
});
