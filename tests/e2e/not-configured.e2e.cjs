// A production build with no Supabase settings (and not marked as a demo) must not quietly run on sample data:
// students would do inspections that are saved nowhere. Run it through tests/e2e/run.mjs.
const { chromium } = require('playwright');
const B = process.env.E2E_BASE || 'http://localhost:4176'; let n = 0, fails = 0;
const check = (name, ok, d = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d && !ok ? '  → ' + d : ''}`); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  for (const path of ['/', '/login', '/admin', '/inspect/FH-210A']) {
    await p.goto(B + path);
    const text = await p.locator('body').innerText();
    check(`${path}: says it is not connected, offers no login or demo`, /not connected to its database/.test(text) && !/Demo quick login|Sign in|Try the demo/.test(text), text.slice(0, 120));
  }
  console.log(`\n${n - fails}/${n} passed; page errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
