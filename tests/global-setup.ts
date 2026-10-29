import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Recreates the *test* database schema from migrations before the test run.
// Refuses to touch any database whose name does not end in "_test".
export default async function setup() {
  const url = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url) throw new Error("TEST_DATABASE_ADMIN_URL is not set (see .env.example)");
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_ADMIN_URL must point to a *_test database");

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
