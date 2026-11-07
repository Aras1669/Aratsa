/**
 * Aratsa Projesi - Login (Giriş Yap) Fonksiyonu
 * Girilen şifreyi Base64'e çevirerek KV'deki kayıtla kıyaslar.
 */

// Kayıt işlemindeki ile birebir aynı Base64 kodlama fonksiyonu
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

    // 2. İstek verisini oku
    const body = await request.json();
    const { mail, şifre } = body;

    // 3. Parametre kontrolü
    if (!mail || !şifre) {
      return new Response(JSON.stringify({ error: "Eksik bilgi: Mail ve şifre girilmelidir." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. KV deposundan kullanıcıyı e-posta (key) ile çağır
    const userDataString = await env.USERS_KV.get(mail);
    if (!userDataString) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta adresi veya şifre." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = JSON.parse(userDataString);

    // 5. Girilen şifreyi Base64'e çevir ve veritabanındakiyle karşılaştır
    const encodedInputPassword = encodeBase64(şifre);

    if (encodedInputPassword !== user.şifre) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta adresi veya şifre." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 6. Giriş başarılı, kullanıcı bilgilerini dön
    return new Response(JSON.stringify({
      success: true,
      message: "Giriş başarılı.",
      user: {
        id: user.id,
        isim: user.isim,
        mail: user.mail
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Sunucu hatası: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
