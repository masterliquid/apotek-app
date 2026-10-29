import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

// One pool per server process (kept on globalThis so dev hot-reload does not open new pools).
const globalForDb = globalThis as unknown as { apotekDb?: Db };

export function getDb(): Db {
  if (!globalForDb.apotekDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.apotekDb = createDb(url).db;
  }
  return globalForDb.apotekDb;
}
