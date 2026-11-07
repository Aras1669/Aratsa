# Aratsa

Cloudflare Pages + Functions üzerinde çalışan, Instagram alternatifi sosyal medya ve mesajlaşma platformu.

## Cloudflare Pages Ayarları

### 1. KV Namespace Bağlantıları (Settings > Functions > KV namespace bindings)
Hem **Production** hem de **Preview** ortamlarına ekleyin:
- `USERS_KV`    : Kullanıcı hesapları, oturumlar, takipçi/takip edilen verileri, `all_usernames` arama listesi.
- `POSTS_KV`    : Gönderiler, beğeniler, yorumlar, şikayetler ve 24 saatlik medya silme kuyruğu.
- `MESSAGES_KV` : Açık metin mesajlar (Anahtar formatı: `kullanıcı1-kullanıcı2`).

> **Önemli Not:** Binding ekledikten sonra Cloudflare'in bunları tanıması için mutlaka **Deployments > Redeploy** yapılmalıdır. Sistemimiz, tek bir KV namespace bağlanmış olsa bile yedekli fallback mekanizmasıyla çalışacak şekilde tasarlanmıştır.

### 2. Çevre Değişkenleri (Settings > Environment variables)
- `CLOUDINARY_CLOUD_NAME`   : Cloudinary hesap adı
- `CLOUDINARY_UPLOAD_PRESET` : Unsigned yükleme ön ayarı
- `CLOUDINARY_API_KEY`       : 24 saatlik otomatik görsel/video silme işlemi için API anahtarı
- `CLOUDINARY_API_SECRET`    : 24 saatlik otomatik medya silme imzalaması için API gizli anahtarı

### 3. Özellikler
- **Telefon & Bilgisayar Uyumluluğu:** Masaüstünde sol menü, mobilde Instagram tarzı alt ve üst gezinti çubuğu.
- **İstemci İşlemcili Fuzzy Kullanıcı Arama:** Levenshtein algoritması doğrudan kullanıcının cihazında çalışır; sunucuya gereksiz istek gitmez ve yanlış yazılan isimlerde ("Bunu mu demek istediniz?") alternatif kullanıcıları gösterir.
- **Doğrudan KV Mesajlaşma:** Mesajlar açık metin olarak `kullanıcı1-kullanıcı2` ID'si ile KV'de depolanır; sunucu ve yönetim tarafından kolayca denetlenebilir.
- **Görünür Metin Kutuları:** DM ve form girişlerindeki metin ve imleç görünürlüğü garanti altına alınmıştır.
- **24 Saatlik Otomatik Temizlik:** Silinen veya 24 saati dolduran medya içerikleri her saat başı Cloudinary API'si üzerinden otomatik temizlenir.
