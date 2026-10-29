// Applies SQL migrations in ./drizzle as the database owner. Safe to run repeatedly.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
