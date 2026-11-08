// A small fake of everything the Edge Functions talk to: Supabase Auth, PostgREST (with ai_reviews' primary key),
// Storage, the Vercel /seed/ photos, and NVIDIA's chat API. Tests steer it through POST /__ctl.
import http from 'node:http';

const JPEG = Buffer.from('ffd8ffe000104a464946000101', 'hex');
const unit = { id: 'u1', unit_code: 'FH-304B', building_name: 'Founders Hall', room_number: '304-B', semester: 'Fall 2026',
  assigned_student_name: 'Alex Rivera', inspection_phase: 'COMPLETED', move_in_locked_at: '2026-08-18T15:25:00Z', move_out_locked_at: '2026-11-07T15:40:00Z' };
const base = { unit_id: 'u1', zone_category: 'Living Area', before_captured_at: '2026-08-18T15:14:00Z', after_captured_at: '2026-11-07T15:30:00Z',
  condition_status: 'UNREVIEWED', estimated_fine: 0, dispute_reason: null, instruction_text: 'Frame the whole item.', before_notes: '', after_notes: '' };
const photos = (id) => ({ before_media_path: `u1/${id}/before-1.jpg`, before_media_type: 'image', after_media_path: `u1/${id}/after-1.jpg`, after_media_type: 'image' });
const items = [
  // the unit the AI review runs on
  { ...base, id: 'i1', step_order: 1, item_name: 'Window Blinds', standard_charge: 45, before_media_path: '/seed/blinds.jpg', before_media_type: 'image',
    after_media_path: '/seed/blinds-broken.jpg', after_media_type: 'image', before_notes: 'All slats intact.', after_notes: 'Two slats snapped.',
    condition_status: 'DISPUTE_UNDER_REVIEW', dispute_reason: 'Was like this.' },
  { ...base, id: 'i2', step_order: 2, item_name: 'Desk (NIM 500)', standard_charge: 85, ...photos('i2') },
  { ...base, id: 'i3', step_order: 3, item_name: 'Sink', standard_charge: 120, ...photos('i3') },
  { ...base, id: 'i4', step_order: 4, item_name: 'Door (video)', standard_charge: 150, before_media_path: 'u1/i4/before-1.mp4', before_media_type: 'video',
    after_media_path: 'u1/i4/after-1.mp4', after_media_type: 'video' },
  // items the photo coach tests use (not in a unit the review touches)
  { ...base, unit_id: 'u2', id: 'p1', step_order: 1, item_name: 'Window Blinds', standard_charge: 45, ...photos('p1') },
  { ...base, unit_id: 'u2', id: 'p2', step_order: 2, item_name: 'Study Desk', standard_charge: 85, ...photos('p2'), after_media_path: null, after_media_type: null },
  { ...base, unit_id: 'u2', id: 'p3', step_order: 3, item_name: 'Sink', standard_charge: 120, ...photos('p3') },
  { ...base, unit_id: 'u2', id: 'p4', step_order: 4, item_name: 'Door', standard_charge: 150, ...photos('p4'), after_media_path: null, after_media_type: null },
];

const fresh = () => ({ agent: 'ok', photoNim: 'ok', photoDelayMs: 20, nimCalls: [], reviews: [], reports: [] });
let state = fresh();

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
const eq = (v) => (v ? v.replace(/^eq\./, '') : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = (req) => (req.headers.authorization ?? '').replace('Bearer ', '');

function nim(sent) {
  const text = JSON.stringify(sent.messages);
  const images = sent.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((x) => x.type === 'image_url').length;
  state.nimCalls.push({ model: sent.model, images, tools: !!sent.tools, item: (text.match(/Desk \(NIM 500\)|Window Blinds|Sink|Door|Study Desk/) ?? [])[0] });
  const reply = (content) => [200, { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] }];
  if (sent.tools) {
    if (state.agent === 'notools') return [400, { error: 'tools are not supported for this model' }];
    const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
    const calls = (list) => [200, { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: list } }] }];
    const round = sent.messages.filter((m) => m.role === 'assistant' && m.tool_calls).length;
    if (round === 0) return calls([call('c1', 'list_items', {})]);
    if (round === 1) return calls(['i1', 'i2', 'i3', 'i4'].map((id, n) => call(`c${n + 2}`, 'compare_photos', { item_id: id })).concat(call('c6', 'get_dispute_evidence', { item_id: 'i1' })));
    // junk on purpose: an unknown tool and broken arguments must not break the run
    if (round === 2) return calls([call('c7', 'calculate_fee', { item_id: 'i1' }), call('c8', 'delete_everything', {}), call('c9', 'calculate_fee', '{not json')]);
    return calls([call('c10', 'submit_review', { admin_summary: ['Blinds: new minor damage.'], student_note: 'Two slats broke.', dispute_briefs: [{ item_id: 'i1', brief: 'Uphold.' }] })]);
  }
  if (text.includes('check photos')) {
    if (state.photoNim === 'fail') return [500, { error: 'upstream exploded' }];
    return reply('{"shows_item": true, "framing_ok": false, "lighting_ok": true, "sharp": true, "matches_reference_angle": true, "retake_tip": "Step back so the whole item fits."}');
  }
  if (text.includes('damage inspector')) {
    if (text.includes('NIM 500')) return [500, { error: 'upstream exploded' }];
    return reply('```json\n{"change_detected": true, "findings": [{"description": "Two slats snapped", "location": "bottom", "present_at_move_in": false, "severity": "minor"}], "suggested_status": "NEW_DAMAGE_BILLABLE", "confidence": 0.9, "rationale": "The move-in photo shows intact slats."}\n```');
  }
  if (text.includes('inspection summaries')) {
    return reply('{"admin_summary": ["Blinds: new damage."], "student_note": "Two slats broke.", "dispute_briefs": [{"item_id": "i1", "brief": "Uphold."}]}');
  }
  return [400, { error: 'fake NVIDIA: unexpected prompt' }];
}

