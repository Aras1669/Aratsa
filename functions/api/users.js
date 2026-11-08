// Kullanıcı adı listesi (yalnızca giriş yapmış kullanıcılara); bulanık eşleştirme istemcide yapılır
import { json, getUser } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  if (!(await getUser(request, env))) return json({ error: 'Giriş yapmalısınız.' }, 401);
  const users = [];
  let cursor;
  do {
    const r = await env.USERS_KV.list({ prefix: 'uname:', cursor });
    users.push(...r.keys.map((k) => k.name.slice(6)));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor && users.length < 5000);
  return json({ users }, 200, { 'Cache-Control': 'private, max-age=120' });
}
