import { json, readBody, checkPassword, encodePw, decodePw, createSession, publicUser, getKv } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const kv = getKv(env, 'USERS_KV');
  if (!kv) return json({ error: 'Sistem hatası: USERS_KV tanımlı değil.' }, 500);

  const b = await readBody(request);
  const key = String(b.email || b.mail || '').trim().toLowerCase();
  
  // Şifre Base64 olarak gelebilir
  let pass = b.password_b64 ? decodePw(b.password_b64) : String(b.password || b.şifre || '');
  if (b.password && !b.password_b64) {
    try {
      const decoded = decodePw(b.password);
      if (decoded && decoded !== b.password) {
        pass = decoded;
      }
    } catch {}
  }

  if (!key || !pass) {
    return json({ error: 'E-posta ve şifre zorunludur.' }, 400);
  }

  // Giriş hem e-posta ile hem kullanıcı adı ile yapılabilir
  let userEmail = key;
  if (!key.includes('@')) {
    const lookedUp = await kv.get('uname:' + key);
    if (lookedUp) userEmail = lookedUp;
  }

  const raw = await kv.get(userEmail);
  const user = raw && JSON.parse(raw);
  if (!user || !(await checkPassword(pass, user))) {
    return json({ error: 'Geçersiz e-posta/kullanıcı adı veya şifre.' }, 401);
  }

  // Eski hash'ten Base64 şifreye geçiş güncellemesi
  if (user.hash) { 
    user.şifre = encodePw(pass); 
    delete user.hash; 
    await kv.put(userEmail, JSON.stringify(user)); 
  }

  const uk = 'uname:' + String(user.isim).toLowerCase();
  if (!(await kv.get(uk))) {
    await kv.put(uk, userEmail);
  }

  const token = await createSession(env, user);
  return json({ success: true, token, user: publicUser(user) });
}
