jest.mock("../../../server/db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require("../../../server/db");
const { saveFinishedLiveSessionResults } = require("../../../server/live/results");

describe("server/live/results", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("saveFinishedLiveSessionResults performs a single batch upsert for multiple participants", async () => {
    const snapshot = {
      context: { quiz: { id: 10 } },
      participants: [],
      leaderboard: { entries: [{ participantId: 101 }, { participantId: 102 }] },
      attemptRowsForUpsert: [
        {
          quizId: 10,
          participantId: 101,
          answersJson: [{ questionId: 1 }],
          score: 3,
          maxScore: 5,
          timeSpentSeconds: 12,
          liveSessionId: 77,
        },
        {
          quizId: 10,
          participantId: 102,
          answersJson: [{ questionId: 2 }],
          score: 4,
          maxScore: 5,
          timeSpentSeconds: 9,
          liveSessionId: 77,
        },
      ],
    };

    pool.query.mockResolvedValue({ rows: [] });

    const result = await saveFinishedLiveSessionResults(77, { snapshot });

    expect(result).toBe(snapshot);
    expect(pool.query).toHaveBeenCalledTimes(2);
    const [upsertSql, upsertParams] = pool.query.mock.calls[0];
    expect(upsertSql).toContain("jsonb_to_recordset");

    const payload = JSON.parse(upsertParams[0]);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      quiz_id: 10,
      participant_id: 101,
      score: 3,
      max_score: 5,
      time_spent_seconds: 12,
      live_session_id: 77,
    });
    expect(payload[1]).toMatchObject({
      quiz_id: 10,
      participant_id: 102,
      score: 4,
      max_score: 5,
      time_spent_seconds: 9,
      live_session_id: 77,
    });

    const [usageSql, usageParams] = pool.query.mock.calls[1];
    expect(usageSql).toContain("INSERT INTO quiz_attempt_usages");
    const usagePayload = JSON.parse(usageParams[0]);
    expect(usagePayload).toEqual([
      {
        quiz_id: 10,
        participant_id: 101,
        live_session_id: 77,
        created_at: null,
      },
      {
        quiz_id: 10,
        participant_id: 102,
        live_session_id: 77,
        created_at: null,
      },
    ]);
  });

  test("saveFinishedLiveSessionResults skips upsert when there are no leaderboard entries", async () => {
    const snapshot = {
      context: { quiz: { id: 10 } },
      participants: [],
      leaderboard: { entries: [] },
      attemptRowsForUpsert: [],
    };

    const result = await saveFinishedLiveSessionResults(77, { snapshot });

    expect(result).toBe(snapshot);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
