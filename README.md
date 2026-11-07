# Aratsa

Cloudflare Pages + Pages Functions. Settings > Functions > KV namespace bindings:

- `USERS_KV` : kullanıcılar ve oturumlar
- `POSTS_KV` : gönderiler, beğeni, yorum, şikayet

Opsiyonel (sunucu tarafı yükleme): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`.
Şifreler PBKDF2 ile hashlenir; eski Base64 kayıtlar ilk girişte otomatik yükseltilir.
