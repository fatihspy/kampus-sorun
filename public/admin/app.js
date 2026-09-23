const API_BASE = window.location.origin + '/api';

const STATUS_LABELS = { yeni: 'Yeni', inceleniyor: 'İnceleniyor', cozuldu: 'Çözüldü' };
const CATEGORY_LABELS = { temizlik: 'Temizlik', teknik: 'Teknik/Bakım', guvenlik: 'Güvenlik', diger: 'Diğer' };

let currentReports = [];
let activeReportId = null;
let activeReport = null;
let currentView = 'list';
let map = null;
let markers = [];

// --- Yardımcılar ---
function getToken() { return localStorage.getItem('adminToken'); }
function getUser() { return JSON.parse(localStorage.getItem('adminUser') || 'null'); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

// Content-Type belirtmeden (multipart/form-data için) istek atan yardımcı
async function apiUpload(path, formData, method = 'POST') {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

// --- Ekran geçişleri ---
function showPanel() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('panelScreen').classList.remove('hidden');
  document.getElementById('userName').textContent = getUser()?.name || '';
  loadReports();
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('panelScreen').classList.add('hidden');
}

// --- Giriş ---
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data.user.role === 'ogrenci') {
      errorEl.textContent = 'Bu panele sadece personel ve yöneticiler girebilir.';
      return;
    }

    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminUser', JSON.stringify(data.user));
    showPanel();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  showLogin();
});

// --- Rapor listeleme ---
async function loadReports() {
  const status = document.getElementById('statusFilter').value;
  const category = document.getElementById('categoryFilter').value;

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (category) params.append('category', category);

  try {
    currentReports = await apiFetch(`/reports?${params.toString()}`);
    render();
  } catch (err) {
    alert('Raporlar yüklenemedi: ' + err.message);
  }
}

function render() {
  document.getElementById('reportCount').textContent = `${currentReports.length} rapor`;
  const grid = document.getElementById('reportGrid');
  const emptyMsg = document.getElementById('emptyMessage');
  const mapEl = document.getElementById('mapContainer');
  const statsEl = document.getElementById('statsContainer');

  statsEl.classList.add('hidden');

  if (currentView === 'map') {
    grid.classList.add('hidden');
    emptyMsg.classList.add('hidden');
    renderMap();
  } else {
    mapEl.classList.add('hidden');
    renderReports();
  }
}

function renderReports() {
  const grid = document.getElementById('reportGrid');
  const emptyMsg = document.getElementById('emptyMessage');

  grid.classList.remove('hidden');
  grid.innerHTML = '';

  if (currentReports.length === 0) {
    emptyMsg.classList.remove('hidden');
    return;
  }
  emptyMsg.classList.add('hidden');

  currentReports.forEach((report) => {
    const card = document.createElement('div');
    card.className = 'report-card';
    card.innerHTML = `
      <img src="${window.location.origin}${report.photoUrl}" alt="${report.category}" />
      <div class="card-body">
        <div class="card-top">
          <span class="category">${CATEGORY_LABELS[report.category] || report.category}</span>
          <span class="status-pill status-${report.status}">${STATUS_LABELS[report.status]}</span>
        </div>
        <div class="desc">${report.description ? escapeHtml(report.description).slice(0, 60) : 'Açıklama yok'}</div>
        <div class="date">${new Date(report.createdAt).toLocaleString('tr-TR')} · 👍 ${report.upvotes?.length ?? 0}</div>
      </div>
    `;
    card.addEventListener('click', () => openModal(report));
    grid.appendChild(card);
  });
}

// Ege Üniversitesi Bornova kampüsü yaklaşık merkezi
const CAMPUS_CENTER = [38.4606, 27.2144];

function renderMap() {
  const mapEl = document.getElementById('mapContainer');
  mapEl.classList.remove('hidden');

  if (!map) {
    map = L.map(mapEl).setView(CAMPUS_CENTER, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap katkıda bulunanlar'
    }).addTo(map);
  }

  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  currentReports.forEach((report) => {
    const [lng, lat] = report.location.coordinates;
    const marker = L.marker([lat, lng]).addTo(map);

    const popupEl = document.createElement('div');
    popupEl.className = 'map-popup';
    popupEl.innerHTML = `
      <img src="${window.location.origin}${report.photoUrl}" alt="${report.category}" />
      <div class="map-popup-title">${CATEGORY_LABELS[report.category] || report.category}</div>
      <span class="status-pill status-${report.status}">${STATUS_LABELS[report.status]}</span>
      <button>Detayı Gör</button>
    `;
    popupEl.querySelector('button').addEventListener('click', () => openModal(report));
    marker.bindPopup(popupEl);

    markers.push(marker);
  });

  setTimeout(() => map.invalidateSize(), 50);
}

