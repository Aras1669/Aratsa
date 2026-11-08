// MESSAGES_KV: anahtar "a - b" (kullanıcı adları, küçük harf, alfabetik). Mesajlar okunabilir metin olarak saklanır.
import { json, readBody, getUser } from '../_lib.js';
const N = (s) => String(s || '').toLowerCase().slice(0, 40);

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const kv = env.MESSAGES_KV || env.MESSAGES || env.messages;
  if (!kv) return json({ error: 'MESSAGES_KV bağlı değil. Pages > Settings > Bindings bölümüne Production ve Preview için ekleyip projeyi yeniden dağıtın.' }, 500);
  const mine = N(me.username);

  if (request.method === 'GET') {
    const peer = N(new URL(request.url).searchParams.get('with'));
    if (!peer) return json({ conversations: JSON.parse((await kv.get('idx:' + mine)) || '{}') });
    const c = JSON.parse((await kv.get([mine, peer].sort().join(' - '))) || '{}');
    return json({ msgs: c.msgs || [] });
  }
  if (request.method !== 'POST') return json({ error: 'Desteklenmeyen yöntem.' }, 405);

  const { to, text } = await readBody(request);
  const peer = N(to), t = String(text || '').trim().slice(0, 1000);
  if (!peer || peer === mine || !t) return json({ error: 'Geçersiz mesaj.' }, 400);
  if (!(await env.USERS_KV.get('uname:' + peer))) return json({ error: 'Kullanıcı bulunamadı.' }, 404);

  const key = [mine, peer].sort().join(' - ');
  const c = JSON.parse((await kv.get(key)) || '{}');
  const msg = { id: crypto.randomUUID().slice(0, 8), from: mine, text: t, t: Date.now() };
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
