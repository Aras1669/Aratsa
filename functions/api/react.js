// /api/react: beğeni, yorum, silme isteği, şikayet (hepsi oturum anahtarı ister)
import { json, readBody, getUser, now } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Oturum geçersiz, lütfen tekrar giriş yapın.' }, 401);
  const { action, id, text, reason } = await readBody(request);
  const db = env.DB;
  const post = typeof id === 'string' ? await db.prepare('SELECT id, kullanici_id FROM gonderiler WHERE id = ? AND silinme_istegi IS NULL').bind(id).first() : null;
  if (!post) return json({ error: 'Gönderi bulunamadı.' }, 404);

  if (action === 'like') {
    const had = await db.prepare('SELECT 1 AS x FROM begeniler WHERE gonderi_id = ? AND kullanici_id = ?').bind(id, user.id).first();
    const [, , c] = await db.batch([
      had ? db.prepare('DELETE FROM begeniler WHERE gonderi_id = ? AND kullanici_id = ?').bind(id, user.id) : db.prepare('INSERT OR IGNORE INTO begeniler (gonderi_id, kullanici_id) VALUES (?,?)').bind(id, user.id),
      db.prepare('UPDATE gonderiler SET begeni_sayisi = (SELECT COUNT(*) FROM begeniler WHERE gonderi_id = ?1) WHERE id = ?1').bind(id),
      db.prepare('SELECT begeni_sayisi FROM gonderiler WHERE id = ?').bind(id),
    ]);
    return json({ success: true, likes_count: c.results[0].begeni_sayisi, liked: !had });
  }
  if (action === 'comment') {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) return json({ error: 'Yorum boş olamaz.' }, 400);
    const cid = 'c_' + crypto.randomUUID().replaceAll('-', '').slice(0, 10), at = now();
    await db.prepare('INSERT INTO yorumlar (id, gonderi_id, kullanici_id, kullanici_adi, metin, tarih) VALUES (?,?,?,?,?,?)').bind(cid, id, user.id, user.username, t, at).run();
    return json({ success: true, comment: { id: cid, username: user.username, text: t, created_at: at, mine: true } });
  }
  if (action === 'delete') {
    if (post.kullanici_id !== user.id) return json({ error: 'Sadece kendi gönderini silebilirsin.' }, 403);
    // Hemen silinmez: akıştan kalkar, satır ve Cloudinary dosyası 24 saat durur, sonra temizle() siler
    await db.prepare('UPDATE gonderiler SET silinme_istegi = ? WHERE id = ?').bind(now(), id).run();
    return json({ success: true });
  }
  if (action === 'report') {
    await db.prepare('INSERT OR REPLACE INTO sikayetler (gonderi_id, kullanici_id, sebep, tarih) VALUES (?,?,?,?)').bind(id, user.id, String(reason || '').slice(0, 100), now()).run();
    return json({ success: true });
  }
  return json({ error: 'Geçersiz işlem.' }, 400);
}
