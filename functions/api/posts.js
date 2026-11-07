import { getUser } from '../_lib.js';
import { purgeDue } from '../_cloud.js';
// Cloudflare Pages Function: /api/posts (Cloudinary Kullanıcı Klasörlü + Günlük Sınır)
export async function onRequestGet(context) {
  const { env } = context;
  context.waitUntil?.(purgeDue(env));
  try {
    if (env && env.DB) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM posts ORDER BY created_at DESC'
      ).all();
      return new Response(JSON.stringify(results || []), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (env && env.POSTS_KV) {
      const data = await env.POSTS_KV.get('all_posts');
      return new Response(data || '[]', {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const authed = await getUser(request, env);
    if (!authed) {
      return new Response(JSON.stringify({ error: 'Gönderi paylaşmak için giriş yapmalısınız.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const contentType = request.headers.get('content-type') || '';
    
    let userId = '';
    let username = 'Anonim';
    let caption = '';
    let mediaUrl = '';
    let mediaType = 'image';
    let postId = 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    let createdAt = new Date().toISOString();

    let body = {};

    // 1. Gelen veriyi oku
    if (contentType.includes('application/json')) {
      body = await request.json();
      userId = body.user_id || body.userId || '';
      username = body.username || 'Anonim';
      caption = body.caption || '';
      mediaUrl = body.media_url || '';
      mediaType = body.media_type || 'image';
      if (body.id) postId = body.id;
      if (body.created_at) createdAt = body.created_at;
    } else {
      const formData = await request.formData();
      userId = formData.get('user_id') || formData.get('userId') || '';
      username = formData.get('username') || 'Anonim';
      caption = formData.get('caption') || '';
      mediaType = formData.get('media_type') || 'image';
      mediaUrl = formData.get('media_url') || '';
    }

    // Kimlik istemciden değil, oturum token'ından alınır
    userId = authed.id;
    username = authed.username;
    if (!/^https:\/\//i.test(mediaUrl) && !body.image_base64 && contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Geçerli bir https medya bağlantısı gerekli.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // Kullanıcı ID kontrolü
    if (!userId) {
      return new Response(JSON.stringify({ error: "Gönderi paylaşmak için yetkili bir kullanıcı ID'si gereklidir." }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // -----------------------------------------------------------------
    // 2. GÜNLÜK GÖNDERİ SINIRI KONTROLÜ
    // -----------------------------------------------------------------
    const todayStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD" formatı
    let existingPosts = [];

    if (env && env.POSTS_KV) {
      const raw = await env.POSTS_KV.get('all_posts');
      existingPosts = raw ? JSON.parse(raw) : [];
    } else if (env && env.DB) {
      const { results } = await env.DB.prepare('SELECT user_id, created_at FROM posts WHERE user_id = ?').bind(userId).all();
      existingPosts = results || [];
    }

    // Kullanıcının bugün yaptığı paylaşımları say
    const todaysUserPostsCount = existingPosts.filter(p => {
      const postUserId = p.user_id || p.userId;
      const postDate = p.created_at || '';
      return postUserId === userId && postDate.startsWith(todayStr);
    }).length;

    if (todaysUserPostsCount >= 20) {
      return new Response(JSON.stringify({ 
        error: "Günlük sınır aşıldı: Bir gün içerisinde en fazla 20 fotoğraf/gönderi paylaşabilirsiniz. Yarın tekrar deneyin." 
      }), {
        status: 429, // Too Many Requests
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // -----------------------------------------------------------------

    // 3. Cloudinary Yükleme İşlemi (Kullanıcıya Özel Klasör Destekli)
    if (contentType.includes('application/json') && body.image_base64 && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET) {
      const cldFormData = new FormData();
      cldFormData.append('file', body.image_base64);
      cldFormData.append('upload_preset', env.CLOUDINARY_UPLOAD_PRESET);
      // Kullanıcı bazlı klasör yönlendirmesi
      cldFormData.append('folder', `aratsa_users/${userId}`);

      const cldRes = await fetch(
        `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: cldFormData }
      );
      const cldData = await cldRes.json();
      if (cldData.secure_url) {
        mediaUrl = cldData.secure_url;
      } else {
        throw new Error('Cloudinary yükleme hatası: ' + (cldData.error?.message || 'Bilinmeyen hata'));
      }
    } else if (!contentType.includes('application/json')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') || formData.get('file') || formData.get('media');

      if (imageFile && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET) {
        const cldFormData = new FormData();
        cldFormData.append('file', imageFile);
        cldFormData.append('upload_preset', env.CLOUDINARY_UPLOAD_PRESET);
        // Kullanıcı bazlı klasör yönlendirmesi
        cldFormData.append('folder', `aratsa_users/${userId}`);

        const cldRes = await fetch(
          `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: cldFormData }
        );
        const cldData = await cldRes.json();
        if (cldData.secure_url) {
          mediaUrl = cldData.secure_url;
        } else {
          throw new Error('Cloudinary yükleme hatası: ' + (cldData.error?.message || 'Bilinmeyen hata'));
        }
      }
    }

    // 4. Kaydedilecek Post Nesnesi
    const post = {
      id: postId,
      user_id: userId,
      username: username,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: caption,
      likes_count: 0,
      liked_by: [],
      comments: [],
      created_at: createdAt
    };

    // 5. Veritabanına Kaydet
    if (env && env.DB) {
      await env.DB.prepare(
        'INSERT INTO posts (id, user_id, username, media_url, media_type, caption, likes_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(post.id, post.user_id, post.username, post.media_url, post.media_type, post.caption, post.likes_count || 0, post.created_at).run();
    } else if (env && env.POSTS_KV) {
      existingPosts.unshift(post);
      await env.POSTS_KV.put('all_posts', JSON.stringify(existingPosts));
    }

    return new Response(JSON.stringify({ success: true, post }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
