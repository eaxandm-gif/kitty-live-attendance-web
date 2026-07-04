const state = {
  idToken: '',
  profile: null,
  me: null,
  activeSession: null,
  currentTab: 'time',
  selectedDate: new Date(),
  selectedMonth: new Date(),
  cache: {}
};

const $app = document.getElementById('app');

function fmtDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtMonth(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('th-TH', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Bangkok' }).format(new Date(value));
}
function fmtDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short', hour12:false, timeZone:'Asia/Bangkok' }).format(new Date(value));
}
function fmtDuration(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return '—';
  const h = Math.floor(Number(minutes) / 60);
  const m = Number(minutes) % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
}
function showLoading(text='กำลังโหลด...') {
  $app.innerHTML = `<section class="center-card"><div class="spinner"></div><h1>Kitty Live</h1><p>${escapeHtml(text)}</p></section>`;
}
function showError(message, detail='') {
  $app.innerHTML = `<section class="center-card"><div class="icon-alert">!</div><h1>ไม่สามารถเปิดระบบได้</h1><p>${escapeHtml(message)}</p>${detail ? `<p class="small">${escapeHtml(detail)}</p>` : ''}<button class="btn" onclick="location.reload()">ลองใหม่</button></section>`;
}
function assertConfig() {
  const c = window.APP_CONFIG || {};
  if (!c.liffId || c.liffId.includes('YOUR_') || !c.supabaseUrl || c.supabaseUrl.includes('YOUR_') || !c.supabaseAnonKey || c.supabaseAnonKey.includes('YOUR_')) {
    throw new Error('กรุณาตั้งค่า public/config.js ให้ครบ');
  }
}
async function api(action, payload={}) {
  const c = window.APP_CONFIG;
  const url = `${c.supabaseUrl.replace(/\/$/,'')}${c.apiFunctionPath || '/functions/v1/api'}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${c.supabaseAnonKey}`,
      'apikey': c.supabaseAnonKey
    },
    body: JSON.stringify({ action, idToken: state.idToken, payload })
  });
  let data;
  try { data = await res.json(); } catch (_) { data = { ok:false, message:'API response ไม่ใช่ JSON' }; }
  if (!res.ok || !data.ok) {
    const err = new Error(data.message || `API error ${res.status}`);
    err.code = data.error;
    err.data = data;
    throw err;
  }
  return data.data;
}

async function init() {
  try {
    assertConfig();
    showLoading('กำลังเชื่อมต่อ LINE...');
    await liff.init({ liffId: window.APP_CONFIG.liffId });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return;
    }
    state.idToken = liff.getIDToken();
    state.profile = await liff.getProfile();
    await bootstrap();
  } catch (error) {
    console.error(error);
    showError(error.message || 'เปิดระบบไม่สำเร็จ');
  }
}

async function bootstrap() {
  showLoading('กำลังโหลดข้อมูล...');
  const data = await api('bootstrap');
  state.me = data.user;
  state.activeSession = data.activeSession || null;
  if (!state.me) return renderRegister();
  if (state.me.status === 'pending') return renderPending();
  if (state.me.status === 'disabled') return showError('บัญชีนี้ถูกปิดใช้งาน', 'กรุณาติดต่อ Admin');
  renderApp();
}

function layout(content) {
  const me = state.me;
  const isSupervisor = ['admin','supervisor'].includes(me.role);
  const isAdmin = me.role === 'admin';
  const tabs = [
    ['time','ลงเวลา'], ['timeline','Timeline'],
    ...(isSupervisor ? [['daily','รายวัน'], ['monthly','รายเดือน']] : []),
    ...(isAdmin ? [['users','ผู้ใช้'], ['audit','Audit']] : [])
  ];
  $app.innerHTML = `
    <header class="header">
      <div><h1>Kitty Live</h1><div class="sub">${escapeHtml(me.display_name)} · ${escapeHtml(me.role)}</div></div>
      <button class="btn ghost" onclick="refreshCurrent()">รีเฟรช</button>
    </header>
    ${content}
    <nav class="tabs"><div class="tab-wrap">${tabs.map(([id,label]) => `<button class="tab ${state.currentTab===id?'active':''}" onclick="switchTab('${id}')">${label}</button>`).join('')}</div></nav>
  `;
}
function switchTab(tab) { state.currentTab = tab; renderApp(); }
function refreshCurrent() { renderApp(true); }

