export const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
export const readBody = async (r) => { try { return await r.json(); } catch { return {}; } };
export const encodePw = (p) => btoa(String.fromCharCode(...new TextEncoder().encode(p)));

// Önceki sürümde PBKDF2'ye yükselmiş hesaplar için tek seferlik geri dönüş (girişte Base64'e çevrilir)
async function legacyHashOk(pass, hash) {
  const [, salt, h] = hash.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === h;
}
export const checkPassword = async (pass, user) => (user.hash ? legacyHashOk(pass, user.hash) : encodePw(pass) === user.şifre);

export async function createSession(env, user) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  await env.USERS_KV.put('sess:' + token, JSON.stringify({ id: user.id, username: user.isim, email: user.mail }), { expirationTtl: 2592000 });
  return token;
}
export async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token || !env.USERS_KV) return null;
  const s = await env.USERS_KV.get('sess:' + token);
  return s ? JSON.parse(s) : null;
}
export const publicUser = (u) => ({ id: u.id, username: u.isim, isim: u.isim, email: u.mail, mail: u.mail });
