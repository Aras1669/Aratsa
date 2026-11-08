import { json, readBody, readPw64, validPw64, decodePw, createSession, publicUser, sha, rlGet, rlBump } from '../../_lib.js';
const RESERVED = ['admin', 'aratsa', 'root', 'support', 'destek', 'moderator', 'system', 'null'];

export async function onRequestPost({ request, env }) {
  if (!env.USERS_KV) return json({ error: 'Sistem hatası: USERS_KV bağlı değil.' }, 500);
  const b = await readBody(request);
  const isim = String(b.username || b.isim || '').trim();
  const mail = String(b.email || b.mail || '').trim().toLowerCase();
  const pw = readPw64(b);
  const plain = validPw64(pw) ? decodePw(pw) : '';
  if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{3,20}$/.test(isim) || RESERVED.includes(isim.toLowerCase())) return json({ error: 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).' }, 400);
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 120) return json({ error: 'Geçersiz e-posta formatı.' }, 400);
  if (plain.length < 6 || plain.length > 128) return json({ error: 'Şifre 6-128 karakter olmalı.' }, 400);

  const rk = 'reg:' + (await sha(request.headers.get('CF-Connecting-IP') || ''));
  const n = await rlGet(env, rk);
  if (n >= 5) return json({ error: 'Çok fazla kayıt denemesi. Bir saat sonra tekrar deneyin.' }, 429);
  if (await env.USERS_KV.get(mail)) return json({ error: 'Bu e-posta ile zaten bir hesap var.' }, 409);
  const uk = 'uname:' + isim.toLowerCase();
  if (await env.USERS_KV.get(uk)) return json({ error: 'Bu kullanıcı adı alınmış.' }, 409);

  const user = { id: 'usr_' + crypto.randomUUID(), isim, mail, şifre: pw };
  await env.USERS_KV.put(mail, JSON.stringify(user));
  await env.USERS_KV.put(uk, mail);
  await rlBump(env, rk, n, 3600);
  return json({ success: true, token: await createSession(env, user), user: publicUser(user) }, 201);
}
