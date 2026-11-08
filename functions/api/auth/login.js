import { json, readBody, readPw64, validPw64, checkPassword, createSession, publicUser, sha, rlGet, rlBump } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.USERS_KV) return json({ error: 'Sistem hatası: USERS_KV bağlı değil.' }, 500);
  const b = await readBody(request);
  const key = String(b.email || b.mail || '').trim().toLowerCase();
  const pw = readPw64(b);
  if (!key || key.length > 120 || !validPw64(pw)) return json({ error: 'E-posta ve şifre zorunludur.' }, 400);

  const rk = 'login:' + (await sha((request.headers.get('CF-Connecting-IP') || '') + '|' + key));
  const fails = await rlGet(env, rk);
  if (fails >= 8) return json({ error: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.' }, 429);

  const raw = await env.USERS_KV.get(key);
  const user = raw && JSON.parse(raw);
  if (!user || !(await checkPassword(pw, user))) {
    await rlBump(env, rk, fails, 900);
    return json({ error: 'Geçersiz e-posta veya şifre.' }, 401);
  }
  if (user.hash) { user.şifre = pw; delete user.hash; await env.USERS_KV.put(key, JSON.stringify(user)); }
  const uk = 'uname:' + String(user.isim).toLowerCase();
  if (!(await env.USERS_KV.get(uk))) await env.USERS_KV.put(uk, key);
  return json({ success: true, token: await createSession(env, user), user: publicUser(user) });
}