// --- İstatistikler ---
async function loadStats() {
  const statsEl = document.getElementById('statsContainer');
  statsEl.innerHTML = '<p class="empty">Yükleniyor...</p>';
  try {
    const stats = await apiFetch('/reports/stats');
    renderStats(stats);
  } catch (err) {
    statsEl.innerHTML = `<p class="empty">İstatistikler yüklenemedi: ${escapeHtml(err.message)}</p>`;
  }
}

function renderStats(stats) {
  const statsEl = document.getElementById('statsContainer');
  const maxCategory = Math.max(1, ...stats.byCategory.map((c) => c.count));
  const maxBuilding = Math.max(1, ...stats.byBuilding.map((b) => b.count));

  const statusMap = Object.fromEntries(stats.byStatus.map((s) => [s._id, s.count]));

  statsEl.innerHTML = `
    <div class="stat-card">
      <h3>Toplam Rapor</h3>
      <div class="stat-big-number">${stats.total}</div>
    </div>

    <div class="stat-card">
      <h3>Duruma Göre</h3>
      <div class="stat-bar-row">
        <div class="stat-bar-label"><span>🔴 Yeni</span><span>${statusMap.yeni || 0}</span></div>
      </div>
      <div class="stat-bar-row">
        <div class="stat-bar-label"><span>🟠 İnceleniyor</span><span>${statusMap.inceleniyor || 0}</span></div>
      </div>
      <div class="stat-bar-row">
        <div class="stat-bar-label"><span>🟢 Çözüldü</span><span>${statusMap.cozuldu || 0}</span></div>
      </div>
    </div>

    <div class="stat-card">
      <h3>Kategoriye Göre</h3>
      ${stats.byCategory.map((c) => `
        <div class="stat-bar-row">
          <div class="stat-bar-label"><span>${CATEGORY_LABELS[c._id] || c._id}</span><span>${c.count}</span></div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(c.count / maxCategory) * 100}%"></div></div>
        </div>
      `).join('')}
    </div>

    <div class="stat-card">
      <h3>En Çok Rapor Alan Binalar</h3>
      ${stats.byBuilding.length > 0 ? stats.byBuilding.map((b) => `
        <div class="stat-bar-row">
          <div class="stat-bar-label"><span>${escapeHtml(b._id)}</span><span>${b.count}</span></div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(b.count / maxBuilding) * 100}%"></div></div>
        </div>
      `).join('') : '<p class="empty" style="padding:10px 0;">Henüz bina bilgisi girilmemiş.</p>'}
    </div>

    <div class="stat-card">
      <h3>Ortalama Çözüm Süresi</h3>
      <div class="stat-big-number">${stats.avgResolutionHours !== null ? stats.avgResolutionHours + ' sa' : '-'}</div>
    </div>
  `;
}

// --- Detay modal ---
async function openModal(report) {
  activeReportId = report._id;
  activeReport = report;

  document.getElementById('modalPhoto').src = window.location.origin + report.photoUrl;
  document.getElementById('modalCategory').textContent = CATEGORY_LABELS[report.category] || report.category;
  document.getElementById('modalVoteCount').textContent = `👍 ${report.upvotes?.length ?? report.upvoteCount ?? 0} onay`;
  document.getElementById('modalDesc').textContent = report.description || 'Açıklama girilmemiş.';
  document.getElementById('modalBuilding').textContent = report.building || '-';
  document.getElementById('modalReporter').textContent = report.reporter?.name
    ? `${report.reporter.name} (${report.reporter.email})`
    : 'Bilinmiyor';
  document.getElementById('modalDate').textContent = new Date(report.createdAt).toLocaleString('tr-TR');
  document.getElementById('updateMessage').classList.add('hidden');

  const anonBadge = document.getElementById('modalAnonymousBadge');
  anonBadge.classList.toggle('hidden', !report.isAnonymous);

  const [lng, lat] = report.location.coordinates;
  document.getElementById('modalMapLink').href = `https://www.google.com/maps?q=${lat},${lng}`;

  renderResolveSection(report);
  renderComments(report.comments || []);

  document.getElementById('detailModal').classList.remove('hidden');
}

function renderResolveSection(report) {
  const statusSelect = document.getElementById('statusSelect');
  const updateBtn = document.getElementById('updateStatusBtn');
  const resolvedView = document.getElementById('resolvedPhotoView');
  const uploadView = document.getElementById('resolveUploadView');

  if (report.status === 'cozuldu') {
    statusSelect.classList.add('hidden');
    updateBtn.classList.add('hidden');
    uploadView.classList.add('hidden');
    resolvedView.classList.remove('hidden');

    const img = document.getElementById('resolvedPhotoImg');
    if (report.resolvedPhotoUrl) {
      img.src = window.location.origin + report.resolvedPhotoUrl;
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
    }
  } else {
    statusSelect.classList.remove('hidden');
    updateBtn.classList.remove('hidden');
    uploadView.classList.remove('hidden');
    resolvedView.classList.add('hidden');
    statusSelect.value = report.status;
  }
}

