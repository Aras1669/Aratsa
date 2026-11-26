// Şifre sıfırlama: e-postadaki kodla yeni şifre belirlenir, tüm oturumlar kapanır.
import { json, readBody, N, readPw64, validPw64, decodePw } from '../../_lib.js';
import { checkCode } from '../../_kod.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Sistem hatası: DB (D1) bağlı değil.' }, 500);
  const b = await readBody(request);
  const mail = N(b.email).trim(), pw = readPw64(b);
  const plain = validPw64(pw) ? decodePw(pw) : '';
  if (plain.length < 6 || plain.length > 128) return json({ error: 'Şifre 6-128 karakter olmalı.' }, 400);
  if (!(await checkCode(env, mail, 'sifre', b.code))) return json({ error: 'Kod hatalı veya süresi dolmuş.' }, 400);
  const u = await env.DB.prepare("SELECT id FROM kullanicilar WHERE eposta = ? AND durum = 'aktif'").bind(mail).first();
  if (!u) return json({ error: 'Kod hatalı veya süresi dolmuş.' }, 400);
  await env.DB.batch([env.DB.prepare('UPDATE kullanicilar SET sifre_base64 = ? WHERE id = ?').bind(pw, u.id), env.DB.prepare('DELETE FROM oturumlar WHERE kullanici_id = ?').bind(u.id)]);
  return json({ success: true });
}
