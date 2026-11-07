// Ortak yardımcılar (onRequest* export'u olmadığı için route olmaz)
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const readBody = async (request) => { try { return await request.json(); } catch { return {}; } };

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${b64(salt)}$${b64(await derive(password, salt))}`;
}

export async function checkPassword(password, user) {
  if (user.hash) {
    const [, salt, hash] = user.hash.split('$');
    return b64(await derive(password, unb64(salt))) === hash;
  }
  // Eski kayıtlar: Base64 (girişte otomatik olarak hash'e yükseltilir)
  return btoa(String.fromCharCode(...new TextEncoder().encode(password))) === user.şifre;
}

export async function createSession(env, user) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  await env.USERS_KV.put('sess:' + token, JSON.stringify({ id: user.id, username: user.isim, email: user.mail }), { expirationTtl: 60 * 60 * 24 * 30 });
  return token;
}

export async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token || !env.USERS_KV) return null;
  const s = await env.USERS_KV.get('sess:' + token);
  return s ? JSON.parse(s) : null;
}

export const publicUser = (u) => ({ id: u.id, username: u.isim, isim: u.isim, email: u.mail, mail: u.mail });
