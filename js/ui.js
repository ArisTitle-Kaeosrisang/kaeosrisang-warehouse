// ตัวช่วยหน้าจอ: escape, format, modal, toast, icons, validation

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const mf = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (n) => nf.format(Number(n || 0));
export const fmtMoney = (n) => mf.format(Number(n || 0));
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
};
export const todayISO = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

export const STATUS = {
  draft: { label: 'ร่าง', cls: 'b-draft' },
  shipping: { label: 'กำลังจัดส่ง', cls: 'b-shipping' },
  delivered: { label: 'ส่งแล้ว', cls: 'b-delivered' },
  cancelled: { label: 'ยกเลิก', cls: 'b-cancelled' },
};
export const statusBadge = (s) => `<span class="badge ${STATUS[s]?.cls || ''}">${esc(STATUS[s]?.label || s)}</span>`;

export const BANKS = ['ธนาคารกรุงเทพ', 'ธนาคารกสิกรไทย', 'ธนาคารกรุงไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารทหารไทยธนชาต (ttb)', 'ธนาคารออมสิน', 'ธ.ก.ส.', 'ธนาคารอาคารสงเคราะห์', 'ธนาคารยูโอบี', 'ธนาคารซีไอเอ็มบี ไทย',
  'ธนาคารเกียรตินาคินภัทร', 'ธนาคารแลนด์ แอนด์ เฮ้าส์', 'ธนาคารอิสลามแห่งประเทศไทย'];

// ---------- เลขบัตรประชาชน / บัญชีธนาคาร ----------
export const digits = (s) => String(s || '').replace(/\D/g, '');
export function isValidThaiId(id) {
  const d = digits(id);
  if (d.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}
export const formatThaiId = (id) => {
  const d = digits(id);
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : d;
};
export const maskThaiId = (id) => {
  const d = digits(id);
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-xxxxx-xx-${d[12]}` : '-';
};
export const maskBank = (acc) => {
  const d = digits(acc);
  return d ? `xxx-x-x${d.slice(-4)}` : '-';
};
export const formatBank = (acc) => {
  const d = digits(acc);
  return d.length === 10 ? `${d.slice(0, 3)}-${d[3]}-${d.slice(4, 9)}-${d[9]}` : d;
};
export function secret(masked, full) {
  return `<span class="secret" data-masked="${esc(masked)}" data-full="${esc(full)}"><span>${esc(masked)}</span>` +
    `<button type="button" title="แสดง/ซ่อน" aria-label="แสดงหรือซ่อนข้อมูล">${icon('eye')}</button></span>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.secret button');
  if (!b) return;
  e.stopPropagation();
  const w = b.parentElement, span = w.firstElementChild;
  const showing = w.dataset.show === '1';
  span.textContent = showing ? w.dataset.masked : w.dataset.full;
  w.dataset.show = showing ? '0' : '1';
  b.innerHTML = icon(showing ? 'eye' : 'eyeOff');
}, true);

// ---------- Toast ----------
export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6500 : 3500);
}
export const errMsg = (e) => {
  const m = e?.message || String(e);
  if (/duplicate key.*national_id/.test(m)) return 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว';
  if (/duplicate key.*code/.test(m)) return 'รหัสสาขานี้มีอยู่แล้ว';
  if (/duplicate key.*sku/.test(m)) return 'รหัสสินค้านี้มีอยู่แล้ว';
  if (/violates foreign key/.test(m)) return 'ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่';
  if (/Failed to fetch/.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return m;
};

// ---------- Modal ----------
export function modal({ title, body, foot = '', wide = false, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2>
      <button class="btn btn-ghost btn-icon" data-close aria-label="ปิด">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  const prevFocus = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  const m = wrap.firstElementChild;
  (m.querySelector('input,select,textarea') || m.querySelector('button'))?.focus();
  onMount?.(m, close);
  return { el: m, close };
}

export function confirmDialog(message, { ok = 'ยืนยัน', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = modal({
      title: 'ยืนยันการทำรายการ',
      body: `<p style="margin:0">${esc(message)}</p>`,
      foot: `<button class="btn" data-close>ยกเลิก</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
    });
    el.querySelector('[data-ok]').addEventListener('click', () => { done = true; close(); resolve(true); });
    const obs = new MutationObserver(() => { if (!el.isConnected) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// ส่งฟอร์ม: เก็บค่าทั้งหมดเป็น object
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ปุ่มกำลังทำงาน
export async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

export function optionList(items, selected, { valueKey = 'id', labelKey = 'name', empty } = {}) {
  return (empty ? `<option value="">${esc(empty)}</option>` : '') + items.map((i) =>
    `<option value="${esc(i[valueKey])}" ${String(i[valueKey]) === String(selected ?? '') ? 'selected' : ''}>${esc(i[labelKey])}</option>`).join('');
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function toCSV(rows) {
  return '﻿' + rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// ---------- Icons (inline SVG, stroke) ----------
const P = {
  home: '<path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  store: '<path d="M4 9h16l-1-5H5z"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14.8c1.8.7 2.8 2.5 3 5.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.3C3.6 8.1 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>',
  pdf: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 17h4"/>',
  line: '<path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.2 1c0 .3-.2 1.2 1 .6s6.6-3.9 9-6.7c1.6-1.8 2-3.1 2-4.3C22 6.6 17.5 3 12 3z"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
