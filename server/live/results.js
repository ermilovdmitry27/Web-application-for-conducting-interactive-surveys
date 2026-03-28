const { pool } = require("../db");
const { recordLiveAttemptUsages } = require("../attempts/usage");
const { buildLiveAttemptAnswers, getLiveAttemptTimeSpentSeconds } = require("./helpers");
const { getLiveLeaderboardSnapshot } = require("./leaderboard");

async function getFinishedLiveSessionResultsSnapshot(
  sessionId,
  { db = pool, leaderboardSnapshot = null } = {}
) {
  const resolvedLeaderboardSnapshot =
    leaderboardSnapshot || await getLiveLeaderboardSnapshot(sessionId, { db });
  if (!resolvedLeaderboardSnapshot) {
    return null;
  }

  const { context, participants, leaderboard } = resolvedLeaderboardSnapshot;
  if (!leaderboard || leaderboard.entries.length === 0) {
    return {
      context,
      participants,
      leaderboard,
      attemptRowsForUpsert: [],
    };
  }

  const answerRowsResult = await db.query(
    `
    SELECT
      participant_id,
      question_index,
      selected_option_ids_json,
      is_correct,
      submitted_at,
      submitted_after_seconds
    FROM quiz_session_answers
    WHERE session_id = $1
    ORDER BY participant_id ASC, question_index ASC;
    `,
    [sessionId]
  );

  const answerRowsByParticipant = new Map();
  answerRowsResult.rows.forEach((row) => {
    const participantId = Number(row.participant_id);
    if (!answerRowsByParticipant.has(participantId)) {
      answerRowsByParticipant.set(participantId, []);
    }
    answerRowsByParticipant.get(participantId).push(row);
  });

  const participantMap = new Map(
    participants.map((participant) => [participant.participantId, participant])
  );
  const totalQuestionCount = leaderboard.maxScore;
  const attemptRowsForUpsert = leaderboard.entries.map((entry) => {
    const participant = participantMap.get(entry.participantId) || null;
    const participantAnswerRows = answerRowsByParticipant.get(entry.participantId) || [];
    const answersForStorage = buildLiveAttemptAnswers(context, participantAnswerRows);
    const timeSpentSeconds = getLiveAttemptTimeSpentSeconds(
      context,
      participant?.joinedAt,
      participantAnswerRows
    );

    return {
      quizId: context.quiz.id,
      participantId: entry.participantId,
      answersJson: answersForStorage,
      score: entry.score,
      maxScore: totalQuestionCount,
      timeSpentSeconds,
      liveSessionId: sessionId,
    };
  });

  return {
    context,
    participants,
    leaderboard,
    attemptRowsForUpsert,
  };
}

async function saveFinishedLiveSessionResults(
  sessionId,
  { db = pool, snapshot = null } = {}
) {
  const resolvedSnapshot =
    snapshot || await getFinishedLiveSessionResultsSnapshot(sessionId, { db });
  if (!resolvedSnapshot) {
    return null;
  }

  if (resolvedSnapshot.attemptRowsForUpsert.length === 0) {
    return resolvedSnapshot;
  }

  await db.query(
    `
    WITH attempt_payload AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS payload(
        quiz_id bigint,
        participant_id bigint,
        answers_json jsonb,
        score integer,
        max_score integer,
        time_spent_seconds integer,
        live_session_id bigint
      )
    )
    INSERT INTO quiz_attempts (
      quiz_id,
      participant_id,
      answers_json,
      score,
      max_score,
      time_spent_seconds,
      live_session_id
    )
    SELECT
      quiz_id,
      participant_id,
      answers_json,
      score,
      max_score,
      time_spent_seconds,
      live_session_id
    FROM attempt_payload
    ON CONFLICT (live_session_id, participant_id)
    WHERE live_session_id IS NOT NULL
    DO UPDATE
    SET
      answers_json = EXCLUDED.answers_json,
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      time_spent_seconds = EXCLUDED.time_spent_seconds;
    `,
    [
      JSON.stringify(
        resolvedSnapshot.attemptRowsForUpsert.map((row) => ({
          quiz_id: row.quizId,
          participant_id: row.participantId,
          answers_json: row.answersJson,
          score: row.score,
          max_score: row.maxScore,
          time_spent_seconds: row.timeSpentSeconds,
          live_session_id: row.liveSessionId,
        }))
      ),
    ]
  );

  await recordLiveAttemptUsages(
    resolvedSnapshot.attemptRowsForUpsert.map((row) => ({
      quizId: row.quizId,
      participantId: row.participantId,
      liveSessionId: row.liveSessionId,
      createdAt: resolvedSnapshot.context?.session?.finishedAt || null,
    })),
    db
  );

  return resolvedSnapshot;
}

module.exports = {
  getFinishedLiveSessionResultsSnapshot,
  saveFinishedLiveSessionResults,
};
