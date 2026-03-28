const {
  MIN_QUIZ_QUESTION_TIME_SECONDS,
  MAX_QUIZ_QUESTION_TIME_SECONDS,
  DEFAULT_QUIZ_QUESTION_TIME_SECONDS,
} = require("./config/env");
const { pool } = require("./db");

async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      middle_name TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('participant', 'organizer')),
      avatar_data_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS middle_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_data_url TEXT;
  `);
}

async function ensureQuizzesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id BIGSERIAL PRIMARY KEY,
      organizer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      join_code TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      question_time_seconds INTEGER NOT NULL DEFAULT 30,
      max_attempts_per_participant INTEGER NOT NULL DEFAULT 1,
      rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS join_code TEXT;
  `);
  await pool.query(`
    UPDATE quizzes
    SET join_code = 'LEGACY-' || id::text
    WHERE join_code IS NULL OR join_code = '';
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ALTER COLUMN join_code SET NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER NOT NULL DEFAULT 15;
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS question_time_seconds INTEGER NOT NULL DEFAULT 30;
  `);
  await pool.query(
    `
    UPDATE quizzes
    SET question_time_seconds = GREATEST($1, LEAST($2, COALESCE(question_time_seconds, $3)))
    WHERE question_time_seconds IS NULL OR question_time_seconds < $1 OR question_time_seconds > $2;
    `,
    [
      MIN_QUIZ_QUESTION_TIME_SECONDS,
      MAX_QUIZ_QUESTION_TIME_SECONDS,
      DEFAULT_QUIZ_QUESTION_TIME_SECONDS,
    ]
  );
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS max_attempts_per_participant INTEGER NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    UPDATE quizzes
    SET max_attempts_per_participant = 1
    WHERE max_attempts_per_participant IS NULL OR max_attempts_per_participant < 1;
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS rules_json JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS questions_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quizzes_organizer_id
    ON quizzes (organizer_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_join_code
    ON quizzes (join_code);
  `);
}

async function ensureQuizAttemptsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGSERIAL PRIMARY KEY,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      score INTEGER NOT NULL DEFAULT 0,
      max_score INTEGER NOT NULL DEFAULT 0,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      live_session_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS live_session_id BIGINT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_participant_id
    ON quiz_attempts (participant_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
    ON quiz_attempts (quiz_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_live_session_id
    ON quiz_attempts (live_session_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_live_session_participant
    ON quiz_attempts (live_session_id, participant_id)
    WHERE live_session_id IS NOT NULL;
  `);
}

async function ensureQuizAttemptUsagesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempt_usages (
      id BIGSERIAL PRIMARY KEY,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('classic', 'live')),
      quiz_attempt_id BIGINT UNIQUE REFERENCES quiz_attempts(id) ON DELETE SET NULL,
      live_session_id BIGINT REFERENCES quiz_sessions(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS quiz_id BIGINT;
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS participant_id BIGINT;
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'classic';
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS quiz_attempt_id BIGINT;
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS live_session_id BIGINT;
  `);
  await pool.query(`
    ALTER TABLE quiz_attempt_usages
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_attempt_usages_quiz_participant
    ON quiz_attempt_usages (quiz_id, participant_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempt_usages_attempt_id
    ON quiz_attempt_usages (quiz_attempt_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempt_usages_live_session_participant
    ON quiz_attempt_usages (live_session_id, participant_id);
  `);
  await pool.query(`
    INSERT INTO quiz_attempt_usages (
      quiz_id,
      participant_id,
      source,
      quiz_attempt_id,
      live_session_id,
      created_at
    )
    SELECT
      qa.quiz_id,
      qa.participant_id,
      CASE WHEN qa.live_session_id IS NULL THEN 'classic' ELSE 'live' END,
      qa.id,
      qa.live_session_id,
      qa.created_at
    FROM quiz_attempts qa
    ON CONFLICT (quiz_attempt_id) DO NOTHING;
  `);
}

async function ensureLiveSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id BIGSERIAL PRIMARY KEY,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      organizer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('running', 'finished')),
      is_live_started BOOLEAN NOT NULL DEFAULT FALSE,
      is_paused BOOLEAN NOT NULL DEFAULT FALSE,
      current_question_index INTEGER NOT NULL DEFAULT -1,
      question_order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_question_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paused_at TIMESTAMPTZ,
      paused_remaining_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS is_live_started BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ALTER COLUMN current_question_index SET DEFAULT -1;
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS question_order_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS current_question_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
  `);
  await pool.query(`
    ALTER TABLE quiz_sessions
    ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    UPDATE quiz_sessions
    SET is_live_started = TRUE
    WHERE status = 'running' AND current_question_index >= 0;
  `);
  await pool.query(`
    UPDATE quiz_sessions
    SET current_question_index = -1
    WHERE status = 'running' AND is_live_started = FALSE AND current_question_index >= 0;
  `);
  await pool.query(`
    UPDATE quiz_sessions
    SET
      is_paused = FALSE,
      paused_at = NULL,
      paused_remaining_seconds = 0
    WHERE status = 'finished';
  `);
  await pool.query(`
    UPDATE quiz_sessions
    SET current_question_started_at = COALESCE(current_question_started_at, started_at, NOW())
  WHERE current_question_started_at IS NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id
    ON quiz_sessions (quiz_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_running_quiz
    ON quiz_sessions (quiz_id)
    WHERE status = 'running';
  `);
}

async function ensureLiveSessionParticipantsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_session_participants (
      session_id BIGINT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, participant_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_session_participants_session_id
    ON quiz_session_participants (session_id);
  `);
}

async function ensureLiveSessionAnswersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_session_answers (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_index INTEGER NOT NULL,
      selected_option_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_after_seconds INTEGER NOT NULL DEFAULT 0,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE quiz_session_answers
    ADD COLUMN IF NOT EXISTS submitted_after_seconds INTEGER NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quiz_session_answers_session_id
    ON quiz_session_answers (session_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_session_answers_unique
    ON quiz_session_answers (session_id, participant_id, question_index);
  `);
}

module.exports = {
  ensureUsersTable,
  ensureQuizzesTable,
  ensureQuizAttemptsTable,
  ensureQuizAttemptUsagesTable,
  ensureLiveSessionsTable,
  ensureLiveSessionParticipantsTable,
  ensureLiveSessionAnswersTable,
};
