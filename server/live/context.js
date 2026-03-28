const { pool } = require("../db");
const { mapLiveSessionFromRow, mapLiveQuizFromRow } = require("../mappers");

function buildLiveContextFromRow(row, participantsCount = 0) {
  return {
    session: mapLiveSessionFromRow(row),
    quiz: mapLiveQuizFromRow(row),
    participantsCount: Number(participantsCount || 0),
  };
}

async function getLiveSessionContextById(sessionId, db = pool) {
  const result = await db.query(
    `
    SELECT
      s.id AS session_id,
      s.quiz_id AS session_quiz_id,
      s.organizer_id,
      s.status AS session_status,
      s.is_live_started,
      s.is_paused,
      s.current_question_index,
      s.question_order_json,
      s.current_question_started_at,
      s.paused_at,
      s.paused_remaining_seconds,
      s.started_at,
      s.finished_at,
      q.id AS quiz_id,
      q.organizer_id AS quiz_organizer_id,
      q.title AS quiz_title,
      q.description AS quiz_description,
      q.category AS quiz_category,
      q.join_code AS quiz_join_code,
      q.is_active AS quiz_is_active,
      q.time_limit_minutes AS quiz_time_limit_minutes,
      q.question_time_seconds AS quiz_question_time_seconds,
      q.max_attempts_per_participant AS quiz_max_attempts_per_participant,
      q.rules_json AS quiz_rules_json,
      q.questions_json AS quiz_questions_json,
      q.created_at AS quiz_created_at,
      (
        SELECT COUNT(*)::int
        FROM quiz_session_participants p
        WHERE p.session_id = s.id
      ) AS participants_count
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.id = $1
    LIMIT 1;
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildLiveContextFromRow(result.rows[0], result.rows[0].participants_count);
}

async function getLiveStateContextById(sessionId, db = pool) {
  const result = await db.query(
    `
    SELECT
      s.id AS session_id,
      s.quiz_id AS session_quiz_id,
      s.organizer_id,
      s.status AS session_status,
      s.is_live_started,
      s.is_paused,
      s.current_question_index,
      s.question_order_json,
      s.current_question_started_at,
      s.paused_at,
      s.paused_remaining_seconds,
      s.started_at,
      s.finished_at,
      q.id AS quiz_id,
      q.title AS quiz_title,
      q.join_code AS quiz_join_code,
      q.time_limit_minutes AS quiz_time_limit_minutes,
      q.question_time_seconds AS quiz_question_time_seconds,
      q.rules_json AS quiz_rules_json,
      q.questions_json AS quiz_questions_json
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.id = $1
    LIMIT 1;
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildLiveContextFromRow(result.rows[0]);
}

async function getLiveRuntimeContextById(sessionId, db = pool) {
  const result = await db.query(
    `
    SELECT
      s.id AS session_id,
      s.quiz_id AS session_quiz_id,
      s.organizer_id,
      s.status AS session_status,
      s.is_live_started,
      s.is_paused,
      s.current_question_index,
      s.question_order_json,
      s.current_question_started_at,
      s.paused_at,
      s.paused_remaining_seconds,
      s.started_at,
      s.finished_at,
      q.id AS quiz_id,
      q.organizer_id AS quiz_organizer_id,
      q.title AS quiz_title,
      q.join_code AS quiz_join_code,
      q.time_limit_minutes AS quiz_time_limit_minutes,
      q.question_time_seconds AS quiz_question_time_seconds,
      q.max_attempts_per_participant AS quiz_max_attempts_per_participant,
      q.rules_json AS quiz_rules_json,
      q.questions_json AS quiz_questions_json
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE s.id = $1
    LIMIT 1;
    `,
    [sessionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildLiveContextFromRow(result.rows[0]);
}

async function getRunningSessionContextByJoinCode(joinCode, db = pool) {
  const result = await db.query(
    `
    SELECT
      s.id AS session_id,
      s.quiz_id AS session_quiz_id,
      s.organizer_id,
      s.status AS session_status,
      s.is_live_started,
      s.is_paused,
      s.current_question_index,
      s.question_order_json,
      s.current_question_started_at,
      s.paused_at,
      s.paused_remaining_seconds,
      s.started_at,
      s.finished_at,
      q.id AS quiz_id,
      q.organizer_id AS quiz_organizer_id,
      q.title AS quiz_title,
      q.description AS quiz_description,
      q.category AS quiz_category,
      q.join_code AS quiz_join_code,
      q.is_active AS quiz_is_active,
      q.time_limit_minutes AS quiz_time_limit_minutes,
      q.question_time_seconds AS quiz_question_time_seconds,
      q.max_attempts_per_participant AS quiz_max_attempts_per_participant,
      q.rules_json AS quiz_rules_json,
      q.questions_json AS quiz_questions_json,
      q.created_at AS quiz_created_at,
      (
        SELECT COUNT(*)::int
        FROM quiz_session_participants p
        WHERE p.session_id = s.id
      ) AS participants_count
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE q.join_code = $1 AND s.status = 'running'
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1;
    `,
    [joinCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const session = mapLiveSessionFromRow(row);
  const quiz = mapLiveQuizFromRow(row);
  const participantsCount = Number(row.participants_count || 0);
  return {
    session,
    quiz,
    participantsCount,
  };
}

async function getRunningSessionRuntimeContextByJoinCode(joinCode, db = pool) {
  const result = await db.query(
    `
    SELECT
      s.id AS session_id,
      s.quiz_id AS session_quiz_id,
      s.organizer_id,
      s.status AS session_status,
      s.is_live_started,
      s.is_paused,
      s.current_question_index,
      s.question_order_json,
      s.current_question_started_at,
      s.paused_at,
      s.paused_remaining_seconds,
      s.started_at,
      s.finished_at,
      q.id AS quiz_id,
      q.organizer_id AS quiz_organizer_id,
      q.title AS quiz_title,
      q.join_code AS quiz_join_code,
      q.time_limit_minutes AS quiz_time_limit_minutes,
      q.question_time_seconds AS quiz_question_time_seconds,
      q.max_attempts_per_participant AS quiz_max_attempts_per_participant,
      q.rules_json AS quiz_rules_json,
      q.questions_json AS quiz_questions_json
    FROM quiz_sessions s
    JOIN quizzes q ON q.id = s.quiz_id
    WHERE q.join_code = $1 AND s.status = 'running'
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1;
    `,
    [joinCode]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildLiveContextFromRow(result.rows[0]);
}

module.exports = {
  getLiveSessionContextById,
  getLiveStateContextById,
  getLiveRuntimeContextById,
  getRunningSessionContextByJoinCode,
  getRunningSessionRuntimeContextByJoinCode,
};
