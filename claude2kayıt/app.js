/**
 * ARATSA - CLOUDFLARE WORKERS KV & CLOUDINARY FULL-STACK ENTEGRASYONU
 */

// 1. AYARLAR
const CONFIG = {
  // Cloudinary: Medya Depolama
  CLOUDINARY_CLOUD_NAME: 'yrvpqiet', 
  CLOUDINARY_UPLOAD_PRESET: 'İmages', // <-- Buraya Cloudinary'deki güncel unsigned preset adını yazmalısın
  
  // Giriş yapmadan görülebilecek maksimum gönderi sınırı
  GUEST_POST_LIMIT: 2
};

// Uygulama Durumu
let currentUser = null;
let currentAuthTab = 'login';
let selectedFile = null;
let posts = [];
let currentActivePostId = null;

// E-posta Onay Durumu (Geçici Bellek)
let pendingRegistration = null;

// Sayfa Yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
  loadPostsFromCloud();
  initGuestScrollObserver();
});

/* =========================================================
   2. KİMLİK DOĞRULAMA & CLOUDFLARE API ENTEGRASYONU
   ========================================================= */

function checkUserSession() {
  try {
    const saved = localStorage.getItem('aratsa_current_user');
    if (saved) {
      currentUser = JSON.parse(saved);
      if (!currentUser?.token) currentUser = null; // token'sız eski oturumlar yeniden giriş yapar
    }
  } catch (e) {
    currentUser = null;
  }
  updateUIForUser();
}

function updateUIForUser() {
  const profileText = document.getElementById('nav-profile-text');
  const sidebarSection = document.getElementById('sidebar-user-section');
  const sidebarAccountBox = document.getElementById('sidebar-account-box');

  if (currentUser) {
    const email = currentUser.email || JSON.parse(localStorage.getItem("aratsa_current_user")).mail;
    const username = currentUser.username || JSON.parse(localStorage.getItem("aratsa_current_user")).isim;

    if (profileText) profileText.textContent = username;

    if (sidebarSection) {
      sidebarSection.innerHTML = `
        <div class="logged-in-badge">
          <span class="logged-in-email"><i class="fa-solid fa-circle-user"></i>${" "+username}</span>
        </div>
      `;
    }

    if (sidebarAccountBox) {
      sidebarAccountBox.innerHTML = `
        <div class="account-avatar"><i class="fa-solid fa-user-check" style="color: #0095f6;"></i></div>
        <div class="account-meta">
          <span class="user-status">${escapeHtml(username)}</span>
          <span class="user-sub">${escapeHtml(email)}</span>
        </div>
        <button type="button" class="logout-btn" onclick="handleSignOut()">Çıkış</button>
      `;
    }
  } else {
    if (profileText) profileText.textContent = 'Giriş Yap';
    if (sidebarSection) sidebarSection.innerHTML = '';

    if (sidebarAccountBox) {
      sidebarAccountBox.innerHTML = `
        <div class="account-avatar"><i class="fa-solid fa-user"></i></div>
        <div class="account-meta">
          <span class="user-status" style="font-size: 14px;">Misafir Kullanıcı</span>
          <br>
          <span class="user-sub" style="font-size: 10px;">Lütfen ilk önce oturum açın</span>
        </div>
        <div class="account-btn-group">
          <button type="button" class="auth-action-link" onclick="openAuthModal('login')">Giriş Yap</button>
        </div>
      `;
    }
  }
}

// Modal Yönetimi
window.openAuthModal = function(tab = 'login') {
  cancelVerification();
  switchAuthTab(tab);
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  const err = document.getElementById('auth-error');
  if (err) err.style.display = 'none';
  cancelVerification();
};

window.switchAuthTab = function(tab) {
  currentAuthTab = tab;
  cancelVerification();

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const title = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const usernameGroup = document.getElementById('group-username');
  const legalNoticeBox = document.getElementById('legal-notice-box');
  const errorElem = document.getElementById('auth-error');

  if (errorElem) errorElem.style.display = 'none';

  if (tab === 'login') {
    tabLogin?.classList.add('active');
    tabRegister?.classList.remove('active');
    if (title) title.textContent = "Aratsa'ya Giriş Yap";
    if (submitBtn) submitBtn.textContent = 'Giriş Yap';
    if (usernameGroup) usernameGroup.style.display = 'none';
    if (legalNoticeBox) legalNoticeBox.style.display = 'none';
  } else {
    tabRegister?.classList.add('active');
    tabLogin?.classList.remove('active');
    if (title) title.textContent = 'Yeni Hesap Oluştur';
    if (submitBtn) submitBtn.textContent = 'Kayıt Ol ve Onay Kodu İste';
    if (usernameGroup) usernameGroup.style.display = 'flex';
    if (legalNoticeBox) legalNoticeBox.style.display = 'block';
  }
};

