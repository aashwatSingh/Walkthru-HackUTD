// Live-mode sign-in, with the REAL Supabase client talking to a fake Supabase Auth + REST API (answered here
// through Playwright's network interception, so no server and no account). Covers what demo mode cannot:
// students need no code, the housing admin must set up and then enter a real authenticator code.
// Run it through tests/e2e/run.mjs.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const S = process.env.E2E_SHOTS || path.join(__dirname, '..', '.out', 'shots');
fs.mkdirSync(S, { recursive: true });
const B = process.env.E2E_BASE || 'http://localhost:4175';
const API = 'https://walkthrough-test.supabase.co'; // must match VITE_SUPABASE_URL in run.mjs

let n = 0, fails = 0;
const check = (name, ok, d = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d && !ok ? '  → ' + d : ''}`); };

// ── the fake project ──
const TOTP = '424242'; // the "current code" of the fake authenticator
const users = {
  'housing.admin@university.edu': { id: '00000000-0000-4000-8000-000000000001', password: 'admin-pass', role: 'admin', full_name: 'Housing Admin', factors: [] },
  'jordan.lee@university.edu': { id: '00000000-0000-4000-8000-000000000002', password: 'student-pass', role: 'student', full_name: 'Jordan Lee', factors: [] },
};
const seen = [];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (email, aal) => {
  const u = users[email]; const now = Math.floor(Date.now() / 1000);
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email, factors: u.factors, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email, aal, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, session_id: 's1' })}.sig`;
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `r-${aal}-${email}`, user };
};
const emailOf = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').split('.')[1], 'base64url')).email; } catch { return null; } };