function renderComments(comments) {
  const listEl = document.getElementById('commentsList');
  document.getElementById('newCommentText').value = '';

  if (!comments || comments.length === 0) {
    listEl.innerHTML = '<p class="no-comments">Henüz yorum yok.</p>';
    return;
  }

  listEl.innerHTML = comments.map((c) => `
    <div class="comment-item">
      <div class="comment-head">
        <span>${escapeHtml(c.author?.name || 'Kullanıcı')}${c.author?.role && c.author.role !== 'ogrenci' ? ' · Personel' : ''}</span>
        <span class="comment-date">${new Date(c.createdAt).toLocaleDateString('tr-TR')}</span>
      </div>
      <div class="comment-body">${escapeHtml(c.text)}</div>
    </div>
  `).join('');
}

// Aktif raporu backend'den tazeleyip modalı günceller (yorum/çözüm sonrası)
async function refreshActiveReport() {
  try {
    const fresh = await apiFetch(`/reports/${activeReportId}`);
    activeReport = fresh;
    document.getElementById('modalVoteCount').textContent = `👍 ${fresh.upvotes?.length ?? 0} onay`;
    renderResolveSection(fresh);
    renderComments(fresh.comments || []);
  } catch (err) {
    console.log('Rapor tazelenemedi:', err.message);
  }
}

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('detailModal').classList.add('hidden');
  activeReportId = null;
  activeReport = null;
});

document.getElementById('updateStatusBtn').addEventListener('click', async () => {
  const newStatus = document.getElementById('statusSelect').value;
  try {
    await apiFetch(`/reports/${activeReportId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    document.getElementById('updateMessage').classList.remove('hidden');
    await loadReports();
  } catch (err) {
    alert('Güncellenemedi: ' + err.message);
  }
});

document.getElementById('resolveBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('resolvePhotoInput');
  const file = fileInput.files[0];
  if (!file) {
    alert('Lütfen bir çözüm fotoğrafı seçin.');
    return;
  }

  const formData = new FormData();
  formData.append('photo', file);

  try {
    await apiUpload(`/reports/${activeReportId}/resolve-photo`, formData);
    fileInput.value = '';
    await refreshActiveReport();
    await loadReports();
  } catch (err) {
    alert('Çözüldü olarak işaretlenemedi: ' + err.message);
  }
});

document.getElementById('addCommentBtn').addEventListener('click', async () => {
  const textEl = document.getElementById('newCommentText');
  const text = textEl.value.trim();
  if (!text) return;

  try {
    await apiFetch(`/reports/${activeReportId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    await refreshActiveReport();
  } catch (err) {
    alert('Yorum eklenemedi: ' + err.message);
  }
});

// --- Filtreler ---
document.getElementById('statusFilter').addEventListener('change', loadReports);
document.getElementById('categoryFilter').addEventListener('change', loadReports);
document.getElementById('refreshBtn').addEventListener('click', () => {
  if (currentView === 'stats') loadStats();
  else loadReports();
});

// --- Görünüm sekmeleri ---
function setActiveViewButton(id) {
  ['listViewBtn', 'mapViewBtn', 'statsViewBtn'].forEach((btnId) => {
    document.getElementById(btnId).classList.toggle('active', btnId === id);
  });
}

document.getElementById('listViewBtn').addEventListener('click', () => {
  currentView = 'list';
  setActiveViewButton('listViewBtn');
  document.getElementById('statsContainer').classList.add('hidden');
  try {
    render();
  } catch (err) {
    alert('Görünüm değiştirilemedi: ' + err.message);
  }
});

document.getElementById('mapViewBtn').addEventListener('click', () => {
  currentView = 'map';
  setActiveViewButton('mapViewBtn');
  document.getElementById('statsContainer').classList.add('hidden');
  try {
    render();
  } catch (err) {
    alert('Harita yüklenemedi: ' + err.message);
  }
});

document.getElementById('statsViewBtn').addEventListener('click', () => {
  currentView = 'stats';
  setActiveViewButton('statsViewBtn');
  document.getElementById('reportGrid').classList.add('hidden');
  document.getElementById('emptyMessage').classList.add('hidden');
  document.getElementById('mapContainer').classList.add('hidden');
  document.getElementById('statsContainer').classList.remove('hidden');
  loadStats();
});

// --- Başlangıç ---
if (getToken() && getUser()) {
  showPanel();
} else {
  showLogin();
}
