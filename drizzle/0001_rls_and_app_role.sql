-- Pharmacy data isolation, second layer (the first is the app always filtering by the session's pharmacy).
--
-- The app connects as role `apotek_app` (NOSUPERUSER, NOBYPASSRLS, not the table owner), so these
-- policies apply to every query it runs. Each transaction sets `app.pharmacy_id`; when it is not set,
-- current_setting(..., true) returns NULL and no rows match (fail closed).
--
-- Platform tables without pharmacy scoping (users, pharmacies, sessions) and memberships (needed at
-- login before a pharmacy is chosen) are excluded. tests/tenancy.test.ts asserts that every other table
-- with a pharmacy_id column has RLS enabled, so new tables cannot silently skip this.

CREATE OR REPLACE FUNCTION app_current_pharmacy_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.pharmacy_id', true), '')::bigint
$$;
--> statement-breakpoint

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'pharmacy_id'
      AND c.table_name NOT IN ('memberships', 'sessions')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format(
      'CREATE POLICY pharmacy_isolation ON %I USING (pharmacy_id = app_current_pharmacy_id()) WITH CHECK (pharmacy_id = app_current_pharmacy_id())',
      t.table_name
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- Runtime privileges for the app role (the role itself is created by docker/postgres-init, outside migrations,
-- because its password comes from the environment).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apotek_app') THEN
    GRANT USAGE ON SCHEMA public TO apotek_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apotek_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apotek_app;
    GRANT EXECUTE ON FUNCTION app_current_pharmacy_id() TO apotek_app;
    -- Tables created by later migrations get the same privileges automatically.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apotek_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO apotek_app;
  END IF;
END
$$;
--> statement-breakpoint

-- Stock is changed only through the ledger-aware service code; the ledger itself is append-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apotek_app') THEN
    REVOKE UPDATE, DELETE ON stock_movements FROM apotek_app;
  END IF;
END
$$;
