// SHA-256 fingerprint of a file/blob. Needs HTTPS (or localhost): crypto.subtle is unavailable on plain http://192.168.x.x.
export async function sha256Hex(blob) {
  if (!globalThis.crypto?.subtle) throw new Error('Fingerprinting needs HTTPS. Open the app from the https:// URL.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
