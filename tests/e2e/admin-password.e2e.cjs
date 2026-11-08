// Admin login on a site built with VITE_ADMIN_NEEDS_PASSWORD=true (how the real site behaves): the Admin
// buttons never sign in by themselves, students stay one click. Run it through tests/e2e/run.mjs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const S = process.env.E2E_SHOTS || path.join(__dirname, '..', '.out', 'shots');
fs.mkdirSync(S, { recursive: true });
const B = process.env.E2E_BASE || 'http://localhost:4174'; let n = 0, fails = 0;
const check = (name, ok, d = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  → ' + d : ''}`); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${B}/login`);
  await p.getByRole('button', { name: /^Admin/ }).click(); await p.waitForTimeout(400);
  check('Login page: Admin button does NOT sign in by itself', /\/login/.test(p.url()) && (await p.getByRole('dialog').count()) === 0);
  check('...it fills in the admin email', (await p.getByLabel('University email').inputValue()) === 'housing.admin@university.edu');
  check('...and focuses the password field', await p.getByLabel('Password').evaluate((el) => el === document.activeElement));
  check('...and explains what to do', (await p.getByText('Enter the housing admin password').count()) === 1);
  await p.getByLabel('Password').fill('wrong-one'); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByText('Invalid login credentials').waitFor(); check('Wrong admin password is rejected', true);
  await p.getByLabel('Password').fill('demo1234'); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('dialog', { name: 'Two-factor verification' }).waitFor(); check('Correct password → 2FA step (not skipped for admin)', true);
  for (const d of '123456') await p.keyboard.type(d);
  await p.waitForURL(/\/admin$/); check('After 2FA → admin dashboard', true);
  // switcher: become a student in one click, then try Admin from the switcher
  await p.getByRole('button', { name: 'Jordan', exact: true }).click(); await p.waitForURL(/\/inspect\/FH-210A/);
  check('Student switch is still one click (no password)', true);
  await p.screenshot({ path: path.join(S, 'A1-switcher.png') });
  await p.getByRole('button', { name: /^Admin/ }).click(); await p.waitForURL(/\/login\?email=/); await p.waitForTimeout(400);
  check('Switcher Admin → signs out and opens the login form', (await p.getByLabel('University email').inputValue()) === 'housing.admin@university.edu');
  check('...not still signed in as Jordan (no switcher on login page)', (await p.getByRole('button', { name: 'Jordan', exact: true }).count()) <= 1 && !(await p.locator('header').count()));
  check('...password focused, ready to type', await p.getByLabel('Password').evaluate((el) => el === document.activeElement));
  await p.screenshot({ path: path.join(S, 'A2-admin-login.png') });
  await p.goto(`${B}/admin`); await p.waitForURL(/\/login/); check('Signed out: /admin redirects to login', true);
  await p.getByLabel('Password').fill('demo1234'); await p.getByLabel('University email').fill('housing.admin@university.edu'); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('dialog').waitFor(); for (const d of '123456') await p.keyboard.type(d); await p.waitForURL(/\/admin$/);
  check('Returns to /admin after typed login + 2FA', true);
  console.log(`\n${n - fails}/${n} passed; page errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await b.close(); process.exit(fails ? 1 : 0);
})();
