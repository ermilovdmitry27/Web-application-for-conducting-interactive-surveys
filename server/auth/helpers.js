const crypto = require("crypto");

const { jwtSecret, jwtExpiresIn } = require("../config/env");

function parseExpiresIn(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 60 * 60 * 24 * 7;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  return amount * 60 * 60 * 24;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function signHmac(value) {
  return crypto.createHmac("sha256", jwtSecret).update(value).digest("base64url");
}

function createAuthToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseExpiresIn(jwtExpiresIn);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: now,
      exp,
    })
  );
  const signature = signHmac(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

function verifyAuthToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [header, payload, signature] = parts;
  const expectedSignature = signHmac(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (typeof decodedPayload.exp !== "number" || decodedPayload.exp <= now) {
    throw new Error("Token expired");
  }
  return decodedPayload;
}

function getBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== "string") {
    return "";
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return "";
  }
  return token;
}

function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: "Требуется токен авторизации." });
    }
    const decoded = verifyAuthToken(token);
    req.auth = decoded;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Недействительный токен." });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth || req.auth.role !== role) {
      return res.status(403).json({ message: "Недостаточно прав для этого действия." });
    }
    return next();
  };
}

module.exports = {
  parseExpiresIn,
  base64UrlEncode,
  signHmac,
  createAuthToken,
  verifyAuthToken,
  getBearerToken,
  authenticate,
  requireRole,
};
