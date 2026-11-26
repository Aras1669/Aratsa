import { json, readBody, getUser, N, limited, bump } from '../_lib.js';

export async function onRequest({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const db = env.DB, mine = N(me.username);
  if (request.method === 'GET') {
    const [a, b] = (await db.batch([
      db.prepare('SELECT takip_edilen AS n FROM takipler WHERE takip_eden = ?').bind(mine),
      db.prepare('SELECT takip_eden AS n FROM takipler WHERE takip_edilen = ?').bind(mine),
    ])).map((r) => r.results.map((x) => x.n));
    return json({ following: a, followers: b });
  }
  if (await limited(env, 'takip:' + me.id, 30)) return json({ error: 'Çok hızlı işlem yapıyorsunuz, biraz bekleyin.' }, 429);
  await bump(env, 'takip:' + me.id, 60e3);
  const { target, action } = await readBody(request);
  const t = N(target).slice(0, 40);
  if (!t || t === mine) return json({ error: 'Geçersiz kullanıcı.' }, 400);
  if (!(await db.prepare('SELECT 1 AS x FROM kullanicilar WHERE kullanici_adi = ?').bind(t).first())) return json({ error: 'Kullanıcı bulunamadı.' }, 404);
  const on = action === 'follow';
  await db.prepare(on ? 'INSERT OR IGNORE INTO takipler (takip_eden, takip_edilen) VALUES (?,?)' : 'DELETE FROM takipler WHERE takip_eden = ? AND takip_edilen = ?').bind(mine, t).run();
  return json({ success: true, following: on });
}
