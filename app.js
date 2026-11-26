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
    pendingRegistration = { email: email.toLowerCase(), username, password };
    submitBtn.disabled = true;
    try {
      await requestCode('kayit', pendingRegistration.email, username);
      document.getElementById('auth-form').style.display = 'none';
      document.getElementById('verify-step-box').style.display = 'block';
      document.getElementById('verify-email-desc').textContent = `${email} adresine gönderilen 6 haneli onay kodunu girin:`;
      document.getElementById('verify-code-input').value = '';
      document.getElementById('verify-code-input').focus();
    } catch (err) {
      pendingRegistration = null;
      errorElem.textContent = err.message;
      errorElem.style.display = 'block';
    }
    submitBtn.disabled = false;
    return;
  }

  // 2. GİRİŞ YAPMA ADIMI (/api/auth/login)
  submitBtn.disabled = true;
  submitBtn.textContent = 'Bulut sunucuya bağlanıyor...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pw64: toB64(password) })
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


  try {
    // Cloudflare Workers KV / D1 kayıt isteği
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingRegistration.email,
        pw64: toB64(pendingRegistration.password),
        code: enteredCode,
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
    posts.unshift(result.post ? normalizePost(result.post) : newPost);
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
  file = await shrinkImage(file);
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
    const response = await fetch('/api/posts', { headers: authHeaders() });
    if (response.ok) {
      const data = await response.json();
      posts = Array.isArray(data) ? data.map(normalizePost) : [];
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
    <img src="${escapeHtml(post.media_url)}" alt="Post" class="post-media" onerror="this.onerror=null;this.src='icon-512.png';">
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
  if (!currentUser && feedFilter !== 'reels') list = list.slice(0, CONFIG.GUEST_POST_LIMIT);
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
    return openPanel('Ara', `<input type="search" id="search-input" class="comment-input" style="width:100%" placeholder="Kullanıcı veya açıklama ara..." value="${escapeHtml(searchQuery)}"><div id="people-results"></div>`, () => {
      const input = document.getElementById('search-input');
      input.focus();
      input.addEventListener('input', () => { searchQuery = input.value.trim(); document.body.classList.add('searching'); renderPosts(); showPeople(input.value); });
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
  if (currentUser?.token) fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {});
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
    post.liked_by = r.liked && currentUser ? [currentUser.id] : [];
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
  if (post) (post.comments ||= []).push(normalizeComment(comment));
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
  card.dataset.user = u;
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


const _renderPosts = renderPosts;
renderPosts = function() {
  _renderPosts();
  document.querySelectorAll('.post-media-container video').forEach(v => { v.muted = true; v.loop = true; videoIO.observe(v); });
  addGuestGate();
  refreshFollow();
  showFeedError();
};

const _updateUI = updateUIForUser;
updateUIForUser = function() {
  _updateUI();
  decorateAccountBox();
  loadFollow();
  const uid = currentUser?.id || '';
  if (lastUid !== null && uid !== lastUid) loadPostsFromCloud();
  lastUid = uid;
  loadUsers();
  loadStories();
};

// ---- Cihazda çalışan yardımcılar (sunucuyu yormaz) ----
let lastUid = null;
let allUsers = [];
let dmPeer = null, dmTimer = null;

function toB64(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))); }
function normalizeComment(c) { return { ...c, user_id: c.mine ? currentUser?.id : 'u:' + c.username }; }
function normalizePost(p) {
  return { ...p, id: String(p.id).replace(/[^\w-]/g, ''), user_id: p.mine ? currentUser?.id : 'u:' + p.username, liked_by: p.liked && currentUser ? [currentUser.id] : [], comments: (p.comments || []).map(normalizeComment) };
}

// Fotoğraflar yüklenmeden önce telefonda küçültülür (hız + depolama tasarrufu)
async function shrinkImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

function addGuestGate() {
  document.querySelectorAll('.guest-gate').forEach(e => e.remove());
  if (currentUser || !posts.length) return;
  const g = document.createElement('div');
  g.className = 'guest-gate';
  g.innerHTML = '<i class="fa-solid fa-lock"></i><h3>Daha fazlası seni bekliyor</h3><p>Tüm gönderi ve reels’leri görmek için giriş yap veya kayıt ol.</p><button type="button" class="primary-btn" onclick="openAuthModal(\'register\')">Kayıt Ol</button>';
  document.getElementById('posts-stream').appendChild(g);
}

