const { pool } = require("../db");

async function getLiveParticipants(sessionId) {
  const result = await pool.query(
    `
    SELECT
      p.participant_id,
      p.joined_at,
      u.name AS participant_name,
      u.avatar_data_url AS participant_avatar_data_url
    FROM quiz_session_participants p
    JOIN users u ON u.id = p.participant_id
    WHERE p.session_id = $1
    ORDER BY p.joined_at ASC, p.participant_id ASC;
    `,
    [sessionId]
  );

  return result.rows.map((row) => ({
    participantId: Number(row.participant_id),
    participantName: row.participant_name,
    participantAvatarDataUrl: row.participant_avatar_data_url || "",
    joinedAt: row.joined_at,
  }));
}

async function getLiveAnsweredParticipants(sessionId, questionIndex) {
  if (!Number.isInteger(questionIndex) || questionIndex < 0) {
    return [];
  }

  const result = await pool.query(
    `
    SELECT
      a.participant_id,
      a.submitted_at,
      a.submitted_after_seconds,
      u.name AS participant_name,
      u.avatar_data_url AS participant_avatar_data_url
    FROM quiz_session_answers a
    JOIN users u ON u.id = a.participant_id
    WHERE a.session_id = $1 AND a.question_index = $2
    ORDER BY a.submitted_at ASC, a.participant_id ASC;
    `,
    [sessionId, questionIndex]
  );

  return result.rows.map((row) => ({
    participantId: Number(row.participant_id),
    participantName: row.participant_name,
    participantAvatarDataUrl: row.participant_avatar_data_url || "",
    submittedAt: row.submitted_at,
    submittedAfterSeconds: Math.max(0, Number(row.submitted_after_seconds || 0)),
  }));
}

async function getLiveRuntimeData(context) {
  if (!context?.session?.id) {
    return {
      participants: [],
      answeredParticipants: [],
    };
  }

  const participants = await getLiveParticipants(context.session.id);
  const answeredParticipants =
    context.session.status === "running" &&
    context.session.isLiveStarted &&
    Number.isInteger(context.session.currentQuestionIndex) &&
    context.session.currentQuestionIndex >= 0
      ? await getLiveAnsweredParticipants(context.session.id, context.session.currentQuestionIndex)
      : [];

  return {
    participants,
    answeredParticipants,
  };
}

module.exports = {
  getLiveParticipants,
  getLiveAnsweredParticipants,
  getLiveRuntimeData,
};
