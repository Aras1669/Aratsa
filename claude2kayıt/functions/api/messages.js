// MESSAGES_KV: anahtar "a - b" (kullanıcı adları, küçük harf, alfabetik). Değer yalnızca ŞİFRELİ mesajları içerir.
import { json, readBody, getUser } from '../_lib.js';
const N = (s) => String(s || '').toLowerCase();

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const kv = env.MESSAGES_KV || env.MESSAGES || env.messages;
  if (!kv) return json({ error: 'Sistem hatası: MESSAGES_KV tanımlı değil.' }, 500);
  const mine = N(me.username);

  if (request.method === 'GET') {
    const peer = N(new URL(request.url).searchParams.get('with'));
    if (!peer) return json({ conversations: JSON.parse((await kv.get('idx:' + mine)) || '{}') });
    const c = JSON.parse((await kv.get([mine, peer].sort().join(' - '))) || '{}');
    return json({ msgs: c.msgs || [] });
  }
  if (request.method !== 'POST') return json({ error: 'Desteklenmeyen yöntem.' }, 405);

  const { to, iv, ct } = await readBody(request);
  const peer = N(to);
  if (!peer || peer === mine || typeof iv !== 'string' || typeof ct !== 'string' || !ct || ct.length > 6000 || iv.length > 32) return json({ error: 'Geçersiz mesaj.' }, 400);
  if (!(await env.USERS_KV.get('uname:' + peer))) return json({ error: 'Kullanıcı bulunamadı.' }, 404);

  const key = [mine, peer].sort().join(' - ');
  const c = JSON.parse((await kv.get(key)) || '{}');
  const msg = { id: crypto.randomUUID().slice(0, 8), from: mine, iv, ct, t: Date.now() };
  c.members = [mine, peer].sort();
  c.msgs = [...(c.msgs || []), msg].slice(-300);
  await kv.put(key, JSON.stringify(c));
  for (const [a, b] of [[mine, peer], [peer, mine]]) {
    const idx = JSON.parse((await kv.get('idx:' + a)) || '{}');
    idx[b] = msg.t;
    await kv.put('idx:' + a, JSON.stringify(idx));
  }
  return json({ success: true, msg });
}
