#!/usr/bin/env bash
# Runs migrations 0001-0003 + SQL tests against a throwaway local Postgres database (needs psql + a server).
# usage: PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=qrtest
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB" postgres 2>/dev/null
for f in tests/stub_supabase.sql migrations/0001_schema.sql migrations/0002_rls.sql migrations/0003_functions.sql tests/rls_and_orders.sql; do
  psql -q -v ON_ERROR_STOP=1 "$DB" -f "$f" 2>&1 | grep -E "PASS|FAIL|ERROR|PASSED" || true
done
