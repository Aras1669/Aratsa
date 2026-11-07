import { json, readBody, encodePw, createSession, publicUser } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.USERS_KV) return json({ error: 'Sistem hatası: USERS_KV tanımlı değil.' }, 500);
  const b = await readBody(request);
  const isim = String(b.username || b.isim || '').trim();
  const mail = String(b.email || b.mail || '').trim().toLowerCase();
  const pass = String(b.password || b.şifre || '');
  if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{3,20}$/.test(isim)) return json({ error: 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).' }, 400);
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(mail)) return json({ error: 'Geçersiz e-posta formatı.' }, 400);
  if (pass.length < 6 || pass.length > 128) return json({ error: 'Şifre 6-128 karakter olmalı.' }, 400);
  if (await env.USERS_KV.get(mail)) return json({ error: 'Bu e-posta ile zaten bir hesap var.' }, 409);
  const uk = 'uname:' + isim.toLowerCase();
  if (await env.USERS_KV.get(uk)) return json({ error: 'Bu kullanıcı adı alınmış.' }, 409);
  const user = { id: 'usr_' + crypto.randomUUID(), isim, mail, şifre: encodePw(pass) };
  await env.USERS_KV.put(mail, JSON.stringify(user));
  await env.USERS_KV.put(uk, mail);
  return json({ success: true, token: await createSession(env, user), user: publicUser(user) }, 201);
}
