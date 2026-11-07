import { json, readBody, getUser } from '../_lib.js';
const N = (s) => String(s || '').toLowerCase();
const arr = async (kv, k) => JSON.parse((await kv.get(k)) || '[]');

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const mine = N(me.username), kv = env.USERS_KV;
  if (request.method === 'GET') return json({ following: await arr(kv, 'fw:' + mine), followers: await arr(kv, 'fr:' + mine) });
  const { target, action } = await readBody(request);
  const t = N(target);
  if (!t || t === mine) return json({ error: 'Geçersiz kullanıcı.' }, 400);
  if (!(await kv.get('uname:' + t))) return json({ error: 'Kullanıcı bulunamadı.' }, 404);
  const on = action === 'follow';
  const upd = (a, v) => (on ? [...new Set([...a, v])] : a.filter((x) => x !== v));
  await kv.put('fw:' + mine, JSON.stringify(upd(await arr(kv, 'fw:' + mine), t)));
  await kv.put('fr:' + t, JSON.stringify(upd(await arr(kv, 'fr:' + t), mine)));
  return json({ success: true, following: on });
}
