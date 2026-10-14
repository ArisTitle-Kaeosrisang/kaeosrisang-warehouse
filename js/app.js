// จุดเริ่มระบบ: ล็อกอิน, เมนู, เปลี่ยนหน้า
import { sb, configured, state, isAdmin, q } from './store.js';
import { COMPANY } from './config.js';
import { $, esc, icon, toast, errMsg, formData, busy } from './ui.js';

const ROUTES = {
  dashboard: { label: 'ภาพรวม', icon: 'home', load: () => import('./pages/dashboard.js') },
  shipments: { label: 'รับส่งสินค้า', icon: 'truck', load: () => import('./pages/shipments.js') },
  products: { label: 'สินค้าและสต็อก', icon: 'box', load: () => import('./pages/products.js') },
  reports: { label: 'สรุปการจ่ายสินค้า', icon: 'chart', load: () => import('./pages/reports.js') },
  analytics: { label: 'แนวโน้มการใช้สินค้า', icon: 'trend', load: () => import('./pages/analytics.js') },
  branches: { label: 'สาขา', icon: 'store', admin: true, load: () => import('./pages/branches.js') },
  employees: { label: 'พนักงาน', icon: 'users', admin: true, load: () => import('./pages/employees.js') },
  users: { label: 'ผู้ใช้ระบบ', icon: 'key', admin: true, load: () => import('./pages/users.js') },
};

const app = $('#app');

// ---------------- ยังไม่ได้ตั้งค่า ----------------
if (!configured) {
  app.innerHTML = `<div class="page" style="margin:auto;max-width:640px;padding-top:4rem">
    <h1>${esc(COMPANY.system)}</h1>
    <div class="notice" style="margin-top:1rem">
      <b>ยังไม่ได้เชื่อมต่อฐานข้อมูล</b><br>
      เปิดไฟล์ <code>js/config.js</code> แล้วใส่ <code>SUPABASE_URL</code> และ <code>SUPABASE_ANON_KEY</code>
      ของโปรเจกต์ Supabase (ดูขั้นตอนในไฟล์ README.md)
    </div></div>`;
} else {
  start();
}

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  await onSession(session);
  sb.auth.onAuthStateChange((evt, s) => {
    if (evt === 'SIGNED_IN' && state.user?.id === s?.user?.id) return;
    if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') onSession(s);
  });
  window.addEventListener('hashchange', route);
}

async function onSession(session) {
  state.user = session?.user || null;
  state.profile = null;
  if (!state.user) return renderAuth();
  try {
    state.profile = await q(sb.from('profiles').select('*, branches(name)').eq('id', state.user.id).maybeSingle());
  } catch (e) { toast(errMsg(e), 'error'); }
  if (!state.profile || state.profile.role === 'pending') return renderPending();
  renderShell();
  route();
}

// ---------------- ล็อกอิน / สมัครสมาชิก ----------------
function renderAuth(mode = 'login') {
  const signup = mode === 'signup';
  app.innerHTML = `<div class="auth">
    <div class="auth-art">
      <div><div class="brand-name" style="font-size:1.1rem">${esc(COMPANY.name)}</div></div>
      <div>
        <h1>${esc(COMPANY.system)}</h1>
        <p>ระบบจัดการคลังสินค้า จ่ายสินค้าไปสาขา ตัดสต็อกอัตโนมัติ และติดตามแนวโน้มการใช้สินค้าของแต่ละสาขา</p>
      </div>
      <div class="tape"></div>
    </div>
    <form class="auth-form" id="authForm" novalidate>
      <h2>${signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}</h2>
      <p class="muted small" style="margin:0 0 1.25rem">${signup
        ? 'หลังสมัคร แอดมินต้องอนุมัติและกำหนดสาขาให้ก่อนจึงจะใช้งานได้'
        : 'ใช้อีเมลและรหัสผ่านที่ลงทะเบียนไว้'}</p>
      ${signup ? `<div class="field"><label for="fn">ชื่อ-สกุล</label><input id="fn" name="full_name" required autocomplete="name"></div>` : ''}
      <div class="field"><label for="em">อีเมล</label><input id="em" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="pw">รหัสผ่าน</label><input id="pw" name="password" type="password" required minlength="6" autocomplete="${signup ? 'new-password' : 'current-password'}">
        ${signup ? '<div class="hint">อย่างน้อย 6 ตัวอักษร</div>' : ''}</div>
      <button class="btn btn-primary" type="submit" style="width:100%">${signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}</button>
      <div class="switch">${signup
        ? 'มีบัญชีแล้ว? <a href="#" data-mode="login">เข้าสู่ระบบ</a>'
        : 'ยังไม่มีบัญชี? <a href="#" data-mode="signup">สมัครใช้งาน</a>'}</div>
    </form></div>`;
  $('[data-mode]', app).addEventListener('click', (e) => { e.preventDefault(); renderAuth(e.target.dataset.mode); });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.email || !f.password) return toast('กรุณากรอกอีเมลและรหัสผ่าน', 'error');
    await busy(e.submitter, async () => {
      if (signup) {
        const { data, error } = await sb.auth.signUp({
          email: f.email, password: f.password,
          options: { data: { full_name: f.full_name }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) return toast(errMsg(error), 'error');
        if (!data.session) {
          toast('สมัครสำเร็จ ตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ', 'ok');
          renderAuth('login');
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) toast(/Invalid login/.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : errMsg(error), 'error');
      }
    });
  });
}

