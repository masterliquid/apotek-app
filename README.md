# Apotek

Pharmacy POS and inventory for multiple pharmacies. Rebuild of the legacy PHP/Yii app (see `../_audit/`).

Stack: Next.js 16 (App Router) + React + TypeScript, PostgreSQL 18, Drizzle ORM, Docker.

**Status:** foundation only (Phase 4). Login, roles, pharmacies, users and the full database schema exist. POS, products, purchasing, stock, reports and printing come next (Phase 5).

## Run with Docker

Requirements: Docker (Docker Desktop, Colima or OrbStack).

On this Mac the project uses its own Colima VM profile `apotek`, and the standalone `docker-compose` command
(the `docker compose` plugin is not installed). Start the VM and point commands at it:

```bash
colima start apotek
export DOCKER_CONTEXT=colima-apotek
```

Then use `docker-compose` wherever the commands below say `docker compose`.

```bash
cp .env.example .env        # then replace every change-me value
docker compose up -d --build
docker compose exec app node scripts/seed.mjs   # creates the first platform admin from SEED_ADMIN_*
```

Open http://localhost:3100 and sign in with `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` from `.env`.
As platform admin, create a pharmacy and its owner; then sign in as that owner.

- Migrations run automatically every time the app container starts.
- Data lives in the Docker volume `apotek_pgdata`. `docker compose down` keeps it; `docker compose down -v` **deletes all data**.
- Ports are bound to `127.0.0.1` only. To let phones on your own Wi-Fi use it, change the app port in `compose.yaml` to `"3100:3000"` and open `http://<this-computer's-IP>:3100`. Do this only on a network you trust.

Backup / restore:

```bash
docker compose exec -T db pg_dump -U apotek_owner -Fc apotek > backup.dump
```

```bash
docker compose exec -T db pg_restore -U apotek_owner -d apotek --clean --if-exists < backup.dump
```

## Sample data (to try the POS)

```bash
docker-compose exec app node dist/seed-sample.mjs
```

Creates the pharmacy "Apotek Contoh Sehat" (code `SAMPLE`) owned by your admin account (`SEED_ADMIN_USERNAME`), with 58 products, pack units, suppliers, customers and opening stock with batches and expiry dates. Safe to run twice (the second run changes nothing). On the host instead of Docker: `pnpm seed:sample`. Product list and where the prices come from: `docs/SAMPLE_DATA.md`.

## Import legacy data (old MySQL dump)

Reads a phpMyAdmin/mysqldump `.sql` file of the old app and writes it into ONE pharmacy of this app, in a single transaction (all or nothing). The dump file is only read.

```bash
docker cp /path/to/sqldump.sql apotek-app-1:/tmp/legacy.sql
docker-compose exec app node dist/import-legacy.mjs /tmp/legacy.sql --dry-run     # report only, writes nothing
docker-compose exec -e IMPORT_INTO_EXISTING=1 -e IMPORT_PHARMACY_CODE=TEST app node dist/import-legacy.mjs /tmp/legacy.sql
docker-compose exec app rm /tmp/legacy.sql
```

- `IMPORT_INTO_EXISTING=1` fills an existing **empty** pharmacy (code in `IMPORT_PHARMACY_CODE`); it refuses a pharmacy that already has products, sales or orders. Without it, a NEW pharmacy is created (`IMPORT_OWNER_PASSWORD` required; optional `IMPORT_OWNER_USERNAME`, `IMPORT_PHARMACY_NAME`).
- It prints a reconciliation (stock units and completed-sales total, legacy vs imported) and aborts without writing if they differ.
- Rules and assumptions: `docs/PHASE3_MIGRATION_MAPPING.md` and `docs/PROGRESS.md` ("Legacy import").

## Printing

Receipts are queued in the database and printed by the **print worker** (`print-worker` in `compose.yaml`), so a printer problem never blocks or undoes a sale.

1. **Printers** menu → add a printer: code (e.g. `KASIR1`), thermal (ESC/POS) or normal, paper 58 mm / 80 mm / A4, and connection:
   - *Network*: the printer's IP address and port (usually 9100). Works from Docker.
   - *Installed on the computer*: the **Printers** page lists names from this computer (macOS/Linux via CUPS `lpstat` / `lp`). Docker cannot see USB or installed printers, so run the app and worker on the host instead: `pnpm dev` (or `pnpm start`) and `pnpm build:worker && pnpm worker` (and stop the `print-worker` container).
2. **Use on this device** picks this browser's printer; finished sales print there automatically. **Test print** checks a printer without a sale.
3. No printer or worker? Sale → **Browser print** opens a receipt page for the browser's print dialog (58 / 80 mm), which works with any printer.

Failed jobs retry 3 times, then show a Retry button under *Recent print jobs*.

## Develop on your machine

Runs the database in Docker and the app with hot reload:

```bash
pnpm install
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev                    # http://localhost:3000
```

## Tests

Tests use the separate `apotek_test` database (created by the db container) and reset it on every run.

```bash
docker compose up -d db
pnpm test
```

## Layout

| Path | What |
|---|---|
| `src/db/schema.ts` | All tables. Changes → `pnpm db:generate` → review the SQL in `drizzle/` |
| `drizzle/` | SQL migrations (`0001_rls_and_app_role.sql` = pharmacy isolation) |
| `src/server/` | Business logic, framework-free and tested (`auth/`, `pricing.ts`, `tenant.ts`, …) |
| `src/lib/auth.ts` | Next.js glue: session cookie, `requirePharmacy()`, `requirePermission()` |
| `src/app/` | Pages and Server Actions |
| `tests/` | Vitest unit + database tests |
| `docs/PHASE3_MIGRATION_MAPPING.md` | Legacy MySQL → new schema mapping and import plan |

## Security model (short)

- Each pharmacy's data is separated twice: every query filters by the session's pharmacy, and Postgres Row-Level Security blocks anything else. The app connects as `apotek_app`, a role that cannot bypass RLS.
- Composite foreign keys `(pharmacy_id, id)` make cross-pharmacy references impossible.
- Passwords: Argon2id. Imported legacy SHA1 passwords are upgraded on first login.
- Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored.
- Stock can never go negative (database CHECK); the stock ledger is append-only for the app role.
