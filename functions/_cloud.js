// Cloudinary entegrasyonu ve 24 saatlik otomatik medya temizliği
export function parseCloudinary(url) {
  const m = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[A-Za-z0-9]+)?$/);
  return m ? { cloud: m[1], type: m[2], id: decodeURIComponent(m[3]) } : null;
}

export async function destroy(env, parsed) {
  if (!parsed || !env || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return false;
  const cloud = parsed.cloud || env.CLOUDINARY_CLOUD_NAME;
  const type = parsed.type || 'image';
  const id = parsed.id;
  if (!cloud || !id) return false;

  try {
    const ts = Math.floor(Date.now() / 1000);
    const raw = new TextEncoder().encode(`public_id=${id}&timestamp=${ts}${env.CLOUDINARY_API_SECRET}`);
    const sig = [...new Uint8Array(await crypto.subtle.digest('SHA-1', raw))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const fd = new FormData();
    fd.append('public_id', id);
    fd.append('timestamp', ts);
    fd.append('api_key', env.CLOUDINARY_API_KEY);
    fd.append('signature', sig);

    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${type}/destroy`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    return r.ok && (j.result === 'ok' || j.result === 'not found');
  } catch {
    return false;
  }
}

export async function deleteCloudinaryMedia(env, mediaUrl) {
  const parsed = parseCloudinary(mediaUrl);
  if (!parsed) return false;
  return await destroy(env, parsed);
}

// Saatte bir çalışan temizleme kontrolü (ziyaretlerde tetiklenir)
export async function purgeDue(env) {
  const kv = env.POSTS_KV || env.KV;
  if (!kv) return;

  const now = Date.now();
  const lastCheck = Number(await kv.get('purge_last')) || 0;
  // Her saat başı bir defa çalıştır
  if (now - lastCheck < 3600 * 1000) return;
  await kv.put('purge_last', String(now));

  try {
    // 1. Silinmek üzere kuyruğa alınan medyaları kontrol et
    if (kv.list) {
      const { keys } = await kv.list({ prefix: 'purge:', limit: 50 });
      for (const k of keys || []) {
        const job = JSON.parse((await kv.get(k.name)) || 'null');
        if (job && now >= (job.at || 0)) {
          await destroy(env, job);
          await kv.delete(k.name);
        }
      }
    }

    // 2. 24 saati geçmiş geçici gönderiler varsa Cloudinary'den temizle
    const rawPosts = await kv.get('all_posts');
    if (rawPosts) {
      let posts = JSON.parse(rawPosts);
      let changed = false;
      const filtered = [];
      for (const p of posts) {
        const ageHours = (now - new Date(p.created_at).getTime()) / (3600 * 1000);
        // Eğer gönderi 24 saati geçmişse ve silinmesi işaretlenmişse Cloudinary'den temizle
        if (p.expires_in_24h && ageHours >= 24) {
          if (p.media_url) {
            await deleteCloudinaryMedia(env, p.media_url);
          }
          changed = true;
        } else {
          filtered.push(p);
        }
      }
      if (changed) {
        await kv.put('all_posts', JSON.stringify(filtered));
      }
    }
  } catch (err) {
    console.error('Purge error:', err);
  }
}
