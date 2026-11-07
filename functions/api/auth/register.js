/**
 * Aratsa Projesi - Register (Kayıt Ol) Fonksiyonu
 * Hem JSON hem FormData destekleyen, Türkçe/İngilizce anahtar uyumlu güvenli kayıt servisi.
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

    // 1. KV Kontrolü
    if (!env.USERS_KV) {
      return new Response(JSON.stringify({ error: "Sistem Hatası: USERS_KV Namespace tanımlanmamış." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Gelen verinin türünü (Content-Type) tespit et ve güvenli şekilde parse et
    let body = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
    } else if (contentType.includes("form") || contentType.includes("multipart")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData);
    } else {
      // Varsayılan olarak JSON denemesi yapalım
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
    }

    // 3. Farklı anahtar kombinasyonlarını esnek bir şekilde yakala (Türkçe veya İngilizce gelebilir)
    const isim = body.isim || body.name || body.username || body.kullaniciAdi;
    const mail = body.mail || body.email;
    const şifre = body.şifre || body.sifre || body.password;

    // 4. Eksik bilgi kontrolü (Hangi alanın eksik olduğunu detaylı görmek için loglanabilir)
    if (!isim || !mail || !şifre) {
      return new Response(JSON.stringify({ 
        error: "Eksik bilgi: İsim, mail ve şifre alanları zorunludur.",
        debug: { 
          gelenVeri: body,
          eksikAlanlar: {
            isim: !isim,
            mail: !mail,
            şifre: !şifre
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

    // 6. Daha önce kayıt olunmuş mu?
    const existingUser = await env.USERS_KV.get(mail);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "Bu e-posta adresi ile zaten bir hesap mevcut." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 7. Benzersiz ID ve Base64 Şifreleme
    const id = "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const encodedPassword = encodeBase64(şifre);

    const userData = {
      id: id,
      isim: isim,
      mail: mail,
      şifre: encodedPassword
    };

    // 8. KV Veritabanına Yazma
    await env.USERS_KV.put(mail, JSON.stringify(userData));

    return new Response(JSON.stringify({
      success: true,
      message: "Kayıt başarıyla oluşturuldu.",
      user: { id, isim, mail }
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
