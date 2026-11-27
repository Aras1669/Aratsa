# Aratsa

**Aratsa**, Cloudflare altyapısı (Pages, Functions, D1) üzerine kurulu; fotoğraf/video paylaşımı, 24 saatlik hikayeler, doğrudan mesajlaşma ve kullanıcı profilleri sunan modern, hafif ve mobil uyumlu bir sosyal medya web uygulamasıdır.

---

## ✨ Özellikler

### 📱 Kullanıcı Deneyimi ve Arayüz
* **Akış (Feed), Keşfet ve Reels:** Fotoğraf ve video tabanlı gönderi akışı, çift tıklayarak beğenme animasyonu ve yorum sistemi.
* **24 Saatlik Hikayeler (Stories):** Tam ekran hikaye görüntüleyici, ilerleme çubukları ve 24 saat sonunda D1 veritabanı ile Cloudinary'den otomatik temizleme.
* **Kullanıcı Profilleri:** Biyografi düzenleme, takipçi/takip edilen istatistikleri ve kullanıcıya ait gönderi ızgarası.
* **Doğrudan Mesajlaşma (DM):** Kullanıcı adı önerileriyle gerçek zamanlı sohbet arayüzü.
* **Duyarlı (Responsive) Tasarım & PWA Desteği:** Masaüstü kenar çubuğu, mobil alt gezinme barı, `manifest.webmanifest` ve koyu/açık tema ikon desteği.

### 🔐 Güvenlik ve Altyapı
* **E-posta Doğrulama ve Şifre Sıfırlama (Brevo):** Kayıt ve şifre sıfırlama işlemlerinde 6 haneli tek kullanımlık doğrulama kodu (10 dakika geçerli, en fazla 5 deneme hakkı). Şifre sıfırlandığında tüm açık oturumlar otomatik kapatılır.
* **Bot Koruması ve Hız Sınırlama:** Cloudflare Turnstile doğrulaması ve kayıt, kod isteği, beğeni, yorum, mesaj gibi işlemlere yönelik hız sınırlaması (rate limiting).
* **Güvenli Medya Yükleme (Cloudinary):** Sunucu imzalı yükleme akışı; herhangi bir gönderiye bağlanmayan dosyalar 24 saat sonra otomatik silinir.
* **Oturum Yönetimi:** `HttpOnly` çerez tabanlı güvenli oturumlar ve yasaklı kullanıcıların anında oturum sonlandırması.
* **Şikayet ve Moderasyon Sistemi:** Gönderi, hikaye ve profiller için şikayet kaydı; içerik silinse bile moderasyon kayıtlarında kanıt koruması.

---

## 🛠️ Teknoloji Yığını

* **Ön Yüz (Frontend):** HTML5, CSS3 (Responsive & Animasyonlar), Vanilla JavaScript (`app.js`), Font Awesome 6
* **Sunucu (Backend):** Cloudflare Pages Functions (`functions/api/...`)
* **Veritabanı:** Cloudflare D1 (SQLite)
* **Medya Depolama:** Cloudinary (Signed Upload)
* **E-posta Servisi:** Brevo Transactional Email API (v3)
* **Bot Koruması:** Cloudflare Turnstile
* **Zamanlanmış Görevler:** Cloudflare Cron Worker (`cron-worker/`)

---

## 🚀 Kurulum Rehberi

### 1. D1 Veritabanını Oluşturma
1. Cloudflare kontrol panelinden **Workers & Pages > D1** bölümüne gidin ve `aratsa-db` adında yeni bir veritabanı oluşturun.
2. Veritabanının **Console** sekmesini açın ve proje kök dizinindeki `schema.sql` dosyasının içeriğini yapıştırıp çalıştırın.
3. Cloudflare Pages projenizde **Settings > Bindings** bölümüne girin, D1 veritabanını `DB` değişken adıyla **Production** ve **Preview** ortamlarına bağlayın.

