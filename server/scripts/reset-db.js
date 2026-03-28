#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const { pool, dbConfig } = require("../db");
const {
  ensureUsersTable,
  ensureQuizzesTable,
  ensureQuizAttemptsTable,
  ensureLiveSessionsTable,
  ensureLiveSessionParticipantsTable,
  ensureLiveSessionAnswersTable,
} = require("../db-init");

const PROJECT_TABLES = [
  "quiz_session_answers",
  "quiz_session_participants",
  "quiz_sessions",
  "quiz_attempts",
  "quizzes",
  "users",
];

async function ensureSchema() {
  await ensureUsersTable();
  await ensureQuizzesTable();
  await ensureLiveSessionsTable();
  await ensureLiveSessionParticipantsTable();
  await ensureLiveSessionAnswersTable();
  await ensureQuizAttemptsTable();
}

async function dropProjectTables() {
  for (const tableName of PROJECT_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
  }
}

async function main() {
  console.log("Resetting local quiz-app database.");
  console.log(
    `Target DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (user: ${dbConfig.user})`
  );
  console.log(`Dropping project tables: ${PROJECT_TABLES.join(", ")}`);

  try {
    await dropProjectTables();
    await ensureSchema();
    console.log("Database reset completed.");
    console.log("Project schema was recreated successfully.");
    console.log("Run `npm run seed:dev` to load dev test data.");
  } catch (error) {
    console.error("Database reset failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
