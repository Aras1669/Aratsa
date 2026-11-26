// Şikayetler D1'deki "sikayetler" tablosuna düşer (id, durum, içerik özeti ile). Siz D1 Konsolu'ndan bakarsınız.
import { json, readBody, getUser, now, limited, bump } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Şikayet için giriş yapmalısınız.' }, 401);
  if (await limited(env, 'sikayet:' + me.id, 20)) return json({ error: 'Çok fazla şikayet gönderdiniz, daha sonra tekrar deneyin.' }, 429);
  const { tur, id, sebep } = await readBody(request);
  const db = env.DB, sid = String(id || '').slice(0, 60);
  let h = null;
  if (tur === 'gonderi') h = await db.prepare('SELECT kullanici_adi AS k, medya_url AS m, aciklama AS a FROM gonderiler WHERE id = ?').bind(sid).first();
  else if (tur === 'hikaye') h = await db.prepare('SELECT kullanici_adi AS k, medya_url AS m, NULL AS a FROM hikayeler WHERE id = ?').bind(sid).first();
  else if (tur === 'kullanici') h = await db.prepare('SELECT kullanici_adi AS k, NULL AS m, bio AS a FROM kullanicilar WHERE kullanici_adi = ?').bind(sid).first();
  if (!h) return json({ error: 'İçerik bulunamadı.' }, 404);
  await bump(env, 'sikayet:' + me.id, 3600e3);
  await db.prepare('INSERT OR IGNORE INTO sikayetler (hedef_tur, hedef_id, hedef_kullanici, bildiren_id, bildiren_adi, sebep, medya_url, aciklama, tarih) VALUES (?,?,?,?,?,?,?,?,?)').bind(tur, tur === 'kullanici' ? h.k.toLowerCase() : sid, h.k, me.id, me.username, String(sebep || '').slice(0, 100), h.m, h.a, now()).run();
  return json({ success: true });
}
