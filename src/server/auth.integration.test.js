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

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

jest.setTimeout(30_000);

const rootDir = path.resolve(__dirname, "../..");
const dbPool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASSWORD || ""),
  database: process.env.DB_NAME || "quiz_app",
});

const testEmail = `integration.auth.${Date.now()}@example.com`;
const registrationPayload = {
  firstName: "Integration",
  lastName: "Smoke",
  email: testEmail,
  password: "Integration123!",
  role: "participant",
};

let serverProcess = null;
let serverPort = null;
let serverLogs = "";

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

function requestJson(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: serverPort,
        path: pathname,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
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

async function cleanupTestUser() {
  await dbPool.query("DELETE FROM users WHERE email = $1", [testEmail]);
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

describe("backend auth integration smoke", () => {
  beforeAll(async () => {
    serverPort = await getAvailablePort();
    await cleanupTestUser();

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
  });

  afterAll(async () => {
    await cleanupTestUser();
    await stopServer();
    await dbPool.end();
  });

  test("registers a new user successfully", async () => {
    const response = await requestJson("POST", "/api/auth/register", registrationPayload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      user: {
        email: testEmail,
        role: "participant",
        firstName: "Integration",
        lastName: "Smoke",
      },
    });
    expect(response.body.user).toHaveProperty("id");
    expect(response.body).toHaveProperty("createdAt");
  });

  test("logs in successfully after registration", async () => {
    const response = await requestJson("POST", "/api/auth/login", {
      email: testEmail,
      password: registrationPayload.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      role: "participant",
      user: {
        email: testEmail,
        role: "participant",
      },
    });
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(20);
  });

  test("returns conflict for duplicate registration", async () => {
    const response = await requestJson("POST", "/api/auth/register", registrationPayload);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      message: "Пользователь с таким e-mail уже существует.",
    });
  });

  test("returns unauthorized for wrong password", async () => {
    const response = await requestJson("POST", "/api/auth/login", {
      email: testEmail,
      password: "WrongPassword123!",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: "Неверный e-mail или пароль.",
    });
  });
});
