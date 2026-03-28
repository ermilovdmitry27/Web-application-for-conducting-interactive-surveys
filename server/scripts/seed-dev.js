#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const bcrypt = require("bcryptjs");

const { pool } = require("../db");
const {
  ensureUsersTable,
  ensureQuizzesTable,
  ensureQuizAttemptsTable,
  ensureLiveSessionsTable,
  ensureLiveSessionParticipantsTable,
  ensureLiveSessionAnswersTable,
} = require("../db-init");
const { sanitizeQuizRules, sanitizeQuizQuestions } = require("../quiz/sanitizers");

const SEED_USERS = {
  organizer: {
    firstName: "Ольга",
    lastName: "Орлова",
    middleName: "Игоревна",
    email: "organizer.dev@example.com",
    password: "Organizer123!",
    role: "organizer",
  },
  participant: {
    firstName: "Павел",
    lastName: "Петров",
    middleName: "Андреевич",
    email: "participant.dev@example.com",
    password: "Participant123!",
    role: "participant",
  },
};

const CLASSIC_QUIZ_JOIN_CODE = "CLASS1";
const LIVE_QUIZ_JOIN_CODE = "LIVE01";

function buildDisplayName({ firstName, lastName, middleName }) {
  return [lastName, firstName, middleName].filter(Boolean).join(" ");
}

function createClassicQuizSeed(organizerId) {
  const rules = sanitizeQuizRules({
    allowBackNavigation: true,
    showCorrectAfterAnswer: true,
    shuffleQuestions: false,
  });
  const questions = sanitizeQuizQuestions([
    {
      type: "text",
      prompt: "Столица Франции?",
      imageUrl: "",
      answerMode: "single",
      options: [
        { text: "Рим", isCorrect: false },
        { text: "Париж", isCorrect: true },
        { text: "Берлин", isCorrect: false },
      ],
    },
    {
      type: "text",
      prompt: "Какие технологии относятся к frontend?",
      imageUrl: "",
      answerMode: "multiple",
      options: [
        { text: "HTML", isCorrect: true },
        { text: "PostgreSQL", isCorrect: false },
        { text: "CSS", isCorrect: true },
        { text: "Redis", isCorrect: false },
      ],
    },
  ]);

  return {
    organizerId,
    title: "Dev Demo Quiz",
    description: "Тестовый обычный квиз для локальной ручной проверки кабинетов и попыток.",
    category: "science",
    joinCode: CLASSIC_QUIZ_JOIN_CODE,
    isActive: true,
    durationMinutes: 12,
    questionTimeSeconds: 30,
    maxAttemptsPerParticipant: 3,
    rules,
    questions,
  };
}

function createLiveQuizSeed(organizerId) {
  const rules = sanitizeQuizRules({
    allowBackNavigation: false,
    showCorrectAfterAnswer: false,
    shuffleQuestions: false,
  });
  const questions = sanitizeQuizQuestions([
    {
      type: "text",
      prompt: "Сколько будет 2 + 2?",
      imageUrl: "",
      answerMode: "single",
      options: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
    },
    {
      type: "text",
      prompt: "Какой протокол обычно используется браузером для загрузки страницы?",
      imageUrl: "",
      answerMode: "single",
      options: [
        { text: "HTTP", isCorrect: true },
        { text: "SMTP", isCorrect: false },
        { text: "SSH", isCorrect: false },
      ],
    },
    {
      type: "text",
      prompt: "Какой язык обычно выполняется в браузере?",
      imageUrl: "",
      answerMode: "single",
      options: [
        { text: "JavaScript", isCorrect: true },
        { text: "Python", isCorrect: false },
        { text: "Go", isCorrect: false },
      ],
    },
  ]);

  return {
    organizerId,
    title: "Dev Live Quiz",
    description: "Тестовый live-ready квиз для локального запуска live-сессии.",
    category: "it",
    joinCode: LIVE_QUIZ_JOIN_CODE,
    isActive: true,
    durationMinutes: 10,
    questionTimeSeconds: 25,
    maxAttemptsPerParticipant: 2,
    rules,
    questions,
  };
}

function buildClassicAttemptAnswers() {
  return [
    {
      questionId: 1,
      questionPosition: 1,
      prompt: "Столица Франции?",
      optionIds: [2],
      optionTexts: ["Париж"],
      isCorrect: true,
      submittedAfterSeconds: 9,
    },
    {
      questionId: 2,
      questionPosition: 2,
      prompt: "Какие технологии относятся к frontend?",
      optionIds: [1, 3],
      optionTexts: ["HTML", "CSS"],
      isCorrect: true,
      submittedAfterSeconds: 18,
    },
  ];
}

