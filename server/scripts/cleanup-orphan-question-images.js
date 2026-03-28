#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs/promises");
const path = require("path");

const { pool, dbConfig } = require("../db");

const MANAGED_UPLOADS_PREFIX = "/uploads/questions/";
const QUESTION_UPLOADS_DIR = path.join(__dirname, "..", "uploads", "questions");
const GRACE_PERIOD_HOURS = 24;
const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;
const URL_PARSE_BASE = "http://local";

function normalizeManagedQuestionImagePath(rawImageUrl) {
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl.trim() : "";
  if (!imageUrl) {
    return "";
  }

  if (imageUrl.startsWith(MANAGED_UPLOADS_PREFIX)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl, URL_PARSE_BASE);
    return parsed.pathname.startsWith(MANAGED_UPLOADS_PREFIX) ? parsed.pathname : "";
  } catch (_error) {
    return "";
  }
}

function collectReferencedQuestionImagePaths(rows) {
  const referencedPaths = new Set();

  for (const row of rows) {
    const questions = Array.isArray(row?.questions_json) ? row.questions_json : [];
    for (const question of questions) {
      const normalizedPath = normalizeManagedQuestionImagePath(question?.imageUrl);
      if (normalizedPath) {
        referencedPaths.add(normalizedPath);
      }
    }
  }

  return referencedPaths;
}

async function readQuestionUploadFiles() {
  try {
    const entries = await fs.readdir(QUESTION_UPLOADS_DIR, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(QUESTION_UPLOADS_DIR, entry.name);
      const stats = await fs.stat(absolutePath);
      files.push({
        name: entry.name,
        absolutePath,
        managedPath: `${MANAGED_UPLOADS_PREFIX}${entry.name}`,
        mtimeMs: stats.mtimeMs,
      });
    }

    return files;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function main() {
  console.log("Cleaning orphaned local question images.");
  console.log(
    `Target DB: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (user: ${dbConfig.user})`
  );
  console.log(`Uploads dir: ${QUESTION_UPLOADS_DIR}`);
  console.log(`Grace period: ${GRACE_PERIOD_HOURS} hours`);

  const summary = {
    filesFound: 0,
    referenced: 0,
    orphaned: 0,
    deleted: 0,
    skippedByGracePeriod: 0,
    deleteFailures: 0,
  };

  try {
    const quizResult = await pool.query(`
      SELECT questions_json
      FROM quizzes;
    `);

    const referencedPaths = collectReferencedQuestionImagePaths(quizResult.rows);
    const uploadFiles = await readQuestionUploadFiles();
    const now = Date.now();

    summary.filesFound = uploadFiles.length;
    summary.referenced = referencedPaths.size;

    for (const file of uploadFiles) {
      if (referencedPaths.has(file.managedPath)) {
        continue;
      }

      summary.orphaned += 1;

      if (now - file.mtimeMs < GRACE_PERIOD_MS) {
        summary.skippedByGracePeriod += 1;
        continue;
      }

      try {
        await fs.unlink(file.absolutePath);
        summary.deleted += 1;
      } catch (error) {
        summary.deleteFailures += 1;
        console.error(`Failed to delete ${file.name}:`, error.message || error);
      }
    }

    console.log("Cleanup summary:");
    console.log(`- files found: ${summary.filesFound}`);
    console.log(`- referenced: ${summary.referenced}`);
    console.log(`- orphaned: ${summary.orphaned}`);
    console.log(`- deleted: ${summary.deleted}`);
    console.log(`- skipped by grace period: ${summary.skippedByGracePeriod}`);
    console.log(`- delete failures: ${summary.deleteFailures}`);

    if (summary.deleteFailures > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Orphan question image cleanup failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
