export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { email, password, username } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'E-posta ve şifre zorunludur' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username || cleanEmail.split('@')[0];
    const user = { id: 'cf_' + Date.now(), email: cleanEmail, username: cleanUsername, createdAt: new Date().toISOString() };

    if (env && env.USERS_KV) {
      const existing = await env.USERS_KV.get(`user:${cleanEmail}`);
      if (existing) {
        return new Response(JSON.stringify({ error: 'Bu e-posta zaten kayıtlı!' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      await env.USERS_KV.put(`user:${cleanEmail}`, JSON.stringify({ ...user, password }));
    }

    return new Response(JSON.stringify({ success: true, user: { id: user.id, email: user.email, username: user.username } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