async function upsertUser(client, userSeed) {
  const passwordHash = await bcrypt.hash(userSeed.password, 12);
  const name = buildDisplayName(userSeed);
  const result = await client.query(
    `
    INSERT INTO users (
      name,
      first_name,
      last_name,
      middle_name,
      email,
      password_hash,
      role
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (email)
    DO UPDATE
    SET
      name = EXCLUDED.name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      middle_name = EXCLUDED.middle_name,
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role
    RETURNING id, email, role;
    `,
    [
      name,
      userSeed.firstName,
      userSeed.lastName,
      userSeed.middleName,
      userSeed.email,
      passwordHash,
      userSeed.role,
    ]
  );

  return result.rows[0];
}

async function upsertQuiz(client, quizSeed) {
  const result = await client.query(
    `
    INSERT INTO quizzes (
      organizer_id,
      title,
      description,
      category,
      join_code,
      is_active,
      time_limit_minutes,
      question_time_seconds,
      max_attempts_per_participant,
      rules_json,
      questions_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
    ON CONFLICT (join_code)
    DO UPDATE
    SET
      organizer_id = EXCLUDED.organizer_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      is_active = EXCLUDED.is_active,
      time_limit_minutes = EXCLUDED.time_limit_minutes,
      question_time_seconds = EXCLUDED.question_time_seconds,
      max_attempts_per_participant = EXCLUDED.max_attempts_per_participant,
      rules_json = EXCLUDED.rules_json,
      questions_json = EXCLUDED.questions_json
    RETURNING id, title, join_code;
    `,
    [
      quizSeed.organizerId,
      quizSeed.title,
      quizSeed.description,
      quizSeed.category,
      quizSeed.joinCode,
      quizSeed.isActive,
      quizSeed.durationMinutes,
      quizSeed.questionTimeSeconds,
      quizSeed.maxAttemptsPerParticipant,
      JSON.stringify(quizSeed.rules),
      JSON.stringify(quizSeed.questions),
    ]
  );

  return result.rows[0];
}

async function ensureClassicAttempt(client, { quizId, participantId }) {
  const existing = await client.query(
    `
    SELECT id
    FROM quiz_attempts
    WHERE quiz_id = $1 AND participant_id = $2 AND live_session_id IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 1;
    `,
    [quizId, participantId]
  );

  if (existing.rows.length > 0) {
    return {
      id: existing.rows[0].id,
      created: false,
    };
  }

  const answers = buildClassicAttemptAnswers();
  const insertResult = await client.query(
    `
    INSERT INTO quiz_attempts (
      quiz_id,
      participant_id,
      answers_json,
      score,
      max_score,
      time_spent_seconds
    )
    VALUES ($1, $2, $3::jsonb, $4, $5, $6)
    RETURNING id;
    `,
    [quizId, participantId, JSON.stringify(answers), 2, 2, 96]
  );

  return {
    id: insertResult.rows[0].id,
    created: true,
  };
}

async function ensureSchema() {
  await ensureUsersTable();
  await ensureQuizzesTable();
  await ensureLiveSessionsTable();
  await ensureLiveSessionParticipantsTable();
  await ensureLiveSessionAnswersTable();
  await ensureQuizAttemptsTable();
}

async function main() {
  await ensureSchema();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const organizer = await upsertUser(client, SEED_USERS.organizer);
    const participant = await upsertUser(client, SEED_USERS.participant);

    const classicQuiz = await upsertQuiz(client, createClassicQuizSeed(organizer.id));
    const liveQuiz = await upsertQuiz(client, createLiveQuizSeed(organizer.id));

    const classicAttempt = await ensureClassicAttempt(client, {
      quizId: classicQuiz.id,
      participantId: participant.id,
    });

    await client.query("COMMIT");

    console.log("Dev seed completed.");
    console.log("");
    console.log("Users:");
    console.log(`- organizer: ${SEED_USERS.organizer.email} / ${SEED_USERS.organizer.password}`);
    console.log(`- participant: ${SEED_USERS.participant.email} / ${SEED_USERS.participant.password}`);
    console.log("");
    console.log("Quizzes:");
    console.log(`- classic quiz: ${classicQuiz.title} (join code: ${classicQuiz.join_code})`);
    console.log(`- live-ready quiz: ${liveQuiz.title} (join code: ${liveQuiz.join_code})`);
    console.log("");
    console.log("Attempts:");
    console.log(
      `- classic participant attempt: ${classicAttempt.created ? "created" : "already existed"}`
    );
    console.log("");
    console.log("Notes:");
    console.log("- No live session rows were created intentionally.");
    console.log("- Start live flow from organizer cabinet using the seeded live-ready quiz.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Dev seed failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
