/* ============================================================
   APP.JS — Home Visit System
   - แผนที่ฟรี: Leaflet + OpenStreetMap
   - ฐานข้อมูล: Google Sheets via Apps Script
   ============================================================ */

// ==================== CONFIG ====================
// ★ ใส่ URL ของ Google Apps Script Web App ตรงนี้เพียงครั้งเดียว
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwG4ySGdHa3bg5fdQA8JSsdDVra9F-2lz8yy6I1zu3s-fLX-xZARVE3WqRdCzOEUwX5hA/exec'
};

// ==================== STATE ====================
let selectedPin  = null; // { lat, lng }
let map          = null;
let marker       = null;
let pinCurrentValue = '';
let allRecords   = [];
const TEACHER_PASSWORD = '313326';

// ==================== TOAST ====================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ==================== MAP (LEAFLET) ====================
document.addEventListener('DOMContentLoaded', () => {
  initMap();
});

function initMap() {
  try {
    map = L.map('map', {
      center: [13.7563, 100.5018], // กรุงเทพฯ
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: true,
      tap: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    map.on('click', (e) => placeMarker(e.latlng.lat, e.latlng.lng));

  } catch (err) {
    console.error('Map init error:', err);
    showToast('โหลดแผนที่ไม่สำเร็จ — กรอกที่อยู่ในช่องด้านล่างได้เลย', 'error');
  }
}

function placeMarker(lat, lng) {
  if (!map) return;
  if (marker) map.removeLayer(marker);

  const icon = L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" style="display:block">
      <filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/></filter>
      <path d="M18 0C8.6 0 1 7.6 1 17c0 12 17 27 17 27S35 29 35 17C35 7.6 27.4 0 18 0z"
            fill="#4f46e5" stroke="white" stroke-width="2" filter="url(#s)"/>
      <circle cx="18" cy="17" r="6" fill="white"/>
      <path d="M15 17l2 2 4-4" stroke="#4f46e5" stroke-width="2" fill="none"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 44]
  });

  marker = L.marker([lat, lng], { icon }).addTo(map);
  selectedPin = { lat, lng };

  const pinInfo = document.getElementById('pinInfo');
  const pinCoords = document.getElementById('pinCoords');
  const mapLink = document.getElementById('mapLink');
  pinInfo.style.display = 'flex';
  pinCoords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;

  document.getElementById('mapContainer').classList.add('has-pin');
  document.getElementById('clearPin').style.display = 'flex';
}

document.getElementById('useMyLocation')?.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์ไม่รองรับ GPS', 'error');
    return;
  }
  const btn = document.getElementById('useMyLocation');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'กำลังหา...';

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const { latitude: lat, longitude: lng } = coords;
      if (map) { map.setView([lat, lng], 16); }
      placeMarker(lat, lng);
      btn.disabled = false;
      btn.querySelector('span').textContent = 'ตำแหน่งฉัน';
    },
    (err) => {
      showToast('ไม่สามารถดึงตำแหน่งได้: ' + err.message, 'error');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'ตำแหน่งฉัน';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

document.getElementById('clearPin')?.addEventListener('click', () => {
  if (marker && map) { map.removeLayer(marker); marker = null; }
  selectedPin = null;
  document.getElementById('pinInfo').style.display = 'none';
  document.getElementById('clearPin').style.display = 'none';
  document.getElementById('mapContainer').classList.remove('has-pin');
});

// ==================== FORM SUBMIT ====================
document.getElementById('visitForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const record = {
    id:            Date.now().toString(),
    timestamp:     new Date().toISOString(),
    parentName:    document.getElementById('parentName').value.trim(),
    parentPhone:   document.getElementById('parentPhone').value.trim(),
    studentName:   document.getElementById('studentName').value.trim(),
    studentNumber: document.getElementById('studentNumber').value,
    studentLevel:  document.getElementById('studentLevel').value,
    studentRoom:   document.getElementById('studentRoom').value,
    note:          document.getElementById('visitNote').value.trim(),
    address:       document.getElementById('addressText').value.trim(),
    pin:           selectedPin ? { ...selectedPin } : null,
  };

  setSubmitLoading(true);

  try {
    await saveToSheets(record);
    showSuccessModal(record);
    resetForm();
  } catch (err) {
    console.error('Save error:', err);
    showToast('❌ บันทึกไม่สำเร็จ กรุณาลองใหม่', 'error');
  } finally {
    setSubmitLoading(false);
  }
});

