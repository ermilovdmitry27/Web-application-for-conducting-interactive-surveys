const { pool } = require("../db");
const { getLiveSessionContextById } = require("./context");

async function getLiveLeaderboard(sessionId) {
  const context = await getLiveSessionContextById(sessionId);
  if (!context) {
    return null;
  }

  const participantsResult = await pool.query(
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

  const scoreResult = await pool.query(
    `
    SELECT
      participant_id,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS score
    FROM quiz_session_answers
    WHERE session_id = $1
    GROUP BY participant_id;
    `,
    [sessionId]
  );
  const scoreMap = new Map(
    scoreResult.rows.map((row) => [Number(row.participant_id), Number(row.score || 0)])
  );

  const maxScore = Array.isArray(context.quiz.questions) ? context.quiz.questions.length : 0;
  const entries = participantsResult.rows
    .map((row) => {
      const participantId = Number(row.participant_id);
      const score = scoreMap.get(participantId) || 0;
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

module.exports = {
  getLiveLeaderboard,
};
