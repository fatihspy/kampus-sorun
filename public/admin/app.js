const API_BASE = window.location.origin + '/api';

const STATUS_LABELS = { yeni: 'Yeni', inceleniyor: 'İnceleniyor', cozuldu: 'Çözüldü' };

let currentReports = [];
let activeReportId = null;
let currentView = 'list';
let map = null;
let markers = [];

// --- Yardımcılar ---
function getToken() { return localStorage.getItem('adminToken'); }
function getUser() { return JSON.parse(localStorage.getItem('adminUser') || 'null'); }

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
          <span class="category">${report.category}</span>
          <span class="status-pill status-${report.status}">${STATUS_LABELS[report.status]}</span>
        </div>
        <div class="desc">${report.description ? escapeHtml(report.description).slice(0, 60) : 'Açıklama yok'}</div>
        <div class="date">${new Date(report.createdAt).toLocaleString('tr-TR')}</div>
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

  // Önceki işaretçileri temizle
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  currentReports.forEach((report) => {
    const [lng, lat] = report.location.coordinates;
    const marker = L.marker([lat, lng]).addTo(map);

    const popupEl = document.createElement('div');
    popupEl.className = 'map-popup';
    popupEl.innerHTML = `
      <img src="${window.location.origin}${report.photoUrl}" alt="${report.category}" />
      <div class="map-popup-title">${report.category}</div>
      <span class="status-pill status-${report.status}">${STATUS_LABELS[report.status]}</span>
      <button>Detayı Gör</button>
    `;
    popupEl.querySelector('button').addEventListener('click', () => openModal(report));
    marker.bindPopup(popupEl);

    markers.push(marker);
  });

  // Harita sekmesine geçince boyut hesaplaması bozulmasın diye
  setTimeout(() => map.invalidateSize(), 50);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Detay modal ---
function openModal(report) {
  activeReportId = report._id;
  document.getElementById('modalPhoto').src = window.location.origin + report.photoUrl;
  document.getElementById('modalCategory').textContent = report.category;
  document.getElementById('modalDesc').textContent = report.description || 'Açıklama girilmemiş.';
  document.getElementById('modalBuilding').textContent = report.building || '-';
  document.getElementById('modalReporter').textContent = report.reporter?.name
    ? `${report.reporter.name} (${report.reporter.email})`
    : 'Bilinmiyor';
  document.getElementById('modalDate').textContent = new Date(report.createdAt).toLocaleString('tr-TR');
  document.getElementById('statusSelect').value = report.status;
  document.getElementById('updateMessage').classList.add('hidden');

  const [lng, lat] = report.location.coordinates;
  document.getElementById('modalMapLink').href = `https://www.google.com/maps?q=${lat},${lng}`;

  document.getElementById('detailModal').classList.remove('hidden');
}

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('detailModal').classList.add('hidden');
  activeReportId = null;
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

// --- Filtreler ---
document.getElementById('statusFilter').addEventListener('change', loadReports);
document.getElementById('categoryFilter').addEventListener('change', loadReports);
document.getElementById('refreshBtn').addEventListener('click', loadReports);

// --- Görünüm sekmeleri ---
document.getElementById('listViewBtn').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('listViewBtn').classList.add('active');
  document.getElementById('mapViewBtn').classList.remove('active');
  try {
    render();
  } catch (err) {
    alert('Görünüm değiştirilemedi: ' + err.message);
  }
});

document.getElementById('mapViewBtn').addEventListener('click', () => {
  currentView = 'map';
  document.getElementById('mapViewBtn').classList.add('active');
  document.getElementById('listViewBtn').classList.remove('active');
  try {
    render();
  } catch (err) {
    alert('Harita yüklenemedi: ' + err.message);
  }
});

// --- Başlangıç ---
if (getToken() && getUser()) {
  showPanel();
} else {
  showLogin();
}
