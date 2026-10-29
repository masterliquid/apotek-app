import { createDb } from "@/db/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

// `app` connects as the restricted apotek_app role (RLS applies), `admin` as the owner (for setup/assertions).
export function connectTestDbs() {
  const app = createDb(requireEnv("TEST_DATABASE_URL"));
  const admin = createDb(requireEnv("TEST_DATABASE_ADMIN_URL"));
  return {
    app: app.db,
    admin: admin.db,
    adminPool: admin.pool,
    close: async () => {
      await app.pool.end();
      await admin.pool.end();
    },
  };
}

let counter = 0;
export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

// Drizzle wraps driver errors ("Failed query: ..."); the Postgres error (code, message) is on `cause`.
export async function postgresErrorOf(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const pgError = ((error as { cause?: unknown }).cause ?? error) as { code?: string; message: string };
    return { code: pgError.code, message: pgError.message };
  }
  throw new Error("Expected the query to fail, but it succeeded");
}
