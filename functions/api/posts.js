// Cloudflare Pages Function: /api/posts (Cloudinary Entegrasyonlu)
export async function onRequestGet(context) {
  const { env } = context;
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
    const contentType = request.headers.get('content-type') || '';
    
    let userId = '';
    let username = 'Anonim';
    let caption = '';
    let mediaUrl = '';
    let mediaType = 'image';
    let postId = 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    let createdAt = new Date().toISOString();

    let body = {};

    // 1. Veriyi JSON veya FormData olarak esnekçe oku
    if (contentType.includes('application/json')) {
      body = await request.json();
      userId = body.user_id || body.userId || '';
      username = body.username || 'Anonim';
      caption = body.caption || '';
      mediaUrl = body.media_url || '';
      mediaType = body.media_type || 'image';
      if (body.id) postId = body.id;
      if (body.created_at) createdAt = body.created_at;

      // Eğer JSON içinde base64 görsel verisi gönderildiyse Cloudinary'ye yükle
      if (body.image_base64 && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET) {
        const cldFormData = new FormData();
        cldFormData.append('file', body.image_base64);
        cldFormData.append('upload_preset', env.CLOUDINARY_UPLOAD_PRESET);

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
    } else {
      // Multipart form data (Dosya yükleme desteği)
      const formData = await request.formData();
      userId = formData.get('user_id') || formData.get('userId') || '';
      username = formData.get('username') || 'Anonim';
      caption = formData.get('caption') || '';
      mediaType = formData.get('media_type') || 'image';

      const imageFile = formData.get('image') || formData.get('file') || formData.get('media');

      // Eğer formdan doğrudan bir dosya geldiyse Cloudinary'ye yükle
      if (imageFile && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_UPLOAD_PRESET) {
        const cldFormData = new FormData();
        cldFormData.append('file', imageFile);
        cldFormData.append('upload_preset', env.CLOUDINARY_UPLOAD_PRESET);

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
      } else {
        mediaUrl = formData.get('media_url') || '';
      }
    }

    // 2. Kaydedilecek Post Nesnesi
    const post = {
      id: postId,
      user_id: userId,
      username: username,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: caption,
      likes_count: 0,
      created_at: createdAt
    };

    // 3. Veritabanına (D1 veya KV) Kaydet
    if (env && env.DB) {
      await env.DB.prepare(
        'INSERT INTO posts (id, user_id, username, media_url, media_type, caption, likes_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(post.id, post.user_id, post.username, post.media_url, post.media_type, post.caption, post.likes_count || 0, post.created_at).run();
    } else if (env && env.POSTS_KV) {
      const raw = await env.POSTS_KV.get('all_posts');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(post);
      await env.POSTS_KV.put('all_posts', JSON.stringify(list));
    }

    return new Response(JSON.stringify({ success: true, post }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
