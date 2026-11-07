import { json, getUser } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const kv = env.USERS_KV || env.MESSAGES_KV || env.KV;
  if (!kv) return json({ users: [] });

  const url = new URL(request.url);
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();

  try {
    let list = JSON.parse((await kv.get('all_usernames')) || '[]');
    
    // Eğer liste henüz boşsa, KV'den uname: prefix'li kayıtları çek
    if (!list.length && kv.list) {
      const keys = await kv.list({ prefix: 'uname:', limit: 100 });
      list = (keys.keys || []).map(k => k.name.replace(/^uname:/, ''));
      if (list.length) {
        await kv.put('all_usernames', JSON.stringify(list));
      }
    }

    if (q) {
      list = list.filter(u => u.toLowerCase().includes(q));
    }

    return json({ users: list.slice(0, 50) });
  } catch (err) {
    return json({ users: [], error: err.message });
  }
}
