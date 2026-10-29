#!/bin/sh
# Runs once, when the Postgres data volume is first created.
# Creates the restricted runtime role used by the app and an empty database for automated tests.
set -eu

psql -v ON_ERROR_STOP=1 -v app_pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE apotek_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE apotek_test;
EOSQL