function setSubmitLoading(loading) {
  const btn = document.getElementById('submitBtn');
  document.querySelector('.btn-submit-text').style.display = loading ? 'none' : 'flex';
  document.querySelector('.btn-submit-loading').style.display = loading ? 'flex' : 'none';
  btn.disabled = loading;
}

function validateForm() {
  const required = ['parentName','parentPhone','studentName','studentNumber','studentLevel','studentRoom','addressText'];
  let valid = true;
  required.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('error');
    if (!el.value.trim()) { el.classList.add('error'); valid = false; }
  });
  if (!valid) {
    const first = document.querySelector('.error');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'error');
  }
  return valid;
}

function resetForm() {
  document.getElementById('visitForm').reset();
  if (marker && map) { map.removeLayer(marker); marker = null; }
  selectedPin = null;
  document.getElementById('pinInfo').style.display = 'none';
  document.getElementById('clearPin').style.display = 'none';
  document.getElementById('mapContainer').classList.remove('has-pin');
}

// ==================== GOOGLE SHEETS API ====================
async function saveToSheets(record) {
  if (CONFIG.APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    // ถ้ายังไม่ได้ตั้ง URL → บันทึก localStorage แทน (โหมดทดสอบ)
    const local = JSON.parse(localStorage.getItem('homeVisitRecords') || '[]');
    local.unshift(record);
    localStorage.setItem('homeVisitRecords', JSON.stringify(local));
    showToast('⚠️ บันทึกแบบ LOCAL (ยังไม่มี Apps Script URL)', 'info');
    return;
  }

  const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    // ใช้ text/plain เพื่อหลีกเลี่ยง CORS preflight
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'save', record })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadFromSheets() {
  if (CONFIG.APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    // โหมดทดสอบ: โหลดจาก localStorage
    return JSON.parse(localStorage.getItem('homeVisitRecords') || '[]');
  }

  const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getAll`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data;
}

async function deleteFromSheets(id) {
  if (CONFIG.APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    const local = JSON.parse(localStorage.getItem('homeVisitRecords') || '[]');
    localStorage.setItem('homeVisitRecords', JSON.stringify(local.filter(r => r.id !== id)));
    return;
  }

  await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=delete&id=${encodeURIComponent(id)}`);
}

// ==================== SUCCESS MODAL ====================
function showSuccessModal(record) {
  const detail = document.getElementById('successDetail');
  detail.innerHTML = `
    <div class="detail-row"><span class="detail-label">นักเรียน</span><span class="detail-value">${record.studentName}</span></div>
    <div class="detail-row"><span class="detail-label">ชั้น/ห้อง</span><span class="detail-value">${record.studentLevel}/${record.studentRoom} เลขที่ ${record.studentNumber}</span></div>
    <div class="detail-row"><span class="detail-label">ผู้ปกครอง</span><span class="detail-value">${record.parentName} (${record.parentPhone})</span></div>
    <div class="detail-row"><span class="detail-label">ที่อยู่</span><span class="detail-value">${record.address}</span></div>
    ${record.pin ? `<div class="detail-row"><span class="detail-label">พิกัด</span><span class="detail-value">${record.pin.lat.toFixed(5)}, ${record.pin.lng.toFixed(5)}</span></div>` : ''}
  `;
  document.getElementById('successModal').classList.add('active');
}

document.getElementById('closeSuccess')?.addEventListener('click', () => {
  document.getElementById('successModal').classList.remove('active');
});

document.getElementById('successModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

// ==================== TEACHER SHIELD ====================
document.getElementById('teacherShieldBtn')?.addEventListener('click', () => {
  pinCurrentValue = '';
  updatePinDots();
  document.getElementById('pinError').textContent = '';
  document.getElementById('teacherLoginModal').classList.add('active');
});

document.getElementById('closeTeacherLogin')?.addEventListener('click', () => {
  document.getElementById('teacherLoginModal').classList.remove('active');
});

document.getElementById('teacherLoginModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
});

