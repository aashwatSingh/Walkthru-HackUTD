#!/usr/bin/env node
// Database security tests: loads every migration into a throwaway Postgres database (with a small Supabase
// look-alike: roles, JWT claims, storage tables, Supabase's default grants) and runs attacks against it.
//   npm run test:sql
// Needs `psql` and a local Postgres you can create databases on. Point SQL_TEST_URL at it
// (default postgres://postgres:postgres@localhost:5432/postgres), e.g. one from:
//   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, '..', '..', 'supabase', 'migrations');
const admin = new URL(process.env.SQL_TEST_URL || 'postgres://postgres:postgres@localhost:5432/postgres');
const DB = 'walkthrough_sql_test';
const test = new URL(admin); test.pathname = `/${DB}`;

const psql = (url, args, input) => {
  const r = spawnSync('psql', [url.href, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', input });
  if (r.error) { console.error(`Could not run psql: ${r.error.message}`); process.exit(1); }
  return r;
};
const load = (file) => {
  const r = psql(test, ['-f', file]);
  if (r.status !== 0) { console.error(`FAILED loading ${path.basename(file)}:\n${r.stderr}`); process.exit(1); }
};

const created = psql(admin, ['-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`]);
if (created.status !== 0) { console.error(`Could not create the test database:\n${created.stderr}`); process.exit(1); }

const mig = (n) => path.join(migrations, readdirSync(migrations).find((f) => f.startsWith(n)));
load(path.join(here, '00_supabase_stub.sql'));
for (const n of ['001', '002', '003']) load(mig(n));
load(path.join(here, '01_users.sql'));                 // 004 needs the demo users to exist
for (const n of ['004', '005', '006', '007']) load(mig(n));
load(mig('006'));                                       // safe to run twice
load(mig('008'));
load(mig('008'));                                       // safe to run twice
load(mig('009'));
load(mig('010'));
load(mig('010'));                                       // safe to run twice
for (const n of ['005', '006']) load(mig(n));           // re-running an older migration must not undo 008 or 010
load(path.join(here, '02_helpers.sql'));

const out = psql(test, ['-f', path.join(here, '03_attacks.sql')]);
const lines = out.stdout.split('\n').filter((l) => l.trim());
for (const l of lines) console.log(l);
const ok = lines.filter((l) => l.startsWith('ok')).length;
const holes = lines.filter((l) => l.startsWith('!!')).length;
psql(admin, ['-c', `drop database if exists ${DB}`]);
if (out.status !== 0) console.error(out.stderr);
console.log(`\n${ok} checks passed, ${holes} holes`);
process.exit(out.status !== 0 || holes || !ok ? 1 : 0);
