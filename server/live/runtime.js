const { pool } = require("../db");

async function getLiveParticipantsSnapshot(sessionId, questionIndex = null, db = pool) {
  const shouldIncludeAnswerState = Number.isInteger(questionIndex) && questionIndex >= 0;
  const result = await db.query(
    `
    SELECT
      p.participant_id,
      p.joined_at,
      u.name AS participant_name,
      u.avatar_data_url AS participant_avatar_data_url,
      a.submitted_at,
      a.submitted_after_seconds
    FROM quiz_session_participants p
    JOIN users u ON u.id = p.participant_id
    LEFT JOIN quiz_session_answers a
      ON a.session_id = p.session_id
      AND a.participant_id = p.participant_id
      AND ($2::int IS NOT NULL AND a.question_index = $2)
    WHERE p.session_id = $1
    ORDER BY p.joined_at ASC, p.participant_id ASC;
    `,
    [sessionId, shouldIncludeAnswerState ? questionIndex : null]
  );

  return result.rows;
}

async function getLiveParticipants(sessionId, db = pool) {
  const rows = await getLiveParticipantsSnapshot(sessionId, null, db);
  return rows.map((row) => ({
    participantId: Number(row.participant_id),
    participantName: row.participant_name,
    participantAvatarDataUrl: row.participant_avatar_data_url || "",
    joinedAt: row.joined_at,
  }));
}

async function getLiveAnsweredParticipants(sessionId, questionIndex, db = pool) {
  if (!Number.isInteger(questionIndex) || questionIndex < 0) {
    return [];
  }

  const rows = await getLiveParticipantsSnapshot(sessionId, questionIndex, db);
  return rows
    .filter((row) => row.submitted_at)
    .map((row) => ({
      participantId: Number(row.participant_id),
      participantName: row.participant_name,
      participantAvatarDataUrl: row.participant_avatar_data_url || "",
      submittedAt: row.submitted_at,
      submittedAfterSeconds: Math.max(0, Number(row.submitted_after_seconds || 0)),
    }));
}

async function getLiveRuntimeData(context, db = pool) {
  if (!context?.session?.id) {
    return {
      participants: [],
      answeredParticipants: [],
    };
  }

  const questionIndex =
    context.session.status === "running" &&
    context.session.isLiveStarted &&
    Number.isInteger(context.session.currentQuestionIndex) &&
    context.session.currentQuestionIndex >= 0
      ? context.session.currentQuestionIndex
      : null;
  const snapshotRows = await getLiveParticipantsSnapshot(context.session.id, questionIndex, db);
  const participants = snapshotRows.map((row) => ({
    participantId: Number(row.participant_id),
    participantName: row.participant_name,
    participantAvatarDataUrl: row.participant_avatar_data_url || "",
    joinedAt: row.joined_at,
  }));
  const answeredParticipants = questionIndex == null
    ? []
    : snapshotRows
        .filter((row) => row.submitted_at)
        .map((row) => ({
          participantId: Number(row.participant_id),
          participantName: row.participant_name,
          participantAvatarDataUrl: row.participant_avatar_data_url || "",
          submittedAt: row.submitted_at,
          submittedAfterSeconds: Math.max(0, Number(row.submitted_after_seconds || 0)),
        }));

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