// Form Gönderimi (Cloudflare API ile Haberleşme)
window.handleAuthSubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username')?.value.trim() || email.split('@')[0];
  const errorElem = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (errorElem) errorElem.style.display = 'none';

  // 1. KAYIT OLMA ADIMI: Önce 6 Haneli E-posta Onay Kodu Simülasyonu
  if (currentAuthTab === 'register') {
    if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{3,20}$/.test(username)) {
      errorElem.textContent = 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf (a-z), rakam, _ ve . kullanılabilir (tire ve boşluk yok).';
      errorElem.style.display = 'block';
      return;
    }
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    pendingRegistration = {
      email: email.toLowerCase(),
      username: username,
      password: password,
      code: verificationCode
    };

    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('verify-step-box').style.display = 'block';
    document.getElementById('verify-email-desc').textContent = `${email} adresine gönderilen 6 haneli onay kodunu girin:`;
    document.getElementById('verify-code-input').value = '';
    document.getElementById('verify-code-input').focus();

    alert(`📧 [Cloudflare E-posta Doğrulama Simülasyonu]\n\nSayın ${username},\nAratsa onay kodunuz: ${verificationCode}`);
    showToast(`Doğrulama kodu: ${verificationCode}`);
    return;
  }

  // 2. GİRİŞ YAPMA ADIMI (/api/auth/login)
  submitBtn.disabled = true;
  submitBtn.textContent = 'Bulut sunucuya bağlanıyor...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Giriş yapılamadı!');
    }

    currentUser = { ...result.user, token: result.token };
    localStorage.setItem('aratsa_current_user', JSON.stringify(currentUser));

    closeAuthModal();
    document.getElementById('auth-form').reset();
    updateUIForUser();
    closeGuestBarrier();
    renderPosts();
    showToast(`Hoş geldin, ${currentUser.username}!`);
  } catch (err) {
    errorElem.textContent = err.message;
    errorElem.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Giriş Yap';
  }
};

// Onay Kodunu Doğrulama ve Cloudflare KV'ye Kayıt (/api/auth/register)
window.confirmVerificationCode = async function() {
  const enteredCode = document.getElementById('verify-code-input')?.value.trim();
  const verifyError = document.getElementById('verify-error');
  if (verifyError) verifyError.style.display = 'none';

  if (!pendingRegistration) {
    cancelVerification();
    return;
  }

  if (enteredCode !== pendingRegistration.code) {
    if (verifyError) {
      verifyError.textContent = 'Hatalı kod girdiniz! Lütfen e-postanıza gelen kodu kontrol edin.';
      verifyError.style.display = 'block';
    }
    return;
  }

  try {
    // Cloudflare Workers KV / D1 kayıt isteği
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingRegistration.email,
        password: pendingRegistration.password,
        username: pendingRegistration.username
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Kayıt işlemi başarısız oldu.');
    }

    currentUser = { ...result.user, token: result.token };
    localStorage.setItem('aratsa_current_user', JSON.stringify(currentUser));

    pendingRegistration = null;
    cancelVerification();
    closeAuthModal();
    updateUIForUser();
    closeGuestBarrier();
    renderPosts();

    showToast('Tebrikler! E-posta adresiniz doğrulandı ve bulut hesabınız açıldı.');
  } catch (err) {
    if (verifyError) {
      verifyError.textContent = err.message;
      verifyError.style.display = 'block';
    }
  }
};

window.resendVerificationCode = function() {
  if (!pendingRegistration) return;
  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
  pendingRegistration.code = newCode;
  alert(`📧 Yeni Onay Kodunuz: ${newCode}`);
  showToast(`Yeni kod gönderildi: ${newCode}`);
};

window.cancelVerification = function() {
  pendingRegistration = null;
  const authForm = document.getElementById('auth-form');
  const verifyBox = document.getElementById('verify-step-box');
  if (authForm) authForm.style.display = 'block';
  if (verifyBox) verifyBox.style.display = 'none';
  const verifyError = document.getElementById('verify-error');
  if (verifyError) verifyError.style.display = 'none';
};


/* =========================================================
   3. GÖNDERİ OLUŞTURMA & CLOUDINARY + CLOUDFLARE POSTS API
   ========================================================= */

