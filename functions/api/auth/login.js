// Cloudflare Pages Function: /api/auth/login
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-posta ve şifre zorunludur' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const cleanEmail = email.toLowerCase().trim();
    // Cloudflare KV kontrolü
    if (env && env.USERS_KV) {
      const storedData = await env.USERS_KV.get(`user:${cleanEmail}`);
      if (!storedData) {
        return new Response(JSON.stringify({ error: 'Bu e-posta ile kayıtlı kullanıcı bulunamadı!' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const userRecord = JSON.parse(storedData);
      if (userRecord.password !== password) {
        return new Response(JSON.stringify({ error: 'Hatalı şifre girdiniz!' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        user: { id: userRecord.id, email: userRecord.email, username: userRecord.username }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Cloudflare D1 kontrolü
    if (env && env.DB) {
      const user = await env.DB.prepare(
        'SELECT id, email, username, password FROM users WHERE email = ?'
      ).bind(cleanEmail).first();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Kullanıcı bulunamadı!' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (user.password !== password) {
        return new Response(JSON.stringify({ error: 'Hatalı şifre!' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        user: { id: user.id, email: user.email, username: user.username }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Eğer KV veya D1 henüz tanımlanmadıysa genel yanıt (frontend fallback yönetecek)
    return new Response(JSON.stringify({
      success: true,
      user: { id: 'cf_' + Date.now(), email: cleanEmail, username: cleanEmail.split('@')[0] }
      }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Giriş hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