function renderRegister() {
  const defaultName = state.profile?.displayName || '';
  $app.innerHTML = `
    <section class="center-card">
      <h1>ลงทะเบียนเข้าใช้งาน</h1>
      <p>กรอกชื่อของคุณเพื่อรอ Admin อนุมัติ</p>
      <div class="card" style="width:100%;max-width:420px;text-align:left">
        <label class="label">ชื่อพนักงาน</label>
        <input id="displayName" class="input" value="${escapeHtml(defaultName)}" placeholder="เช่น น้อง A" />
        <button class="btn" style="width:100%;margin-top:12px" onclick="registerUser()">ส่งคำขอเข้าใช้งาน</button>
      </div>
    </section>`;
}
async function registerUser() {
  const displayName = document.getElementById('displayName').value.trim();
  if (!displayName) return alert('กรุณากรอกชื่อ');
  try { showLoading('กำลังส่งคำขอ...'); await api('register', { displayName }); await bootstrap(); }
  catch(e) { showError(e.message); }
}
function renderPending() {
  $app.innerHTML = `<section class="center-card"><div class="icon-alert">!</div><h1>รอ Admin อนุมัติ</h1><p>ส่งคำขอเรียบร้อยแล้ว กรุณารอการอนุมัติ</p><button class="btn" onclick="bootstrap()">ตรวจสอบอีกครั้ง</button></section>`;
}

async function renderApp(force=false) {
  try {
    if (state.currentTab === 'time') return await renderTime(force);
    if (state.currentTab === 'timeline') return await renderTimeline(force);
    if (state.currentTab === 'daily') return await renderDaily(force);
    if (state.currentTab === 'monthly') return await renderMonthly(force);
    if (state.currentTab === 'users') return await renderUsers(force);
    if (state.currentTab === 'audit') return await renderAudit(force);
  } catch (e) { console.error(e); showError(e.message || 'โหลดข้อมูลไม่สำเร็จ'); }
}

async function renderTime(force=false) {
  if (force) { const data = await api('bootstrap'); state.activeSession = data.activeSession || null; state.me = data.user; }
  const active = state.activeSession;
  layout(`
    <section class="card">
      <h2 style="margin-top:0">สถานะปัจจุบัน</h2>
      ${active ? `<p><span class="badge live">กำลังไลฟ์</span></p><p>เริ่ม ${fmtDateTime(active.started_at)}</p>` : `<p><span class="badge">ไม่ได้ไลฟ์อยู่</span></p>`}
      <div class="grid two">
        <button class="btn" ${active?'disabled':''} onclick="startLive()">เริ่มไลฟ์</button>
        <button class="btn danger" ${active?'':'disabled'} onclick="endLive()">จบไลฟ์</button>
      </div>
    </section>
    <section class="card">
      <h2 style="margin-top:0">วันนี้</h2>
      <p class="small">ดู Timeline ของทีมได้ที่แท็บ Timeline</p>
    </section>`);
}
async function startLive() { if (!confirm('เริ่มไลฟ์ตอนนี้?')) return; showLoading('กำลังบันทึก...'); await api('startLive'); await bootstrap(); }
async function endLive() { if (!confirm('จบไลฟ์ตอนนี้?')) return; showLoading('กำลังบันทึก...'); await api('endLive'); await bootstrap(); }

