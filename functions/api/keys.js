// Uçtan uca şifreleme için yalnızca GENEL anahtarlar burada tutulur (özel anahtar cihazdan çıkmaz)
import { json, readBody, getUser } from '../_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    const u = String(new URL(request.url).searchParams.get('u') || '').toLowerCase();
    const k = u && (await env.USERS_KV.get('pub:' + u));
    return k ? json(JSON.parse(k)) : json({ error: 'Anahtar yok.' }, 404);
  }
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const { jwk } = await readBody(request);
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return json({ error: 'Geçersiz anahtar.' }, 400);
  await env.USERS_KV.put('pub:' + me.username.toLowerCase(), JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }));
  return json({ success: true });
}
