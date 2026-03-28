jest.mock("../../../server/db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require("../../../server/db");
const {
  getUsedQuizAttemptsCount,
  recordClassicAttemptUsage,
  recordLiveAttemptUsages,
} = require("../../../server/attempts/usage");

describe("server/attempts/usage", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("getUsedQuizAttemptsCount returns numeric total", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ total: "3" }],
    });

    await expect(getUsedQuizAttemptsCount(10, 20)).resolves.toBe(3);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("recordClassicAttemptUsage inserts immutable classic usage row", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await recordClassicAttemptUsage({
      quizId: 10,
      participantId: 20,
      quizAttemptId: 30,
      createdAt: "2026-03-28T09:00:00.000Z",
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO quiz_attempt_usages");
    expect(sql).toContain("ON CONFLICT (quiz_attempt_id) DO NOTHING");
    expect(params).toEqual([10, 20, 30, "2026-03-28T09:00:00.000Z"]);
  });

  test("recordLiveAttemptUsages performs batch insert for live sessions", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await recordLiveAttemptUsages([
      {
        quizId: 10,
        participantId: 20,
        liveSessionId: 30,
        createdAt: "2026-03-28T09:00:00.000Z",
      },
      {
        quizId: 10,
        participantId: 21,
        liveSessionId: 30,
        createdAt: "2026-03-28T09:00:01.000Z",
      },
    ]);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("jsonb_to_recordset");
    expect(sql).toContain("ON CONFLICT (live_session_id, participant_id) DO NOTHING");

    const payload = JSON.parse(params[0]);
    expect(payload).toEqual([
      {
        quiz_id: 10,
        participant_id: 20,
        live_session_id: 30,
        created_at: "2026-03-28T09:00:00.000Z",
      },
      {
        quiz_id: 10,
        participant_id: 21,
        live_session_id: 30,
        created_at: "2026-03-28T09:00:01.000Z",
      },
    ]);
  });
});
