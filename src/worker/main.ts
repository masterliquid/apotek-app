import { createDb } from "@/db/client";
import { runWorkerOnce } from "@/server/printing/worker";

// Long-running print worker: `node dist/print-worker.mjs`. Needs DATABASE_URL (the restricted app role).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const { db, pool } = createDb(url);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => (stopping = true));

console.log("Print worker started");
while (!stopping) {
  try {
    const attempted = await runWorkerOnce(db);
    if (attempted > 0) console.log(`Processed ${attempted} print job(s)`);
  } catch (error) {
    console.error("Print worker pass failed:", error instanceof Error ? error.message : error);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
console.log("Print worker stopped");
