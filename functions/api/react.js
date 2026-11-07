// /api/react: beğeni, yorum, silme, şikayet (hepsi oturum token'ı ister)
import { json, readBody, getUser, getKv } from '../_lib.js';
import { parseCloudinary, destroy } from '../_cloud.js';

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Oturum geçersiz, lütfen tekrar giriş yapın.' }, 401);
  const kv = getKv(env, 'POSTS_KV');
  if (!kv) return json({ error: 'Sistem hatası: POSTS_KV tanımlı değil.' }, 500);

  const { action, id, text, reason } = await readBody(request);
  const posts = JSON.parse((await kv.get('all_posts')) || '[]');
  const post = posts.find((p) => p.id === id);
  if (!post) return json({ error: 'Gönderi bulunamadı.' }, 404);
  post.liked_by ||= [];
  post.comments ||= [];
  const save = () => kv.put('all_posts', JSON.stringify(posts));

  if (action === 'like') {
    const i = post.liked_by.indexOf(user.id);
    i < 0 ? post.liked_by.push(user.id) : post.liked_by.splice(i, 1);
    post.likes_count = post.liked_by.length;
    await save();
    return json({ success: true, likes_count: post.likes_count, liked_by: post.liked_by });
  }
  if (action === 'comment') {
    const t = String(text || '').trim().slice(0, 500);
    if (!t) return json({ error: 'Yorum boş olamaz.' }, 400);
    const comment = { id: 'c_' + crypto.randomUUID().slice(0, 8), user_id: user.id, username: user.username, text: t, created_at: new Date().toISOString() };
    post.comments.push(comment);
    await save();
    return json({ success: true, comment });
  }
  if (action === 'delete') {
    if (post.user_id !== user.id) return json({ error: 'Sadece kendi gönderini silebilirsin.' }, 403);
    const job = parseCloudinary(post.media_url);
    if (job) {
      // 24 saat sonra kesin silinmesi için kuyruğa ekle
      await kv.put('purge:' + id, JSON.stringify({ ...job, at: Date.now() + 864e5 }));
      // Cloudinary'den hemen silmeyi de dene
      if (env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
        destroy(env, job).catch(() => {});
      }
    }
    await kv.put('all_posts', JSON.stringify(posts.filter((p) => p.id !== id)));
    return json({ success: true });
  }
  if (action === 'report') {
    await kv.put(`report:${id}:${user.id}`, JSON.stringify({ reason: String(reason || '').slice(0, 100), at: new Date().toISOString() }));
    return json({ success: true });
  }
  return json({ error: 'Geçersiz işlem.' }, 400);
}
