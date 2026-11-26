// Profiller yalnızca giriş yapmış kullanıcılara açıktır.
import { json, readBody, getUser, N } from '../_lib.js';

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Profilleri görmek için giriş yapmalısınız.' }, 401);
  const db = env.DB;

  if (request.method === 'POST') { // kendi biyografin
    const bio = String((await readBody(request)).bio || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 150);
    await db.prepare('UPDATE kullanicilar SET bio = ? WHERE id = ?').bind(bio, me.id).run();
    return json({ success: true, bio });
  }
  const name = N(new URL(request.url).searchParams.get('u')).slice(0, 40);
  const u = await db.prepare("SELECT id, kullanici_adi, bio, olusturma FROM kullanicilar WHERE kullanici_adi = ? AND durum = 'aktif'").bind(name).first();
  if (!u) return json({ error: 'Kullanıcı bulunamadı.' }, 404);
  const lower = N(u.kullanici_adi);
  const [fr, fw, isf, posts] = (await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM takipler WHERE takip_edilen = ?').bind(lower),
    db.prepare('SELECT COUNT(*) AS n FROM takipler WHERE takip_eden = ?').bind(lower),
    db.prepare('SELECT 1 AS x FROM takipler WHERE takip_eden = ? AND takip_edilen = ?').bind(N(me.username), lower),
    db.prepare('SELECT id, medya_url, medya_tipi, begeni_sayisi FROM gonderiler WHERE kullanici_id = ? AND silinme_istegi IS NULL ORDER BY tarih DESC LIMIT 30').bind(u.id),
  ])).map((x) => x.results);
  return json({ username: u.kullanici_adi, bio: u.bio, joined: u.olusturma, followers: fr[0].n, following: fw[0].n, is_following: isf.length > 0, mine: u.id === me.id, posts: posts.map((p) => ({ id: p.id, media_url: p.medya_url, media_type: p.medya_tipi, likes_count: p.begeni_sayisi })) });
}
