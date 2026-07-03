const state = {
  idToken: '',
  lineProfile: null,
  user: null,
  currentSession: null,
  timelineStartHour: 12,
  users: [],
  sessionMap: new Map(),
  clockTimer: null,
  activeTab: 'home'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  loadingScreen: $('#loadingScreen'),
  loadingText: $('#loadingText'),
  errorScreen: $('#errorScreen'),
  errorText: $('#errorText'),
  app: $('#app'),
  registrationView: $('#registrationView'),
  pendingView: $('#pendingView'),
  mainView: $('#mainView'),
  topNav: $('#topNav'),
  toast: $('#toast')
};

function showOnly(view) {
  [elements.registrationView, elements.pendingView, elements.mainView].forEach((el) => el.classList.add('hidden'));
  view.classList.remove('hidden');
}

function setLoading(text) {
  elements.loadingText.textContent = text;
}

function showError(message) {
  elements.loadingScreen.classList.add('hidden');
  elements.app.classList.add('hidden');
  elements.errorScreen.classList.remove('hidden');
  elements.errorText.textContent = message;
}

function showToast(message, type = 'success') {
  clearTimeout(showToast.timer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', type === 'error');
  elements.toast.classList.remove('hidden');
  showToast.timer = setTimeout(() => elements.toast.classList.add('hidden'), 3200);
}

const bridgeState = {
  ready: false,
  sequence: 0,
  pending: new Map(),
  readyPromise: null,
  resolveReady: null
};

function initializeBridge() {
  const gasUrl = String(window.APP_CONFIG?.gasWebAppUrl || '').replace(/\/$/, '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(gasUrl)) {
    throw new Error('กรุณาตั้งค่า gasWebAppUrl ใน docs/config.js ให้เป็น URL /exec');
  }
  bridgeState.readyPromise = new Promise((resolve) => { bridgeState.resolveReady = resolve; });
  window.addEventListener('message', handleBridgeMessage);
  $('#gasBridge').src = `${gasUrl}?bridge=1`;
}

function handleBridgeMessage(event) {
  const gasOrigin = 'https://script.google.com';
  const googleUserContentOrigin = 'https://script.googleusercontent.com';
  if (![gasOrigin, googleUserContentOrigin].includes(event.origin)) return;
  const message = event.data || {};
  if (message.type === 'kitty-bridge-ready') {
    bridgeState.ready = true;
    bridgeState.resolveReady?.();
    return;
  }
  if (message.type !== 'kitty-api-response' || !message.requestId) return;
  const pending = bridgeState.pending.get(message.requestId);
  if (!pending) return;
  bridgeState.pending.delete(message.requestId);
  clearTimeout(pending.timeout);
  const data = message.response;
  if (!data || !data.ok) {
    const code = data?.error || 'INVALID_RESPONSE';
    const error = new Error(data?.message || errorMessage(code));
    error.code = code;
    pending.reject(error);
    return;
  }
  pending.resolve(data.data);
}

async function api(action, payload = {}) {
  if (!bridgeState.readyPromise) initializeBridge();
  await Promise.race([
    bridgeState.readyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('เชื่อมต่อ Backend ไม่สำเร็จ')), 15000))
  ]);

  return new Promise((resolve, reject) => {
    const requestId = `req-${Date.now()}-${++bridgeState.sequence}`;
    const timeout = setTimeout(() => {
      bridgeState.pending.delete(requestId);
      reject(new Error('Backend ใช้เวลาตอบสนองนานเกินไป'));
    }, 30000);
    bridgeState.pending.set(requestId, { resolve, reject, timeout });
    $('#gasBridge').contentWindow.postMessage({
      type: 'kitty-api-request',
      requestId,
      action,
      idToken: state.idToken,
      payload
    }, '*');
  });
}