async function fakeSupabase(route) {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const send = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
  if (m === 'OPTIONS') return send(204);
  seen.push(`${m} ${p}`);
  const body = () => { try { return JSON.parse(req.postData() || '{}'); } catch { return {}; } };
  const me = emailOf(req); const u = users[me];

  if (p === '/auth/v1/token') {
    const { email, password } = body(); const who = users[email];
    if (!who || who.password !== password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return send(200, session(email, 'aal1'));
  }
  if (p === '/auth/v1/logout') return send(204);
  // Public project settings (what the dashboard's setup checks read): this fake project is set up badly on purpose.
  if (p === '/auth/v1/settings') return send(200, { disable_signup: false, mailer_autoconfirm: true, external: {} });
  if (!u) return send(401, { code: 401, error_code: 'no_authorization', msg: 'not signed in' });
  if (p === '/auth/v1/user') return send(200, session(me, 'aal1').user);
  if (p === '/auth/v1/factors' && m === 'POST') {
    const f = { id: `factor-${u.factors.length + 1}`, friendly_name: body().friendly_name, factor_type: 'totp', status: 'unverified', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (u.factors.some((x) => x.friendly_name === f.friendly_name)) return send(422, { code: 422, error_code: 'mfa_factor_name_conflict', msg: 'A factor with that friendly name already exists' });
    u.factors.push(f);
    return send(200, { id: f.id, type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="black"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
  }
  const fm = p.match(/^\/auth\/v1\/factors\/([^/]+)(\/(challenge|verify))?$/);
  if (fm) {
    const f = u.factors.find((x) => x.id === fm[1]);
    if (!f) return send(404, { code: 404, error_code: 'mfa_factor_not_found', msg: 'Factor not found' });
    if (m === 'DELETE') { u.factors = u.factors.filter((x) => x !== f); return send(200, { id: f.id }); }
    if (fm[3] === 'challenge') return send(200, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (fm[3] === 'verify') {
      if (body().code !== TOTP) return send(422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
      f.status = 'verified';
      return send(200, session(me, 'aal2'));
    }
  }
  if (p === '/rest/v1/profiles') return send(200, [{ id: u.id, full_name: u.full_name, email: me, role: u.role }]);
  if (p === '/rest/v1/rpc/security_status') return send(200, { hardening: true, server_fingerprints: true, admin_mfa_required: false, audit_chain: true, seed_photos_fingerprinted: true, migrations: ['010_scale_and_safety'], storage: { files: 0, bytes: 0, unreferenced_files: 0, unreferenced_bytes: 0 } });
  if (p === '/rest/v1/rpc/dashboard_summary') return send(200, { units: 7, inspected: 3, items: 28, saved: '205.00', billable: '130.00', disputes: 1, by_building: [], by_status: [], buildings: [], zones: [], unit_codes: [] });
  if (p.startsWith('/rest/v1/')) return send(200, []); // no rooms, no rows: enough to render the pages
  return send(404, { msg: `fake: no route ${m} ${p}` });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const csp = []; page.on('console', (msg) => { if (/Content Security Policy/i.test(msg.text())) csp.push(msg.text().slice(0, 200)); });
  await page.route(`${API}/**`, fakeSupabase);
  const dialog = page.getByRole('dialog', { name: 'Two-factor verification' });
  const login = async (email, password) => {
    await page.goto(`${B}/login`);
    await page.getByLabel('University email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };
  const type = async (code) => { for (const d of code) await page.keyboard.type(d); };
  // Sign-out finishes when the logout request does. Loading /login before that would find the old session
  // still stored and bounce straight back to the signed-in page.
  const signOut = async () => {
    const button = page.getByRole('button', { name: 'Sign out' });
    await button.click();
    await button.waitFor({ state: 'hidden' });
  };

  try {
    // Student: password only, no code, no demo buttons on a site without a bundled demo password
    await page.goto(`${B}/login`);
    check('No one-click demo logins when the site has no demo password', (await page.getByText('Demo quick login').count()) === 0);
    await login('jordan.lee@university.edu', 'wrong'); await page.getByText('Invalid login credentials').waitFor();
    check('Wrong password is rejected', true);
    await login('jordan.lee@university.edu', 'student-pass');
    await page.getByText(/No room is assigned to your account/).waitFor();
    check('Student signs in with the password alone (no fake code step)', (await dialog.count()) === 0);
    await signOut();

    // Admin, first time: must set up an authenticator
    await login('housing.admin@university.edu', 'admin-pass');
    await dialog.waitFor(); await dialog.getByText('Set up two-factor').waitFor();
    await dialog.getByAltText('QR code for your authenticator app').waitFor();
    check('First admin login asks to set up an authenticator (QR code + key)', (await dialog.getByText('JBSWY3DPEHPK3PXP').count()) === 1);
    check('No demo code is offered on the live site', (await dialog.getByText(/DEMO_CODE/).count()) === 0);
    await page.screenshot({ path: path.join(S, 'M1-enroll.png') });
    await page.goto(`${B}/admin`); await page.waitForURL(/\/login/);
    check('Password alone does not open the admin dashboard', true);
    await dialog.getByAltText('QR code for your authenticator app').waitFor();
    check('Reopening the setup replaces the unfinished one (one factor, not two)', users['housing.admin@university.edu'].factors.length === 1);
    await page.getByLabel('Digit 1').click(); await type('000000');
    await dialog.getByText('That code is not right').waitFor(); check('Wrong authenticator code is rejected', true);
    await type(TOTP); await page.waitForURL(/\/admin$/); await page.getByText('Housing dashboard').waitFor();
    check('Correct code finishes setup and opens the dashboard', users['housing.admin@university.edu'].factors[0].status === 'verified');
    const setup = page.getByTestId('setup-checks');
    await setup.waitFor();
    const warned = await setup.innerText();
    await page.screenshot({ path: path.join(S, 'M2-setup-checks.png') });
    check('Dashboard warns that two-factor is not enforced by the database yet (007 not run)', /two-factor is not enforced/.test(warned), warned.slice(0, 200));
    check('...that email confirmation is off, and that sign-ups are open', /Email confirmation is off/.test(warned) && /Sign-ups are open/.test(warned), warned.slice(0, 300));
    check('Dashboard totals come from the database summary (7 rooms, $205.00 saved)', /7 rooms/.test(await page.locator('main').innerText()) && (await page.locator('[data-testid="kpi-$ saved by students"]').innerText()).trim() === '$205.00');

    // Admin, next time: just the code
    await signOut();
    await login('housing.admin@university.edu', 'admin-pass');
    await dialog.getByText('Open your authenticator app').waitFor();
    check('Later logins ask for the code only (no new setup)', (await dialog.getByText('Set up two-factor').count()) === 0);
    await type(TOTP); await page.waitForURL(/\/admin$/);
    check('Code accepted; dashboard opens', true);
    await page.reload(); await page.getByText('Housing dashboard').waitFor();
    check('A verified session survives a page reload', true);
    check('No Content-Security-Policy violations (Supabase calls are allowed by the policy)', csp.length === 0, csp[0]);
  } catch (e) {
    check('live-auth flow', false, e.message.split('\n')[0]);
    await page.screenshot({ path: path.join(S, 'FAIL-live-auth.png') }).catch(() => {});
    console.log('   url:', page.url(), '| last calls:', seen.slice(-6).join(', '));
  }
  console.log(`\n${n - fails}/${n} passed; page errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await browser.close(); process.exit(fails ? 1 : 0);
})();
