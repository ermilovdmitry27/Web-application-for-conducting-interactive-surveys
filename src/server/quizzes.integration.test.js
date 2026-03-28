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
const organizerEmail = `integration.organizer.${runId}@example.com`;
const participantEmail = `integration.participant.${runId}@example.com`;
const password = "Integration123!";

const createQuizPayload = {
  title: `Integration Quiz ${runId}`,
  description: "Quiz created by integration smoke",
  category: "science",
  isActive: true,
  durationMinutes: 12,
  questionTimeSeconds: 25,
  maxAttempts: 2,
  rules: {
    allowBackNavigation: true,
    showCorrectAfterAnswer: false,
    shuffleQuestions: false,
  },
  questions: [
    {
      type: "text",
      prompt: "First question",
      answerMode: "single",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
      ],
    },
    {
      type: "image",
      prompt: "Second question",
      imageUrl: "https://example.com/question.png",
      answerMode: "multiple",
      options: [
        { text: "C", isCorrect: true },
        { text: "D", isCorrect: true },
        { text: "E", isCorrect: false },
      ],
    },
  ],
};

let serverProcess = null;
let serverPort = null;
let serverLogs = "";
let organizerToken = "";
let participantToken = "";
let createdQuizId = null;

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

async function registerAndLogin(email, role) {
  const registerResponse = await requestJson("POST", "/api/auth/register", {
    firstName: role === "organizer" ? "Quiz" : "Participant",
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

(runBackendIntegrationTests ? describe : describe.skip)("backend quiz CRUD integration smoke", () => {
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
    organizerToken = await registerAndLogin(organizerEmail, "organizer");
    participantToken = await registerAndLogin(participantEmail, "participant");
  });

  afterAll(async () => {
    await cleanupTestEntities();
    await stopServer();
    await dbPool.end();
  });

  test("rejects unauthenticated create request", async () => {
    const response = await requestJson("POST", "/api/quizzes", createQuizPayload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: "Требуется токен авторизации.",
    });
  });

  test("participant cannot create quiz", async () => {
    const response = await requestJson("POST", "/api/quizzes", createQuizPayload, participantToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: "Недостаточно прав для этого действия.",
    });
  });

  test("organizer creates a valid quiz and receives expected payload", async () => {
    const response = await requestJson("POST", "/api/quizzes", createQuizPayload, organizerToken);

    expect(response.status).toBe(201);
    createdQuizId = response.body.quiz.id;

    expect(response.body.quiz).toMatchObject({
      title: createQuizPayload.title,
      description: createQuizPayload.description,
      category: createQuizPayload.category,
      isActive: true,
      durationMinutes: 12,
      questionTimeSeconds: 25,
      maxAttemptsPerParticipant: 2,
      questionCount: 2,
      rules: createQuizPayload.rules,
    });
    expect(response.body.quiz).toHaveProperty("id");
    expect(response.body.quiz).toHaveProperty("organizerId");
    expect(response.body.quiz).toHaveProperty("joinCode");
    expect(response.body.quiz.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(response.body.quiz.questions).toEqual([
      {
        id: 1,
        type: "text",
        prompt: "First question",
        imageUrl: "",
        answerMode: "single",
        options: [
          { id: 1, text: "A", isCorrect: true },
          { id: 2, text: "B", isCorrect: false },
        ],
      },
      {
        id: 2,
        type: "image",
        prompt: "Second question",
        imageUrl: "https://example.com/question.png",
        answerMode: "multiple",
        options: [
          { id: 1, text: "C", isCorrect: true },
          { id: 2, text: "D", isCorrect: true },
          { id: 3, text: "E", isCorrect: false },
        ],
      },
    ]);

  });

  test("deleting classic history does not restore attempts limit", async () => {
    const limitedQuizPayload = {
      title: `Limited Quiz ${runId}`,
      description: "Single attempt quiz",
      category: "math",
      isActive: true,
      durationMinutes: 8,
      questionTimeSeconds: 20,
      maxAttempts: 1,
      rules: {
        allowBackNavigation: false,
        showCorrectAfterAnswer: false,
        shuffleQuestions: false,
      },
      questions: [
        {
          type: "text",
          prompt: "Only one try",
          answerMode: "single",
          options: [
            { text: "Right", isCorrect: true },
            { text: "Wrong", isCorrect: false },
          ],
        },
      ],
    };

    const createResponse = await requestJson(
      "POST",
      "/api/quizzes",
      limitedQuizPayload,
      organizerToken
    );

    expect(createResponse.status).toBe(201);
    const limitedQuizId = createResponse.body.quiz.id;
    const limitedJoinCode = createResponse.body.quiz.joinCode;

    const firstJoinResponse = await requestJson(
      "POST",
      "/api/quizzes/join",
      { joinCode: limitedJoinCode },
      participantToken
    );

    expect(firstJoinResponse.status).toBe(200);
    expect(firstJoinResponse.body).toMatchObject({
      attemptsUsed: 0,
      attemptsLimit: 1,
      attemptsRemaining: 1,
    });

    const submitResponse = await requestJson(
      "POST",
      `/api/quizzes/${limitedQuizId}/submit`,
      {
        answers: [{ questionId: 1, optionIds: [1] }],
        spentSeconds: 7,
      },
      participantToken
    );

    expect(submitResponse.status).toBe(201);

    const deleteResponse = await requestJson(
      "DELETE",
      `/api/attempts/mine/${limitedQuizId}`,
      null,
      participantToken
    );

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toMatchObject({
      deleted: true,
      quizId: Number(limitedQuizId),
    });

    const secondJoinResponse = await requestJson(
      "POST",
      "/api/quizzes/join",
      { joinCode: limitedJoinCode },
      participantToken
    );

    expect(secondJoinResponse.status).toBe(403);
    expect(secondJoinResponse.body).toEqual({
      message: "Лимит попыток исчерпан (1).",
    });
  });

  test("participant cannot edit organizer quiz", async () => {
    const response = await requestJson(
      "PUT",
      `/api/quizzes/${createdQuizId}`,
      {
        ...createQuizPayload,
        title: "Participant edit attempt",
      },
      participantToken
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: "Недостаточно прав для этого действия.",
    });
  });

  test("organizer updates quiz and changed fields are returned", async () => {
    const updatePayload = {
      ...createQuizPayload,
      title: `Updated Quiz ${runId}`,
      description: "Updated integration quiz",
      category: "history",
      isActive: false,
      durationMinutes: 20,
      questionTimeSeconds: 35,
      maxAttempts: 3,
      rules: {
        allowBackNavigation: false,
        showCorrectAfterAnswer: true,
        shuffleQuestions: true,
      },
      questions: [
        {
          type: "text",
          prompt: "Updated question",
          answerMode: "single",
          options: [
            { text: "Yes", isCorrect: true },
            { text: "No", isCorrect: false },
          ],
        },
      ],
    };

    const response = await requestJson(
      "PUT",
      `/api/quizzes/${createdQuizId}`,
      updatePayload,
      organizerToken
    );

    expect(response.status).toBe(200);
    expect(response.body.quiz).toMatchObject({
      id: createdQuizId,
      title: updatePayload.title,
      description: updatePayload.description,
      category: updatePayload.category,
      isActive: false,
      durationMinutes: 20,
      questionTimeSeconds: 35,
      maxAttemptsPerParticipant: 3,
      questionCount: 1,
      rules: updatePayload.rules,
    });
    expect(response.body.quiz.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(response.body.quiz.questions).toEqual([
      {
        id: 1,
        type: "text",
        prompt: "Updated question",
        imageUrl: "",
        answerMode: "single",
        options: [
          { id: 1, text: "Yes", isCorrect: true },
          { id: 2, text: "No", isCorrect: false },
        ],
      },
    ]);
  });
});