window.handleCreatePostClick = function() {
  if (!currentUser) {
    openAuthModal('login');
    showToast('Gönderi paylaşmak için lütfen giriş yapın');
    return;
  }
  const modal = document.getElementById('create-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeCreateModal = function() {
  const modal = document.getElementById('create-modal');
  if (modal) modal.style.display = 'none';
  selectedFile = null;
  const label = document.getElementById('file-label-text');
  if (label) label.textContent = 'Bilgisayardan dosya seç (Fotoğraf veya Video)';
  const progress = document.getElementById('upload-progress-box');
  if (progress) progress.style.display = 'none';
};

window.handleFileSelect = function(input) {
  if (input.files && input.files[0]) {
    selectedFile = input.files[0];
    const sizeMb = (selectedFile.size / (1024 * 1024)).toFixed(1);
    const label = document.getElementById('file-label-text');
    if (label) label.textContent = `Seçildi: ${selectedFile.name} (${sizeMb} MB)`;

    const isVideo = selectedFile.type.startsWith('video/');
    const radioVideo = document.getElementById('radio-video');
    const radioImage = document.getElementById('radio-image');
    if (isVideo && radioVideo) radioVideo.checked = true;
    else if (radioImage) radioImage.checked = true;
  }
};

window.submitNewPost = async function() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  const mediaType = document.querySelector('input[name="media-type"]:checked')?.value || 'image';
  const urlInput = document.getElementById('new-media-url')?.value.trim() || '';
  const caption = document.getElementById('new-post-caption')?.value.trim() || '';
  const progressBox = document.getElementById('upload-progress-box');
  const statusText = document.getElementById('upload-status-text');
  const submitBtn = document.getElementById('submit-new-post');

  if (!selectedFile && !urlInput) {
    alert('Lütfen bir fotoğraf/video dosyası seçin veya bir link girin!');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  let finalMediaUrl = urlInput;

  // 1. Adım: Dosya seçildiyse Cloudinary'ye yükle
  if (selectedFile) {
    if (progressBox) progressBox.style.display = 'flex';
    if (statusText) statusText.textContent = "Cloudinary bulut depolamaya yükleniyor...";

    try {
      finalMediaUrl = await uploadToCloudinary(selectedFile);
    } catch (err) {
      console.warn('Cloudinary yükleme hatası, yerel nesne URL ile devam ediliyor:', err);
      alert('Dosya yüklenemedi. Cloudinary ayarlarını (cloud name / unsigned preset) kontrol edin veya bir URL girin.');
      if (submitBtn) submitBtn.disabled = false;
      if (progressBox) progressBox.style.display = 'none';
      return;
    }
  }

  // GÜVENLİK KONTROLÜ: currentUser nesnesindeki isim/mail alanlarını hatasız oku (.split hatasını önler)
  const userEmail = currentUser.mail || currentUser.email || 'kullanici@aratsa.com';
  const userName = currentUser.isim || currentUser.username || userEmail.split('@')[0];

  const newPost = {
    id: 'post_' + Date.now(),
    created_at: new Date().toISOString(),
    user_id: currentUser.id,
    username: userName,
    media_url: finalMediaUrl,
    media_type: mediaType,
    caption: caption,
    likes_count: 0,
    liked_by: []
  };

  try {
    if (statusText) statusText.textContent = "Cloudflare veritabanına kaydediliyor...";
    
    // 2. Adım: Cloudflare /api/posts endpoint'ine gönderiyi kalıcı olarak kaydet
    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(newPost)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Gönderi buluta kaydedilemedi.');
    }

    // Başarılı olursa listeye ekle ve ekranı yenile
    posts.unshift(result.post || newPost);
    renderPosts();
    closeCreateModal();
    
    document.getElementById('new-media-url').value = '';
    document.getElementById('new-post-caption').value = '';
    showToast('Gönderiniz buluta başarıyla paylaşıldı!');

  } catch (err) {
    alert('Hata: ' + err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (progressBox) progressBox.style.display = 'none';
  }
};


async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);

  const endpoint = `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/auto/upload`;
  const response = await fetch(endpoint, { method: 'POST', body: formData });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error('Cloudinary yükleme başarısız oldu.');
  }

  const data = JSON.parse(responseText);
  return data.secure_url;
}

/* =========================================================
   4. GÖNDERİLERİ BULUTTAN ÇEKME (GET /api/posts)
   ========================================================= */

async function loadPostsFromCloud() {
  try {
    const response = await fetch('/api/posts');
    if (response.ok) {
      const data = await response.json();
      posts = Array.isArray(data) ? data : [];
    } else {
      posts = [];
    }
  } catch (e) {
    posts = [];
  }
  renderPosts();
  if (location.hash && !window.hashDone) {
    window.hashDone = true;
    document.querySelector(`[data-post-id="${CSS.escape(location.hash.slice(1))}"]`)?.scrollIntoView();
  }
}

