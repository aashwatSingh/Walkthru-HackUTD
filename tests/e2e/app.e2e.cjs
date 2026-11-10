// The main browser suite (mock mode): student wizard, photo coach, 2FA, admin dashboard, comparator,
// Nemotron panel, disputes, QR codes, report. Run it through tests/e2e/run.mjs (npm run test:e2e).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const S = process.env.E2E_SHOTS || path.join(__dirname, '..', '.out', 'shots');
fs.mkdirSync(S, { recursive: true });
const BASE = process.env.E2E_BASE || 'http://localhost:4173';
const results = []; const problems = [];
const check = (name, ok, detail = '') => { results.push([ok, name, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };
let pageRef; const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message.split('\n')[0].slice(0, 160)); try { await pageRef.screenshot({ path: `${S}/FAIL-${name.replace(/\W+/g, '-')}.png` }); console.log('   url at failure:', pageRef.url(), '| text:', (await pageRef.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)); } catch {} } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage(); pageRef = page;
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  const cspViolations = []; page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text().slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/getUserMedia|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  const text = async (sel) => (await page.locator(sel).first().innerText()).trim();
  const kpi = (label) => text(`[data-testid="kpi-${label}"]`);
  // The table is filtered by the database now: wait for it to show n rows (true) or give up (false).
  const rowsAre = (n) => page.waitForFunction((want) => document.querySelectorAll('[data-testid="item-row"]').length === want && !document.querySelector('tbody[aria-busy="true"]'), n, { timeout: 6000 }).then(() => true, () => false);
  const switchTo = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForLoadState('networkidle'); };

  // ── 0. landing page: the demos on it are real controls
  await step('landing demos', async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole('tab', { name: /Photograph and lock/ }).click();
    await page.getByRole('button', { name: 'Take the photo' }).click();
    await page.getByRole('button', { name: /Lock & submit/ }).click();
    await page.getByRole('button', { name: /Try to edit it/ }).click();
    await page.getByText('Rejected by the database.').waitFor();
    check('Landing: shutter → lock → an edit is rejected', true);
    await page.getByText('Fingerprint matches upload').waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: /Change one bit of the file/ }).click();
    await page.getByText('Mismatch: file changed since upload').waitFor();
    await page.getByRole('button', { name: /Put it back/ }).click();
    await page.getByText('Fingerprint matches upload').waitFor();
    check('Landing: changing one bit of the photo flips the fingerprint to a mismatch, and back', true);
    await page.getByRole('button', { name: /Does the AI decide who pays/ }).click();
    check('Landing: FAQ opens the question that was clicked', (await page.getByRole('button', { name: /Does the AI decide who pays/ }).getAttribute('aria-expanded')) === 'true');
  });

  // ── 1. unauthenticated QR scan → login → back to the room
  await step('qr redirect', async () => {
    const first = await page.goto(`${BASE}/inspect/FH-210A`);
    const h = first.headers();
    check('Pages are served with the security headers (CSP, no framing, nosniff)',
      /frame-ancestors 'none'/.test(h['content-security-policy'] || '') && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff');
    await page.waitForURL(/\/login\?next=%2Finspect%2FFH-210A/);
    check('Unauthenticated /inspect/FH-210A redirects to /login with ?next=', true);
    await page.screenshot({ path: `${S}/01-login.png` });
  });

  // ── 2. real login + 2FA path (typed credentials)
  await step('login+2fa', async () => {
    await page.getByLabel('University email').fill('jordan.lee@university.edu');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByText('Invalid login credentials').waitFor();
    check('Wrong password is rejected with a clear message', true);
    await page.getByLabel('Password').fill('demo1234');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('dialog', { name: 'Two-factor verification' }).waitFor();
    check('2FA modal appears after password sign-in', true);
    for (const d of '111111') await page.keyboard.type(d);
    await page.getByText('That code is not right').waitFor();
    check('Wrong 2FA code is rejected', true);
    await page.screenshot({ path: `${S}/02-2fa.png` });
    for (const d of '123456') await page.keyboard.type(d);
    await page.waitForURL(/\/inspect\/FH-210A/);
    check('Correct code 123456 passes and returns to the scanned room (?next=)', true);
  });

  // ── 3. student Jordan: mobile move-in wizard
  await page.setViewportSize({ width: 390, height: 844 });
  await step('move-in wizard', async () => {
    await page.getByText('Step 1 of 4').waitFor();
    await page.screenshot({ path: `${S}/03-wizard-start-mobile.png` });
    const sample = page.getByRole('button', { name: /use a sample photo/ });
    for (let n = 1; n <= 4; n++) {
      await page.getByText(`Step ${n} of 4`).waitFor();
      await sample.click();
      await page.getByText(/Captured /).waitFor();
      if (n === 3) {
        await page.getByText('Nemotron suggests a retake').waitFor();
        check('Photo coach suggests a retake on the first blinds photo', true);
        await page.screenshot({ path: `${S}/04-photo-coach-mobile.png` });
        await page.getByRole('button', { name: 'Retake' }).click();
        await sample.click();
        await page.getByText(/Looks good/).waitFor();
        check('Photo coach is happy after the retake', true);
      }
      if (n < 4) await page.getByRole('button', { name: /Next/ }).click();
    }
    await page.getByLabel(/Condition notes/).fill('Small chip on the baseboard.');
    await page.getByLabel(/Condition notes/).blur();
    await page.getByRole('button', { name: /Lock & Submit Official Inspection/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Lock & submit/ }).click();
    await page.getByText('Move-in submitted and locked').first().waitFor();
    check('Student completed the move-in and locked it', true);
    await page.screenshot({ path: `${S}/05-locked-mobile.png`, fullPage: true });
  });

  // ── 4. access control as a student
  await step('access control', async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForURL(/\/inspect\/FH-210A/);
    check('Student visiting /admin is sent back to their own room', true);
    await page.goto(`${BASE}/inspect/FH-304B`);
    await page.getByText("This room isn't assigned to you").waitFor();
    check("Student scanning someone else's room sees \"isn't assigned to you\"", true);
    await page.goto(`${BASE}/admin/qr`);
    await page.waitForURL(/\/inspect\//);
    check('Student cannot open the QR generator', true);
  });

  // ── 5. admin dashboard
  await page.setViewportSize({ width: 1360, height: 900 });
  await step('admin dashboard', async () => {
    await switchTo('Admin');
    await page.waitForURL(/\/admin$/);
    await page.getByText('Housing dashboard').waitFor();
    await page.waitForTimeout(600);
    check('KPI: units inspected = 4 (Jordan just locked FH-210A)', (await kpi('Units inspected')) === '4', await kpi('Units inspected'));
    check('KPI: $ saved by students = $205.00', (await kpi('$ saved by students')) === '$205.00', await kpi('$ saved by students'));
    check('KPI: active disputes = 1', (await kpi('Active disputes')) === '1', await kpi('Active disputes'));
    check('KPI: confirmed billable = $130.00', (await kpi('Confirmed billable')) === '$130.00', await kpi('Confirmed billable'));
    check('Two charts rendered', (await page.locator('.recharts-wrapper').count()) === 2);
    check('16 item rows in the table', await rowsAre(16), String(await page.getByTestId('item-row').count()));
    await page.screenshot({ path: `${S}/06-admin-dashboard.png`, fullPage: true });
    await page.locator('select[aria-label="Status"]').selectOption('DISPUTE_UNDER_REVIEW');
    check('Status filter narrows the table to 1 row', await rowsAre(1));
    await page.locator('select[aria-label="Status"]').selectOption('');
    await rowsAre(16);
    await page.locator('select[aria-label="Room"]').selectOption('BB-118');
    check('Room filter shows only BB-118 (4 rows)', await rowsAre(4));
    await page.locator('select[aria-label="Room"]').selectOption('');
    await page.getByRole('button', { name: /Active disputes/ }).click();
    check('Clicking the disputes number filters the table to it', await rowsAre(1));
    await page.getByRole('button', { name: /Clear 1 filter/ }).click();
    await rowsAre(16);
    await page.getByLabel('Search items').fill('priya');
    check('Search narrows the table (Priya: 4 rows)', await rowsAre(4));
    await page.getByLabel('Search items').fill('');
    await rowsAre(16);
    await page.getByRole('button', { name: 'Filter the table to FH-304B' }).click();
    check('A room card filters the table to that room', await rowsAre(4));
    await page.getByRole('button', { name: 'Filter the table to FH-304B' }).click();
    await rowsAre(16);
    await page.getByRole('button', { name: 'Fine', exact: true }).click(); await page.getByRole('button', { name: 'Fine', exact: true }).click();
    const top = await page.waitForFunction(() => /\$120\.00/.test(document.querySelector('[data-testid="item-row"]')?.innerText || ''), null, { timeout: 6000 }).then(() => true, () => false);
    check('Sorting by fine puts the largest charge first', top);
    await page.getByRole('button', { name: 'Fine', exact: true }).click();
    check('All 16 rows are back', await rowsAre(16));
  });

  // ── 6. comparator + resolve the dispute
  await step('comparator', async () => {
    const row = page.getByTestId('item-row').filter({ hasText: 'Porcelain Sink' }).filter({ hasText: 'FH-304B' });
    await row.getByRole('button', { name: /Inspect side-by-side/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Move-in (Before)').waitFor();
    await dlg.getByText(/Student dispute/).waitFor();
    await dlg.getByText(/Fingerprint matches upload/).first().waitFor({ timeout: 8000 });
    check('Comparator shows both sides, the dispute, and ✓ fingerprint matches', true);
    await dlg.getByRole('button', { name: 'Previous item' }).click();
    await page.getByRole('dialog', { name: /Window Blinds/ }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Following item' }).click();
    await page.getByRole('dialog', { name: /Porcelain Sink/ }).waitFor();
    check('Comparator steps to the neighbouring item and back', true);
    await page.screenshot({ path: `${S}/07-comparator.png` });
    await dlg.getByRole('tab', { name: 'Slider' }).click();
    await dlg.getByLabel('Comparison slider').waitFor();
    await dlg.getByLabel('Comparison slider').fill('30');
    check('Slider view works', true);
    await dlg.getByRole('button', { name: /Waive Fine/ }).click();
    await page.getByText(/Add a comment explaining/).waitFor();
    check('Resolving a dispute without a comment is blocked', true);
    await dlg.getByLabel(/Comment/).fill('Crack is visible in the move-in photo. Waived.');
    await dlg.getByRole('button', { name: /Waive Fine/ }).click();
    await page.getByText('Fine waived.').waitFor();
    await page.waitForTimeout(500);
    check('After waiving: active disputes = 0', (await kpi('Active disputes')) === '0', await kpi('Active disputes'));
    check('After waiving: $ saved = $325.00 (205 + 120)', (await kpi('$ saved by students')) === '$325.00', await kpi('$ saved by students'));
  });

  // ── 6b. a photo uploaded in this session: fingerprinted from the stored bytes, and it verifies
  await step('uploaded photo verifies', async () => {
    const row = page.getByTestId('item-row').filter({ hasText: 'Study Desk' }).filter({ hasText: 'FH-210A' });
    await row.getByRole('button', { name: /Inspect side-by-side/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Move-in (Before)').waitFor();
    await dlg.getByText(/Fingerprint matches upload/).first().waitFor({ timeout: 8000 });
    check("The photo Jordan just took shows ✓ fingerprint matches (computed from the stored file)", true);
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'hidden' });
  });

  // ── 7. Nemotron review panel
  await step('ai review', async () => {
    const card = page.getByTestId('unit-card').filter({ hasText: 'FH-304B' });
    await card.getByRole('button', { name: /Run Nemotron Review/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: /Run Nemotron Review/ }).click();
    await dlg.getByText(/Nemotron agent working/).waitFor();
    check('Panel shows the running state', true);
    await dlg.getByTestId('ai-mode').waitFor({ timeout: 15000 });
    check('Panel shows the agent badge', /Nemotron agent/.test(await text('[data-testid="ai-mode"]')), await text('[data-testid="ai-mode"]'));
    check('Agent timeline lists the tool calls', (await dlg.getByTestId('ai-timeline').getByText('compare_photos').count()) === 4);
    check('Four per-item suggestion cards', (await dlg.getByTestId('ai-item-card').count()) === 4);
    await dlg.getByText(/Round 2 · \d+ tools in parallel/).waitFor();
    check('Round 2 is grouped as parallel tools', true);
    await page.screenshot({ path: `${S}/08-ai-review.png`, fullPage: true });
    await dlg.getByTestId('ai-item-card').filter({ hasText: 'Window Blinds' }).getByText('Applied').waitFor();
    check('Blinds suggestion matches what is already applied (shows "Applied")', true);
    await page.keyboard.press('Escape');
  });

  // ── 8. move-out opens for Jordan, Sam does a move-out
  await step('open move-out', async () => {
    const card = page.getByTestId('unit-card').filter({ hasText: 'FH-210A' });
    await card.getByRole('button', { name: /Open move-out/ }).click();
    await page.getByText(/Move-out opened for FH-210A/).waitFor();
    check('Admin opened move-out for FH-210A', true);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await step('move-out wizard', async () => {
    await switchTo('Sam');
    await page.getByText('Match this angle').waitFor();
    check('Move-out shows the locked move-in photo as a reference', true);
    await page.screenshot({ path: `${S}/09-moveout-reference-mobile.png` });
    const sample = page.getByRole('button', { name: /use a sample photo/ });
    for (let n = 1; n <= 4; n++) {
      await page.getByText(`Step ${n} of 4`).waitFor();
      await sample.click();
      await page.getByText(/Captured /).waitFor();
      if (n < 4) await page.getByRole('button', { name: /Next/ }).click();
    }
    await page.getByRole('button', { name: /Lock & Submit Official Inspection/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Lock & submit/ }).click();
    await page.getByText('Move-out submitted and locked').first().waitFor();
    await page.getByText('Charges').first().waitFor();
    check('Sam completed move-out; summary shows before/after', true);
  });

  // ── 9. dispute flow as Priya (typed login again)
  await step('dispute', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(`${BASE}/login`);
    await page.getByLabel('University email').fill('priya.nair@university.edu');
    await page.getByLabel('Password').fill('demo1234');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('dialog', { name: 'Two-factor verification' }).waitFor();
    for (const d of '123456') await page.keyboard.type(d);
    await page.waitForURL(/\/inspect\/BB-118/);
    check('Student login lands on /my-unit → their own room', true);
    await page.getByRole('button', { name: 'Dispute this charge' }).click();
    const dlg = page.getByRole('dialog');
    check('Submit is disabled until the reason is 10+ characters', await dlg.getByRole('button', { name: 'Submit dispute' }).isDisabled());
    await dlg.getByLabel(/Why is this charge wrong/).fill('The desk was already marked at move-in.');
    await dlg.getByRole('button', { name: 'Submit dispute' }).click();
    await page.getByText(/Under review: housing is checking/).waitFor();
    check('Dispute submitted; item shows "Under review"', true);
    check('Dispute button is gone (one dispute per item)', (await page.getByRole('button', { name: 'Dispute this charge' }).count()) === 0);
    await page.screenshot({ path: `${S}/10-student-summary-mobile.png`, fullPage: true });
  });

  // ── 10. QR generator + report as admin
  await page.setViewportSize({ width: 1360, height: 900 });
  await step('qr + report', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(`${BASE}/login`);
    await page.getByRole('button', { name: /^Admin/ }).click();
    await page.waitForURL(/\/admin$/);
    await page.getByRole('link', { name: 'QR codes' }).click();
    await page.getByRole('heading', { name: 'Door Check-In' }).waitFor();
    const url = await text('text=Encodes:');
    check('QR page encodes the room URL', /\/inspect\/BB-112$/.test(url), url);
    check('QR code rendered as SVG', (await page.locator('.print-area svg').count()) >= 1);
    await page.getByRole('button', { name: /New unit/ }).click();
    await page.getByLabel('Building name').fill('Lakeside Hall');
    await page.getByLabel('Room number').fill('7-C');
    await page.getByLabel('Assigned student').fill('Taylor Kim');
    await page.getByLabel('Student email').fill('taylor.kim@university.edu');
    await page.getByRole('button', { name: 'Create unit' }).click();
    await page.getByText(/Created LH-7C with its checklist/).waitFor();
    check('New unit created; QR now encodes /inspect/LH-7C', /\/inspect\/LH-7C$/.test(await text('text=Encodes:')));
    const decode = async () => {
      const png = PNG.sync.read(await page.locator('.print-area svg').first().screenshot());
      return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
    };
    check('QR code scans to the new room', (await decode()) === `${BASE}/inspect/LH-7C`);
    await page.emulateMedia({ media: 'print' });
    check('QR code still scans when printed (black on white)', (await decode()) === `${BASE}/inspect/LH-7C`);
    await page.emulateMedia({ media: 'screen' });
    check('QR page warns that phones cannot open localhost', /phones can't open/.test(await text('[data-testid="qr-site-check"]')));
    await page.screenshot({ path: `${S}/11-qr-flyer.png`, fullPage: true });
    await page.goto(`${BASE}/report/FH-304B`);
    await page.getByText('Official inspection record').waitFor();
    await page.waitForTimeout(500);
    check('Report shows all 4 items with totals', (await page.locator('.print-area section').count()) === 4 && /Total charges/.test(await text('.print-area footer')));
    await page.screenshot({ path: `${S}/12-report.png`, fullPage: true });
  });

  // A link that tries to send the user to another site after login must not work.
  await step('safe next', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(`${BASE}/login?next=${encodeURIComponent('//example.com/phish')}`);
    await page.getByRole('button', { name: /^Jordan/ }).first().click();
    await page.waitForURL(/\/inspect\/FH-210A/);
    check('A hostile ?next= link is ignored: login lands on the student\'s own room', true);
  });
  check('No Content-Security-Policy violations during the whole run', cspViolations.length === 0, cspViolations[0]);

  await browser.close();
  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (problems.length) console.log('\nBrowser errors:\n' + [...new Set(problems)].join('\n')); else console.log('No browser console errors.');
  process.exit(failed.length ? 1 : 0);
})();
