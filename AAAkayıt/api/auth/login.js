/**
 * Aratsa Projesi - Akıllı Login (Giriş Yap) Fonksiyonu
 * Ön yüzden gelen mail ve şifre verilerini esnekçe yakalayan, 
 * Base64 doğrulaması yapan güvenli oturum açma servisi.
 */

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

    // 2. Gelen isteğin gövdesini ham metin olarak hiçbir kısıtlamaya takılmadan al
    let rawText = "";
    try {
      rawText = await request.text();
    } catch (e) {
      rawText = "";
    }

    let body = {};
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch (e1) {
        try {
          body = Object.fromEntries(new URLSearchParams(rawText).entries());
        } catch (e2) {
          body = {};
        }
      }
    }

    if (Object.keys(body).length === 0) {
      try {
        const formData = await request.formData();
        body = Object.fromEntries(formData.entries());
      } catch (e3) {}
    }

    // 3. Olası standart anahtar isimlerini esnekçe yakala (Türkçe veya İngilizce)
    let mail = body.mail || body.email || body.eposta;
    let şifre = body.şifre || body.sifre || body.password || body.pass;

    // 4. Akıllı Otomatik Eşleştirme (Eğer anahtarlar eşleşmediyse içeriğe göre bul)
    const values = Object.values(body);
    const keys = Object.keys(body);

    // İçeriğinde '@' ve '.' geçen değeri mail olarak kabul et
    if (!mail) {
      const foundKey = keys.find(k => {
        const val = String(body[k]);
        return val.includes("@") && val.includes(".");
      });
      if (foundKey) mail = body[foundKey];
    }

    // Eğer hala eksik varsa ve değerler geldiyse sırasıyla dağıt
    if ((!mail || !şifre) && values.length >= 2) {
      for (const val of values) {
        const strVal = String(val);
        if (!mail && strVal.includes("@") && strVal.includes(".")) {
          mail = strVal;
        } else if (!şifre) {
          şifre = strVal;
        }
      }
    }

    const unfilled = values.filter(v => v !== mail && v !== şifre);
    if (!mail && unfilled.length > 0) mail = unfilled.shift();
    if (!şifre && unfilled.length > 0) şifre = unfilled.shift();

    // 5. Kesin eksiklik kontrolü ve hata durumunda detaylı debug bilgisi döndür
    if (!mail || !şifre) {
      return new Response(JSON.stringify({ 
        error: "Eksik bilgi: Mail ve şifre alanları zorunludur.",
        debug: {
          gelenHamVeri: rawText,
          cozulenBodyObjesi: body,
          tespitEdilenler: { mail, şifre }
        }
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 6. KV deposundan e-posta adresine karşılık gelen kullanıcı verisini çek
    const userDataString = await env.USERS_KV.get(mail);
    if (!userDataString) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta adresi veya şifre." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = JSON.parse(userDataString);

    // 7. Girilen şifreyi Base64 formatına çevir ve veritabanındakiyle karşılaştır
    const bytes = new TextEncoder().encode(şifre);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const encodedInputPassword = btoa(binary);

    if (encodedInputPassword !== user.şifre) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta adresi veya şifre." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 8. Giriş başarılı, güvenli kullanıcı bilgilerini yanıt olarak dön
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