function renderPosts() {
  const container = document.getElementById('posts-stream');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;

  container.querySelectorAll('.post-card').forEach(el => el.remove());

  const visible = getVisiblePosts();
  updateFilterBar();
  if (visible.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  visible.forEach(post => {
    const postEl = createPostElement(post);
    container.appendChild(postEl);
  });
}

function createPostElement(post) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.postId = post.id;

  const isVideo = post.media_type === 'video' || (post.media_url && post.media_url.match(/\.(mp4|webm|mov)$/i));
  const isLiked = currentUser && Array.isArray(post.liked_by) && post.liked_by.includes(currentUser.id);

  const mediaHTML = isVideo ? `
    <video src="${escapeHtml(post.media_url)}" controls playsinline class="post-media"></video>
  ` : `
    <img src="${escapeHtml(post.media_url)}" alt="Post" class="post-media" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000';">
    <div class="floating-heart"><i class="fa-solid fa-heart"></i></div>
  `;

  card.innerHTML = `
    <header class="post-header">
      <div class="post-author">
        <div class="author-avatar-ring"><i class="fa-solid fa-user"></i></div>
        <div class="author-details">
          <span class="username">${escapeHtml(post.username || 'kullanici')}</span>
          <span class="time">• ${timeAgo(post.created_at)}</span>
        </div>
      </div>
      <button type="button" class="close-modal-btn" onclick="openPostOptions('${post.id}')"><i class="fa-solid fa-ellipsis"></i></button>
    </header>

    <div class="post-media-container">${mediaHTML}</div>

    <div class="post-actions">
      <div class="action-buttons-left">
        <button type="button" class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-liked="${isLiked}">
          <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>
        <button type="button" class="action-btn comment-btn" onclick="openComments('${post.id}')"><i class="fa-regular fa-comment"></i></button>
        <button type="button" class="action-btn share-btn" onclick="sharePost('${post.id}')"><i class="fa-regular fa-paper-plane"></i></button>
      </div>
      <button type="button" class="action-btn save-btn"><i class="fa-regular fa-bookmark"></i></button>
    </div>

    <div class="post-likes"><span class="likes-count">${post.likes_count || 0}</span> beğenme</div>

    <div class="post-caption">
      <span class="username">${escapeHtml(post.username || 'kullanici')}</span>
      <span class="caption-text">${escapeHtml(post.caption || '')}</span>
    </div>

    <button type="button" class="view-comments" onclick="openComments('${post.id}')">Yorumlar</button>

    <form class="comment-form" onsubmit="event.preventDefault(); submitComment('${post.id}', this);">
      <input type="text" placeholder="Yorum ekle..." class="comment-input" id="comment-input-${post.id}">
      <button type="submit" class="comment-submit">Paylaş</button>
    </form>
  `;

  setupCardInteractions(card, post, isVideo);
  hydrateCard(card, post);
  return card;
}

function setupCardInteractions(card, post, isVideo) {
  const likeBtn = card.querySelector('.like-btn');
  const likesCountElem = card.querySelector('.likes-count');
  const mediaContainer = card.querySelector('.post-media-container');
  const floatingHeart = card.querySelector('.floating-heart');
  const saveBtn = card.querySelector('.save-btn');

  likeBtn?.addEventListener('click', () => {
    if (!requireAuth('Beğenmek')) return;
    togglePostLike(post, likeBtn, likesCountElem);
  });

  if (!isVideo && mediaContainer && floatingHeart) {
    mediaContainer.addEventListener('dblclick', () => {
      if (!requireAuth('Beğenmek')) return;
      floatingHeart.classList.add('animate');
      setTimeout(() => floatingHeart.classList.remove('animate'), 750);
      
      const isLiked = likeBtn.dataset.liked === 'true';
      if (!isLiked) {
        togglePostLike(post, likeBtn, likesCountElem);
      }
    });
  }

  saveBtn?.addEventListener('click', () => {
    if (!requireAuth('Kaydetmek')) return;
    const icon = saveBtn.querySelector('i');
    icon.classList.toggle('fa-regular');
    icon.classList.toggle('fa-solid');
    showToast(icon.classList.contains('fa-solid') ? 'Gönderi kaydedildi' : 'Kayıtlardan çıkarıldı');
  });
}

function togglePostLike(post, likeBtn, likesCountElem) {
  let isLiked = likeBtn.dataset.liked === 'true';
  const icon = likeBtn.querySelector('i');

  if (!Array.isArray(post.liked_by)) post.liked_by = [];

  if (isLiked) {
    likeBtn.dataset.liked = 'false';
    likeBtn.classList.remove('liked');
    icon.classList.replace('fa-solid', 'fa-regular');
    post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
    post.liked_by = post.liked_by.filter(id => id !== currentUser.id);
  } else {
    likeBtn.dataset.liked = 'true';
    likeBtn.classList.add('liked');
    icon.classList.replace('fa-regular', 'fa-solid');
    post.likes_count = (post.likes_count || 0) + 1;
    if (!post.liked_by.includes(currentUser.id)) {
      post.liked_by.push(currentUser.id);
    }
  }

  likesCountElem.textContent = post.likes_count;
  syncLike(post, likesCountElem);
}

window.focusComment = function(postId) {
  document.getElementById(`comment-input-${postId}`)?.focus();
};



/* =========================================================
   5. DİĞER YARDIMCI FONKSİYONLAR & MİSAFİR KİLİDİ
   ========================================================= */

window.openLegalModal = function() {
  document.getElementById('legal-modal').style.display = 'flex';
};

window.closeLegalModal = function() {
  document.getElementById('legal-modal').style.display = 'none';
};

function initGuestScrollObserver() {
  window.addEventListener('scroll', () => {
    if (currentUser || feedFilter === 'reels') return;
    const visiblePosts = document.querySelectorAll('.post-card');
    if (visiblePosts.length > CONFIG.GUEST_POST_LIMIT) {
      const secondPost = visiblePosts[CONFIG.GUEST_POST_LIMIT - 1];
      const rect = secondPost.getBoundingClientRect();
      if (rect.bottom < 150) {
        document.getElementById('guest-barrier-modal').style.display = 'flex';
      }
    }
  });
}

