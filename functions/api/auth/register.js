/**
 * Aratsa Projesi - Register (Kayıt Ol) Fonksiyonu
 * Ultra-Dayanıklı Veri Ayrıştırıcı ve Base64 Şifreleme Modülü
 */

// Güvenli Base64 kodlama fonksiyonu
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 1. Cloudflare Workers KV binding kontrolü
    if (!env.USERS_KV) {
      return new Response(JSON.stringify({ error: "Sistem Hatası: USERS_KV Namespace tanımlanmamış." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Gelen isteğin gövdesini (body) hiçbir kısıtlamaya takılmadan ham metin olarak al
    let rawText = "";
    try {
      rawText = await request.text();
    } catch (e) {
      rawText = "";
    }

    let body = {};
    if (rawText) {
      // Önce JSON olarak parse etmeyi dene
      try {
        body = JSON.parse(rawText);
      } catch (e1) {
        // JSON olmazsa URL-encoded form verisi (name=ali&mail=...) olarak dene
        try {
          const urlParams = new URLSearchParams(rawText);
          body = Object.fromEntries(urlParams.entries());
        } catch (e2) {
          body = {};
        }
      }
    }

    // Eğer hala boşsa standart FormData olarak okumayı dene
    if (Object.keys(body).length === 0) {
      try {
        const formData = await request.formData();
        body = Object.fromEntries(formData.entries());
      } catch (e3) {}
    }

    // 3. Ön yüzden gelebilecek tüm olası anahtar adlarını esnekçe yakala
    const isim = body.isim || body.name || body.username || body.kullaniciAdi || body.kullanici_adi;
    const mail = body.mail || body.email || body.eposta;
    const şifre = body.şifre || body.sifre || body.password || body.pass;

    // 4. Eksik bilgi kontrolü ve hata durumunda detaylı debug bilgisi döndür
    if (!isim || !mail || !şifre) {
      return new Response(JSON.stringify({ 
        error: "Eksik bilgi: İsim, mail ve şifre alanları zorunludur.",
        debug: {
          gelenHamMetin: rawText,
          cozulenBody: body,
          tespitEdilenAlanlar: {
            isimVarmi: !!isim,
            mailVarmi: !!mail,
            sifreVarmi: !!şifre
          }
        }
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. E-posta format kontrolü
    if (!mail.includes("@") || !mail.includes(".")) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta formatı." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 6. Daha önce kayıt olunmuş mu kontrol et
    const existingUser = await env.USERS_KV.get(mail);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "Bu e-posta adresi ile zaten bir hesap mevcut." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 7. Benzersiz ID oluştur ve şifreyi Base64 ile kodla
    const id = "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const encodedPassword = encodeBase64(şifre);

    // 8. KV içerisine kaydedilecek format: id, isim, mail, şifre
    const userData = {
      id: id,
      isim: isim,
      mail: mail,
      şifre: encodedPassword
    };

    // 9. Cloudflare Workers KV'ye yaz
    await env.USERS_KV.put(mail, JSON.stringify(userData));

    // 10. Başarılı yanıt
    return new Response(JSON.stringify({
      success: true,
      message: "Kayıt başarıyla oluşturuldu.",
      user: {
        id: id,
        isim: isim,
        mail: mail
      }
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Sunucu hatası: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
