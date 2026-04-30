const { Pool } = require("pg");

let _pool;

/**
 * Lazy pool so `require("db")` does not exit during Vercel’s build when env is not loaded yet.
 * Supabase Postgres over TLS from Node still requires a Pool (or Client).
 */
function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL (see .env.example).");
  }
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return _pool;
}

module.exports = {
  get pool() {
    return getPool();
  },
};
