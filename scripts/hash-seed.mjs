// Fingerprints every photo in public/seed/ (SHA-256).
//   node scripts/hash-seed.mjs
// Writes src/lib/seedHashes.json (used by mock mode) and prints SQL to paste into the Supabase
// SQL Editor so the seed rows also show the ✓ integrity badge. Re-run it whenever you replace a seed photo.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const hashes = {};
for (const f of readdirSync('public/seed').filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()) {
  hashes[`/seed/${f}`] = createHash('sha256').update(readFileSync(`public/seed/${f}`)).digest('hex');
}
writeFileSync('src/lib/seedHashes.json', JSON.stringify(hashes, null, 2) + '\n');
console.error(`Wrote src/lib/seedHashes.json (${Object.keys(hashes).length} photos). SQL for Supabase:\n`);
for (const [path, h] of Object.entries(hashes)) {
  console.log(`update inspection_items set before_sha256='${h}' where before_media_path='${path}';`);
  console.log(`update inspection_items set after_sha256='${h}'  where after_media_path='${path}';`);
}