### 2. Brevo E-posta Servisini Ayarlama
1. [Brevo](https://www.brevo.com/) üzerinde ücretsiz bir hesap açın.
2. **Settings > Senders, domains, IPs > Senders** bölümünden gönderen e-posta adresinizi ekleyin ve gelen kutunuza düşen onay bağlantısına tıklayarak doğrulayın.
3. **Settings > SMTP & API > API Keys** bölümünden **Transactional email** yetkisine sahip bir v3 API anahtarı oluşturun.

### 3. Ortam Değişkenleri (Secrets)
Cloudflare Pages projenizde **Settings > Variables and secrets** sekmesinden aşağıdaki gizli değişkenleri ekleyin:

| Değişken Adı | Açıklama |
| :--- | :--- |
| `BREVO_API_KEY` | Brevo panelinden alınan v3 API anahtarı |
| `MAIL_FROM` | Brevo Senders bölümünde doğrulanan gönderen e-posta adresi |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary hesap adı |
| `CLOUDINARY_API_KEY` | Cloudinary API anahtarı |
| `CLOUDINARY_API_SECRET` | Cloudinary API gizli anahtarı |
| `CRON_KEY` | Zamanlanmış temizlik işlemleri için rastgele güvenlik anahtarı |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site anahtarı |
| `TURNSTILE_SECRET` | Cloudflare Turnstile gizli anahtarı *(Test için geçici olarak `TURNSTILE_DISABLED=1` kullanılabilir)* |

### 4. Dağıtım ve Saatlik Temizlik Worker'ı
1. Değişkenleri kaydettikten sonra Cloudflare Pages üzerinden yeni bir dağıtım (**Deployment**) tetikleyin.
2. Süresi dolan hikayelerin ve silinen/kullanılmayan Cloudinary dosyalarının saat başı temizlenmesi için `cron-worker/` dizinindeki Worker'ı `0 * * * *` zamanlamasıyla ve aynı `CRON_KEY` gizli anahtarıyla yayınlayın.

---

## 🛡️ Moderasyon ve Yönetim (D1 Konsol Sorguları)

Yönetici işlemleri doğrudan Cloudflare D1 Konsolu üzerinden yürütülebilir:

* **Bekleyen şikayetleri listeleme:**
  ```sql
  SELECT id, hedef_tur, hedef_id, hedef_kullanici, bildiren_adi, sebep, medya_url, aciklama, tarih
  FROM sikayetler
  WHERE durum = 'bekliyor'
  ORDER BY tarih;
  ```
* **Şikayeti kapatma:**
  ```sql
  UPDATE sikayetler SET durum = 'kapandi', yonetici_notu = 'İncelendi' WHERE id = 1;
  ```
* **Gönderiyi yayından kaldırma (24 saat sonra Cloudinary'den de silinir):**
  ```sql
  UPDATE gonderiler SET silinme_istegi = '2020-01-01T00:00:00.000Z' WHERE id = 'post_...';
  ```
* **Hikayeyi yayından kaldırma:**
  ```sql
  UPDATE hikayeler SET bitis = '2020-01-01T00:00:00.000Z' WHERE id = 'st_...';
  ```
* **Kullanıcıyı yasaklama:**
  ```sql
  UPDATE kullanicilar SET durum = 'yasakli' WHERE kullanici_adi = 'kullanici_adi';
  ```

---

## 📁 Proje Yapısı

```text
Aratsa-main/
├── index.html              # Ana uygulama arayüzü ve modallar
├── style.css               # Duyarlı tasarım, tema ve animasyon stilleri
├── app.js                  # Ön yüz uygulama mantığı ve API iletişimi
├── schema.sql              # Cloudflare D1 veritabanı şeması
├── _headers                # Güvenlik ve önbellek başlıkları
├── manifest.webmanifest    # PWA yapılandırması
├── cron-worker/            # Saatlik temizlik görevleri için Cloudflare Worker
└── functions/              # Cloudflare Pages Functions (Backend API)
    ├── _lib.js             # Ortak yardımcılar, oturum ve güvenlik kontrolleri
    ├── _mail.js            # Brevo e-posta gönderim modülü
    ├── _kod.js             # 6 haneli doğrulama kodu yönetimi
    ├── _cloud.js           # Cloudinary imza ve dosya silme işlemleri
    └── api/                # REST API uç noktaları (auth, posts, hikaye, messages, profil, sikayet...)
```