async function renderTimeline(force=false) {
  const date = fmtDate(state.selectedDate);
  const data = await api('getTimeline', { date });
  const rows = data.rows || [];
  const sessions = data.sessions || [];
  const minHour = 0, maxHour = 24;
  layout(`
    <section class="card">
      <label class="label">เลือกวันที่</label>
      <input class="input" type="date" value="${date}" onchange="state.selectedDate=new Date(this.value+'T00:00:00'); renderApp(true)" />
    </section>
    <section class="card">
      <h2 style="margin-top:0">Timeline 24 ชั่วโมง</h2>
      <div class="hours">${[0,4,8,12,16,20,24].map(h=>`<span>${String(h).padStart(2,'0')}:00</span>`).join('')}</div>
      <div class="timeline">
        ${rows.map(row => `<div class="timeline-row"><div class="timeline-name">${escapeHtml(row.display_name)}</div><div class="timeline-track">${row.sessions.map(s=>bar(s,minHour,maxHour)).join('')}</div></div>`).join('') || '<p class="small">ไม่มีข้อมูล</p>'}
      </div>
    </section>
    ${['admin','supervisor'].includes(state.me.role) ? supervisorSessionList(sessions) : ''}`);
}
function bar(s) {
  const start = new Date(s.started_at); const end = s.ended_at ? new Date(s.ended_at) : new Date();
  const base = new Date(start); base.setHours(0,0,0,0);
  const startMin = Math.max(0, (start-base)/60000);
  const endMin = Math.min(1440, (end-base)/60000);
  const left = (startMin/1440)*100;
  const width = Math.max(2, ((endMin-startMin)/1440)*100);
  return `<div class="timeline-bar ${s.status==='live'?'live':''}" style="left:${left}%;width:${width}%">${fmtTime(s.started_at)}-${s.ended_at?fmtTime(s.ended_at):'กำลังไลฟ์'}</div>`;
}
function supervisorSessionList(sessions) {
  return `<section class="card"><h2 style="margin-top:0">จัดการรอบ</h2><button class="btn" onclick="openSessionModal()">เพิ่มรอบย้อนหลัง</button>${sessions.map(s=>`<div class="session"><div><div class="title">${escapeHtml(s.user_display_name)}</div><div class="meta">${fmtTime(s.started_at)}–${s.ended_at?fmtTime(s.ended_at):'กำลังไลฟ์'} · ${fmtDuration(s.duration_minutes)} · ${escapeHtml(s.status)}</div></div><div class="actions"><button class="btn secondary" onclick='openSessionModal(${JSON.stringify(s).replace(/'/g,"&#039;")})'>แก้ไข</button><button class="btn danger" onclick="deleteSession('${s.id}')">ลบ</button></div></div>`).join('')}</section>`;
}

async function renderDaily() {
  const date = fmtDate(state.selectedDate);
  const data = await api('getDailyReport', { date });
  layout(`<section class="card"><label class="label">วันที่</label><input class="input" type="date" value="${date}" onchange="state.selectedDate=new Date(this.value+'T00:00:00'); renderApp(true)" /></section><section class="card"><h2 style="margin-top:0">รายงานรายวัน</h2><div class="kpi"><div class="box"><div class="num">${data.activeUsers}</div><div class="name">คนที่ไลฟ์</div></div><div class="box"><div class="num">${data.totalSessions}</div><div class="name">รอบ</div></div><div class="box"><div class="num">${fmtDuration(data.totalMinutes)}</div><div class="name">ชั่วโมงรวม</div></div><div class="box"><div class="num">${data.liveNow}</div><div class="name">ยังไลฟ์อยู่</div></div></div></section><section class="card">${(data.rows||[]).map(r=>`<div class="session"><div><div class="title">${escapeHtml(r.display_name)}</div><div class="meta">${r.sessions.map(s=>`${fmtTime(s.started_at)}–${s.ended_at?fmtTime(s.ended_at):'ยังไลฟ์อยู่'}`).join('<br>') || 'ไม่มีรายการ'}</div></div><strong>${fmtDuration(r.total_minutes)}</strong></div>`).join('')}</section>`);
}
async function renderMonthly() {
  const month = fmtMonth(state.selectedMonth);
  const data = await api('getMonthlyReport', { month });
  layout(`<section class="card"><label class="label">เดือน</label><input class="input" type="month" value="${month}" onchange="state.selectedMonth=new Date(this.value+'-01T00:00:00'); renderApp(true)" /></section><section class="card"><h2 style="margin-top:0">รายงานรายเดือน</h2><table class="table"><thead><tr><th>ชื่อ</th><th>วันที่ไลฟ์</th><th>รอบ</th><th>รวม</th><th>เฉลี่ย/วัน</th></tr></thead><tbody>${(data.rows||[]).map(r=>`<tr><td>${escapeHtml(r.display_name)}</td><td>${r.live_days}</td><td>${r.session_count}</td><td>${fmtDuration(r.total_minutes)}</td><td>${fmtDuration(r.avg_minutes_per_live_day)}</td></tr>`).join('')}</tbody></table></section>`);
}