// ---- Kullanıcı arama: liste bir kez indirilir, en yakın eşleşmeler cihazda hesaplanır ----
async function loadUsers() {
  allUsers = [];
  if (!currentUser) return;
  try {
    const c = JSON.parse(sessionStorage.getItem('aratsa_users') || 'null');
    if (c && c.uid === currentUser.id && Date.now() - c.t < 300000) { allUsers = c.u; return; }
    const r = await fetch('/api/users', { headers: authHeaders() });
    if (r.ok) {
      allUsers = (await r.json()).users || [];
      sessionStorage.setItem('aratsa_users', JSON.stringify({ uid: currentUser.id, t: Date.now(), u: allUsers }));
    }
  } catch {}
}

function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

function suggest(q, n = 5) {
  q = String(q || '').toLowerCase().replace(/^@/, '').trim();
  if (!q) return [];
  const limit = 2 + Math.max(2, Math.ceil(q.length * 0.6));
  return allUsers.filter(u => u !== me())
    .map(u => [u, u.startsWith(q) ? 0 : u.includes(q) ? 1 : 2 + lev(q, u)])
    .filter(([, s]) => s <= limit)
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length)
    .slice(0, n)
    .map(([u]) => u);
}

function showPeople(q) {
  const box = document.getElementById('people-results');
  if (!box) return;
  box.innerHTML = suggest(q, 5).map(u => `<div class="person"><i class="fa-solid fa-circle-user"></i><span>@${escapeHtml(u)}</span><button type="button" class="follow-btn" data-user="${escapeHtml(u)}" onclick="toggleFollow(this.dataset.user)"></button><button type="button" class="mini-btn" data-user="${escapeHtml(u)}" onclick="closePanel(); openDM(this.dataset.user)">Mesaj</button></div>`).join('');
  refreshFollow();
}

// ---- Mesajlar (metin). Yetki kontrolü ve kayıt sunucuda yapılır ----
const userBtn = u => `<button type="button" class="dm-convo" data-user="${escapeHtml(u)}" onclick="dmOpen(this.dataset.user)"><i class="fa-solid fa-circle-user"></i> @${escapeHtml(u)}</button>`;

window.dmSuggest = function() {
  document.getElementById('dm-suggest').innerHTML = suggest(document.getElementById('dm-user-input').value, 4).map(userBtn).join('');
};

async function dmLoad() {
  if (!dmPeer || document.getElementById('dm-modal').style.display === 'none') return clearInterval(dmTimer);
  if (document.hidden) return;
  try {
    const r = await fetch('/api/messages?with=' + encodeURIComponent(dmPeer), { headers: authHeaders() });
    if (r.status === 401) return handleSignOut(true);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const msgs = d.msgs || [];
    const th = document.getElementById('dm-thread');
    if (th.dataset.n === String(msgs.length)) return;
    th.dataset.n = String(msgs.length);
    th.innerHTML = msgs.length ? '' : '<p class="dm-note">Henüz mesaj yok. Merhaba de!</p>';
    msgs.forEach(m => {
      const el = document.createElement('div');
      el.className = 'dm-msg' + (m.from === me() ? ' me' : '');
      el.textContent = m.text ?? '🔒 Eski şifreli mesaj';
      th.appendChild(el);
    });
    th.scrollTop = th.scrollHeight;
  } catch (err) {
    clearInterval(dmTimer);
    showToast(err.message || 'Mesajlar yüklenemedi.');
  }
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

window.openDM = async function(peer) {
  if (!requireAuth('Mesajları görmek')) return;
  document.getElementById('dm-modal').style.display = 'flex';
  loadUsers();
  if (typeof peer === 'string' && peer) return dmOpen(peer);
  dmShow('list');
  document.getElementById('dm-suggest').innerHTML = '';
  const box = document.getElementById('dm-convos');
  try {
    const r = await fetch('/api/messages', { headers: authHeaders() });
    if (r.status === 401) return handleSignOut(true);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const c = d.conversations || {};
    const names = Object.keys(c).sort((a, b) => c[b] - c[a]);
    box.innerHTML = names.length
      ? names.map(n => `<button type="button" class="dm-convo" data-user="${escapeHtml(n)}" onclick="dmOpen(this.dataset.user)"><i class="fa-solid fa-circle-user"></i> @${escapeHtml(n)} <small>${timeAgo(c[n])}</small></button>`).join('')
      : '<p class="dm-note">Henüz sohbet yok. Yukarıya bir kullanıcı adı yazıp başla.</p>';
  } catch (err) {
    box.innerHTML = `<p class="dm-note">${escapeHtml(err.message || 'Mesajlar yüklenemedi.')}</p>`;
  }
};
window.dmBack = () => openDM();

window.dmOpen = async function(name) {
  dmPeer = String(name).toLowerCase();
  dmShow('chat');
  const th = document.getElementById('dm-thread');
  th.innerHTML = '';
  th.dataset.n = '';
  await dmLoad();
  clearInterval(dmTimer);
  dmTimer = setInterval(dmLoad, 6000);
  document.getElementById('dm-input').focus();
};

window.dmOpenFromInput = function() {
  const input = document.getElementById('dm-user-input');
  const v = input.value.trim().replace(/^@/, '').toLowerCase();
  if (!v) return;
  if (v === me()) return showToast('Kendine mesaj gönderemezsin.');
  if (allUsers.includes(v) || !allUsers.length) { input.value = ''; return dmOpen(v); }
  const s = suggest(v, 3);
  document.getElementById('dm-suggest').innerHTML = s.length
    ? `<p class="dm-note">“${escapeHtml(v)}” bulunamadı. Şunu mu demek istedin?</p>` + s.map(userBtn).join('')
    : `<p class="dm-note">“${escapeHtml(v)}” adında bir kullanıcı yok.</p>`;
};

window.dmSend = async function() {
  const input = document.getElementById('dm-input');
  const text = input.value.trim();
  if (!text || !dmPeer) return;
  input.disabled = true;
  try {
    const r = await fetch('/api/messages', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ to: dmPeer, text }) });
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


