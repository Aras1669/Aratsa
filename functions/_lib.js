export const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
export const readBody = async (r) => { try { return await r.json(); } catch { return {}; } };
export const N = (s) => String(s || '').toLowerCase();
export const now = () => new Date().toISOString();
export const ago = (ms) => new Date(Date.now() - ms).toISOString();

// Şifre: istemci Base64 (pw64) yollar; sunucu Base64 olarak saklar ve karşılaştırır.
export const encodePw = (p) => btoa(String.fromCharCode(...new TextEncoder().encode(p)));
export const decodePw = (b) => { try { return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); } catch { return ''; } };
export const readPw64 = (b) => String(b.pw64 || (b.password ? encodePw(String(b.password)) : ''));
export const validPw64 = (s) => /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length <= 700;
export const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const safeEq = (a, b) => { a = String(a); b = String(b); let r = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return r === 0; };
export const pub = (u) => ({ id: u.id, username: u.kullanici_adi, isim: u.kullanici_adi, email: u.eposta, mail: u.eposta });

// Oturum anahtarı veritabanında yalnızca SHA-256 özeti olarak tutulur
export async function createSession(env, userId) {
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oturumlar WHERE bitis < ?').bind(now()),
    env.DB.prepare('INSERT INTO oturumlar (token_ozeti, kullanici_id, bitis) VALUES (?,?,?)').bind(await sha(token), userId, new Date(Date.now() + 2592e6).toISOString()),
  ]);
  return token;
}
export async function getUser(request, env) {
  const t = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (t.length < 40 || !env.DB) return null;
  return env.DB.prepare('SELECT k.id AS id, k.kullanici_adi AS username, k.eposta AS email FROM oturumlar o JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.token_ozeti = ? AND o.bitis > ?').bind(await sha(t), now()).first();
}

// Hız sınırı: limited() dolu mu bakar, bump() sayacı artırır (süre dolunca sıfırlanır)
export async function limited(env, key, max) {
  const r = await env.DB.prepare('SELECT sayi FROM deneme_sayaci WHERE anahtar = ? AND bitis > ?').bind(key, now()).first();
  return (r?.sayi || 0) >= max;
}
export const bump = (env, key, ttlMs) => env.DB.prepare('INSERT INTO deneme_sayaci (anahtar, sayi, bitis) VALUES (?1, 1, ?2) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN bitis > ?3 THEN sayi + 1 ELSE 1 END, bitis = CASE WHEN bitis > ?3 THEN bitis ELSE ?2 END').bind(key, new Date(Date.now() + ttlMs).toISOString(), now()).run();
