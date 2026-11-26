// Hikayeler: 24 saat görünür, sonra saatlik temizlik Cloudinary dosyasıyla birlikte siler. Yalnızca giriş yapmışlar görür.
import { json, readBody, getUser, now, ago, mediaOk } from '../_lib.js';

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Hikayeler için giriş yapmalısınız.' }, 401);
  const db = env.DB;

  if (request.method === 'GET') {
    const { results } = await db.prepare('SELECT id, kullanici_id, kullanici_adi, medya_url, medya_tipi, tarih, bitis FROM hikayeler WHERE bitis > ? ORDER BY tarih').bind(now()).all();
    return json(results.map((s) => ({ id: s.id, username: s.kullanici_adi, media_url: s.medya_url, media_type: s.medya_tipi, created_at: s.tarih, expires_at: s.bitis, mine: s.kullanici_id === me.id })));
  }
  if (request.method === 'POST') {
    const url = String((await readBody(request)).media_url || '');
    if (!mediaOk(env, url)) return json({ error: 'Geçerli bir Cloudinary medya bağlantısı gerekli.' }, 400);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM hikayeler WHERE kullanici_id = ? AND tarih > ?').bind(me.id, ago(864e5)).first();
    if (n.n >= 20) return json({ error: 'Günlük sınır: günde en fazla 20 hikaye.' }, 429);
    const s = { id: 'st_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14), kullanici_id: me.id, kullanici_adi: me.username, medya_url: url, medya_tipi: /\/video\/upload\//.test(url) ? 'video' : 'image', tarih: now(), bitis: new Date(Date.now() + 864e5).toISOString() };
    await db.prepare('INSERT INTO hikayeler (id, kullanici_id, kullanici_adi, medya_url, medya_tipi, tarih, bitis) VALUES (?,?,?,?,?,?,?)').bind(...Object.values(s)).run();
    return json({ success: true }, 201);
  }
  if (request.method === 'DELETE') { // erken silme: süre hemen biter, saatlik temizlik dosyayı siler
    await db.prepare('UPDATE hikayeler SET bitis = ? WHERE id = ? AND kullanici_id = ? AND bitis > ?').bind(now(), String(new URL(request.url).searchParams.get('id')), me.id, now()).run();
    return json({ success: true });
  }
  return json({ error: 'Desteklenmeyen yöntem.' }, 405);
}
