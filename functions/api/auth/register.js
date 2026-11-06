// Cloudflare Pages Function: /api/auth/register
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { email, password, username } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-posta ve şifre zorunludur' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const cleanUsername = username || email.split('@')[0];
    const user = {
      id: 'cf_' + Date.now(),
      email: email.toLowerCase().trim(),
      username: cleanUsername,
      createdAt: new Date().toISOString()
    };
    // Eğer Cloudflare KV bağlıysa
    if (env && env.USERS_KV) {
      const existing = await env.USERS_KV.get(`user:${user.email}`);
      if (existing) {
        return new Response(JSON.stringify({ error: 'Bu e-posta adresi zaten kayıtlı!' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      await env.USERS_KV.put(`user:${user.email}`, JSON.stringify({ ...user, password }));
    }
    // Eğer Cloudflare D1 bağlıysa
    if (env && env.DB) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO users (id, email, username, password, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(user.id, user.email, user.username, password, user.createdAt).run();
    }

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, email: user.email, username: user.username },
      message: 'Kayıt başarılı (Cloudflare)'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