function errorMessage(code) {
  const messages = {
    INVALID_TOKEN: 'การเข้าสู่ระบบ LINE หมดอายุ กรุณาเปิด LIFF ใหม่',
    USER_NOT_APPROVED: 'บัญชียังไม่ได้รับการอนุมัติ',
    USER_INACTIVE: 'บัญชีถูกระงับการใช้งาน',
    OPEN_SESSION_EXISTS: 'คุณมีรอบที่กำลังไลฟ์อยู่แล้ว',
    NO_OPEN_SESSION: 'ไม่พบรอบที่กำลังไลฟ์',
    EDIT_WINDOW_EXPIRED: 'แก้ไขได้เฉพาะข้อมูลย้อนหลังไม่เกิน 7 วัน',
    REASON_REQUIRED: 'กรุณาระบุเหตุผล',
    PERMISSION_DENIED: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
    INVALID_TIME_RANGE: 'เวลาจบต้องอยู่หลังเวลาเริ่ม',
    DUPLICATE_SESSION: 'ช่วงเวลานี้ซ้ำกับรอบเดิมของพนักงาน',
    BACKEND_UNAVAILABLE: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้',
    SERVER_ERROR: 'ระบบขัดข้อง กรุณาลองใหม่'
  };
  return messages[code] || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

function todayBangkok() {
  return formatDateKey(new Date());
}

function formatDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getOperationalDate() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hour12: false
  }).format(new Date())) % 24;
  if (hour >= state.timelineStartHour) return todayBangkok();
  const previous = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return formatDateKey(previous);
}

function thaiDate(dateKey, options = {}) {
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: options.short ? 'short' : 'long',
    year: options.year === false ? undefined : 'numeric'
  }).format(date);
}

function thaiDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(iso));
}

function timeOnly(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).format(new Date(iso));
}

