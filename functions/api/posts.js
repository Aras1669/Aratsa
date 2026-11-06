export async function onRequestGet(context) {
  const { env } = context;
  try {
    if (env && env.POSTS_KV) {
      const data = await env.POSTS_KV.get('all_posts');
      return new Response(data || '[]', { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const post = await request.json();
    if (env && env.POSTS_KV) {
      const raw = await env.POSTS_KV.get('all_posts');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(post);
      await env.POSTS_KV.put('all_posts', JSON.stringify(list));
    }
    return new Response(JSON.stringify({ success: true, post }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