/* =========================================================
   8. E-POSTA KODU, ŞİFRE SIFIRLAMA, HİKAYE, PROFİL, ŞİKAYET
   ========================================================= */
window.alert = (m) => showToast(String(m)); // tarayıcı uyarı kutuları yerine bildirim

async function requestCode(amac, email, username) {
  const r = await fetch('/api/auth/kod', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, amac, username }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Kod gönderilemedi.');
}
window.resendVerificationCode = async function() {
  if (!pendingRegistration) return;
  try { await requestCode('kayit', pendingRegistration.email, pendingRegistration.username); showToast('Yeni kod gönderildi.'); }
  catch (err) { showToast(err.message); }
};

let resetStep = 1;
window.openReset = function() {
  closeAuthModal();
  resetStep = 1;
  document.getElementById('reset-step2').style.display = 'none';
  document.getElementById('reset-btn').textContent = 'Kod Gönder';
  document.getElementById('reset-error').style.display = 'none';
  document.getElementById('reset-modal').style.display = 'flex';
};
window.closeReset = () => { document.getElementById('reset-modal').style.display = 'none'; };
window.resetSubmit = async function() {
  const err = document.getElementById('reset-error'), btn = document.getElementById('reset-btn');
  const email = document.getElementById('reset-email').value.trim().toLowerCase();
  err.style.display = 'none';
  btn.disabled = true;
  try {
    if (resetStep === 1) {
      await requestCode('sifre', email);
      resetStep = 2;
      document.getElementById('reset-step2').style.display = 'block';
      btn.textContent = 'Şifreyi Değiştir';
      showToast('Hesap kayıtlıysa e-postana kod gönderdik.');
    } else {
      const r = await fetch('/api/auth/sifre', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, code: document.getElementById('reset-code').value.trim(), pw64: toB64(document.getElementById('reset-pw').value) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Şifre değiştirilemedi.');
      closeReset();
      showToast('Şifren değişti. Şimdi giriş yapabilirsin.');
      openAuthModal('login');
    }
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  btn.disabled = false;
};
const _switchTab = window.switchAuthTab;
window.switchAuthTab = function(tab) { _switchTab(tab); const f = document.getElementById('forgot-link'); if (f) f.style.display = tab === 'login' ? 'block' : 'none'; };

// ---- Gönderi / hikaye oluşturma ----
let createMode = 'post';
window.setCreateMode = function(m) {
  createMode = m;
  document.querySelectorAll('#create-mode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  document.getElementById('create-title').textContent = m === 'story' ? 'Yeni Hikaye (24 saat sonra silinir)' : 'Yeni Gönderi Paylaş';
  document.getElementById('new-post-caption').parentElement.style.display = m === 'story' ? 'none' : '';
};
const _hcp = window.handleCreatePostClick;
window.handleCreatePostClick = function() { _hcp(); setCreateMode('post'); };
window.openStoryCreate = function() { if (!currentUser) return openAuthModal('login'); _hcp(); setCreateMode('story'); };

window.submitNewPost = async function() {
  if (!currentUser) return openAuthModal('login');
  const progress = document.getElementById('upload-progress-box'), status = document.getElementById('upload-status-text'), btn = document.getElementById('submit-new-post');
  if (!selectedFile) return showToast('Lütfen bir fotoğraf veya video seçin.');
  const isVid = selectedFile.type.startsWith('video/');
  if (isVid && selectedFile.size > 100 * 1048576) return showToast('Video en fazla 100 MB olabilir.');
  if (!isVid && selectedFile.size > 25 * 1048576) return showToast('Fotoğraf en fazla 25 MB olabilir.');
  btn.disabled = true; progress.style.display = 'flex'; status.textContent = 'Yükleniyor...';
  try {
    let url;
    try { url = await uploadToCloudinary(selectedFile); } catch { throw new Error('Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene.'); }
    status.textContent = 'Kaydediliyor...';
    const story = createMode === 'story';
    const r = await fetch(story ? '/api/hikaye' : '/api/posts', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ media_url: url, media_type: isVid ? 'video' : 'image', caption: document.getElementById('new-post-caption').value.trim() }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Kaydedilemedi.');
    if (story) await loadStories(); else { posts.unshift(normalizePost(d.post)); renderPosts(); }
    selectedFile = null;
    document.getElementById('media-file-input').value = '';
    document.getElementById('file-label-text').textContent = 'Dosya seç';
    document.getElementById('new-post-caption').value = '';
    closeCreateModal();
    showToast(story ? 'Hikayen paylaşıldı, 24 saat görünecek.' : 'Gönderin paylaşıldı!');
  } catch (err) { showToast(err.message); }
  btn.disabled = false; progress.style.display = 'none';
};

// ---- Akış hatası ----
let feedError = false;
function showFeedError() {
  document.querySelectorAll('.feed-error').forEach(e => e.remove());
  if (!feedError) return;
  document.querySelectorAll('.empty-state').forEach(e => { e.style.display = 'none'; });
  const d = document.createElement('div');
  d.className = 'guest-gate feed-error';
  d.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><h3>Gönderiler yüklenemedi</h3><p>Bağlantını kontrol edip tekrar dene.</p><button type="button" class="primary-btn" onclick="loadPostsFromCloud()">Tekrar dene</button>';
  document.getElementById('posts-stream').appendChild(d);
}
async function loadPostsFromCloud() {
  feedError = false;
  try {
    const r = await fetch('/api/posts', { headers: authHeaders() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    posts = Array.isArray(data) ? data.map(normalizePost) : [];
  } catch { posts = []; feedError = true; }
  renderPosts();
  if (!feedError && location.hash && !window.hashDone) {
    window.hashDone = true;
    document.querySelector(`[data-post-id="${CSS.escape(location.hash.slice(1))}"]`)?.scrollIntoView();
  }
}

// ---- Hikayeler ----
let stories = [], svGroups = [], svG = 0, svI = 0, svTimer = null;
const SEEN = 'aratsa_seen_stories';
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')); } catch { return new Set(); } };

async function loadStories() {
  stories = [];
  if (currentUser) {
    try { const r = await fetch('/api/hikaye', { headers: authHeaders() }); if (r.ok) stories = await r.json(); } catch {}
  }
  renderStories();
}
function groupStories() {
  const g = {}, sd = seenSet();
  stories.forEach(s => (g[s.username.toLowerCase()] ||= { user: s.username, items: [], mine: s.mine }).items.push(s));
  return Object.values(g)
    .sort((a, b) => (b.mine - a.mine) || (myFollowing.has(b.user.toLowerCase()) - myFollowing.has(a.user.toLowerCase())) || a.user.localeCompare(b.user))
    .map(x => ({ ...x, allSeen: x.items.every(i => sd.has(i.id)) }));
}
function renderStories() {
  const bar = document.getElementById('stories-bar');
  if (!bar) return;
  bar.style.display = currentUser ? '' : 'none';
  if (!currentUser) return;
  bar.innerHTML = '<button type="button" class="st-bubble" data-add="1"><span class="st-ring add"><i class="fa-solid fa-plus"></i></span><span class="st-name">Hikaye ekle</span></button>'
    + groupStories().map((g, i) => `<button type="button" class="st-bubble" data-g="${i}"><span class="st-ring${g.allSeen ? ' seen' : ''}"><i class="fa-solid fa-user"></i></span><span class="st-name">${g.mine ? 'Hikayen' : escapeHtml(g.user)}</span></button>`).join('');
  bar.onclick = e => { const b = e.target.closest('.st-bubble'); if (b) b.dataset.add ? openStoryCreate() : openStory(Number(b.dataset.g)); };
}
window.openStory = function(g) { svGroups = groupStories(); svG = g; svI = 0; document.getElementById('story-viewer').style.display = 'flex'; document.body.classList.add('no-scroll'); showStory(); };
function showStory() {
  clearTimeout(svTimer);
  const grp = svGroups[svG], s = grp?.items[svI];
  if (!s) return closeStory();
  const sd = seenSet(); sd.add(s.id);
  try { localStorage.setItem(SEEN, JSON.stringify([...sd].slice(-300))); } catch {}
  document.getElementById('sv-user').textContent = '@' + grp.user;
  document.getElementById('sv-user').onclick = () => { closeStory(); openProfile(grp.user); };
  document.getElementById('sv-time').textContent = timeAgo(s.created_at);
  const act = document.getElementById('sv-action');
  act.textContent = s.mine ? 'Sil' : 'Şikayet Et'; act.dataset.id = s.id; act.dataset.mine = s.mine ? '1' : '';
  document.getElementById('sv-bars').innerHTML = grp.items.map((_, k) => `<span class="sv-bar ${k < svI ? 'done' : k === svI ? 'run' : ''}"><i></i></span>`).join('');
  const bar = () => (ms) => document.querySelector('.sv-bar.run')?.style.setProperty('--d', ms + 'ms');
  const box = document.getElementById('sv-media');
  box.innerHTML = '';
  const isV = s.media_type === 'video';
  const el = document.createElement(isV ? 'video' : 'img');
  el.className = 'sv-el'; el.src = s.media_url; el.onerror = () => storyStep(1);
  if (isV) {
    el.playsInline = true; el.onended = () => storyStep(1);
    el.onloadedmetadata = () => bar()(el.duration * 1000);
    el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
  } else {
    el.alt = 'Hikaye';
    el.onload = () => { bar()(5000); svTimer = setTimeout(() => storyStep(1), 5000); };
  }
  box.appendChild(el);
}
window.storyStep = function(d) {
  svI += d;
  if (svI < 0) { if (svG === 0) svI = 0; else { svG--; svI = svGroups[svG].items.length - 1; } }
  else if (svI >= svGroups[svG].items.length) { svG++; svI = 0; }
  if (svG >= svGroups.length) return closeStory();
  showStory();
};
window.closeStory = function() {
  clearTimeout(svTimer);
  document.getElementById('sv-media').innerHTML = '';
  document.getElementById('story-viewer').style.display = 'none';
  document.body.classList.remove('no-scroll');
  renderStories();
};
window.storyAction = async function() {
  const a = document.getElementById('sv-action'), id = a.dataset.id;
  if (a.dataset.mine) {
    if (!confirm('Bu hikayeyi silmek istediğine emin misin?')) return;
    try { await fetch('/api/hikaye?id=' + encodeURIComponent(id), { method: 'DELETE', headers: authHeaders() }); stories = stories.filter(s => s.id !== id); showToast('Hikaye silindi.'); } catch { showToast('Silinemedi.'); }
    closeStory();
  } else {
    closeStory();
    reportTarget = { tur: 'hikaye', id };
    document.getElementById('report-modal').style.display = 'flex';
  }
};

// ---- Şikayet (D1 > sikayetler) ----
let reportTarget = null;
window.submitReport = async function(reason) {
  const t = reportTarget || { tur: 'gonderi', id: reportPostId };
  try {
    const r = await fetch('/api/sikayet', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ tur: t.tur, id: t.id, sebep: reason }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Şikayet gönderilemedi.');
    showToast('Şikayetin alındı, teşekkürler.');
  } catch (err) { showToast(err.message); }
  reportTarget = null;
  closeReportModal();
};

// ---- Profil (yalnızca giriş yapmış kullanıcılar) ----
window.closeProfile = () => { document.getElementById('profile-modal').style.display = 'none'; };
window.handleProfileNavClick = () => openProfile(me());
window.openProfile = async function(name) {
  if (!currentUser) return openAuthModal('login');
  const body = document.getElementById('prof-body');
  document.getElementById('prof-title').textContent = '@' + String(name).toLowerCase();
  body.innerHTML = '<p class="dm-note">Yükleniyor...</p>';
  document.getElementById('profile-modal').style.display = 'flex';
  try {
    const r = await fetch('/api/profil?u=' + encodeURIComponent(String(name).toLowerCase()), { headers: authHeaders() });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { closeProfile(); return handleSignOut(true); }
    if (!r.ok) throw new Error(d.error || 'Profil yüklenemedi.');
    renderProfile(d);
  } catch (err) { body.innerHTML = `<p class="dm-note">${escapeHtml(err.message)}</p>`; }
};
function renderProfile(d) {
  document.getElementById('prof-title').textContent = '@' + d.username;
  const body = document.getElementById('prof-body');
  body.innerHTML = `<div class="prof-head"><span class="prof-avatar"><i class="fa-solid fa-user"></i></span><div class="prof-stats"><b>${d.posts.length}</b><small>gönderi</small></div><div class="prof-stats"><b id="prof-followers">${d.followers}</b><small>takipçi</small></div><div class="prof-stats"><b>${d.following}</b><small>takip</small></div></div><p class="prof-bio" id="prof-bio"></p><div class="prof-actions" id="prof-actions"></div><div class="prof-grid" id="prof-grid"></div>`;
  const bio = document.getElementById('prof-bio'), act = document.getElementById('prof-actions');
  bio.textContent = d.bio || (d.mine ? 'Henüz biyografi eklemedin.' : 'Biyografi yok.');
  const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = txt; b.onclick = fn; act.appendChild(b); return b; };
  if (d.mine) {
    mk('Biyografiyi düzenle', 'mini-btn', () => {
      bio.outerHTML = `<textarea class="bio-edit" id="bio-edit" maxlength="150" rows="3"></textarea>`;
      const ta = document.getElementById('bio-edit'); ta.value = d.bio; ta.focus();
      act.innerHTML = '';
      mk('Kaydet', 'mini-btn', async () => {
        try {
          const r = await fetch('/api/profil', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ bio: ta.value }) });
          if (!r.ok) throw new Error();
          showToast('Biyografin güncellendi.'); openProfile(d.username);
        } catch { showToast('Kaydedilemedi.'); }
      });
    });
    mk('Çıkış yap', 'mini-btn danger-btn', () => { closeProfile(); handleSignOut(); });
  } else {
    const lower = d.username.toLowerCase();
    const f = mk('', 'mini-btn follow-btn', async () => {
      const before = myFollowing.has(lower);
      await toggleFollow(lower);
      const cnt = document.getElementById('prof-followers');
      if (cnt && before !== myFollowing.has(lower)) cnt.textContent = Number(cnt.textContent) + (myFollowing.has(lower) ? 1 : -1);
    });
    f.dataset.user = lower;
    mk('Mesaj', 'mini-btn', () => { closeProfile(); openDM(lower); });
    mk('Şikayet', 'mini-btn', () => { reportTarget = { tur: 'kullanici', id: lower }; closeProfile(); document.getElementById('report-modal').style.display = 'flex'; });
  }
  const grid = document.getElementById('prof-grid');
  grid.innerHTML = d.posts.map(p => `<button type="button" class="prof-cell" data-id="${escapeHtml(p.id)}">${p.media_type === 'video' ? `<video src="${escapeHtml(p.media_url)}" muted preload="metadata"></video>` : `<img loading="lazy" src="${escapeHtml(p.media_url)}" alt="">`}</button>`).join('');
  grid.onclick = e => { const c = e.target.closest('.prof-cell'); if (!c) return; closeProfile(); document.querySelector(`[data-post-id="${CSS.escape(c.dataset.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  refreshFollow();
}
document.getElementById('posts-stream')?.addEventListener('click', e => {
  const a = e.target.closest('.post-author');
  const u = a?.closest('.post-card')?.dataset.user;
  if (u) openProfile(u);
});
