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
    const email = currentUser.email || 'kullanici@aratsa.com';
    const username = currentUser.username || email.split('@')[0];

    if (profileText) profileText.textContent = username;

    if (sidebarSection) {
      sidebarSection.innerHTML = `
        <div class="logged-in-badge">
          <span class="logged-in-email"><i class="fa-solid fa-circle-user"></i> ${escapeHtml(username)}</span>
          <button type="button" class="logout-btn" onclick="handleSignOut()">Çıkış Yap</button>
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
          <span class="user-status">Misafir Kullanıcı</span>
          <span class="user-sub">Gönderi paylaşmak için oturum açın</span>
        </div>
        <div class="account-btn-group">
          <button type="button" class="auth-action-link" onclick="openAuthModal('login')">Giriş Yap</button>
          <span class="divider">•</span>
          <button type="button" class="auth-action-link highlight" onclick="openAuthModal('register')">Kayıt Ol</button>
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
    const verificationCode = Math.floor(100 + Math.random() * 99).toString();

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

    currentUser = result.user;
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

    currentUser = result.user;
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

window.handleSignOut = function() {
  localStorage.removeItem('aratsa_current_user');
  currentUser = null;
  updateUIForUser();
  renderPosts();
  showToast('Oturum kapatıldı.');
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
      finalMediaUrl = URL.createObjectURL(selectedFile);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPost)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Gönderi buluta kaydedilemedi.');
    }

    // Başarılı olursa listeye ekle ve ekranı yenile
    posts.unshift(newPost);
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
  setTimeout(() => {
    alert("Bu site henüz geliştirme aşamasındadır. Lütfen test amaçlı kullanın. Site yakın bir zamanda güncellenecektir. Güncellemeden sonra siteyi kullanabilirsiniz. Güncelleme sonrası verileriniz silinebilir. Lütfen önemli verilerinizi saklamayın. Teşekkürler.");
  }, 500);
}

function renderPosts() {
  const container = document.getElementById('posts-stream');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;

  container.querySelectorAll('.post-card').forEach(el => el.remove());

  if (posts.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  posts.forEach(post => {
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
          <span class="time">• Bulut</span>
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
        <button type="button" class="action-btn comment-btn" onclick="focusComment('${post.id}')"><i class="fa-regular fa-comment"></i></button>
        <button type="button" class="action-btn share-btn" onclick="sharePost()"><i class="fa-regular fa-paper-plane"></i></button>
      </div>
      <button type="button" class="action-btn save-btn"><i class="fa-regular fa-bookmark"></i></button>
    </div>

    <div class="post-likes"><span class="likes-count">${post.likes_count || 0}</span> beğenme</div>

    <div class="post-caption">
      <span class="username">${escapeHtml(post.username || 'kullanici')}</span>
      <span class="caption-text">${escapeHtml(post.caption || '')}</span>
    </div>

    <div class="post-comments" id="comments-list-${post.id}"></div>

    <form class="comment-form" onsubmit="event.preventDefault(); submitComment('${post.id}', this);">
      <input type="text" placeholder="Yorum ekle..." class="comment-input" id="comment-input-${post.id}">
      <button type="submit" class="comment-submit">Paylaş</button>
    </form>
  `;

  setupCardInteractions(card, post, isVideo);
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
}

window.focusComment = function(postId) {
  document.getElementById(`comment-input-${postId}`)?.focus();
};

window.sharePost = function() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    showToast('Bağlantı kopyalandı!');
  } else {
    showToast('Bağlantı kopyalandı!');
  }
};

window.submitComment = function(postId, form) {
  if (!requireAuth('Yorum yapmak')) return;

  const input = form.querySelector('.comment-input');
  const text = input.value.trim();
  if (!text) return;

  const commentsList = document.getElementById(`comments-list-${postId}`);
  if (commentsList) {
    const item = document.createElement('div');
    item.className = 'comment-item';
    const username = currentUser.username || currentUser.email.split('@')[0];
    item.innerHTML = `
      <span class="username">${escapeHtml(username)}</span>
      <span class="comment-text">${escapeHtml(text)}</span>
    `;
    commentsList.appendChild(item);
    input.value = '';
  }
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
    if (currentUser) return;
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

window.handleNavClick = function(section) {
  if (section === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.handleProfileNavClick = function() {
  if (!currentUser) openAuthModal('login');
  else showToast(`Oturum: ${currentUser.username || currentUser.email}`);
};

window.showToast = function(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
};

window.openPostOptions = function(postId) {
  currentActivePostId = postId;
  document.getElementById('post-options-modal').style.display = 'flex';
};

window.closePostOptionsModal = function() {
  document.getElementById('post-options-modal').style.display = 'none';
  currentActivePostId = null;
};

window.copyCurrentPostLink = function() {
  if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
  showToast('Bağlantı kopyalandı!');
  closePostOptionsModal();
};

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