function durationText(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} นาที`;
  if (!mins) return `${hours} ชม.`;
  return `${hours} ชม. ${mins} นาที`;
}

function elapsedText(startIso) {
  if (!startIso) return '00:00:00';
  const diff = Math.max(0, Date.now() - new Date(startIso).getTime());
  const seconds = Math.floor(diff / 1000);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function toBangkokInput(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function fromBangkokInput(value) {
  return value ? `${value}:00+07:00` : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function initialize() {
  try {
    setLoading('กำลังโหลดการตั้งค่า...');
    const liffId = String(window.APP_CONFIG?.liffId || '');
    if (!liffId || liffId.includes('YOUR_')) throw new Error('กรุณาตั้งค่า liffId ใน docs/config.js');
    initializeBridge();

    setLoading('กำลังเชื่อมต่อ LINE...');
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    state.idToken = liff.getIDToken();
    if (!state.idToken) throw new Error('LIFF ต้องเปิด scope: openid');
    state.lineProfile = await liff.getProfile().catch(() => null);

    setLoading('กำลังตรวจสอบสิทธิ์...');
    await loadBootstrap();
    bindEvents();

    elements.loadingScreen.classList.add('hidden');
    elements.app.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    showError(error.message || 'ไม่สามารถเริ่มระบบได้');
  }
}

async function loadBootstrap() {
  const data = await api('bootstrap');
  state.user = data.user || null;
  state.currentSession = data.currentSession || null;
  state.timelineStartHour = Number(data.timelineStartHour ?? 12);
  state.users = data.users || [];

  updateProfileUI();

  if (data.status === 'unregistered') {
    showOnly(elements.registrationView);
    $('#registrationName').value = state.lineProfile?.displayName || '';
    return;
  }

  if (data.status === 'pending') {
    showOnly(elements.pendingView);
    $('#pendingName').textContent = state.user?.name || '—';
    return;
  }

  if (data.status === 'rejected') {
    showOnly(elements.pendingView);
    $('#pendingName').textContent = `${state.user?.name || '—'} (ไม่อนุมัติ)`;
    return;
  }

  if (data.status !== 'approved') throw new Error('บัญชีนี้ไม่สามารถใช้งานได้');

  showOnly(elements.mainView);
  renderNavigation();
  renderAttendance(data.todaySummary || {});
  const operationalDate = getOperationalDate();
  $('#homeTimelineDate').value = operationalDate;
  $('#dailyDate').value = operationalDate;
  $('#monthlyMonth').value = operationalDate.slice(0, 7);
  await loadHomeTimeline();
}

function updateProfileUI() {
  const name = state.user?.name || state.lineProfile?.displayName || 'Kitty';
  $('#profileInitial').textContent = name.trim().charAt(0).toUpperCase() || 'K';
  const picture = state.lineProfile?.pictureUrl;
  if (picture) {
    $('#profileImage').src = picture;
    $('#profileImage').style.display = 'block';
    $('#profileInitial').style.display = 'none';
  }

  const roleLabel = { admin: 'Admin', supervisor: 'Supervisor', streamer: 'Live Streamer' }[state.user?.role] || 'รออนุมัติ';
  $('#profileDetails').innerHTML = `
    <div class="profile-row"><span>ชื่อ</span><strong>${escapeHtml(name)}</strong></div>
    <div class="profile-row"><span>สิทธิ์</span><strong>${roleLabel}</strong></div>
    <div class="profile-row"><span>สถานะ</span><strong>${state.user?.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}</strong></div>
  `;
}

function renderNavigation() {
  const role = state.user.role;
  const tabs = [{ id: 'home', label: role === 'streamer' ? 'ลงเวลา' : 'Timeline' }];
  if (['supervisor', 'admin'].includes(role)) {
    tabs.push({ id: 'daily', label: 'รายวัน' }, { id: 'monthly', label: 'รายเดือน' }, { id: 'audit', label: 'Audit Log' });
  }
  if (role === 'admin') tabs.push({ id: 'users', label: 'ผู้ใช้งาน' });

  elements.topNav.innerHTML = tabs.map((tab) => `
    <button class="nav-button ${tab.id === state.activeTab ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>
  `).join('');
}

function renderAttendance(summary) {
  const isStreamer = state.user?.role === 'streamer';
  $('#attendanceCard').classList.toggle('hidden', !isStreamer);
  $('#personalSummary').classList.toggle('hidden', !isStreamer);
  if (!isStreamer) return;
  const isLive = Boolean(state.currentSession);
  $('#todayLabel').textContent = `วันผลงาน ${thaiDate(getOperationalDate(), { short: true })}`;
  $('#attendanceStatus').textContent = isLive ? 'กำลังไลฟ์สด' : 'พร้อมเริ่มไลฟ์';
  $('#liveBadge').textContent = isLive ? 'LIVE' : 'ยังไม่ไลฟ์';
  $('#liveBadge').className = `badge ${isLive ? 'live' : 'neutral'}`;
  $('#attendanceButton').className = `attendance-button ${isLive ? 'stop' : 'start'}`;
  $('#attendanceButtonIcon').textContent = isLive ? '■' : '▶';
  $('#attendanceButtonText').textContent = isLive ? 'จบไลฟ์' : 'เริ่มไลฟ์';
  $('#sessionStartedAt').textContent = isLive
    ? `เริ่มเมื่อ ${thaiDateTime(state.currentSession.startAt)}`
    : 'กดเริ่มไลฟ์เพื่อบันทึกเวลาจริง';
  $('#todaySessions').textContent = summary.sessionCount ?? 0;
  $('#todayDuration').textContent = durationText(summary.completedMinutes ?? 0);

  clearInterval(state.clockTimer);
  const updateClock = () => {
    $('#sessionClock').textContent = isLive ? elapsedText(state.currentSession.startAt) : '00:00:00';
  };
  updateClock();
  if (isLive) state.clockTimer = setInterval(updateClock, 1000);
}

async function handleAttendance() {
  const button = $('#attendanceButton');
  button.disabled = true;
  try {
    if (state.currentSession) {
      if (!window.confirm('ยืนยันจบไลฟ์ตอนนี้?')) return;
      const data = await api('endSession');
      state.currentSession = null;
      renderAttendance(data.todaySummary);
      showToast(`จบไลฟ์แล้ว รวม ${durationText(data.session.durationMinutes)}`);
    } else {
      const data = await api('startSession');
      state.currentSession = data.session;
      renderAttendance(data.todaySummary);
      showToast('เริ่มบันทึกเวลาไลฟ์แล้ว');
    }
    await loadHomeTimeline();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadHomeTimeline() {
  const date = $('#homeTimelineDate').value || getOperationalDate();
  $('#homeTimeline').innerHTML = '<div class="timeline-empty">กำลังโหลด...</div>';
  try {
    const data = await api('getDailyTimeline', { date });
    state.timelineStartHour = Number(data.timelineStartHour ?? state.timelineStartHour);
    renderTimeline($('#homeTimeline'), data);
  } catch (error) {
    $('#homeTimeline').innerHTML = `<div class="timeline-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderTimeline(container, data) {
  const rows = (data.users || []).filter((user) => (user.sessions || []).length > 0);
  if (!rows.length) {
    container.innerHTML = '<div class="timeline-empty">ยังไม่มีรายการไลฟ์ในวันนี้</div>';
    return;
  }

  const windowStart = new Date(`${data.date}T${String(data.timelineStartHour).padStart(2, '0')}:00:00+07:00`).getTime();
  const windowEnd = windowStart + 24 * 60 * 60 * 1000;
  const axis = Array.from({ length: 9 }, (_, index) => {
    const minutes = index * 180;
    const hour = (data.timelineStartHour + index * 3) % 24;
    const nextDay = data.timelineStartHour + index * 3 >= 24 ? '+1' : '';
    return `<span class="timeline-label" style="left:${(minutes / 1440) * 100}%">${String(hour).padStart(2, '0')}:00${nextDay}</span>`;
  }).join('');

  const rowHtml = rows.map((user) => {
    const bars = user.sessions.map((session) => {
      const rawStart = new Date(session.startAt).getTime();
      const rawEnd = session.endAt ? new Date(session.endAt).getTime() : Math.min(Date.now(), windowEnd);
      const start = Math.max(rawStart, windowStart);
      const end = Math.min(rawEnd, windowEnd);
      if (end <= windowStart || start >= windowEnd || end <= start) return '';
      const left = ((start - windowStart) / (windowEnd - windowStart)) * 100;
      const width = ((end - start) / (windowEnd - windowStart)) * 100;
      const label = `${timeOnly(session.startAt)}–${session.endAt ? timeOnly(session.endAt) : 'LIVE'}`;
      return `<div class="timeline-bar ${session.endAt ? '' : 'open'}" style="left:${left}%;width:${width}%" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`;
    }).join('');
    return `<div class="timeline-row"><div class="timeline-name" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</div><div class="timeline-track">${bars}</div></div>`;
  }).join('');

  const detailHtml = rows.map((user) => `
    <article class="timeline-detail-card">
      <strong>${escapeHtml(user.name)}</strong>
      <span>${user.sessions.map((session) => `${timeOnly(session.startAt)}–${session.endAt ? timeOnly(session.endAt) : 'ยังไลฟ์อยู่'}`).join(', ')}</span>
    </article>`).join('');

  container.innerHTML = `
    <p class="tiny">Timeline 24 ชั่วโมง: ${String(data.timelineStartHour).padStart(2, '0')}:00 ถึง ${String(data.timelineStartHour).padStart(2, '0')}:00 ของวันถัดไป</p>
    <div class="timeline-chart"><div class="timeline-axis">${axis}</div>${rowHtml}</div>
    <div class="timeline-details">${detailHtml}</div>`;
}

