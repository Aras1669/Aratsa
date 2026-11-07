/**
 * Aratsa Projesi - Register (Kayıt Ol) Fonksiyonu
 * Şifreler Base64 formatında kodlanarak Cloudflare Workers KV'ye kaydedilir.
 */

// Güvenli ve Türkçe karakter destekli Base64 kodlama fonksiyonu
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

    // 1. Cloudflare Workers KV kontrolü
    if (!env.USERS_KV) {
      return new Response(JSON.stringify({ error: "Sistem Hatası: USERS_KV Namespace tanımlanmamış." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Gelen JSON verisini al
    const body = await request.json();
    const { isim, mail, şifre } = body;

    // 3. Eksik alan kontrolü
    if (!isim || !mail || !şifre) {
      return new Response(JSON.stringify({ error: "Eksik bilgi: İsim, mail ve şifre alanları zorunludur." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. E-posta formatı kontrolü
    if (!mail.includes("@") || !mail.includes(".")) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta formatı." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. Daha önce bu mail ile kayıt olunmuş mu kontrol et
    const existingUser = await env.USERS_KV.get(mail);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "Bu e-posta adresi ile zaten bir hesap mevcut." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 6. Benzersiz ID oluştur
    const id = "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 7. Şifreyi Base64 ile kodla
    const encodedPassword = encodeBase64(şifre);

    // 8. KV içine kaydedilecek kullanıcı objesi (id, isim, mail, şifre formatında)
    const userData = {
      id: id,
      isim: isim,
      mail: mail,
      şifre: encodedPassword
    };

    // 9. Cloudflare Workers KV içerisine kaydet (Key: mail, Value: JSON string)
    await env.USERS_KV.put(mail, JSON.stringify(userData));

    // 10. Başarılı yanıt döndür (Güvenlik için şifre dışarıya verilmez)
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
