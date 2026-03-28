const { pool } = require("../db");
const { getLiveRuntimeContextById } = require("./context");

async function getLiveLeaderboardParticipantRows(sessionId, db = pool) {
  const result = await db.query(
    `
    SELECT
      p.participant_id,
      p.joined_at,
      u.name AS participant_name,
      u.avatar_data_url AS participant_avatar_data_url,
      COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 0)::int AS score
    FROM quiz_session_participants p
    JOIN users u ON u.id = p.participant_id
    LEFT JOIN quiz_session_answers a
      ON a.session_id = p.session_id
      AND a.participant_id = p.participant_id
    WHERE p.session_id = $1
    GROUP BY p.participant_id, p.joined_at, u.name, u.avatar_data_url
    ORDER BY p.joined_at ASC, p.participant_id ASC;
    `,
    [sessionId]
  );

  return result.rows;
}

function mapLiveParticipantsFromLeaderboardRows(rows) {
  return rows.map((row) => ({
    participantId: Number(row.participant_id),
    participantName: row.participant_name,
    participantAvatarDataUrl: row.participant_avatar_data_url || "",
    joinedAt: row.joined_at,
  }));
}

function buildLiveLeaderboardFromRows(sessionId, context, rows) {
  const maxScore = Array.isArray(context?.quiz?.questions) ? context.quiz.questions.length : 0;
  const entries = rows
    .map((row) => {
      const participantId = Number(row.participant_id);
      const score = Number(row.score || 0);
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return {
        participantId,
        participantName: row.participant_name,
        participantAvatarDataUrl: row.participant_avatar_data_url || "",
        score,
        maxScore,
        percentage,
        joinedAt: row.joined_at,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const timeA = new Date(a.joinedAt).getTime();
      const timeB = new Date(b.joinedAt).getTime();
      return timeA - timeB;
    })
    .map((entry, index) => ({
      ...entry,
      place: index + 1,
    }));

  return {
    sessionId,
    quizId: context.quiz.id,
    quizTitle: context.quiz.title,
    maxScore,
    totalParticipants: entries.length,
    entries,
  };
}

async function getLiveLeaderboardSnapshot(
  sessionId,
  { db = pool, context = null, participantRows = null } = {}
) {
  const resolvedContext = context || await getLiveRuntimeContextById(sessionId, db);
  if (!resolvedContext) {
    return null;
  }

  const resolvedRows = participantRows || await getLiveLeaderboardParticipantRows(sessionId, db);
  return {
    context: resolvedContext,
    participantRows: resolvedRows,
    participants: mapLiveParticipantsFromLeaderboardRows(resolvedRows),
    leaderboard: buildLiveLeaderboardFromRows(sessionId, resolvedContext, resolvedRows),
  };
}

async function getLiveLeaderboard(sessionId, options) {
  const snapshot = await getLiveLeaderboardSnapshot(sessionId, options);
  return snapshot?.leaderboard || null;
}

module.exports = {
  getLiveLeaderboard,
  getLiveLeaderboardParticipantRows,
  getLiveLeaderboardSnapshot,
};
