// Mesajlar düz metin olarak "mesajlar" tablosunda tutulur. sohbet = "a - b" (kullanıcı adları, alfabetik).
import { json, readBody, getUser, N, now, limited, bump } from '../_lib.js';

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const db = env.DB, mine = N(me.username);

  if (request.method === 'GET') {
    const peer = N(new URL(request.url).searchParams.get('with')).slice(0, 40);
    if (!peer) {
      const { results } = await db.prepare('SELECT CASE WHEN gonderen = ?1 THEN alici ELSE gonderen END AS kisi, MAX(tarih) AS son FROM mesajlar WHERE gonderen = ?1 OR alici = ?1 GROUP BY kisi ORDER BY son DESC LIMIT 100').bind(mine).all();
      return json({ conversations: Object.fromEntries(results.map((r) => [r.kisi, Date.parse(r.son)])) });
    }
    const { results } = await db.prepare('SELECT id, gonderen AS "from", metin AS text, tarih AS t FROM (SELECT * FROM mesajlar WHERE sohbet = ? ORDER BY tarih DESC LIMIT 300) ORDER BY tarih').bind([mine, peer].sort().join(' - ')).all();
    return json({ msgs: results });
  }
  if (request.method !== 'POST') return json({ error: 'Desteklenmeyen yöntem.' }, 405);

  const { to, text } = await readBody(request);
  const t = String(text || '').trim().slice(0, 1000), peer = N(to).slice(0, 40);
  if (!peer || peer === mine || !t) return json({ error: 'Geçersiz mesaj.' }, 400);
  if (await limited(env, 'mesaj:' + me.id, 30)) return json({ error: 'Çok hızlı mesaj gönderiyorsunuz, biraz bekleyin.' }, 429);
  if (!(await db.prepare('SELECT 1 AS x FROM kullanicilar WHERE kullanici_adi = ?').bind(peer).first())) return json({ error: 'Kullanıcı bulunamadı.' }, 404);
  await bump(env, 'mesaj:' + me.id, 60e3);
  const msg = { id: crypto.randomUUID(), sohbet: [mine, peer].sort().join(' - '), gonderen: mine, alici: peer, metin: t, tarih: now() };
  await db.prepare('INSERT INTO mesajlar (id, sohbet, gonderen, alici, metin, tarih) VALUES (?,?,?,?,?,?)').bind(...Object.values(msg)).run();
  return json({ success: true });
}
