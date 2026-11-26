-- Aratsa veritabanı (D1). BOŞ veritabanına kurun: DROP satırları eski tabloları siler.
-- Bakmak için D1 Konsol'una şunu yazın: SELECT * FROM kullanicilar   (tarihler UTC ve okunabilir metindir)
DROP TABLE IF EXISTS kullanicilar;
DROP TABLE IF EXISTS oturumlar;
DROP TABLE IF EXISTS takipler;
DROP TABLE IF EXISTS gonderiler;
DROP TABLE IF EXISTS begeniler;
DROP TABLE IF EXISTS yorumlar;
DROP TABLE IF EXISTS hikayeler;
DROP TABLE IF EXISTS mesajlar;
DROP TABLE IF EXISTS sikayetler;
DROP TABLE IF EXISTS dogrulama_kodlari;
DROP TABLE IF EXISTS deneme_sayaci;

-- kullanicilar: her satır bir hesap. durum = aktif veya yasakli. Yasaklamak için durum'u yasakli yapın.
CREATE TABLE kullanicilar (id TEXT PRIMARY KEY, kullanici_adi TEXT NOT NULL UNIQUE COLLATE NOCASE, eposta TEXT NOT NULL UNIQUE, sifre_base64 TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', durum TEXT NOT NULL DEFAULT 'aktif', olusturma TEXT NOT NULL);

-- oturumlar: açık girişler (30 gün). token_ozeti = giriş anahtarının özeti, kendisi değil.
CREATE TABLE oturumlar (token_ozeti TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, bitis TEXT NOT NULL);
CREATE INDEX oturum_bitis ON oturumlar (bitis);

-- takipler: her satır "takip_eden, takip_edileni takip ediyor" demek.
CREATE TABLE takipler (takip_eden TEXT NOT NULL, takip_edilen TEXT NOT NULL, PRIMARY KEY (takip_eden, takip_edilen));
CREATE INDEX takip_ters ON takipler (takip_edilen);

-- gonderiler: silinme_istegi doluysa gönderi silinmek üzeredir. Akıştan kalkar, satır ve Cloudinary dosyası 24 saat durur, sonra kalıcı silinir.
CREATE TABLE gonderiler (id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, kullanici_adi TEXT NOT NULL, medya_url TEXT NOT NULL, medya_tipi TEXT NOT NULL, aciklama TEXT, begeni_sayisi INTEGER NOT NULL DEFAULT 0, tarih TEXT NOT NULL, silinme_istegi TEXT);
CREATE INDEX gonderi_tarih ON gonderiler (tarih);
CREATE INDEX gonderi_silinecek ON gonderiler (silinme_istegi) WHERE silinme_istegi IS NOT NULL;

CREATE TABLE begeniler (gonderi_id TEXT NOT NULL, kullanici_id TEXT NOT NULL, PRIMARY KEY (gonderi_id, kullanici_id));
CREATE INDEX begeni_kullanici ON begeniler (kullanici_id);

CREATE TABLE yorumlar (id TEXT PRIMARY KEY, gonderi_id TEXT NOT NULL, kullanici_id TEXT NOT NULL, kullanici_adi TEXT NOT NULL, metin TEXT NOT NULL, tarih TEXT NOT NULL);
CREATE INDEX yorum_gonderi ON yorumlar (gonderi_id);

-- hikayeler: bitis anında süresi dolar. Saatlik temizlik Cloudinary dosyasını ve satırı siler.
CREATE TABLE hikayeler (id TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, kullanici_adi TEXT NOT NULL, medya_url TEXT NOT NULL, medya_tipi TEXT NOT NULL, tarih TEXT NOT NULL, bitis TEXT NOT NULL);
CREATE INDEX hikaye_bitis ON hikayeler (bitis);

-- mesajlar: düz metin. sohbet = iki kullanıcı adı, alfabetik: "aras - veli".
CREATE TABLE mesajlar (id TEXT PRIMARY KEY, sohbet TEXT NOT NULL, gonderen TEXT NOT NULL, alici TEXT NOT NULL, metin TEXT NOT NULL, tarih TEXT NOT NULL);
CREATE INDEX mesaj_sohbet ON mesajlar (sohbet, tarih);
CREATE INDEX mesaj_alici ON mesajlar (alici);
CREATE INDEX mesaj_gonderen ON mesajlar (gonderen);

-- sikayetler: sizin inceleyeceğiniz liste. id her şikayetin numarası. durum = bekliyor veya kapandi. hedef_tur = gonderi, hikaye veya kullanici.
-- medya_url ve aciklama şikayet anındaki halidir, içerik silinse bile burada kalır.
CREATE TABLE sikayetler (id INTEGER PRIMARY KEY AUTOINCREMENT, hedef_tur TEXT NOT NULL, hedef_id TEXT NOT NULL, hedef_kullanici TEXT, bildiren_id TEXT NOT NULL, bildiren_adi TEXT NOT NULL, sebep TEXT, medya_url TEXT, aciklama TEXT, tarih TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'bekliyor', yonetici_notu TEXT);
CREATE UNIQUE INDEX sikayet_tekil ON sikayetler (hedef_tur, hedef_id, bildiren_id);
CREATE INDEX sikayet_durum ON sikayetler (durum, tarih);

-- dogrulama_kodlari: e-postaya giden 6 haneli kodların özeti (10 dakika geçerli, en fazla 5 deneme).
CREATE TABLE dogrulama_kodlari (eposta TEXT NOT NULL, amac TEXT NOT NULL, kod_ozeti TEXT NOT NULL, bitis TEXT NOT NULL, deneme INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (eposta, amac));

-- deneme_sayaci: şifre deneme, kayıt, kod, mesaj, işlem hızı sınırları (kendiliğinden süresi dolar).
CREATE TABLE deneme_sayaci (anahtar TEXT PRIMARY KEY, sayi INTEGER NOT NULL, bitis TEXT NOT NULL);
