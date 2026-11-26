// E-postaya 6 haneli kod gönderir. amac: kayit veya sifre
import { json, readBody, N, sha, limited, bump, validUsername } from '../../_lib.js';
import { issueCode } from '../../_kod.js';
import { sendMail } from '../../_mail.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Sistem hatası: DB (D1) bağlı değil.' }, 500);
  const b = await readBody(request);
  const mail = N(b.email).trim(), amac = b.amac === 'sifre' ? 'sifre' : 'kayit';
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 120) return json({ error: 'Geçersiz e-posta formatı.' }, 400);

  const rkIp = 'kod-ip:' + (await sha(request.headers.get('CF-Connecting-IP') || '')), rkMail = 'kod-posta:' + (await sha(mail));
  if ((await limited(env, rkIp, 8)) || (await limited(env, rkMail, 3))) return json({ error: 'Çok fazla kod istendi. Bir saat sonra tekrar deneyin.' }, 429);
  await bump(env, rkIp, 3600e3);
  await bump(env, rkMail, 3600e3);

  if (amac === 'kayit') {
    const isim = String(b.username || '').trim();
    if (!validUsername(isim)) return json({ error: 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).' }, 400);
    if (await env.DB.prepare('SELECT 1 AS x FROM kullanicilar WHERE eposta = ? OR kullanici_adi = ?').bind(mail, isim).first()) return json({ error: 'Bu e-posta veya kullanıcı adı zaten kayıtlı.' }, 409);
  } else if (!(await env.DB.prepare("SELECT 1 AS x FROM kullanicilar WHERE eposta = ? AND durum = 'aktif'").bind(mail).first())) {
    return json({ success: true }); // hesap olup olmadığı belli edilmez
  }

  const code = await issueCode(env, mail, amac);
  try {
    await sendMail(env, mail, `Aratsa doğrulama kodunuz: ${code}`, `<p>Aratsa ${amac === 'kayit' ? 'kayıt' : 'şifre sıfırlama'} kodunuz:</p><h2 style="letter-spacing:4px">${code}</h2><p>Kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p>`);
  } catch {
    return json({ error: 'E-posta gönderilemedi. Biraz sonra tekrar deneyin.' }, 503);
  }
  return json({ success: true });
}
