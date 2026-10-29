import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { normalizeUsername } from "@/server/auth/login";
import { SampleAlreadyExistsError, seedSamplePharmacy } from "./sample";

// Run: node dist/seed-sample.mjs  (inside the app container: docker-compose exec app node dist/seed-sample.mjs)
// The sample pharmacy is owned by the user named in SEED_ADMIN_USERNAME, so you log in with your existing account.
const url = process.env.DATABASE_URL;
const username = normalizeUsername(process.env.SEED_ADMIN_USERNAME ?? "");
if (!url || !username) {
  console.error("DATABASE_URL and SEED_ADMIN_USERNAME must be set");
  process.exit(1);
}

const { db, pool } = createDb(url);
try {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (!owner) {
    console.error(`User "${username}" does not exist. Run the first-admin seed (scripts/seed.mjs) first.`);
    process.exit(1);
  }
  const summary = await seedSamplePharmacy(db, owner.id);
  console.log(`Sample pharmacy created: ${summary.products} products, ${summary.batches} batches, ${summary.suppliers} suppliers, ${summary.customers} customers.`);
  console.log(`Log in as "${username}" and open "Apotek Contoh Sehat".`);
} catch (error) {
  if (error instanceof SampleAlreadyExistsError) console.log(error.message);
  else throw error;
} finally {
  await pool.end();
}
