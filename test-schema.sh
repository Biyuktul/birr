#!/usr/bin/env bash
# Validates schema.sql against a real throwaway PostgreSQL 16.
# Every statement in schema-test.sql that is MEANT to fail prints an ERROR;
# that is the pass condition. The run is correct when all nine guards fire.
set -e
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DIR=${DIR:-/var/tmp/pgt}
rm -rf "$DIR" && mkdir -p "$DIR/data" "$DIR/run" && chown -R postgres:postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-k $DIR/run -p 5433 -c listen_addresses=' -l $DIR/pg.log start -w" >/dev/null
trap "su postgres -c '$PGBIN/pg_ctl -D $DIR/data stop -m immediate' >/dev/null 2>&1 || true" EXIT

cp schema.sql schema-test.sql "$DIR/" && chmod 644 "$DIR"/*.sql
su postgres -c "psql -h $DIR/run -p 5433 -q -c 'create database birr;'"
su postgres -c "psql -h $DIR/run -p 5433 -d birr -q -v ON_ERROR_STOP=1 <<'EOF'
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;
EOF"
echo '=== schema.sql ==='
su postgres -c "psql -h $DIR/run -p 5433 -d birr -q -v ON_ERROR_STOP=1 -f $DIR/schema.sql"
echo 'applied clean'
echo '=== constraint guards ==='
su postgres -c "psql -h $DIR/run -p 5433 -d birr -tA -f $DIR/schema-test.sql" 2>&1 | grep -v '^INSERT 0 1$'
