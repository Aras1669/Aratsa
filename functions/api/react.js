// /api/react: beğeni, yorum, silme, şikayet (hepsi oturum token'ı ister)
import { json, readBody, getUser, viewComment } from '../_lib.js';
import { parseCloudinary } from '../_cloud.js';

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Oturum geçersiz, lütfen tekrar giriş yapın.' }, 401);
  if (!env.POSTS_KV) return json({ error: 'Sistem hatası: POSTS_KV tanımlı değil.' }, 500);

  const { action, id, text, reason } = await readBody(request);
  const posts = JSON.parse((await env.POSTS_KV.get('all_posts')) || '[]');
  const post = posts.find((p) => p.id === id);
  if (!post) return json({ error: 'Gönderi bulunamadı.' }, 404);
  post.liked_by ||= [];
  post.comments ||= [];
  const save = () => env.POSTS_KV.put('all_posts', JSON.stringify(posts));

  if (action === 'like') {
    const i = post.liked_by.indexOf(user.id);
    i < 0 ? post.liked_by.push(user.id) : post.liked_by.splice(i, 1);
    post.likes_count = post.liked_by.length;
    await save();
    return json({ success: true, likes_count: post.likes_count, liked: post.liked_by.includes(user.id) });
  }
  if (action === 'comment') {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) return json({ error: 'Yorum boş olamaz.' }, 400);
    const comment = { id: 'c_' + crypto.randomUUID().slice(0, 8), user_id: user.id, username: user.username, text: t, created_at: new Date().toISOString() };
    post.comments.push(comment);
    await save();
    return json({ success: true, comment: viewComment(comment, user.id) });
  }
  if (action === 'delete') {
    if (post.user_id !== user.id) return json({ error: 'Sadece kendi gönderini silebilirsin.' }, 403);
    const job = parseCloudinary(post.media_url);
    const rest = posts.filter((p) => p.id !== id);
    if (job && !rest.some((p) => p.media_url === post.media_url)) await env.POSTS_KV.put('purge:' + id, JSON.stringify({ ...job, at: Date.now() + 864e5 }));
    await env.POSTS_KV.put('all_posts', JSON.stringify(rest));
    return json({ success: true });
  }
  if (action === 'report') {
    await env.POSTS_KV.put(`report:${id}:${user.id}`, JSON.stringify({ reason: String(reason || '').slice(0, 100), at: new Date().toISOString() }));
    return json({ success: true });
  }
  return json({ error: 'Geçersiz işlem.' }, 400);
}
