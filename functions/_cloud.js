// Cloudinary: silinen gönderinin medyası 24 saat sonra depodan da silinir (zamanlayıcı yok; ziyaretlerde saatte bir kontrol edilir)
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

export async function purgeDue(env) {
  if (!env.POSTS_KV || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return;
  if (Date.now() - (Number(await env.POSTS_KV.get('purge_last')) || 0) < 3600e3) return;
  await env.POSTS_KV.put('purge_last', String(Date.now()));
  const { keys } = await env.POSTS_KV.list({ prefix: 'purge:', limit: 50 });
  for (const k of keys) {
    const job = JSON.parse((await env.POSTS_KV.get(k.name)) || 'null');
    if (job && Date.now() >= job.at && (await destroy(env, job))) await env.POSTS_KV.delete(k.name);
  }
}
