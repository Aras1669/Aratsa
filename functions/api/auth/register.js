import { json, readBody, encodePw, decodePw, createSession, publicUser, getKv } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const kv = getKv(env, 'USERS_KV');
  if (!kv) return json({ error: 'Sistem hatası: USERS_KV tanımlı değil.' }, 500);

  const b = await readBody(request);
  const isim = String(b.username || b.isim || '').trim();
  const mail = String(b.email || b.mail || '').trim().toLowerCase();
  
  // Şifre Base64 olarak gelebilir
  let pass = b.password_b64 ? decodePw(b.password_b64) : String(b.password || b.şifre || '');
  // Eğer b.password Base64 formatındaysa çözmeyi dene
  if (b.password && !b.password_b64) {
    try {
      const decoded = decodePw(b.password);
      if (decoded && decoded !== b.password && decoded.length >= 6) {
        pass = decoded;
      }
    } catch {}
  }

  if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{3,20}$/.test(isim)) {
    return json({ error: 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).' }, 400);
  }
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return json({ error: 'Geçersiz e-posta formatı.' }, 400);
  }
  if (pass.length < 6 || pass.length > 128) {
    return json({ error: 'Şifre en az 6 karakter olmalı.' }, 400);
  }

  if (await kv.get(mail)) {
    return json({ error: 'Bu e-posta ile zaten bir hesap var.' }, 409);
  }
  const uk = 'uname:' + isim.toLowerCase();
  if (await kv.get(uk)) {
    return json({ error: 'Bu kullanıcı adı alınmış.' }, 409);
  }

  const user = { 
    id: 'usr_' + crypto.randomUUID(), 
    isim, 
    mail, 
    şifre: encodePw(pass) // Şifre Base64 formatında saklanır
  };

  await kv.put(mail, JSON.stringify(user));
  await kv.put(uk, mail);

  // İstemci taraflı arama ve fuzzy eşleştirme için all_usernames listesini güncelle
  try {
    let allUsers = JSON.parse((await kv.get('all_usernames')) || '[]');
    if (!allUsers.includes(isim.toLowerCase())) {
      allUsers.push(isim.toLowerCase());
      await kv.put('all_usernames', JSON.stringify(allUsers));
    }
  } catch {}

  const token = await createSession(env, user);
  return json({ success: true, token, user: publicUser(user) }, 201);
}
