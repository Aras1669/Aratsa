export const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
export const readBody = async (r) => { try { return await r.json(); } catch { return {}; } };

// Şifre: istemci Base64 (pw64) yollar; sunucu Base64 olarak saklar ve karşılaştırır.
export const encodePw = (p) => btoa(String.fromCharCode(...new TextEncoder().encode(p)));
export const decodePw = (b) => { try { return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); } catch { return ''; } };
export const readPw64 = (b) => String(b.pw64 || (b.password ? encodePw(String(b.password)) : ''));
export const validPw64 = (s) => /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length <= 700;

export const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const safeEq = (a, b) => { a = String(a); b = String(b); let r = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return r === 0; };

// Önceki sürümde PBKDF2'ye yükselmiş hesaplar için tek seferlik geri dönüş
async function legacyHashOk(plain, hash) {
  const [, salt, h] = hash.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 100000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === h;
}
export const checkPassword = async (pw64, user) => (user.hash ? legacyHashOk(decodePw(pw64), user.hash) : safeEq(pw64, user.şifre || ''));

// Oturum token'ı KV'de yalnızca SHA-256 özeti olarak tutulur
export async function createSession(env, user) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  await env.USERS_KV.put('sess:' + (await sha(token)), JSON.stringify({ id: user.id, username: user.isim, email: user.mail }), { expirationTtl: 2592000 });
  return token;
}
export async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (token.length < 40 || !env.USERS_KV) return null;
  const s = await env.USERS_KV.get('sess:' + (await sha(token)));
  return s ? JSON.parse(s) : null;
}
export const publicUser = (u) => ({ id: u.id, username: u.isim, isim: u.isim, email: u.mail, mail: u.mail });

export const rlGet = async (env, k) => Number(await env.USERS_KV.get('rl:' + k)) || 0;
export const rlBump = (env, k, n, ttl) => env.USERS_KV.put('rl:' + k, String(n + 1), { expirationTtl: ttl });

// İstemciye sadece gereken alanlar gider (kullanıcı kimlikleri ve beğenen listesi sızmaz)
export const viewComment = (c, uid) => ({ id: c.id, username: c.username, text: c.text, created_at: c.created_at, mine: !!uid && c.user_id === uid });
export const viewPost = (p, uid) => ({
  id: p.id, username: p.username, media_url: p.media_url, media_type: p.media_type, caption: p.caption,
  likes_count: p.likes_count || 0, liked: !!uid && (p.liked_by || []).includes(uid), mine: !!uid && p.user_id === uid,
  created_at: p.created_at, comments: (p.comments || []).map((c) => viewComment(c, uid)),
});
