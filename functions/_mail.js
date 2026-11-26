// E-posta: Brevo (ücretsiz, günde 300). Gerekli: BREVO_API_KEY ve Brevo'da doğrulanmış gönderen adresi MAIL_FROM
export async function sendMail(env, to, subject, html) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) throw new Error('mail-ayarsiz');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'Aratsa', email: env.MAIL_FROM }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!r.ok) throw new Error('mail-hata');
}
