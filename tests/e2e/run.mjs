#!/usr/bin/env node
// Browser tests, no accounts needed: builds the app in MOCK mode, serves it, and drives Chromium with Playwright.
//   npm run test:e2e          (first time only: npx playwright install chromium)
// Screenshots of every step land in tests/.out/shots/.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = path.join(root, 'tests', '.out');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
// Mock mode whatever .env.local says: variables set here win over .env files in Vite.
// VITE_DEMO_MODE: a production build with no database refuses to start unless it is told it is a demo.
const MOCK_ENV = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_PUBLIC_SITE_URL: '', VITE_DEMO_PASSWORD: '', VITE_DEMO_MODE: 'true' };

const SUITES = [
  { name: 'app', port: 4173, env: { VITE_ADMIN_NEEDS_PASSWORD: '' }, file: 'app.e2e.cjs' },
  // Built the way the real site behaves: the housing admin must type its own password.
  { name: 'admin-password', port: 4174, env: { VITE_ADMIN_NEEDS_PASSWORD: 'true' }, file: 'admin-password.e2e.cjs' },
  // Built in LIVE mode against a fake Supabase (answered inside the test): the real sign-in and authenticator flow.
  { name: 'live-auth', port: 4175, env: { VITE_SUPABASE_URL: 'https://walkthrough-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key', VITE_DEMO_MODE: '' }, file: 'live-auth.e2e.cjs' },
  // Built the way a misconfigured deployment would be: no database settings, not marked as a demo.
  { name: 'not-configured', port: 4176, env: { VITE_DEMO_MODE: '' }, file: 'not-configured.e2e.cjs' },
];

const node = (args, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  child.on('exit', (code) => resolve(code ?? 1));
});

async function waitForServer(url, ms = 30_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
  }
  throw new Error(`${url} did not start`);
}

let failed = 0;
for (const suite of SUITES) {
  const dir = path.join(out, suite.name);
  console.log(`\n── ${suite.name}: building…`);
  if (await node([vite, 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], { ...MOCK_ENV, ...suite.env })) {
    failed++;
    continue;
  }
  const server = spawn(process.execPath, [vite, 'preview', '--outDir', dir, '--port', String(suite.port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  try {
    const base = `http://localhost:${suite.port}`;
    await waitForServer(base);
    if (await node([path.join(root, 'tests', 'e2e', suite.file)], { E2E_BASE: base, E2E_SHOTS: path.join(out, 'shots') })) failed++;
  } catch (err) {
    console.error(err.message);
    failed++;
  } finally {
    server.kill();
  }
}
console.log(failed ? `\n${failed} browser suite(s) failed` : '\nAll browser suites passed');
process.exit(failed ? 1 : 0);
