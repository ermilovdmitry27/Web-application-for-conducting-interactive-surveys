const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}

const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

jest.setTimeout(30_000);
const runBackendIntegrationTests = process.env.RUN_BACKEND_INTEGRATION_TESTS === "1";

const rootDir = path.resolve(__dirname, "../..");
const dbPool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASSWORD || ""),
  database: process.env.DB_NAME || "quiz_app",
});

const runId = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
const organizerEmail = `integration.live.organizer.${runId}@example.com`;
const participantEmail = `integration.live.participant.${runId}@example.com`;
const password = "Integration123!";

const createQuizPayload = {
  title: `Live Integration Quiz ${runId}`,
  description: "Live smoke quiz",
  category: "science",
  isActive: true,
  durationMinutes: 10,
  questionTimeSeconds: 60,
  maxAttempts: 1,
  rules: {
    allowBackNavigation: false,
    showCorrectAfterAnswer: true,
    shuffleQuestions: false,
  },
  questions: [
    {
      type: "text",
      prompt: "2 + 2 = ?",
      answerMode: "single",
      options: [
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
    },
  ],
};

let serverProcess = null;
let serverPort = null;
let serverLogs = "";
let organizerToken = "";
let participantToken = "";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", reject);
    tester.listen(0, "127.0.0.1", () => {
      const address = tester.address();
      const port = typeof address === "object" && address ? address.port : null;
      tester.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function requestJson(method, pathname, body, token = "") {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};

    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: serverPort,
        path: pathname,
        method,
        headers,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch (_error) {
            json = raw;
          }
          resolve({
            status: response.statusCode,
            body: json,
          });
        });
      }
    );

    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function waitForServerReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(`Backend exited early.\n${serverLogs}`);
    }
    try {
      const response = await requestJson("GET", "/api/health");
      if (response.status === 200 && response.body?.ok && response.body?.ready) {
        return;
      }
    } catch (_error) {
      // Wait until server starts listening.
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for backend readiness.\n${serverLogs}`);
}

async function cleanupTestEntities() {
  await dbPool.query("DELETE FROM users WHERE email = ANY($1::text[])", [[organizerEmail, participantEmail]]);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (serverProcess && serverProcess.exitCode === null) {
        serverProcess.kill("SIGKILL");
      }
    }, 5_000);

    serverProcess.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    serverProcess.kill("SIGTERM");
  });
}

async function registerAndLogin(email, role, firstName) {
  const registerResponse = await requestJson("POST", "/api/auth/register", {
    firstName,
    lastName: "Integration",
    email,
    password,
    role,
  });

  expect(registerResponse.status).toBe(201);

  const loginResponse = await requestJson("POST", "/api/auth/login", {
    email,
    password,
  });

  expect(loginResponse.status).toBe(200);
  expect(typeof loginResponse.body?.token).toBe("string");
  return loginResponse.body.token;
}

(runBackendIntegrationTests ? describe : describe.skip)("backend live integration smoke", () => {
  beforeAll(async () => {
    serverPort = await getAvailablePort();
    await cleanupTestEntities();

    serverProcess = spawn("node", ["server/index.js"], {
      cwd: rootDir,
      env: {
        ...process.env,
        API_PORT: String(serverPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (chunk) => {
      serverLogs += String(chunk);
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverLogs += String(chunk);
    });

    await waitForServerReady();
    organizerToken = await registerAndLogin(organizerEmail, "organizer", "Live");
    participantToken = await registerAndLogin(participantEmail, "participant", "Player");
  });

  afterAll(async () => {
    await cleanupTestEntities();
    await stopServer();
    await dbPool.end();
  });

  test("runs minimal live flow through real backend routes", async () => {
    const createQuizResponse = await requestJson(
      "POST",
      "/api/quizzes",
      createQuizPayload,
      organizerToken
    );

    expect(createQuizResponse.status).toBe(201);
    expect(createQuizResponse.body.quiz).toMatchObject({
      title: createQuizPayload.title,
      joinCode: expect.any(String),
      questionCount: 1,
    });

    const quizId = createQuizResponse.body.quiz.id;
    const joinCode = createQuizResponse.body.quiz.joinCode;

    const createSessionResponse = await requestJson(
      "POST",
      `/api/quizzes/${quizId}/live/start`,
      {},
      organizerToken
    );

    expect([200, 201]).toContain(createSessionResponse.status);
    expect(createSessionResponse.body.session).toMatchObject({
      quizId,
      joinCode,
      status: "running",
      isLiveStarted: false,
      currentQuestionIndex: -1,
    });

    const sessionId = createSessionResponse.body.session.sessionId;

    const startSessionResponse = await requestJson(
      "POST",
      `/api/live-sessions/${sessionId}/start`,
      {},
      organizerToken
    );

    expect(startSessionResponse.status).toBe(200);
    expect(startSessionResponse.body.session).toMatchObject({
      sessionId,
      quizId,
      status: "running",
      isLiveStarted: true,
      isPaused: false,
      currentQuestionIndex: 0,
      questionCount: 1,
      currentQuestion: {
        index: 0,
        prompt: "2 + 2 = ?",
      },
    });
    expect(startSessionResponse.body.session.currentQuestion.options[0]).toHaveProperty("isCorrect");

    const joinResponse = await requestJson(
      "POST",
      "/api/live/join",
      { joinCode },
      participantToken
    );

    expect(joinResponse.status).toBe(200);
    expect(joinResponse.body).toMatchObject({
      attemptsUsed: 0,
      attemptsLimit: 1,
      attemptsRemaining: 1,
      session: {
        sessionId,
        quizId,
        joinCode,
        status: "running",
        isLiveStarted: true,
        currentQuestionIndex: 0,
        currentQuestion: {
          index: 0,
          prompt: "2 + 2 = ?",
        },
      },
    });
    expect(joinResponse.body.session.currentQuestion.options[0]).not.toHaveProperty("isCorrect");

    const answerResponse = await requestJson(
      "POST",
      `/api/live-sessions/${sessionId}/answer`,
      {
        questionIndex: joinResponse.body.session.currentQuestionIndex,
        optionIds: [1],
      },
      participantToken
    );

    expect(answerResponse.status).toBe(201);
    expect(answerResponse.body).toEqual({
      accepted: true,
      questionIndex: 0,
      showCorrectAfterAnswer: true,
      isCorrect: true,
    });

    const resubmitResponse = await requestJson(
      "POST",
      `/api/live-sessions/${sessionId}/answer`,
      {
        questionIndex: joinResponse.body.session.currentQuestionIndex,
        optionIds: [2],
      },
      participantToken
    );

    expect(resubmitResponse.status).toBe(409);
    expect(resubmitResponse.body).toEqual({
      message: "Ответ на этот вопрос уже принят. Изменение ответа отключено организатором.",
    });

    const finishResponse = await requestJson(
      "POST",
      `/api/live-sessions/${sessionId}/finish`,
      {},
      organizerToken
    );

    expect(finishResponse.status).toBe(200);
    expect(finishResponse.body.session).toMatchObject({
      sessionId,
      quizId,
      status: "finished",
      isLiveStarted: true,
    });
    expect(Number(finishResponse.body.leaderboard.sessionId)).toBe(Number(sessionId));
    expect(Number(finishResponse.body.leaderboard.quizId)).toBe(Number(quizId));
    expect(finishResponse.body.leaderboard).toMatchObject({
      quizTitle: createQuizPayload.title,
      maxScore: 1,
      totalParticipants: 1,
    });
    expect(finishResponse.body.leaderboard.entries).toHaveLength(1);
    expect(finishResponse.body.leaderboard.entries[0]).toMatchObject({
      participantName: "Integration Player",
      score: 1,
      maxScore: 1,
      percentage: 100,
      place: 1,
    });

    const leaderboardResponse = await requestJson(
      "GET",
      `/api/live-sessions/${sessionId}/leaderboard`,
      null,
      participantToken
    );

    expect(leaderboardResponse.status).toBe(200);
    expect(Number(leaderboardResponse.body.leaderboard.sessionId)).toBe(Number(sessionId));
    expect(Number(leaderboardResponse.body.leaderboard.quizId)).toBe(Number(quizId));
    expect(leaderboardResponse.body.leaderboard).toMatchObject({
      totalParticipants: 1,
    });
    expect(leaderboardResponse.body.leaderboard.entries[0]).toMatchObject({
      participantName: "Integration Player",
      score: 1,
      place: 1,
    });
  });
});
