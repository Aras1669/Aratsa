# Aratsa

Cloudflare Pages + Functions + D1.

1. D1 veritabanı oluşturun, `schema.sql` içeriğini D1 > Konsol'da çalıştırın.
2. Pages > Settings > Bindings: D1 database, değişken adı `DB` (Production ve Preview), sonra yeniden dağıtın.
3. Environment variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (secret), `CRON_KEY` (uzun rastgele metin).
4. `cron-worker/` ayrı Worker olarak yayınlanır (Cron `0 * * * *`, secret `CRON_KEY` aynı değer).
5. Eski KV verisini taşımak için geçici `ADMIN_KEY` ekleyin; `/api/admin/tasi?key=...&adim=kullanicilar|gonderiler|takipler|mesajlar`. Bitince `ADMIN_KEY`'i silin.

Silme: gönderi silinince akıştan kalkar, 24 saat sonra D1'den ve Cloudinary'den kalıcı silinir (saatlik cron + ilk ziyarette kontrol).