// PIN keypad
document.querySelectorAll('.pin-key').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.val;
    if (val === 'clear') {
      pinCurrentValue = pinCurrentValue.slice(0, -1);
      updatePinDots();
      document.getElementById('pinError').textContent = '';
    } else if (val === 'ok') {
      checkPin();
    } else if (pinCurrentValue.length < 6) {
      pinCurrentValue += val;
      updatePinDots();
      if (pinCurrentValue.length === 6) setTimeout(checkPin, 200);
    }
  });
});

// Keyboard PIN support (desktop)
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('teacherLoginModal');
  if (!modal.classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') {
    if (pinCurrentValue.length < 6) {
      pinCurrentValue += e.key;
      updatePinDots();
      if (pinCurrentValue.length === 6) setTimeout(checkPin, 200);
    }
  } else if (e.key === 'Backspace') {
    pinCurrentValue = pinCurrentValue.slice(0, -1);
    updatePinDots();
    document.getElementById('pinError').textContent = '';
  } else if (e.key === 'Enter') {
    checkPin();
  }
});

function updatePinDots() {
  for (let i = 0; i < 6; i++) {
    const dot = document.getElementById('dot' + i);
    if (!dot) return;
    dot.classList.toggle('filled', i < pinCurrentValue.length);
    dot.classList.remove('error-dot');
  }
}

function checkPin() {
  if (pinCurrentValue === TEACHER_PASSWORD) {
    document.getElementById('teacherLoginModal').classList.remove('active');
    openDashboard();
  } else {
    for (let i = 0; i < 6; i++) {
      const dot = document.getElementById('dot' + i);
      dot.classList.remove('filled');
      dot.classList.add('error-dot');
    }
    document.getElementById('pinError').textContent = '❌ รหัสไม่ถูกต้อง';
    setTimeout(() => { pinCurrentValue = ''; updatePinDots(); }, 700);
  }
}

// ==================== TEACHER DASHBOARD ====================
async function openDashboard() {
  document.getElementById('teacherDashboard').classList.add('active');
  await loadDashboard();
}

