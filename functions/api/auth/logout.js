import { json, sha } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const t = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (t.length >= 40 && env.DB) await env.DB.prepare('DELETE FROM oturumlar WHERE token_ozeti = ?').bind(await sha(t)).run();
  return json({ success: true });
}
