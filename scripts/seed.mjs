// Creates the first platform admin, only when the users table is empty.
// Credentials come from SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (never hardcoded).
// The platform admin then creates pharmacies (and their owners) from the web UI.
import { hash } from "@node-rs/argon2";
import pg from "pg";

const url = process.env.DATABASE_ADMIN_URL;
const username = (process.env.SEED_ADMIN_USERNAME ?? "").trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

if (!url) {
  console.error("DATABASE_ADMIN_URL is not set");
  process.exit(1);
}
if (!username || password.length < 12) {
  console.error("Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD (at least 12 characters) in .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log("Users already exist; nothing to seed.");
  } else {
    await client.query("INSERT INTO users (username, full_name, password_hash, is_platform_admin) VALUES ($1, $2, $3, true)", [
      username,
      "Platform Admin",
      await hash(password),
    ]);
    console.log(`Created platform admin "${username}".`);
  }
} finally {
  await client.end();
}
