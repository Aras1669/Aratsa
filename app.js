const CONFIG = {
  CLOUDINARY_CLOUD_NAME: 'yrvpqiet', 
  CLOUDINARY_UPLOAD_PRESET: 'r3t5vuoi',
  GUEST_POST_LIMIT: 2
};

let currentUser = null;
let currentAuthTab = 'login';
let selectedFile = null;
let posts = [];
let pendingRegistration = null;

document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
  loadPostsFromCloud();
});

function checkUserSession() {
  try {
    const saved = localStorage.getItem('aratsa_current_user');
    if (saved) currentUser = JSON.parse(saved);
  } catch (e) { currentUser = null; }
  updateUIForUser();
}

function updateUIForUser() {
  const profileText = document.getElementById('nav-profile-text');
  const sidebarSection = document.getElementById('sidebar-user-section');
  const sidebarAccountBox = document.getElementById('sidebar-account-box');

  if (currentUser) {
    const username = currentUser.username || currentUser.email.split('@')[0];
    if (profileText) profileText.textContent = username;
    if (sidebarSection) {
      sidebarSection.innerHTML = `<div class="logged-in-badge"><span><i class="fa-solid fa-circle-user"></i> ${escapeHtml(username)}</span><button type="button" class="logout-btn" onclick="handleSignOut()">Çıkış</button></div>`;
    }
    if (sidebarAccountBox) {
      sidebarAccountBox.innerHTML = `<div class="account-avatar"><i class="fa-solid fa-user-check" style="color: #0095f6;"></i></div><div class="account-meta"><span class="user-status">${escapeHtml(username)}</span><span class="user-sub">${escapeHtml(currentUser.email)}</span></div><button type="button" class="logout-btn" onclick="handleSignOut()">Çıkış</button>`;
    }
  } else {
    if (profileText) profileText.textContent = 'Giriş Yap';
    if (sidebarSection) sidebarSection.innerHTML = '';
    if (sidebarAccountBox) {
      sidebarAccountBox.innerHTML = `<div class="account-avatar"><i class="fa-solid fa-user"></i></div><div class="account-meta"><span class="user-status">Misafir Kullanıcı</span><span class="user-sub">Oturum açın</span></div><div class="account-btn-group"><button type="button" class="auth-action-link" onclick="openAuthModal('login')">Giriş Yap</button><span class="divider">•</span><button type="button" class="auth-action-link highlight" onclick="openAuthModal('register')">Kayıt Ol</button></div>`;
    }
  }
}

window.openAuthModal = function(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('auth-modal').style.display = 'flex';
};

window.closeAuthModal = function() {
  document.getElementById('auth-modal').style.display = 'none';
  document.getElementById('auth-error').style.display = 'none';
  cancelVerification();
};

window.switchAuthTab = function(tab) {
  currentAuthTab = tab;
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const title = document.getElementById('auth-modal-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const usernameGroup = document.getElementById('group-username');
  const legalNoticeBox = document.getElementById('legal-notice-box');

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

window.handleAuthSubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username')?.value.trim() || email.split('@')[0];
  const errorElem = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (errorElem) errorElem.style.display = 'none';

  if (currentAuthTab === 'register') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    pendingRegistration = { email, password, username, code };
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('verify-step-box').style.display = 'block';
    document.getElementById('verify-email-desc').textContent = `${email} adresine gönderilen 6 haneli kod:`;
    alert(`📧 Doğrulama Kodunuz: ${code}`);
    showToast(`Kod: ${code}`);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Giriş yapılıyor...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Giriş başarısız');

    currentUser = result.user;
    localStorage.setItem('aratsa_current_user', JSON.stringify(currentUser));
    closeAuthModal();
    document.getElementById('auth-form').reset();
    updateUIForUser();
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

window.confirmVerificationCode = async function() {
  const enteredCode = document.getElementById('verify-code-input')?.value.trim();
  const verifyError = document.getElementById('verify-error');
  if (enteredCode !== pendingRegistration.code) {
    verifyError.textContent = 'Hatalı kod!';
    verifyError.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('functions/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingRegistration)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Kayıt başarısız');

    currentUser = result.user;
    localStorage.setItem('aratsa_current_user', JSON.stringify(currentUser));
    cancelVerification();
    closeAuthModal();
    updateUIForUser();
    renderPosts();
    showToast('Hesabınız başarıyla açıldı!');
  } catch (err) {
    verifyError.textContent = err.message;
    verifyError.style.display = 'block';
  }
};

window.cancelVerification = function() {
  pendingRegistration = null;
  document.getElementById('auth-form').style.display = 'block';
  document.getElementById('verify-step-box').style.display = 'none';
};

window.handleSignOut = function() {
  localStorage.removeItem('aratsa_current_user');
  currentUser = null;
  updateUIForUser();
  renderPosts();
  showToast('Oturum kapatıldı.');
};

window.handleCreatePostClick = function() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('create-modal').style.display = 'flex';
};

window.closeCreateModal = function() {
  document.getElementById('create-modal').style.display = 'none';
  selectedFile = null;
  document.getElementById('upload-progress-box').style.display = 'none';
};

window.handleFileSelect = function(input) {
  if (input.files && input.files[0]) selectedFile = input.files[0];
};

window.submitNewPost = async function() {
  if (!currentUser) return;
  const urlInput = document.getElementById('new-media-url')?.value.trim() || '';
  const caption = document.getElementById('new-post-caption')?.value.trim() || '';
  const progressBox = document.getElementById('upload-progress-box');
  const statusText = document.getElementById('upload-status-text');

  if (!selectedFile && !urlInput) {
    alert('Dosya seçin veya URL girin!');
    return;
  }

  let finalMediaUrl = urlInput;
  if (selectedFile) {
    progressBox.style.display = 'flex';
    statusText.textContent = "Cloudinary'ye yükleniyor...";
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    finalMediaUrl = data.secure_url;
  }

  statusText.textContent = "Bulut veritabanına kaydediliyor...";
  const newPost = {
    id: 'post_' + Date.now(),
    created_at: new Date().toISOString(),
    user_id: currentUser.id,
    username: currentUser.username,
    media_url: finalMediaUrl,
    media_type: selectedFile && selectedFile.type.startsWith('video/') ? 'video' : 'image',
    caption: caption,
    likes_count: 0,
    liked_by: []
  };

  await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newPost)
  });

  posts.unshift(newPost);
  renderPosts();
  closeCreateModal();
  showToast('Paylaşıldı!');
};

async function loadPostsFromCloud() {
  try {
    const res = await fetch('/api/posts');
    posts = res.ok ? await res.json() : [];
  } catch (e) { posts = []; }
  renderPosts();
}

function renderPosts() {
  const container = document.getElementById('posts-stream');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;
  container.querySelectorAll('.post-card').forEach(el => el.remove());
  if (posts.length === 0) { if (emptyState) emptyState.style.display = 'flex'; return; }
  if (emptyState) emptyState.style.display = 'none';
  posts.forEach(post => container.appendChild(createPostElement(post)));
}

function createPostElement(post) {
  const card = document.createElement('article');
  card.className = 'post-card';
  card.innerHTML = `
    <header class="post-header"><div class="post-author"><div class="author-avatar-ring"><i class="fa-solid fa-user"></i></div><span class="username">${escapeHtml(post.username)}</span></div></header>
    <div class="post-media-container"><img src="${escapeHtml(post.media_url)}" class="post-media"></div>
    <div class="post-caption"><span class="username">${escapeHtml(post.username)}</span><span class="caption-text">${escapeHtml(post.caption)}</span></div>
  `;
  return card;
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

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
