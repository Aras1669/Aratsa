// Saatlik zamanlayıcı (cron-worker) bu adresi çağırır; yalnızca CRON_KEY ile çalışır.
import { json, safeEq, now } from '../_lib.js';
import { temizle } from '../_cloud.js';

export async function onRequestPost({ request, env }) {
  if (!env.CRON_KEY || !safeEq(request.headers.get('X-Cron-Key') || '', env.CRON_KEY)) return json({ error: 'Yetkisiz.' }, 401);
  const silinen = await temizle(env);
  await env.DB.batch([env.DB.prepare('DELETE FROM deneme_sayaci WHERE bitis < ?').bind(now()), env.DB.prepare('DELETE FROM oturumlar WHERE bitis < ?').bind(now())]);
  return json({ silinen });
}
