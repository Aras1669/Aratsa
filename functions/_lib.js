export const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
export const readBody = async (r) => { try { return await r.json(); } catch { return {}; } };

// KV Namespace güvenli alma (herhangi bir KV bağlı olsa bile çalışmasını sağlar)
export function getKv(env, preferred = 'USERS_KV') {
  if (!env) return null;
  return env[preferred] || env.USERS_KV || env.MESSAGES_KV || env.POSTS_KV || env.KV || env.MESSAGES || env.messages || null;
}

// Şifreleri Base64 formatına çevirme ve çözme
export const encodePw = (p) => btoa(String.fromCharCode(...new TextEncoder().encode(p)));
export function decodePw(p) {
  if (!p || typeof p !== 'string') return '';
  try {
    const decoded = atob(p);
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return p;
  }
}

// Önceki sürümde PBKDF2'ye yükselmiş hesaplar için tek seferlik geri dönüş (girişte Base64'e çevrilir)
async function legacyHashOk(pass, hash) {
  const [, salt, h] = hash.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === h;
}
export const checkPassword = async (pass, user) => {
  if (user.hash) return legacyHashOk(pass, user.hash);
  const enc = encodePw(pass);
  return user.şifre === enc || user.şifre === pass;
};

export async function createSession(env, user) {
  const kv = getKv(env, 'USERS_KV');
  if (!kv) return null;
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  await kv.put('sess:' + token, JSON.stringify({ id: user.id, username: user.isim, email: user.mail }), { expirationTtl: 2592000 });
  return token;
}

export async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const kv = getKv(env, 'USERS_KV');
  if (!token || !kv) return null;
  const s = await kv.get('sess:' + token);
  return s ? JSON.parse(s) : null;
}

export const publicUser = (u) => ({ id: u.id, username: u.isim, isim: u.isim, email: u.mail, mail: u.mail });