async function loadDashboard() {
  const container = document.getElementById('recordsContainer');
  container.innerHTML = `
    <div class="loading-state">
      <svg class="spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <p>กำลังโหลดข้อมูลจาก Google Sheets...</p>
    </div>`;

  try {
    allRecords = await loadFromSheets();
    renderRecords(allRecords);
  } catch (err) {
    console.error('Load error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <small style="font-size:0.78rem;color:var(--text-muted)">ตรวจสอบ Apps Script URL และการตั้งค่า</small>
      </div>`;
    showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
  }
}

document.getElementById('closeDashboard')?.addEventListener('click', () => {
  document.getElementById('teacherDashboard').classList.remove('active');
});

document.getElementById('refreshBtn')?.addEventListener('click', loadDashboard);

function renderRecords(records) {
  document.getElementById('statTotal').textContent   = records.length;
  document.getElementById('statWithPin').textContent = records.filter(r => r.pin).length;
  document.getElementById('statNoPin').textContent   = records.filter(r => !r.pin).length;

  const container = document.getElementById('recordsContainer');

  if (!records.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>ยังไม่มีข้อมูลการลงทะเบียน</p>
      </div>`;
    return;
  }

  container.innerHTML = records.map(r => {
    const dt = new Date(r.timestamp);
    const dateStr = isNaN(dt) ? '—' : dt.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = isNaN(dt) ? '' : dt.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const lat = r.pin?.lat ?? r.lat;
    const lng = r.pin?.lng ?? r.lng;
    const hasPin = lat && lng;

    return `
      <div class="record-card" data-id="${r.id}">
        <div class="record-badge">${r.studentLevel || '?'}/${r.studentRoom || '?'}</div>
        <div class="record-body">
          <div class="record-header">
            <span class="record-name">${r.studentName || '—'}</span>
            <span class="record-class">เลขที่ ${r.studentNumber || '—'}</span>
            ${hasPin ? `<span class="has-pin-badge">📍 มีพิกัด</span>` : `<span class="no-pin-badge">📋 ไม่มีพิกัด</span>`}
          </div>
          <div class="record-info">
            <span>👤 ${r.parentName || '—'}</span>
            <span>📞 ${r.parentPhone || '—'}</span>
          </div>
          <div class="record-address">🏠 ${r.address || '—'}</div>
          ${r.note ? `<div class="record-note">📝 ${r.note}</div>` : ''}
          <div class="record-time">🕐 ${dateStr} ${timeStr ? `เวลา ${timeStr} น.` : ''}</div>
        </div>
        <div class="record-actions">
          ${hasPin ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener" class="btn-open-map">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Maps
          </a>` : ''}
          <button class="btn-delete-record" onclick="handleDelete('${r.id}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            ลบ
          </button>
        </div>
      </div>`;
  }).join('');
}

async function handleDelete(id) {
  if (!confirm('ต้องการลบข้อมูลนี้ใช่ไหม?')) return;
  try {
    await deleteFromSheets(id);
    allRecords = allRecords.filter(r => r.id !== id);
    const search = document.getElementById('searchInput').value;
    const level  = document.getElementById('filterLevel').value;
    renderRecords(getFiltered(search, level));
    showToast('ลบข้อมูลสำเร็จ', 'success');
  } catch (err) {
    showToast('ลบข้อมูลไม่สำเร็จ', 'error');
  }
}

// ==================== SEARCH & FILTER ====================
function getFiltered(search, level) {
  return allRecords.filter(r => {
    const s = (search || '').toLowerCase();
    const matchSearch = !s
      || (r.studentName||'').toLowerCase().includes(s)
      || (r.parentName||'').toLowerCase().includes(s)
      || (r.address||'').toLowerCase().includes(s)
      || (r.studentLevel||'').includes(s)
      || (r.studentRoom||'').includes(s);
    const matchLevel = !level || r.studentLevel === level;
    return matchSearch && matchLevel;
  });
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  renderRecords(getFiltered(e.target.value, document.getElementById('filterLevel').value));
});

document.getElementById('filterLevel')?.addEventListener('change', (e) => {
  renderRecords(getFiltered(document.getElementById('searchInput').value, e.target.value));
});

// ==================== EXPORT CSV ====================
document.getElementById('exportBtn')?.addEventListener('click', () => {
  if (!allRecords.length) { showToast('ไม่มีข้อมูลให้ส่งออก', 'info'); return; }

  const headers = ['ลำดับ','วันที่','เวลา','ชื่อนักเรียน','ชั้น','ห้อง','เลขที่','ชื่อผู้ปกครอง','โทรศัพท์','ที่อยู่','ละติจูด','ลองจิจูด','Google Maps Link','หมายเหตุ'];

  const rows = allRecords.map((r, i) => {
    const dt = new Date(r.timestamp);
    const date = isNaN(dt) ? '' : dt.toLocaleDateString('th-TH');
    const time = isNaN(dt) ? '' : dt.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const lat = r.pin?.lat ?? r.lat ?? '';
    const lng = r.pin?.lng ?? r.lng ?? '';
    const mapsUrl = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
    return [
      i + 1, date, time,
      r.studentName, r.studentLevel, r.studentRoom, r.studentNumber,
      r.parentName, r.parentPhone, r.address,
      lat, lng, mapsUrl, r.note || ''
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `home_visit_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('ส่งออก CSV สำเร็จ ✅', 'success');
});

// ==================== SMOOTH SCROLL ====================
document.getElementById('heroScrollBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-section')?.scrollIntoView({ behavior: 'smooth' });
});

// ==================== REAL-TIME VALIDATION ====================
document.querySelectorAll('input, select, textarea').forEach(el => {
  el.addEventListener('input',  () => el.classList.remove('error'));
  el.addEventListener('change', () => el.classList.remove('error'));
});

// ==================== EXTRA STYLES ====================
const extraStyle = document.createElement('style');
extraStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-8px)}
  40%{transform:translateX(8px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}`;
document.head.appendChild(extraStyle);

console.log('✅ Home Visit System ready (Leaflet + Google Sheets mode)');
