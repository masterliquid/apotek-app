import fs from "node:fs";
import pg from "pg";
import { hashPassword } from "@/server/auth/password";
import { normalizeUsername } from "@/server/auth/login";
import { importLegacy } from "./legacy-import";
import { parseMysqlDump } from "./mysql-dump";

// Usage: node dist/import-legacy.mjs <dump.sql> [--dry-run]
// Env:   DATABASE_ADMIN_URL (table owner; the import writes many rows across pharmacies' tables)
//        IMPORT_OWNER_PASSWORD (required unless --dry-run), IMPORT_OWNER_USERNAME (default "owner"),
//        IMPORT_PHARMACY_CODE (default "APOTEK-TEST"), IMPORT_PHARMACY_NAME (default "Apotek Test"),
//        IMPORT_RESTORE_RETURNS_FROM (default "2017-04-01")
//        IMPORT_INTO_EXISTING=1 fills the existing EMPTY pharmacy with code IMPORT_PHARMACY_CODE (no password needed)
const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_ADMIN_URL;
const intoExisting = process.env.IMPORT_INTO_EXISTING === "1";
const password = process.env.IMPORT_OWNER_PASSWORD;
if (!file || !url || (!dryRun && !intoExisting && !password)) {
  console.error("Usage: node dist/import-legacy.mjs <dump.sql> [--dry-run]\nNeeds DATABASE_ADMIN_URL, and IMPORT_OWNER_PASSWORD unless --dry-run or IMPORT_INTO_EXISTING=1.");
  process.exit(1);
}
if (!dryRun && !intoExisting && password!.length < 8) {
  console.error("IMPORT_OWNER_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const started = Date.now();
const data = parseMysqlDump(fs.readFileSync(file, "utf8"));
console.log(`Read ${[...data.values()].reduce((n, rows) => n + rows.length, 0)} rows from ${data.size} tables.`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const report = await importLegacy(client, data, {
    pharmacyCode: process.env.IMPORT_PHARMACY_CODE ?? "APOTEK-TEST",
    pharmacyName: process.env.IMPORT_PHARMACY_NAME ?? "Apotek Test",
    owner: { username: normalizeUsername(process.env.IMPORT_OWNER_USERNAME ?? "owner"), fullName: "Owner", passwordHash: dryRun || intoExisting ? null : await hashPassword(password!) },
    restoreReturnsFrom: process.env.IMPORT_RESTORE_RETURNS_FROM ?? "2017-04-01",
    dryRun,
    existingPharmacy: intoExisting,
  });
  console.log(dryRun ? "\nDRY RUN: nothing was written.\n" : "\nImport finished.\n");
  console.log("Rows to import / imported:");
  for (const [table, n] of Object.entries(report.counts)) if (n > 0) console.log(`  ${String(n).padStart(7)}  ${table}`);
  console.log("\nNotes:");
  for (const line of report.notes) console.log(`  ${line}`);
  if (report.reconciliation.length) {
    console.log("\nReconciliation (legacy → new):");
    for (const line of report.reconciliation) console.log(`  ${line}`);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
} catch (error) {
  console.error("\nImport FAILED, nothing was changed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