async function renderUsers() {
  const data = await api('listUsers');
  layout(`<section class="card"><h2 style="margin-top:0">จัดการผู้ใช้</h2>${data.users.map(u=>`<div class="session"><div><div class="title">${escapeHtml(u.display_name)}</div><div class="meta">${escapeHtml(u.role)} · <span class="badge ${u.status}">${escapeHtml(u.status)}</span><br>${escapeHtml(u.line_user_id)}</div></div><div class="actions"><select onchange="setUserRole('${u.id}', this.value)"><option ${u.role==='streamer'?'selected':''}>streamer</option><option ${u.role==='supervisor'?'selected':''}>supervisor</option><option ${u.role==='admin'?'selected':''}>admin</option></select>${u.status==='pending'?`<button class="btn" onclick="approveUser('${u.id}')">อนุมัติ</button>`:''}<button class="btn secondary" onclick="disableUser('${u.id}')">ปิดใช้</button></div></div>`).join('')}</section>`);
}
async function renderAudit() {
  const data = await api('getAuditLogs', { limit: 80 });
  layout(`<section class="card"><h2 style="margin-top:0">Audit Log</h2>${data.logs.map(l=>`<div class="session"><div><div class="title">${escapeHtml(l.action)} · ${escapeHtml(l.table_name)}</div><div class="meta">${fmtDateTime(l.created_at)} · ${escapeHtml(l.actor_name || '')}<br>${escapeHtml(l.reason || '')}</div></div></div>`).join('')}</section>`);
}
async function approveUser(id) { await api('approveUser', { userId:id }); await renderApp(true); }
async function setUserRole(id, role) { await api('setUserRole', { userId:id, role }); await renderApp(true); }
async function disableUser(id) { const reason=prompt('เหตุผลในการปิดใช้งาน'); if(!reason) return; await api('disableUser', { userId:id, reason }); await renderApp(true); }

function openSessionModal(s=null) {
  const isEdit = !!s;
  const start = s ? localInputValue(s.started_at) : `${fmtDate(state.selectedDate)}T20:00`;
  const end = s && s.ended_at ? localInputValue(s.ended_at) : '';
  const html = `<div class="modal-backdrop" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()"><h2>${isEdit?'แก้ไขรอบ':'เพิ่มรอบย้อนหลัง'}</h2><label class="label">ผู้ไลฟ์</label><select id="modalUser" class="input"></select><label class="label">เวลาเริ่ม</label><input id="modalStart" type="datetime-local" class="input" value="${start}"><label class="label">เวลาจบ</label><input id="modalEnd" type="datetime-local" class="input" value="${end}"><label class="label">เหตุผล</label><textarea id="modalReason" class="input" placeholder="บังคับกรอกเหตุผล"></textarea><div class="actions"><button class="btn" onclick="saveSession('${s?.id||''}')">บันทึก</button><button class="btn secondary" onclick="document.querySelector('.modal-backdrop').remove()">ยกเลิก</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  api('listUsers').then(data=>{
    const select=document.getElementById('modalUser');
    select.innerHTML=data.users.filter(u=>u.status==='active').map(u=>`<option value="${u.id}" ${s?.user_id===u.id?'selected':''}>${escapeHtml(u.display_name)}</option>`).join('');
  });
}
function localInputValue(value) {
  const d = new Date(value); const tz = new Date(d.toLocaleString('en-US', { timeZone:'Asia/Bangkok' }));
  return `${tz.getFullYear()}-${String(tz.getMonth()+1).padStart(2,'0')}-${String(tz.getDate()).padStart(2,'0')}T${String(tz.getHours()).padStart(2,'0')}:${String(tz.getMinutes()).padStart(2,'0')}`;
}
function closeModal(e){ if(e.target.classList.contains('modal-backdrop')) e.target.remove(); }
async function saveSession(id) {
  const payload = { userId: modalUser.value, startedAt: new Date(modalStart.value).toISOString(), endedAt: modalEnd.value ? new Date(modalEnd.value).toISOString() : null, reason: modalReason.value.trim() };
  if (!payload.reason) return alert('กรุณากรอกเหตุผล');
  await api(id ? 'updateSession' : 'createSession', { ...payload, sessionId:id || undefined });
  document.querySelector('.modal-backdrop').remove(); await renderApp(true);
}
async function deleteSession(id) { const reason=prompt('เหตุผลในการลบรอบนี้'); if(!reason) return; await api('deleteSession', { sessionId:id, reason }); await renderApp(true); }

init();
