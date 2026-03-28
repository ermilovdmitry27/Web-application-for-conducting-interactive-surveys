const { pool } = require("../db");

async function getUsedQuizAttemptsCount(quizId, participantId, db = pool) {
  const result = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM quiz_attempt_usages
    WHERE quiz_id = $1 AND participant_id = $2;
    `,
    [quizId, participantId]
  );

  return Number(result.rows[0]?.total || 0);
}

async function recordClassicAttemptUsage(
  { quizId, participantId, quizAttemptId, createdAt = null },
  db = pool
) {
  if (!quizId || !participantId || !quizAttemptId) {
    return;
  }

  await db.query(
    `
    INSERT INTO quiz_attempt_usages (
      quiz_id,
      participant_id,
      source,
      quiz_attempt_id,
      created_at
    )
    VALUES ($1, $2, 'classic', $3, COALESCE($4::timestamptz, NOW()))
    ON CONFLICT (quiz_attempt_id) DO NOTHING;
    `,
    [quizId, participantId, quizAttemptId, createdAt]
  );
}

async function recordLiveAttemptUsages(rows = [], db = pool) {
  const payloadRows = Array.isArray(rows)
    ? rows
        .filter(
          (row) =>
            row &&
            row.quizId &&
            row.participantId &&
            row.liveSessionId
        )
        .map((row) => ({
          quiz_id: row.quizId,
          participant_id: row.participantId,
          live_session_id: row.liveSessionId,
          created_at: row.createdAt || null,
        }))
    : [];

  if (payloadRows.length === 0) {
    return;
  }

  await db.query(
    `
    WITH usage_payload AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS payload(
        quiz_id bigint,
        participant_id bigint,
        live_session_id bigint,
        created_at timestamptz
      )
    )
    INSERT INTO quiz_attempt_usages (
      quiz_id,
      participant_id,
      source,
      live_session_id,
      created_at
    )
    SELECT
      quiz_id,
      participant_id,
      'live',
      live_session_id,
      COALESCE(created_at, NOW())
    FROM usage_payload
    ON CONFLICT (live_session_id, participant_id) DO NOTHING;
    `,
    [JSON.stringify(payloadRows)]
  );
}

module.exports = {
  getUsedQuizAttemptsCount,
  recordClassicAttemptUsage,
  recordLiveAttemptUsages,
};