function closeGuestBarrier() {
  document.getElementById('guest-barrier-modal').style.display = 'none';
}

window.closeBarrierAndOpen = function(tab) {
  closeGuestBarrier();
  openAuthModal(tab);
};

function requireAuth(actionName = 'Bu işlemi yapmak') {
  if (!currentUser) {
    openAuthModal('login');
    showToast(`${actionName} için lütfen giriş yapın`);
    return false;
  }
  return true;
}



window.showToast = function(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
};


window.closePostOptionsModal = function() {
  document.getElementById('post-options-modal').style.display = 'none';
  currentActivePostId = null;
};


function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/* =========================================================
   6. ETKİLEŞİMLER, FİLTRELER VE SUNUCU SENKRONU
   ========================================================= */
let feedFilter = 'home';
let searchQuery = '';
let reportPostId = null;

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (currentUser?.token) h.Authorization = 'Bearer ' + currentUser.token;
  return h;
}

async function react(payload) {
  const res = await fetch('/api/react', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { handleSignOut(true); openAuthModal('login'); }
  if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
  return data;
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (isNaN(s)) return 'Bulut';
  if (s < 60) return 'şimdi';
  if (s < 3600) return Math.floor(s / 60) + ' dk';
  if (s < 86400) return Math.floor(s / 3600) + ' sa';
  return Math.floor(s / 86400) + ' gün';
}

function getVisiblePosts() {
  let list = posts.slice();
  if (feedFilter === 'mine') list = list.filter(p => p.user_id === currentUser?.id);
  if (feedFilter === 'reels') {
    list = list.filter(isReel).sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    if (!currentUser) list = list.slice(0, GUEST_REELS_LIMIT);
  }
  if (feedFilter === 'explore') list.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => ((p.username || '') + ' ' + (p.caption || '')).toLowerCase().includes(q));
  }
  return list;
}

function updateFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const names = { mine: 'Gönderilerim', reels: 'Reels (en çok beğenilenler)', explore: 'Keşfet (en çok beğenilenler)' };
  const label = searchQuery ? `Arama: “${searchQuery}”` : names[feedFilter];
  bar.style.display = label ? 'flex' : 'none';
  bar.innerHTML = label ? `<span>${escapeHtml(label)}</span><button type="button" class="auth-action-link" onclick="handleNavClick('home')">Temizle</button>` : '';
}

function openPanel(title, html, onReady) {
  document.getElementById('panel-title').textContent = title;
  document.getElementById('panel-body').innerHTML = html;
  document.getElementById('panel-modal').style.display = 'flex';
  onReady?.();
}
window.closePanel = () => { document.getElementById('panel-modal').style.display = 'none'; document.body.classList.remove('searching'); };

