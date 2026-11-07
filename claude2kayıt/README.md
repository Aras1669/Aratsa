# Aratsa

Cloudflare Pages + Functions. Settings > Functions > KV namespace bindings:

- `USERS_KV`    : kullanıcılar, oturumlar, takip, genel anahtarlar
- `POSTS_KV`    : gönderiler, beğeni, yorum, şikayet, silme kuyruğu
- `MESSAGES_KV` : şifreli mesajlar (anahtar: `a - b`)

Environment variables (Cloudinary'den 24 saat sonra silme için): `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
