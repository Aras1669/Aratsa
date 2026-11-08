import { json, sha } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const t = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (t.length >= 40 && env.USERS_KV) await env.USERS_KV.delete('sess:' + (await sha(t)));
  return json({ success: true });
}