window.handleNavClick = function(section, btn) {
  if (section === 'search') {
    return openPanel('Ara', `<input type="search" id="search-input" class="comment-input" style="width:100%" placeholder="Kullanıcı veya açıklama ara..." value="${escapeHtml(searchQuery)}">`, () => {
      const input = document.getElementById('search-input');
      input.focus();
      input.addEventListener('input', () => { searchQuery = input.value.trim(); document.body.classList.add('searching'); renderPosts(); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') closePanel(); });
    });
  }
  if (section === 'notifications') return openNotifications();
  searchQuery = '';
  feedFilter = section;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  (btn || (section === 'home' && document.querySelector('.nav-item')))?.classList.add('active');
  renderPosts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.handleProfileNavClick = function() {
  if (!currentUser) return openAuthModal('login');
  handleNavClick('mine', document.getElementById('nav-profile-btn'));
};

function openNotifications() {
  if (!requireAuth('Bildirimleri görmek')) return;
  const items = [];
  posts.filter(p => p.user_id === currentUser.id).forEach(p => {
    if (p.likes_count) items.push({ t: p.created_at, html: `<b>${p.likes_count}</b> kişi gönderini beğendi: “${escapeHtml((p.caption || 'Gönderi').slice(0, 30))}”` });
    (p.comments || []).filter(c => c.user_id !== currentUser.id).forEach(c => items.push({ t: c.created_at, html: `<b>${escapeHtml(c.username)}</b> yorum yaptı: ${escapeHtml(c.text.slice(0, 60))}` }));
  });
  items.sort((a, b) => new Date(b.t) - new Date(a.t));
  openPanel('Bildirimler', items.length ? items.map(i => `<p style="margin:0 0 12px">${i.html}</p>`).join('') : '<p>Henüz bildirimin yok.</p>');
}

window.handleSignOut = function(silent) {
  localStorage.removeItem('aratsa_current_user');
  currentUser = null;
  feedFilter = 'home';
  searchQuery = '';
  updateUIForUser();
  renderPosts();
  if (silent !== true) showToast('Oturum kapatıldı.');
};

async function syncLike(post, countEl) {
  try {
    const r = await react({ action: 'like', id: post.id });
    post.likes_count = r.likes_count;
    post.liked_by = r.liked_by;
    countEl.textContent = r.likes_count;
  } catch (err) {
    showToast(err.message);
    loadPostsFromCloud();
  }
}

function commentEl(c) {
  const d = document.createElement('div');
  d.className = 'comment-item';
  d.innerHTML = `<span class="username">${escapeHtml(c.username)}</span> <span class="comment-text">${escapeHtml(c.text)}</span>`;
  return d;
}

function hydrateCard(card, post) {
  decorateCard(card, post);

  const key = 'aratsa_saved_' + (currentUser?.id || 'guest');
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
  const btn = card.querySelector('.save-btn');
  const icon = btn.querySelector('i');
  if (currentUser && read().includes(post.id)) icon.classList.replace('fa-regular', 'fa-solid');
  btn.addEventListener('click', () => { // ilk dinleyici ikonu çevirir, bu da kalıcı kaydeder
    if (!currentUser) return;
    const set = new Set(read());
    icon.classList.contains('fa-solid') ? set.add(post.id) : set.delete(post.id);
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
  });
}


window.openPostOptions = function(postId) {
  currentActivePostId = postId;
  const post = posts.find(p => p.id === postId);
  document.getElementById('opt-delete-btn').style.display = currentUser && post?.user_id === currentUser.id ? 'block' : 'none';
  document.getElementById('post-options-modal').style.display = 'flex';
};

window.confirmDeleteCurrentPost = async function() {
  const id = currentActivePostId;
  if (!id || !confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
  try {
    await react({ action: 'delete', id });
    posts = posts.filter(p => p.id !== id);
    closePostOptionsModal();
    renderPosts();
    showToast('Gönderi silindi.');
  } catch (err) {
    showToast(err.message);
  }
};

window.openReportModalFromOptions = function() {
  if (!requireAuth('Şikayet etmek')) return;
  reportPostId = currentActivePostId;
  closePostOptionsModal();
  document.getElementById('report-modal').style.display = 'flex';
};
window.closeReportModal = () => { document.getElementById('report-modal').style.display = 'none'; };
window.submitReport = async function(reason) {
  try {
    await react({ action: 'report', id: reportPostId, reason });
    showToast('Şikayetin alındı, teşekkürler.');
  } catch (err) {
    showToast(err.message);
  }
  closeReportModal();
};

async function copyLink(id) {
  const url = `${location.origin}${location.pathname}#${id}`;
  try { await navigator.clipboard.writeText(url); showToast('Bağlantı kopyalandı!'); }
  catch { prompt('Bağlantıyı kopyala:', url); }
}
window.sharePost = id => copyLink(id);
window.copyCurrentPostLink = function() { const id = currentActivePostId; closePostOptionsModal(); copyLink(id); };

// Modal dışına tıklama / Esc ile kapatma (misafir sınırı modalı hariç)
document.addEventListener('click', e => {
  if (e.target.classList?.contains('modal-overlay') && e.target.id !== 'guest-barrier-modal') e.target.style.display = 'none';
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => { if (m.id !== 'guest-barrier-modal') m.style.display = 'none'; });
});

/* =========================================================
   7. YORUM PANELİ, REELS, TAKİP, ŞİFRELİ MESAJLAR
   ========================================================= */
const GUEST_REELS_LIMIT = 5;
const isReel = p => p.media_type === 'video' || /\.(mp4|webm|mov)$/i.test(p.media_url || '');
const me = () => String(currentUser?.username || '').toLowerCase();
let commentsPostId = null;
let myFollowing = new Set();
let myFollowers = [];

// ---- Yorumlar: akışta sadece "Yorumlar (n)" yazar, tıklayınca panel açılır ----
function setCommentCount(card, post) {
  const n = (post.comments || []).length;
  const b = card.querySelector('.view-comments');
  if (b) b.textContent = n ? `Yorumlar (${n})` : 'Yorumlar';
}

async function addComment(postId, text) {
  const { comment } = await react({ action: 'comment', id: postId, text });
  const post = posts.find(p => p.id === postId);
  if (post) (post.comments ||= []).push(comment);
  document.querySelectorAll(`[data-post-id="${postId}"]`).forEach(card => setCommentCount(card, post));
}

window.submitComment = async function(postId, form) {
  if (!requireAuth('Yorum yapmak')) return;
  const input = form.querySelector('.comment-input');
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try { await addComment(postId, text); input.value = ''; showToast('Yorumun eklendi'); }
  catch (err) { showToast(err.message); }
  input.disabled = false;
};

function renderCommentsPanel() {
  const post = posts.find(p => p.id === commentsPostId);
  const box = document.getElementById('comments-modal-list');
  box.innerHTML = '';
  (post?.comments || []).forEach(c => box.appendChild(commentEl(c)));
  if (!box.children.length) box.innerHTML = '<p class="dm-note">Henüz yorum yok. İlk yorumu sen yaz!</p>';
  box.scrollTop = box.scrollHeight;
}
window.openComments = function(id) {
  commentsPostId = id;
  renderCommentsPanel();
  document.getElementById('comments-modal').style.display = 'flex';
  document.getElementById('comments-input').focus();
};
window.closeCommentsModal = () => { document.getElementById('comments-modal').style.display = 'none'; };
window.submitPanelComment = async function() {
  if (!requireAuth('Yorum yapmak')) return;
  const input = document.getElementById('comments-input');
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try { await addComment(commentsPostId, text); input.value = ''; renderCommentsPanel(); }
  catch (err) { showToast(err.message); }
  input.disabled = false;
  input.focus();
};

// ---- Takip ----
function decorateCard(card, post) {
  setCommentCount(card, post);
  const u = String(post.username || '').toLowerCase();
  if (u && u !== me()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'follow-btn'; b.dataset.user = u;
    b.onclick = () => toggleFollow(u);
    card.querySelector('.author-details')?.appendChild(b);
  }
}
function refreshFollow() {
  document.querySelectorAll('.follow-btn').forEach(b => {
    const on = myFollowing.has(b.dataset.user);
    b.classList.toggle('following', on);
    b.textContent = on ? 'Takiptesin' : 'Takip Et';
  });
  const c = document.getElementById('follow-counts');
  if (c) c.textContent = `${myFollowers.length} takipçi • ${myFollowing.size} takip`;
}
async function loadFollow() {
  myFollowing = new Set(); myFollowers = [];
  if (currentUser) {
    try {
      const r = await fetch('/api/follow', { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); myFollowing = new Set(d.following); myFollowers = d.followers; }
    } catch {}
  }
  refreshFollow();
}
window.toggleFollow = async function(user) {
  if (!requireAuth('Takip etmek')) return;
  const action = myFollowing.has(user) ? 'unfollow' : 'follow';
  try {
    const r = await fetch('/api/follow', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ target: user, action }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    action === 'follow' ? myFollowing.add(user) : myFollowing.delete(user);
    refreshFollow();
    showToast(action === 'follow' ? `@${user} takip ediliyor` : `@${user} takipten çıkarıldı`);
  } catch (err) { showToast(err.message || 'İşlem başarısız.'); }
};

// ---- Sağ panel (misafir: Giriş Yap + Kayıt Ol), videoların otomatik oynaması, Reels sınırı ----
function decorateAccountBox() {
  const box = document.getElementById('sidebar-account-box');
  if (!box) return;
  if (!currentUser) {
    box.innerHTML = `<div class="account-avatar"><i class="fa-solid fa-user"></i></div>
      <div class="account-meta"><span class="user-status">Misafir Kullanıcı</span><span class="user-sub">Gönderi paylaşmak için oturum açın</span></div>
      <div class="account-btn-group"><button type="button" class="auth-action-link" onclick="openAuthModal('login')">Giriş Yap</button><span class="divider">•</span><button type="button" class="auth-action-link highlight" onclick="openAuthModal('register')">Kayıt Ol</button></div>`;
  } else {
    box.querySelector('.account-meta')?.insertAdjacentHTML('beforeend', '<span class="user-sub" id="follow-counts"></span>');
  }
}

const videoIO = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting && e.intersectionRatio > 0.6) e.target.play().catch(() => {}); else e.target.pause();
}), { threshold: [0, 0.6] });

