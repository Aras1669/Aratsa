import { json, readBody, getUser, now, ago } from '../_lib.js';
import { temizle } from '../_cloud.js';

const OK_URL = /^https:\/\/(res\.cloudinary\.com|images\.unsplash\.com)\/[^\s"'<>]{1,900}$/i;

// Veritabanı satırları -> istemcinin beklediği biçim (başkasının kimliği ve beğenen listesi gitmez)
const shape = (posts, comments, liked, uid) => posts.map((p) => ({
  id: p.id, username: p.kullanici_adi, media_url: p.medya_url, media_type: p.medya_tipi, caption: p.aciklama,
  likes_count: p.begeni_sayisi, liked: liked.has(p.id), mine: !!uid && p.kullanici_id === uid, created_at: p.tarih,
  comments: comments.filter((c) => c.gonderi_id === p.id).map((c) => ({ id: c.id, username: c.kullanici_adi, text: c.metin, created_at: c.tarih, mine: !!uid && c.kullanici_id === uid })),
}));

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'DB (D1) bağlı değil.' }, 500);
  context.waitUntil?.(temizle(env)); // sunucu kapalı kaldıysa ilk ziyarette süresi dolanları siler
  const me = await getUser(request, env);
  const live = 'silinme_istegi IS NULL';
  // Misafir sınırı sunucuda: en yeni 2 gönderi + en çok beğenilen 5 reels
  const where = me ? live : `${live} AND (id IN (SELECT id FROM gonderiler WHERE ${live} ORDER BY tarih DESC LIMIT 2) OR id IN (SELECT id FROM gonderiler WHERE ${live} AND medya_tipi = 'video' ORDER BY begeni_sayisi DESC, tarih DESC LIMIT 5))`;
  const [posts, comments, likes] = (await env.DB.batch([
    env.DB.prepare(`SELECT * FROM gonderiler WHERE ${where} ORDER BY tarih DESC LIMIT 100`),
    env.DB.prepare(`SELECT * FROM yorumlar WHERE gonderi_id IN (SELECT id FROM gonderiler WHERE ${where} ORDER BY tarih DESC LIMIT 100) ORDER BY tarih`),
    env.DB.prepare('SELECT gonderi_id FROM begeniler WHERE kullanici_id = ?').bind(me?.id || ''),
  ])).map((r) => r.results);
  return json(shape(posts, comments, new Set(likes.map((l) => l.gonderi_id)), me?.id));
}

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Gönderi paylaşmak için giriş yapmalısınız.' }, 401);
  const b = await readBody(request);
  const url = String(b.media_url || '');
  if (!OK_URL.test(url)) return json({ error: 'Geçerli bir Cloudinary medya bağlantısı gerekli.' }, 400);
  if (env.CLOUDINARY_CLOUD_NAME && /res\.cloudinary\.com/i.test(url) && !url.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`)) return json({ error: 'Medya bu hesaba ait değil.' }, 400);

  const sayi = await env.DB.prepare('SELECT COUNT(*) AS n FROM gonderiler WHERE kullanici_id = ? AND tarih > ?').bind(me.id, ago(864e5)).first();
  if (sayi.n >= 20) return json({ error: 'Günlük sınır: günde en fazla 20 gönderi paylaşabilirsiniz.' }, 429);

  const row = {
    id: 'post_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14), kullanici_id: me.id, kullanici_adi: me.username, medya_url: url,
    medya_tipi: /\/video\/upload\//.test(url) || b.media_type === 'video' ? 'video' : 'image', aciklama: String(b.caption || '').slice(0, 2200), begeni_sayisi: 0, tarih: now(),
  };
  await env.DB.prepare('INSERT INTO gonderiler (id, kullanici_id, kullanici_adi, medya_url, medya_tipi, aciklama, begeni_sayisi, tarih) VALUES (?,?,?,?,?,?,?,?)').bind(...Object.values(row)).run();
  return json({ success: true, post: shape([row], [], new Set(), me.id)[0] }, 201);
}
