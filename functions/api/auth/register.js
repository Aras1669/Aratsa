import { json, readBody, readPw64, validPw64, decodePw, createSession, pub, sha, limited, bump, now } from '../../_lib.js';
const RESERVED = ['admin', 'aratsa', 'root', 'support', 'destek', 'moderator', 'system', 'null'];

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Sistem hatası: DB (D1) bağlı değil.' }, 500);
  const b = await readBody(request);
  const isim = String(b.username || b.isim || '').trim();
  const mail = String(b.email || b.mail || '').trim().toLowerCase();
  const pw = readPw64(b);
  const plain = validPw64(pw) ? decodePw(pw) : '';
  if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{3,20}$/.test(isim) || RESERVED.includes(isim.toLowerCase())) return json({ error: 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).' }, 400);
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 120) return json({ error: 'Geçersiz e-posta formatı.' }, 400);
  if (plain.length < 6 || plain.length > 128) return json({ error: 'Şifre 6-128 karakter olmalı.' }, 400);

  const rk = 'kayit:' + (await sha(request.headers.get('CF-Connecting-IP') || ''));
  if (await limited(env, rk, 5)) return json({ error: 'Çok fazla kayıt denemesi. Bir saat sonra tekrar deneyin.' }, 429);
  const id = 'usr_' + crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO kullanicilar (id, kullanici_adi, eposta, sifre_base64, olusturma) VALUES (?,?,?,?,?)').bind(id, isim, mail, pw, now()).run();
  } catch {
    return json({ error: 'Bu e-posta veya kullanıcı adı zaten kayıtlı.' }, 409);
  }
  await bump(env, rk, 3600e3);
  return json({ success: true, token: await createSession(env, id), user: pub({ id, kullanici_adi: isim, eposta: mail }) }, 201);
}