function addReelsGate() {
  document.querySelectorAll('.guest-gate').forEach(e => e.remove());
  if (feedFilter !== 'reels' || currentUser) return;
  const rest = posts.filter(isReel).length - GUEST_REELS_LIMIT;
  if (rest <= 0) return;
  const g = document.createElement('div');
  g.className = 'guest-gate';
  g.innerHTML = `<i class="fa-solid fa-lock"></i><h3>${rest} reels daha seni bekliyor</h3><p>Hepsini izlemek için giriş yap veya kayıt ol.</p><button type="button" class="primary-btn" onclick="openAuthModal('register')">Kayıt Ol</button>`;
  document.getElementById('posts-stream').appendChild(g);
}

const _renderPosts = renderPosts;
renderPosts = function() {
  _renderPosts();
  document.querySelectorAll('.post-media-container video').forEach(v => { v.muted = true; v.loop = true; videoIO.observe(v); });
  addReelsGate();
  refreshFollow();
};

const _updateUI = updateUIForUser;
updateUIForUser = function() {
  _updateUI();
  decorateAccountBox();
  Object.keys(peerKeys).forEach(k => delete peerKeys[k]);
  myPair = null;
  loadFollow();
  if (currentUser) ensureKeys().catch(() => {});
};

// ---- Şifreli mesajlar: ECDH (P-256) ile ortak anahtar + AES-GCM. Özel anahtar bu cihazda kalır ----
const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const peerKeys = {};
let myPair = null, dmPeer = null, dmTimer = null;

