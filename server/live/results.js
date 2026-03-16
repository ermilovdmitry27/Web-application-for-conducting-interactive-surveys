const { pool } = require("../db");
const { buildLiveAttemptAnswers, getLiveAttemptTimeSpentSeconds } = require("./helpers");
const { getLiveSessionContextById } = require("./context");
const { getLiveLeaderboard } = require("./leaderboard");
const { getLiveParticipants } = require("./runtime");

async function saveFinishedLiveSessionResults(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return;
  }
  const leaderboard = await getLiveLeaderboard(sessionId);
  if (!leaderboard || leaderboard.entries.length === 0) {
    return;
  }

  const participantList = await getLiveParticipants(sessionId);
  const participantMap = new Map(
    participantList.map((participant) => [participant.participantId, participant])
  );
  const answerRowsResult = await pool.query(
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
    ORDER BY participant_id ASC, question_index ASC, submitted_at ASC;
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

  const totalQuestionCount = leaderboard.maxScore;
  for (const entry of leaderboard.entries) {
    const participant = participantMap.get(entry.participantId) || null;
    const participantAnswerRows = answerRowsByParticipant.get(entry.participantId) || [];
    const answersForStorage = buildLiveAttemptAnswers(context, participantAnswerRows);
    const timeSpentSeconds = getLiveAttemptTimeSpentSeconds(
      context,
      participant?.joinedAt,
      participantAnswerRows
    );

    await pool.query(
      `
      INSERT INTO quiz_attempts (
        quiz_id,
        participant_id,
        answers_json,
        score,
        max_score,
        time_spent_seconds,
        live_session_id
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
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
        context.quiz.id,
        entry.participantId,
        JSON.stringify(answersForStorage),
        entry.score,
        totalQuestionCount,
        timeSpentSeconds,
        sessionId,
      ]
    );
  }
}

module.exports = {
  saveFinishedLiveSessionResults,
};
