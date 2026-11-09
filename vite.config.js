import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `vite preview` sends the same security headers Vercel does (vercel.json), so the browser tests run under
// the production Content-Security-Policy. Not applied to `vite dev`: hot reload needs inline scripts.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries((vercel.headers?.[0]?.headers ?? []).map((h) => [h.key, h.value]));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true },
  preview: { headers },
});
