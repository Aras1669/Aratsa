// Silme emrinden 24 saat geçen gönderileri kalıcı siler: önce Cloudinary dosyası, sonra veritabanı satırları.
import { ago } from './_lib.js';

export function parseCloudinary(url) {
  const m = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[A-Za-z0-9]+)?$/);
  return m ? { cloud: m[1], type: m[2], id: decodeURIComponent(m[3]) } : null;
}

async function destroy(env, { cloud, type, id }) {
  const ts = Math.floor(Date.now() / 1000);
  const raw = new TextEncoder().encode(`public_id=${id}&timestamp=${ts}${env.CLOUDINARY_API_SECRET}`);
  const sig = [...new Uint8Array(await crypto.subtle.digest('SHA-1', raw))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fd = new FormData();
  fd.append('public_id', id); fd.append('timestamp', ts); fd.append('api_key', env.CLOUDINARY_API_KEY); fd.append('signature', sig);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${type}/destroy`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  return r.ok && (j.result === 'ok' || j.result === 'not found');
}

export async function temizle(env) {
  if (!env.DB) return 0;
  const db = env.DB;
  const { results } = await db.prepare('SELECT id, medya_url FROM gonderiler WHERE silinme_istegi IS NOT NULL AND silinme_istegi <= ? LIMIT 10').bind(ago(864e5)).all();
  let n = 0;
  for (const p of results) {
    const job = parseCloudinary(p.medya_url);
    if (job) {
      const shared = await db.prepare('SELECT 1 AS x FROM gonderiler WHERE medya_url = ? AND id != ? AND silinme_istegi IS NULL').bind(p.medya_url, p.id).first();
      // Cloudinary silinemezse satır kalır; bir sonraki kontrolde tekrar denenir
      if (!shared && !(env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET && (await destroy(env, job)))) continue;
    }
    await db.batch([...['begeniler', 'yorumlar', 'sikayetler'].map((t) => db.prepare(`DELETE FROM ${t} WHERE gonderi_id = ?`).bind(p.id)), db.prepare('DELETE FROM gonderiler WHERE id = ?').bind(p.id)]);
    n++;
  }
  return n;
}
