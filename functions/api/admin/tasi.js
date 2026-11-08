// TEK SEFERLİK: eski KV verisini D1'e taşır. ADMIN_KEY tanımlı değilse bu adres 404 verir.
import { json, safeEq, now } from '../../_lib.js';

const names = async (kv, prefix) => { const out = []; let c; do { const r = await kv.list({ prefix, cursor: c }); out.push(...r.keys.map((k) => k.name)); c = r.list_complete ? undefined : r.cursor; } while (c); return out; };
const get = async (kv, k) => JSON.parse((await kv.get(k)) || 'null');
const iso = (v) => { const d = new Date(v); return isNaN(d) ? now() : d.toISOString(); };

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.ADMIN_KEY || !safeEq(u.searchParams.get('key') || '', env.ADMIN_KEY)) return json({ error: 'Bulunamadı.' }, 404);
  if (!env.DB) return json({ error: 'DB (D1) bağlı değil.' }, 500);
  const adim = u.searchParams.get('adim'), bas = Number(u.searchParams.get('bas')) || 0;
  const STEP = { kullanicilar: 20, gonderiler: 10, takipler: 20, mesajlar: 3 }[adim];
  if (!STEP) return json({ error: 'adim = kullanicilar | gonderiler | takipler | mesajlar' }, 400);
  const P = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const ins = [], atlanan = [];
  const mkv = env.MESSAGES_KV || env.MESSAGES || env.messages;
  let toplam = 0;

  if (adim === 'kullanicilar') {
    const keys = (await names(env.USERS_KV, '')).filter((k) => k.includes('@') && !k.includes(':'));
    toplam = keys.length;
    for (const k of keys.slice(bas, bas + STEP)) {
      const x = await get(env.USERS_KV, k);
      if (!x?.şifre) { atlanan.push(k); continue; }
      ins.push(P('INSERT OR IGNORE INTO kullanicilar (id, kullanici_adi, eposta, sifre_base64, olusturma) VALUES (?,?,?,?,?)', x.id, x.isim, k, x.şifre, now()));
    }
  } else if (adim === 'gonderiler') {
    const all = (await get(env.POSTS_KV, 'all_posts')) || [];
    toplam = all.length;
    for (const p of all.slice(bas, bas + STEP)) {
      ins.push(P('INSERT OR IGNORE INTO gonderiler (id, kullanici_id, kullanici_adi, medya_url, medya_tipi, aciklama, begeni_sayisi, tarih) VALUES (?,?,?,?,?,?,?,?)', p.id, p.user_id, p.username, p.media_url, p.media_type === 'video' ? 'video' : 'image', p.caption || '', (p.liked_by || []).length, iso(p.created_at)));
      for (const uid of p.liked_by || []) ins.push(P('INSERT OR IGNORE INTO begeniler (gonderi_id, kullanici_id) VALUES (?,?)', p.id, uid));
      for (const c of p.comments || []) ins.push(P('INSERT OR IGNORE INTO yorumlar (id, gonderi_id, kullanici_id, kullanici_adi, metin, tarih) VALUES (?,?,?,?,?,?)', c.id, p.id, c.user_id, c.username, c.text, iso(c.created_at)));
    }
    if (bas === 0) for (const k of (await names(env.POSTS_KV, 'purge:')).slice(0, 20)) { // eski Cloudinary silme kuyruğu
      const j = await get(env.POSTS_KV, k);
      if (j) ins.push(P('INSERT OR IGNORE INTO gonderiler (id, kullanici_id, kullanici_adi, medya_url, medya_tipi, aciklama, begeni_sayisi, tarih, silinme_istegi) VALUES (?,?,?,?,?,?,0,?,?)', k.slice(6), 'silinmis', 'silinmis', `https://res.cloudinary.com/${j.cloud}/${j.type}/upload/${j.id}`, j.type === 'video' ? 'video' : 'image', '', now(), new Date(j.at - 864e5).toISOString()));
    }
  } else if (adim === 'takipler') {
    const keys = await names(env.USERS_KV, 'fw:');
    toplam = keys.length;
    for (const k of keys.slice(bas, bas + STEP)) for (const t of (await get(env.USERS_KV, k)) || []) ins.push(P('INSERT OR IGNORE INTO takipler (takip_eden, takip_edilen) VALUES (?,?)', k.slice(3), t));
  } else {
    const keys = (await names(mkv, '')).filter((k) => k.includes(' - '));
    toplam = keys.length;
    for (const k of keys.slice(bas, bas + STEP)) {
      const c = await get(mkv, k);
      for (const m of c?.msgs || []) if (m.text) ins.push(P('INSERT OR IGNORE INTO mesajlar (id, sohbet, gonderen, alici, metin, tarih) VALUES (?,?,?,?,?,?)', m.id + '_' + k, k, m.from, (c.members || []).find((x) => x !== m.from) || '', m.text, iso(m.t)));
    }
  }
  for (let i = 0; i < ins.length; i += 40) await env.DB.batch(ins.slice(i, i + 40));
  const sonraki = bas + STEP < toplam ? `${u.origin}${u.pathname}?key=${u.searchParams.get('key')}&adim=${adim}&bas=${bas + STEP}` : 'BİTTİ';
  return json({ adim, bas, toplam, atlanan, sonraki });
}
