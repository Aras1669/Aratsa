# Aratsa

Cloudflare Pages + Functions + D1. Alan adı: aratsa.pages.dev

## Kurulum
1. D1 veritabanı oluşturun (ad: aratsa-db). Konsol sekmesinde `schema.sql` içeriğini çalıştırın. Boş veritabanına kurun, DROP satırları eski tabloları siler.
2. Pages > Settings > Bindings: D1 database, değişken adı `DB` (Production ve Preview). Sonra yeniden dağıtın.
3. Pages > Settings > Variables and secrets (secret olarak ekleyin):
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `BREVO_API_KEY`, `MAIL_FROM` (Brevo'da doğruladığınız gönderen adresi)
   - `CRON_KEY` (uzun rastgele metin)
4. Brevo: hesap açın, Senders (Gönderenler) bölümünde kendi e-posta adresinizi doğrulayın, SMTP & API bölümünden API anahtarı (v3) oluşturun. Ücretsiz plan günde 300 e-posta. Alan adı gerekmez. Kod e-postaları bazen spam klasörüne düşebilir.
5. `cron-worker/` ayrı Worker olarak yayınlanır (Cron `0 * * * *`, secret `CRON_KEY` aynı değer). Süresi dolan hikaye ve silinen gönderileri saat başı temizler. Ziyaretçi geldiğinde de kontrol edilir.

## Şikayetleri incelemek (D1 Konsolu)
- Bekleyenler: `SELECT id, hedef_tur, hedef_id, hedef_kullanici, bildiren_adi, sebep, medya_url, aciklama, tarih FROM sikayetler WHERE durum = 'bekliyor' ORDER BY tarih`
- Kapatmak: `UPDATE sikayetler SET durum = 'kapandi', yonetici_notu = 'not' WHERE id = 5`
- Gönderiyi kaldırmak (24 saat sonra Cloudinary'den de silinir): `UPDATE gonderiler SET silinme_istegi = '2020-01-01T00:00:00.000Z' WHERE id = 'post_...'`
- Hikayeyi kaldırmak: `UPDATE hikayeler SET bitis = '2020-01-01T00:00:00.000Z' WHERE id = 'st_...'`
- Kullanıcıyı yasaklamak: `UPDATE kullanicilar SET durum = 'yasakli' WHERE kullanici_adi = 'ad'`