async function switchTab(tab) {
  state.activeTab = tab;
  renderNavigation();
  $$('.tab-page').forEach((page) => page.classList.add('hidden'));
  $(`#${tab}Page`).classList.remove('hidden');

  if (tab === 'home') await loadHomeTimeline();
  if (tab === 'daily') await loadDailyReport();
  if (tab === 'monthly') await loadMonthlyReport();
  if (tab === 'users') await loadUsers();
  if (tab === 'audit') await loadAudit();
}

async function loadDailyReport() {
  const date = $('#dailyDate').value || getOperationalDate();
  $('#dailyReport').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  try {
    const data = await api('getDailyReport', { date });
    state.users = data.users || state.users;
    state.sessionMap.clear();
    data.people.forEach((person) => person.sessions.forEach((session) => state.sessionMap.set(session.sessionId, { ...session, userName: person.name, lineUserId: person.lineUserId })));

    $('#dailyMetrics').innerHTML = [
      ['ผู้ไลฟ์', `${data.summary.activePeople} คน`],
      ['จำนวนรอบ', `${data.summary.sessionCount} รอบ`],
      ['ชั่วโมงที่จบแล้ว', durationText(data.summary.completedMinutes)],
      ['ยังไลฟ์อยู่', `${data.summary.openSessions} คน`]
    ].map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');

    $('#dailyReport').innerHTML = data.people.map((person) => {
      const sessions = person.sessions.length
        ? person.sessions.map((session) => `
          <div class="session-item">
            <div>
              <strong>${timeOnly(session.startAt)}–${session.endAt ? timeOnly(session.endAt) : 'ยังไลฟ์อยู่'}</strong>
              <div class="muted">${session.endAt ? durationText(session.durationMinutes) : `เริ่ม ${thaiDateTime(session.startAt)}`}</div>
            </div>
            <div class="session-actions">
              <button class="btn small secondary" data-edit-session="${session.sessionId}">แก้ไข</button>
              <button class="btn small danger" data-delete-session="${session.sessionId}">ลบ</button>
            </div>
          </div>`).join('')
        : '<p>ไม่มีรายการไลฟ์</p>';
      const badge = person.openSessions > 0
        ? '<span class="badge live">กำลังไลฟ์</span>'
        : person.sessionCount > 0
          ? '<span class="badge done">จบแล้ว</span>'
          : '<span class="badge neutral">ไม่มีรายการ</span>';
      return `<article class="report-card">
        <div class="report-card-header">
          <div><h3>${escapeHtml(person.name)}</h3><p>${person.sessionCount} รอบ · ${durationText(person.completedMinutes)}</p></div>
          ${badge}
        </div>
        ${sessions}
      </article>`;
    }).join('');
  } catch (error) {
    $('#dailyReport').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadMonthlyReport() {
  const month = $('#monthlyMonth').value || todayBangkok().slice(0, 7);
  $('#monthlyTableBody').innerHTML = '<tr><td colspan="6">กำลังโหลด...</td></tr>';
  try {
    const data = await api('getMonthlyReport', { month });
    $('#monthlyMetrics').innerHTML = [
      ['ชั่วโมงรวมทีม', durationText(data.summary.completedMinutes)],
      ['จำนวนรอบ', `${data.summary.sessionCount} รอบ`],
      ['ผู้ไลฟ์', `${data.summary.activePeople} คน`],
      ['รายการค้าง', `${data.summary.openSessions} รอบ`]
    ].map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');

    $('#monthlyTableBody').innerHTML = data.people.length ? data.people.map((person) => `
      <tr>
        <td><strong>${escapeHtml(person.name)}</strong></td>
        <td>${person.liveDays}</td>
        <td>${person.sessionCount}</td>
        <td>${durationText(person.completedMinutes)}</td>
        <td>${durationText(person.averageMinutesPerLiveDay)}</td>
        <td>${durationText(person.maxMinutesPerDay)}</td>
      </tr>`).join('') : '<tr><td colspan="6">ยังไม่มีข้อมูลในเดือนนี้</td></tr>';
  } catch (error) {
    $('#monthlyTableBody').innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadUsers() {
  $('#pendingUsers').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  $('#allUsers').innerHTML = '';
  try {
    const data = await api('getUsers');
    state.users = data.users;
    const pending = data.users.filter((user) => user.status === 'pending');
    const approved = data.users.filter((user) => user.status !== 'pending');

    $('#pendingUsers').innerHTML = pending.length ? pending.map((user) => `
      <article class="report-card" data-user-card="${user.lineUserId}">
        <div class="report-card-header">
          <div><h3>${escapeHtml(user.name)}</h3><p>สมัคร ${thaiDateTime(user.createdAt)}</p></div>
          <span class="badge pending">รออนุมัติ</span>
        </div>
        <div class="inline-actions" style="margin-top:12px">
          <select data-role-select="${user.lineUserId}">
            <option value="streamer">Live Streamer</option>
            <option value="supervisor">Supervisor</option>
          </select>
          <button class="btn primary" data-approve-user="${user.lineUserId}">อนุมัติ</button>
          <button class="btn danger" data-reject-user="${user.lineUserId}">ไม่อนุมัติ</button>
        </div>
      </article>`).join('') : '<div class="empty-state">ไม่มีคำขอที่รออนุมัติ</div>';

    $('#allUsers').innerHTML = approved.length ? approved.map((user) => `
      <article class="report-card">
        <div class="report-card-header">
          <div><h3>${escapeHtml(user.name)}</h3><p>${roleText(user.role)} · ${user.active ? 'ใช้งานอยู่' : 'ระงับใช้งาน'}</p></div>
          <button class="btn small ${user.active ? 'danger' : 'primary'}" data-toggle-user="${user.lineUserId}" data-active="${user.active}">${user.active ? 'ระงับ' : 'เปิดใช้งาน'}</button>
        </div>
      </article>`).join('') : '<div class="empty-state">ยังไม่มีผู้ใช้งาน</div>';
  } catch (error) {
    $('#pendingUsers').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function roleText(role) {
  return { admin: 'Admin', supervisor: 'Supervisor', streamer: 'Live Streamer' }[role] || role;
}

async function loadAudit() {
  $('#auditList').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  try {
    const data = await api('getAuditLogs', { limit: 100 });
    $('#auditList').innerHTML = data.logs.length ? data.logs.map((log) => `
      <article class="report-card">
        <div class="report-card-header">
          <div><h3>${auditActionText(log.action)}</h3><p>${escapeHtml(log.actorName)} · ${thaiDateTime(log.timestamp)}</p></div>
          <span class="badge ${log.action === 'DELETE' ? 'live' : 'neutral'}">${escapeHtml(log.entityId)}</span>
        </div>
        <p><strong>เหตุผล:</strong> ${escapeHtml(log.reason || '—')}</p>
        ${log.targetName ? `<p><strong>พนักงาน:</strong> ${escapeHtml(log.targetName)}</p>` : ''}
      </article>`).join('') : '<div class="empty-state">ยังไม่มีประวัติการแก้ไข</div>';
  } catch (error) {
    $('#auditList').innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function auditActionText(action) {
  return { CREATE: 'เพิ่มรอบย้อนหลัง', UPDATE: 'แก้ไขรอบไลฟ์', DELETE: 'ลบรอบไลฟ์', APPROVE_USER: 'อนุมัติผู้ใช้', REJECT_USER: 'ไม่อนุมัติผู้ใช้', TOGGLE_USER: 'เปลี่ยนสถานะผู้ใช้' }[action] || action;
}

function populateSessionUsers(selectedId = '') {
  const select = $('#sessionUser');
  select.innerHTML = state.users
    .filter((user) => user.status === 'approved' && user.active && user.role === 'streamer')
    .map((user) => `<option value="${user.lineUserId}" ${user.lineUserId === selectedId ? 'selected' : ''}>${escapeHtml(user.name)}</option>`)
    .join('');
}

function openAddSession() {
  const date = $('#dailyDate').value || getOperationalDate();
  $('#sessionDialogTitle').textContent = 'เพิ่มรอบย้อนหลัง';
  $('#sessionMode').value = 'add';
  $('#sessionId').value = '';
  populateSessionUsers();
  $('#sessionWorkDate').value = date;
  $('#sessionStart').value = `${date}T20:00`;
  const nextDate = new Date(`${date}T12:00:00+07:00`);
  nextDate.setDate(nextDate.getDate() + 1);
  $('#sessionEnd').value = `${formatDateKey(nextDate)}T02:00`;
  $('#sessionReason').value = '';
  $('#sessionUser').disabled = false;
  $('#sessionDialog').showModal();
}

function openEditSession(sessionId) {
  const session = state.sessionMap.get(sessionId);
  if (!session) return;
  $('#sessionDialogTitle').textContent = 'แก้ไขเวลาไลฟ์';
  $('#sessionMode').value = 'edit';
  $('#sessionId').value = sessionId;
  populateSessionUsers(session.lineUserId);
  $('#sessionUser').value = session.lineUserId;
  $('#sessionUser').disabled = true;
  $('#sessionWorkDate').value = session.workDate;
  $('#sessionStart').value = toBangkokInput(session.startAt);
  $('#sessionEnd').value = toBangkokInput(session.endAt);
  $('#sessionReason').value = '';
  $('#sessionDialog').showModal();
}

async function saveSession(event) {
  event.preventDefault();
  const mode = $('#sessionMode').value;
  const payload = {
    sessionId: $('#sessionId').value || undefined,
    lineUserId: $('#sessionUser').value,
    workDate: $('#sessionWorkDate').value,
    startAt: fromBangkokInput($('#sessionStart').value),
    endAt: fromBangkokInput($('#sessionEnd').value),
    reason: $('#sessionReason').value.trim()
  };
  const button = $('#saveSessionButton');
  button.disabled = true;
  try {
    await api(mode === 'add' ? 'addSession' : 'updateSession', payload);
    $('#sessionDialog').close();
    showToast(mode === 'add' ? 'เพิ่มรอบย้อนหลังแล้ว' : 'แก้ไขเวลาแล้ว');
    await loadDailyReport();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function openDeleteSession(sessionId) {
  $('#deleteSessionId').value = sessionId;
  $('#deleteReason').value = '';
  $('#deleteDialog').showModal();
}

async function deleteSession(event) {
  event.preventDefault();
  try {
    await api('deleteSession', {
      sessionId: $('#deleteSessionId').value,
      reason: $('#deleteReason').value.trim()
    });
    $('#deleteDialog').close();
    showToast('ลบรอบที่บันทึกผิดแล้ว');
    await loadDailyReport();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function register(event) {
  event.preventDefault();
  const name = $('#registrationName').value.trim();
  if (!name) return;
  try {
    await api('register', { name });
    showToast('ส่งคำขอแล้ว');
    await loadBootstrap();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function approveUser(lineUserId, approve) {
  const role = $(`[data-role-select="${lineUserId}"]`)?.value || 'streamer';
  try {
    await api(approve ? 'approveUser' : 'rejectUser', { lineUserId, role });
    showToast(approve ? 'อนุมัติผู้ใช้แล้ว' : 'ไม่อนุมัติคำขอแล้ว');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function toggleUser(lineUserId, active) {
  try {
    await api('setUserActive', { lineUserId, active: !active });
    showToast(active ? 'ระงับผู้ใช้แล้ว' : 'เปิดใช้งานผู้ใช้แล้ว');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindEvents() {
  $('#registrationForm').addEventListener('submit', register);
  $('#refreshApprovalButton').addEventListener('click', loadBootstrap);
  $('#attendanceButton').addEventListener('click', handleAttendance);
  $('#homeTimelineDate').addEventListener('change', loadHomeTimeline);
  $('#dailyDate').addEventListener('change', loadDailyReport);
  $('#monthlyMonth').addEventListener('change', loadMonthlyReport);
  $('#addSessionButton').addEventListener('click', openAddSession);
  $('#sessionForm').addEventListener('submit', saveSession);
  $('#deleteForm').addEventListener('submit', deleteSession);
  $('#refreshUsersButton').addEventListener('click', loadUsers);
  $('#refreshAuditButton').addEventListener('click', loadAudit);
  $('#profileButton').addEventListener('click', () => $('#profileDialog').showModal());
  $('#closeLiffButton').addEventListener('click', () => liff.isInClient() ? liff.closeWindow() : $('#profileDialog').close());

  document.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) return switchTab(tab);

    const closeId = event.target.closest('[data-close-dialog]')?.dataset.closeDialog;
    if (closeId) return $(`#${closeId}`).close();

    const editId = event.target.closest('[data-edit-session]')?.dataset.editSession;
    if (editId) return openEditSession(editId);

    const deleteId = event.target.closest('[data-delete-session]')?.dataset.deleteSession;
    if (deleteId) return openDeleteSession(deleteId);

    const approveId = event.target.closest('[data-approve-user]')?.dataset.approveUser;
    if (approveId) return approveUser(approveId, true);

    const rejectId = event.target.closest('[data-reject-user]')?.dataset.rejectUser;
    if (rejectId) return approveUser(rejectId, false);

    const toggleButton = event.target.closest('[data-toggle-user]');
    if (toggleButton) return toggleUser(toggleButton.dataset.toggleUser, toggleButton.dataset.active === 'true');
  });
}

initialize();
