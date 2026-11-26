// 6 haneli e-posta kodları: veritabanında yalnızca özeti tutulur, 10 dakika geçerli, en fazla 5 deneme.
import { sha, safeEq, now } from './_lib.js';

export async function issueCode(env, email, amac) {
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare('INSERT OR REPLACE INTO dogrulama_kodlari (eposta, amac, kod_ozeti, bitis, deneme) VALUES (?,?,?,?,0)').bind(email, amac, await sha(`${email}|${amac}|${code}`), new Date(Date.now() + 600e3).toISOString()).run();
  return code;
}

export async function checkCode(env, email, amac, code) {
  const row = await env.DB.prepare('SELECT kod_ozeti, bitis, deneme FROM dogrulama_kodlari WHERE eposta = ? AND amac = ?').bind(email, amac).first();
  if (!row || row.bitis < now() || row.deneme >= 5) return false;
  if (!/^\d{6}$/.test(String(code)) || !safeEq(await sha(`${email}|${amac}|${code}`), row.kod_ozeti)) {
    await env.DB.prepare('UPDATE dogrulama_kodlari SET deneme = deneme + 1 WHERE eposta = ? AND amac = ?').bind(email, amac).run();
    return false;
  }
  await env.DB.prepare('DELETE FROM dogrulama_kodlari WHERE eposta = ? AND amac = ?').bind(email, amac).run();
  return true;
}
