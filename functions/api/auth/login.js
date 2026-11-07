import { json, readBody, checkPassword, hashPassword, createSession, publicUser } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.USERS_KV) return json({ error: 'Sistem hatası: USERS_KV tanımlı değil.' }, 500);
  const b = await readBody(request);
  const key = String(b.email || b.mail || '').trim().toLowerCase();
  const pass = String(b.password || b.şifre || '');
  if (!key || !pass) return json({ error: 'E-posta ve şifre zorunludur.' }, 400);

  const raw = await env.USERS_KV.get(key);
  const user = raw && JSON.parse(raw);
  if (!user || !(await checkPassword(pass, user))) return json({ error: 'Geçersiz e-posta veya şifre.' }, 401);

  if (!user.hash) { // eski Base64 kaydını güvenli hash'e yükselt
    user.hash = await hashPassword(pass);
    delete user.şifre;
    await env.USERS_KV.put(key, JSON.stringify(user));
  }
  return json({ success: true, token: await createSession(env, user), user: publicUser(user) });
}
