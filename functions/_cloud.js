// Süresi dolan gönderi ve hikayeleri kalıcı siler: önce Cloudinary dosyası, sonra veritabanı satırları.
import { ago, now } from './_lib.js';

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

// true: dosya artık yok (veya başka bir içerik kullanıyor) ve satır silinebilir
async function dropMedia(env, url, selfId) {
  const job = parseCloudinary(url);
  if (!job) return true;
  const used = await env.DB.prepare('SELECT 1 AS x FROM gonderiler WHERE medya_url = ?1 AND id != ?2 AND silinme_istegi IS NULL UNION ALL SELECT 1 FROM hikayeler WHERE medya_url = ?1 AND id != ?2 AND bitis > ?3').bind(url, selfId, now()).first();
  if (used) return true;
  return !!(env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET && (await destroy(env, job)));
}

export async function temizle(env) {
  if (!env.DB) return 0;
  const db = env.DB;
  let n = 0;
  const posts = (await db.prepare('SELECT id, medya_url FROM gonderiler WHERE silinme_istegi IS NOT NULL AND silinme_istegi <= ? LIMIT 5').bind(ago(864e5)).all()).results;
  for (const p of posts) {
    if (!(await dropMedia(env, p.medya_url, p.id))) continue; // Cloudinary silinemezse satır kalır, sonraki turda tekrar denenir
    await db.batch([...['begeniler', 'yorumlar'].map((t) => db.prepare(`DELETE FROM ${t} WHERE gonderi_id = ?`).bind(p.id)), db.prepare('DELETE FROM gonderiler WHERE id = ?').bind(p.id)]);
    n++;
  }
  const stories = (await db.prepare('SELECT id, medya_url FROM hikayeler WHERE bitis <= ? LIMIT 5').bind(now()).all()).results;
  for (const s of stories) {
    if (!(await dropMedia(env, s.medya_url, s.id))) continue;
    await db.prepare('DELETE FROM hikayeler WHERE id = ?').bind(s.id).run();
    n++;
  }
  return n;
}
