import { json, readBody, readPw64, validPw64, safeEq, createSession, pub, sha, limited, bump } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Sistem hatası: DB (D1) bağlı değil.' }, 500);
  const b = await readBody(request);
  const mail = String(b.email || b.mail || '').trim().toLowerCase();
  const pw = readPw64(b);
  if (!mail || mail.length > 120 || !validPw64(pw)) return json({ error: 'E-posta ve şifre zorunludur.' }, 400);

  const rk = 'giris:' + (await sha((request.headers.get('CF-Connecting-IP') || '') + '|' + mail));
  if (await limited(env, rk, 8)) return json({ error: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.' }, 429);

  const u = await env.DB.prepare('SELECT id, kullanici_adi, eposta, sifre_base64 FROM kullanicilar WHERE eposta = ?').bind(mail).first();
  if (!u || !safeEq(pw, u.sifre_base64)) {
    await bump(env, rk, 900e3);
    return json({ error: 'Geçersiz e-posta veya şifre.' }, 401);
  }
  return json({ success: true, token: await createSession(env, u.id), user: pub(u) });
}
