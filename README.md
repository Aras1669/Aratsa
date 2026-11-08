# Aratsa

Cloudflare Pages + Functions. Settings > Bindings (Production VE Preview için ekleyin, sonra yeniden dağıtın):

- `USERS_KV`    : kullanıcılar, oturumlar, takip
- `POSTS_KV`    : gönderiler, beğeni, yorum, şikayet, silme kuyruğu
- `MESSAGES_KV` : mesajlar (anahtar: `a - b`, düz metin)

Environment variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (secret olarak).

Saatlik temizlik: `cron-worker/` ayrı bir Worker olarak yayınlanır (Cron `0 * * * *`, `POSTS_KV` binding + Cloudinary değişkenleri).
