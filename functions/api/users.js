// Kullanıcı adı listesi (yalnızca giriş yapmışlara); en yakın eşleşme istemcide hesaplanır
import { json, getUser } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  if (!(await getUser(request, env))) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const { results } = await env.DB.prepare('SELECT kullanici_adi FROM kullanicilar ORDER BY kullanici_adi LIMIT 5000').all();
  return json({ users: results.map((r) => r.kullanici_adi.toLowerCase()) }, 200, { 'Cache-Control': 'private, max-age=120' });
}