export function startFake(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const body = await readBody(req);
    const q = (k) => eq(url.searchParams.get(k));

    if (p === '/auth/v1/user') {
      const t = token(req);
      if (t === 'admin-token') return send(res, 200, { id: 'admin-1', email: 'housing.admin@university.edu', aud: 'authenticated', role: 'authenticated' });
      if (t === 'student-token') return send(res, 200, { id: 'stu-1', email: 'alex.rivera@university.edu', aud: 'authenticated', role: 'authenticated' });
      return send(res, 401, { msg: 'invalid JWT' });
    }
    if (p === '/rest/v1/rpc/is_admin') return send(res, 200, token(req) === 'admin-token');
    if (p === '/rest/v1/units') return send(res, 200, q('id') === 'u1' ? [unit] : []);
    if (p === '/rest/v1/inspection_items') {
      return send(res, 200, items.filter((i) => (!q('id') || i.id === q('id')) && (!q('unit_id') || i.unit_id === q('unit_id'))));
    }
    if (p === '/rest/v1/ai_reviews') {
      const match = (r) => (!q('id') || r.id === q('id')) && (!q('item_id') || r.item_id === q('item_id')) && (!q('kind') || r.kind === q('kind'));
      if (req.method === 'GET' || req.method === 'HEAD') {
        const rows = state.reviews.filter(match);
        return send(res, 200, req.method === 'HEAD' ? undefined : rows, { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      if (req.method === 'POST') {
        const rows = [].concat(JSON.parse(body));
        if (rows.some((r) => r.id && state.reviews.some((x) => x.id === r.id))) {
          return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "ai_reviews_pkey"', details: null, hint: null });
        }
        for (const r of rows) state.reviews.push({ id: r.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...r });
        return send(res, 201, undefined);
      }
      if (req.method === 'PATCH') {
        const patch = JSON.parse(body);
        state.reviews = state.reviews.map((r) => (match(r) ? { ...r, ...patch } : r));
        return send(res, 204, undefined);
      }
      if (req.method === 'DELETE') {
        state.reviews = state.reviews.filter((r) => !match(r));
        return send(res, 204, undefined);
      }
    }
    if (p === '/rest/v1/ai_unit_reports' && req.method === 'POST') {
      state.reports.push(JSON.parse(body));
      return send(res, 201, undefined);
    }
    if (p.startsWith('/storage/v1/object/inspection-media/') || p.startsWith('/seed/')) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(JPEG);
    }
    if (p === '/nim/v1/chat/completions') {
      const sent = JSON.parse(body);
      if (!sent.tools && JSON.stringify(sent.messages).includes('check photos')) await sleep(state.photoDelayMs);
      const [status, out] = nim(sent);
      return send(res, status, out);
    }
    if (p === '/__ctl' && req.method === 'POST') {
      const patch = JSON.parse(body || '{}');
      if (patch.reset) state = fresh();
      if (patch.addReviews) state.reviews.push(...patch.addReviews);
      for (const k of ['agent', 'photoNim', 'photoDelayMs']) if (k in patch) state[k] = patch[k];
      return send(res, 200, { ok: true });
    }
    if (p === '/__ctl') return send(res, 200, state);
    send(res, 404, { error: `fake: no route ${req.method} ${p}` });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
