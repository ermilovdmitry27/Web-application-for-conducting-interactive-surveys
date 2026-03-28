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

ALTER TABLE users
ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS middle_name TEXT NOT NULL DEFAULT '';

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

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS question_time_seconds INTEGER NOT NULL DEFAULT 30;

UPDATE quizzes
SET question_time_seconds = COALESCE(question_time_seconds, 30)
WHERE question_time_seconds IS NULL OR question_time_seconds < 1;

CREATE INDEX IF NOT EXISTS idx_quizzes_organizer_id
ON quizzes (organizer_id);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  organizer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'finished')),
  is_live_started BOOLEAN NOT NULL DEFAULT FALSE,
  current_question_index INTEGER NOT NULL DEFAULT -1,
  question_order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  current_question_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  paused_remaining_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS is_live_started BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE quiz_sessions
ALTER COLUMN current_question_index SET DEFAULT -1;

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS question_order_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE quiz_sessions
SET is_live_started = TRUE
WHERE status = 'running' AND current_question_index >= 0;

UPDATE quiz_sessions
SET current_question_index = -1
WHERE status = 'running' AND is_live_started = FALSE AND current_question_index >= 0;

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS current_question_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS paused_remaining_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE quiz_sessions
SET current_question_started_at = COALESCE(current_question_started_at, started_at, NOW())
WHERE current_question_started_at IS NULL;

UPDATE quiz_sessions
SET is_paused = FALSE,
    paused_at = NULL,
    paused_remaining_seconds = 0
WHERE status = 'finished' AND (is_paused = TRUE OR paused_at IS NOT NULL OR paused_remaining_seconds <> 0);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id
ON quiz_sessions (quiz_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_running_quiz
ON quiz_sessions (quiz_id)
WHERE status = 'running';

CREATE TABLE IF NOT EXISTS quiz_session_participants (
  session_id BIGINT NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_session_participants_session_id
ON quiz_session_participants (session_id);

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

ALTER TABLE quiz_session_answers
ADD COLUMN IF NOT EXISTS submitted_after_seconds INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quiz_session_answers_session_id
ON quiz_session_answers (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_session_answers_unique
ON quiz_session_answers (session_id, participant_id, question_index);

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

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_participant_id
ON quiz_attempts (participant_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
ON quiz_attempts (quiz_id);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_live_session_id
ON quiz_attempts (live_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_live_session_participant
ON quiz_attempts (live_session_id, participant_id)
WHERE live_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS quiz_attempt_usages (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('classic', 'live')),
  quiz_attempt_id BIGINT UNIQUE REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  live_session_id BIGINT REFERENCES quiz_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempt_usages_quiz_participant
ON quiz_attempt_usages (quiz_id, participant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempt_usages_attempt_id
ON quiz_attempt_usages (quiz_attempt_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempt_usages_live_session_participant
ON quiz_attempt_usages (live_session_id, participant_id);