function renderPending() {
  app.innerHTML = `<div class="page" style="margin:auto;max-width:560px;padding-top:4rem">
    <h1>${esc(COMPANY.system)}</h1>
    <div class="notice" style="margin:1rem 0">
      <b>บัญชีของคุณรอการอนุมัติ</b><br>
      แจ้งแอดมินให้อนุมัติบัญชี <b>${esc(state.user.email)}</b> และกำหนดสาขา จากนั้นกด "ตรวจสอบอีกครั้ง"
    </div>
    <div class="actions"><button class="btn btn-primary" id="recheck">ตรวจสอบอีกครั้ง</button>
    <button class="btn" id="out">ออกจากระบบ</button></div></div>`;
  $('#recheck').onclick = async () => onSession((await sb.auth.getSession()).data.session);
  $('#out').onclick = () => sb.auth.signOut();
}

// ---------------- โครงหน้าหลัก ----------------
function renderShell() {
  const p = state.profile;
  const links = Object.entries(ROUTES).filter(([, r]) => !r.admin || isAdmin());
  const main = links.filter(([, r]) => !r.admin), admin = links.filter(([, r]) => r.admin);
  const a = ([k, r]) => `<a href="#/${k}" data-route="${k}">${icon(r.icon)}<span>${esc(r.label)}</span></a>`;
  app.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="brand"><div class="brand-name">${esc(COMPANY.name)}</div><div class="brand-sub">${esc(COMPANY.system)}</div></div>
      <div class="tape"></div>
      <nav class="nav">${main.map(a).join('')}
        ${admin.length ? `<div class="nav-group">ตั้งค่าระบบ</div>${admin.map(a).join('')}` : ''}</nav>
      <div class="who"><b>${esc(p.full_name || p.email)}</b>
        ${p.role === 'admin' ? 'แอดมิน' : `พนักงานสาขา ${esc(p.branches?.name || '')}`}
        <div><button class="btn btn-ghost btn-sm" id="logout">${icon('logout')} ออกจากระบบ</button></div></div>
    </aside>
    <div class="main">
      <div class="topbar"><button class="btn btn-ghost btn-icon" id="menuBtn" aria-label="เมนู" style="color:#fff">${icon('menu')}</button>
        <div class="brand-name">${esc(COMPANY.name)}</div></div>
      <main class="page" id="page"></main>
    </div></div>`;
  $('#logout').onclick = () => sb.auth.signOut();
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  $('#side').addEventListener('click', (e) => { if (e.target.closest('a')) $('#side').classList.remove('open'); });
}

let routeToken = 0;
async function route() {
  if (!state.profile || state.profile.role === 'pending' || !$('#page')) return;
  let key = location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  if (!ROUTES[key] || (ROUTES[key].admin && !isAdmin())) key = 'dashboard';
  document.querySelectorAll('[data-route]').forEach((x) => x.classList.toggle('active', x.dataset.route === key));
  const page = $('#page');
  const token = ++routeToken;
  page.innerHTML = '<div class="empty">กำลังโหลด…</div>';
  try {
    const mod = await ROUTES[key].load();
    if (token !== routeToken) return;
    await mod.render(page);
    document.title = `${ROUTES[key].label} · ${COMPANY.system}`;
  } catch (e) {
    console.error(e);
    page.innerHTML = `<div class="notice err">โหลดหน้านี้ไม่สำเร็จ: ${esc(errMsg(e))}</div>`;
  }
}