async function ensureKeys() {
  if (myPair) return myPair;
  const k = 'aratsa_e2e_' + currentUser.id;
  try { myPair = JSON.parse(localStorage.getItem(k)); } catch {}
  if (!myPair) {
    const kp = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
    myPair = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: await crypto.subtle.exportKey('jwk', kp.publicKey) };
    localStorage.setItem(k, JSON.stringify(myPair));
  }
  const r = await fetch('/api/keys?u=' + encodeURIComponent(currentUser.username));
  const srv = r.ok ? await r.json() : {};
  if (srv.x !== myPair.pub.x || srv.y !== myPair.pub.y) {
    await fetch('/api/keys', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ jwk: myPair.pub }) });
  }
  return myPair;
}

async function aesKey(peer) {
  if (peerKeys[peer]) return peerKeys[peer];
  const { priv } = await ensureKeys();
  const r = await fetch('/api/keys?u=' + encodeURIComponent(peer));
  if (!r.ok) throw new Error('Bu kullanıcı şifreli mesajlaşmayı henüz açmamış (bir kez giriş yapması gerekir).');
  const pub = await crypto.subtle.importKey('jwk', await r.json(), ECDH, false, []);
  const sk = await crypto.subtle.importKey('jwk', priv, ECDH, false, ['deriveKey']);
  return (peerKeys[peer] = await crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, sk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
}

async function dmDecrypt(m) {
  try {
    const key = await aesKey(dmPeer);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(m.iv) }, key, b64d(m.ct)));
  } catch { return '🔒 Bu mesaj bu cihazda çözülemedi'; }
}

async function dmLoad() {
  if (!dmPeer || document.getElementById('dm-modal').style.display === 'none') return clearInterval(dmTimer);
  try {
    const r = await fetch('/api/messages?with=' + encodeURIComponent(dmPeer), { headers: authHeaders() });
    const { msgs = [] } = await r.json();
    const th = document.getElementById('dm-thread');
    if (th.dataset.n === String(msgs.length)) return;
    const texts = await Promise.all(msgs.map(dmDecrypt));
    th.dataset.n = String(msgs.length);
    th.innerHTML = '';
    msgs.forEach((m, i) => {
      const d = document.createElement('div');
      d.className = 'dm-msg' + (m.from === me() ? ' me' : '');
      d.textContent = texts[i];
      th.appendChild(d);
    });
    if (!msgs.length) th.innerHTML = '<p class="dm-note">Henüz mesaj yok. Merhaba de!</p>';
    th.scrollTop = th.scrollHeight;
  } catch {}
}

function dmShow(view) {
  const chat = view === 'chat';
  clearInterval(dmTimer);
  if (!chat) dmPeer = null;
  document.getElementById('dm-list-view').style.display = chat ? 'none' : 'block';
  document.getElementById('dm-chat-view').style.display = chat ? 'block' : 'none';
  document.getElementById('dm-back').style.display = chat ? 'inline-flex' : 'none';
  document.getElementById('dm-title').textContent = chat ? '@' + dmPeer : 'Mesajlar';
}

window.openDM = async function() {
  if (!requireAuth('Mesajları görmek')) return;
  document.getElementById('dm-modal').style.display = 'flex';
  dmShow('list');
  try { await ensureKeys(); } catch {}
  const r = await fetch('/api/messages', { headers: authHeaders() });
  const { conversations = {} } = await r.json().catch(() => ({}));
  const names = Object.keys(conversations).sort((a, b) => conversations[b] - conversations[a]);
  document.getElementById('dm-convos').innerHTML = names.length
    ? names.map(n => `<button type="button" class="dm-convo" data-user="${escapeHtml(n)}" onclick="dmOpen(this.dataset.user)"><i class="fa-solid fa-circle-user"></i> ${escapeHtml(n)} <small>${timeAgo(conversations[n])}</small></button>`).join('')
    : '<p class="dm-note">Henüz sohbet yok. Yukarıya bir kullanıcı adı yazıp başla.</p>';
};
window.dmBack = () => openDM();
window.dmOpen = async function(name) {
  dmPeer = String(name).toLowerCase();
  dmShow('chat');
  const th = document.getElementById('dm-thread');
  th.innerHTML = ''; th.dataset.n = '';
  await dmLoad();
  dmTimer = setInterval(dmLoad, 4000);
  document.getElementById('dm-input').focus();
};
window.dmOpenFromInput = function() {
  const input = document.getElementById('dm-user-input');
  const v = input.value.trim().replace(/^@/, '').toLowerCase();
  if (!v) return;
  if (v === me()) return showToast('Kendine mesaj gönderemezsin.');
  input.value = '';
  dmOpen(v);
};
window.dmSend = async function() {
  const input = document.getElementById('dm-input');
  const text = input.value.trim();
  if (!text || !dmPeer) return;
  input.disabled = true;
  try {
    const key = await aesKey(dmPeer);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    const r = await fetch('/api/messages', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ to: dmPeer, iv: b64e(iv), ct: b64e(ct) }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    input.value = '';
    document.getElementById('dm-thread').dataset.n = '';
    await dmLoad();
  } catch (err) { showToast(err.message || 'Mesaj gönderilemedi.'); }
  input.disabled = false;
  input.focus();
};
window.closeDM = () => { clearInterval(dmTimer); dmPeer = null; document.getElementById('dm-modal').style.display = 'none'; };
