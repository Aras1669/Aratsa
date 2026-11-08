import { json, readBody, getUser, viewPost } from '../_lib.js';
import { purgeDue } from '../_cloud.js';

const OK_URL = /^https:\/\/(res\.cloudinary\.com|images\.unsplash\.com)\/[^\s"'<>]{1,900}$/i;
const load = async (env) => JSON.parse((await env.POSTS_KV.get('all_posts')) || '[]');

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.POSTS_KV) return json({ error: 'POSTS_KV bağlı değil.' }, 500);
  context.waitUntil?.(purgeDue(env));
  const me = await getUser(request, env);
  let posts = await load(env);
  if (!me) { // misafir sınırı sunucuda uygulanır: en yeni 2 gönderi + en çok beğenilen 5 reels
    const top = posts.filter((p) => p.media_type === 'video').sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 5);
    posts = posts.filter((p, i) => i < 2 || top.includes(p));
  }
  return json(posts.map((p) => viewPost(p, me?.id)));
}

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return json({ error: 'Gönderi paylaşmak için giriş yapmalısınız.' }, 401);
  if (!env.POSTS_KV) return json({ error: 'POSTS_KV bağlı değil.' }, 500);
  const b = await readBody(request);
  const url = String(b.media_url || '');
  if (!OK_URL.test(url)) return json({ error: 'Geçerli bir Cloudinary medya bağlantısı gerekli.' }, 400);
  if (env.CLOUDINARY_CLOUD_NAME && /res\.cloudinary\.com/i.test(url) && !url.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`)) return json({ error: 'Medya bu hesaba ait değil.' }, 400);

  const posts = await load(env);
  const today = new Date().toISOString().slice(0, 10);
  if (posts.filter((p) => p.user_id === me.id && String(p.created_at).startsWith(today)).length >= 20) return json({ error: 'Günlük sınır: günde en fazla 20 gönderi paylaşabilirsiniz.' }, 429);

  const post = {
    id: 'post_' + crypto.randomUUID().replaceAll('-', '').slice(0, 14), user_id: me.id, username: me.username, media_url: url,
    media_type: /\/video\/upload\//.test(url) || b.media_type === 'video' ? 'video' : 'image',
    caption: String(b.caption || '').slice(0, 2200), likes_count: 0, liked_by: [], comments: [], created_at: new Date().toISOString(),
  };
  posts.unshift(post);
  await env.POSTS_KV.put('all_posts', JSON.stringify(posts.slice(0, 2000)));
  return json({ success: true, post: viewPost(post, me.id) }, 201);
}
