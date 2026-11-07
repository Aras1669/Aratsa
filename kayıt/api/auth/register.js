/**
 * Aratsa Projesi - Akıllı Register (Kayıt Ol) Fonksiyonu
 * Ön yüzden gelen verinin anahtar adları ne olursa olsun (İngilizce/Türkçe) 
 * otomatik çözen ve Base64 şifreleyen akıllı servis.
 */

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

    // 2. Gelen isteğin gövdesini (body) ham metin olarak yakala
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

    // 3. Olası standart anahtar isimlerini yakala
    let isim = body.isim || body.name || body.username || body.kullaniciAdi || body.kullanici_adi;
    let mail = body.mail || body.email || body.eposta;
    let şifre = body.şifre || body.sifre || body.password || body.pass;

    // 4. AKILLI OTOMATİK EŞLEŞTİRME (Eğer anahtarlar eşleşmediyse içeriğe göre bul)
    const values = Object.values(body);
    const keys = Object.keys(body);

    // Mail alanını içeriğinde '@' ve '.' karakterleri geçmesine bakarak bul
    if (!mail) {
      const foundKey = keys.find(k => {
        const val = String(body[k]);
        return val.includes("@") && val.includes(".");
      });
      if (foundKey) mail = body[foundKey];
    }

    // Eğer hala eksik varsa ve tam 3 değer gönderildiyse sırasıyla dağıt
    if ((!isim || !mail || !şifre) && values.length >= 3) {
      for (const val of values) {
        const strVal = String(val);
        if (!mail && strVal.includes("@") && strVal.includes(".")) {
          mail = strVal;
        } else if (!şifre && strVal.length >= 4) {
          // Genellikle şifre veya uzun metinler buraya düşer
          şifre = strVal;
        } else if (!isim) {
          isim = strVal;
        }
      }
    }

    // Yedek dağılım (Kalan boşlukları doldur)
    const unfilled = values.filter(v => v !== isim && v !== mail && v !== şifre);
    if (!isim && unfilled.length > 0) isim = unfilled.shift();
    if (!mail && unfilled.length > 0) mail = unfilled.shift();
    if (!şifre && unfilled.length > 0) şifre = unfilled.shift();

    // 5. Kesin eksiklik kontrolü ve detaylı debug çıktısı
    if (!isim || !mail || !şifre) {
      return new Response(JSON.stringify({ 
        error: "Eksik bilgi: İsim, mail ve şifre alanları zorunludur.",
        debug: {
          gelenHamVeri: rawText,
          cozulenBodyObjesi: body,
          tespitEdilenler: { isim, mail, şifre }
        }
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 6. E-posta format kontrolü
    if (!mail.includes("@") || !mail.includes(".")) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta formatı." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 7. Daha önce kayıt olunmuş mu kontrolü
    const existingUser = await env.USERS_KV.get(mail);
    if (existingUser) {
      return new Response(JSON.stringify({ error: "Bu e-posta adresi ile zaten bir hesap mevcut." }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 8. Benzersiz ID oluştur ve şifreyi Base64 ile kodla
    const id = "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    
    const bytes = new TextEncoder().encode(şifre);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const encodedPassword = btoa(binary);

    // 9. KV için kullanıcı objesi
    const userData = {
      id: id,
      isim: isim,
      mail: mail,
      şifre: encodedPassword
    };

    // 10. KV'ye kaydet
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
