// Aratsa Mesajlar API: Mesajlar açık metin olarak Cloudflare KV'de "kullanıcı1-kullanıcı2" formatında saklanır.
import { json, readBody, getUser, getKv } from '../_lib.js';

const N = (s) => String(s || '').toLowerCase().trim();

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);

  // Esnek KV bağlantısı: MESSAGES_KV, USERS_KV veya bağlı herhangi bir KV'yi kullanır
  const kv = getKv(env, 'MESSAGES_KV');
  if (!kv) {
    return json({ 
      error: 'KV Bağlantı Hatası: Cloudflare Pages ayarlarında MESSAGES_KV binding eklenmemiş veya redeploy yapılmamış olabilir.' 
    }, 500);
  }

  const mine = N(me.username);

  // GET: Sohbet listesini veya belirli bir kullanıcıyla olan mesajları getir
  if (request.method === 'GET') {
    const peer = N(new URL(request.url).searchParams.get('with'));
    if (!peer) {
      const idx = JSON.parse((await kv.get('idx:' + mine)) || '{}');
      return json({ conversations: idx });
    }

    // Anahtar formatı: "kullanıcı1-kullanıcı2" (alfabetik sıralı)
    const key = [mine, peer].sort().join('-');
    let raw = await kv.get(key);
    // Eski "kullanıcı1 - kullanıcı2" formatıyla uyumluluk kontrolü
    if (!raw) raw = await kv.get([mine, peer].sort().join(' - '));

    const c = JSON.parse(raw || '{}');
    return json({ msgs: c.msgs || [] });
  }

  // POST: Yeni mesaj gönder
  if (request.method !== 'POST') return json({ error: 'Desteklenmeyen yöntem.' }, 405);

  const b = await readBody(request);
  const peer = N(b.to || b.peer);
  const text = String(b.text || b.ct || '').trim();

  if (!peer || peer === mine) {
    return json({ error: 'Geçersiz alıcı.' }, 400);
  }
  if (!text || text.length > 5000) {
    return json({ error: 'Mesaj boş olamaz ve 5000 karakterden uzun olamaz.' }, 400);
  }

  // Kullanıcı kontrolü
  const usersKv = getKv(env, 'USERS_KV');
  if (usersKv) {
    const exists = await usersKv.get('uname:' + peer);
    if (!exists) {
      return json({ error: `Kullanıcı @${peer} bulunamadı.` }, 404);
    }
  }

  // KV anahtarı: "kullanıcı1-kullanıcı2"
  const key = [mine, peer].sort().join('-');
  let c = JSON.parse((await kv.get(key)) || (await kv.get([mine, peer].sort().join(' - '))) || '{}');

  const msg = {
    id: crypto.randomUUID().slice(0, 8),
    from: mine,
    to: peer,
    text: text, // Şifrelenmemiş, sunucuda doğrudan okunabilir metin
    t: Date.now()
  };

  c.id = key;
  c.members = [mine, peer].sort();
  c.msgs = [...(c.msgs || []), msg].slice(-300); // Son 300 mesaj saklanır

  await kv.put(key, JSON.stringify(c));

  // Her iki kullanıcının gelen kutusu dizinini güncelle
  for (const [a, b] of [[mine, peer], [peer, mine]]) {
    const idxKey = 'idx:' + a;
    const idx = JSON.parse((await kv.get(idxKey)) || '{}');
    idx[b] = msg.t;
    await kv.put(idxKey, JSON.stringify(idx));
  }

  return json({ success: true, msg });
}
