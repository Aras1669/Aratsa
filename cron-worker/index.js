// Her saat başı çalışır (Cron: 0 * * * *). Gerekli: KV binding POSTS_KV; değişken CLOUDINARY_API_KEY; secret CLOUDINARY_API_SECRET.
// Silinme isteğinden 24 saat geçen medyayı Cloudinary'den siler.
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

async function sweep(env) {
  let cursor;
  do {
    const r = await env.POSTS_KV.list({ prefix: 'purge:', cursor });
    for (const k of r.keys) {
      const job = JSON.parse((await env.POSTS_KV.get(k.name)) || 'null');
      if (job && Date.now() >= job.at && (await destroy(env, job))) await env.POSTS_KV.delete(k.name);
    }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(sweep(env)); },
  async fetch() { return new Response('Not found', { status: 404 }); },
};
