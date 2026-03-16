const { Pool } = require("pg");

const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 5432);
const user = process.env.DB_USER || "postgres";
const password = String(process.env.DB_PASSWORD || "");
const database = process.env.DB_NAME || "quiz_app";

const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
});

module.exports = {
  pool,
  dbConfig: {
    host,
    port,
    user,
    database,
    hasPassword: password.length > 0,
  },
};
