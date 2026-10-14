// ระบบจัดการพนักงาน (แอดมิน) — เลขบัตรประชาชน/บัญชีธนาคารแสดงแบบปิดบางหลัก กดรูปตาเพื่อดูเต็ม
import { sb, q, getBranches } from '../store.js';
import {
  esc, icon, modal, toast, errMsg, formData, busy, confirmDialog, optionList, fmtDate,
  isValidThaiId, formatThaiId, maskThaiId, maskBank, formatBank, digits, secret, BANKS, downloadBlob, toCSV,
} from '../ui.js';

const STATUSES = ['ปฏิบัติงาน', 'พักงาน', 'ลาออก'];
const POSITIONS = ['ผู้จัดการสาขา', 'หัวหน้างาน', 'พนักงานทำความสะอาด', 'พนักงานคลังสินค้า', 'พนักงานขับรถ', 'ธุรการ'];

const age = (d) => {
  if (!d) return '';
  const b = new Date(d), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
};

export async function render(page) {
  const [emps, branches] = await Promise.all([
    q(sb.from('employees').select('*').order('first_name')),
    getBranches(),
  ]);
  const bName = Object.fromEntries(branches.map((b) => [b.id, b.name]));

  page.innerHTML = `<div class="page-head"><div><h1>พนักงาน</h1>
      <p>${emps.filter((e) => e.status === 'ปฏิบัติงาน').length} คนปฏิบัติงาน จากทั้งหมด ${emps.length} คน</p></div>
    <div class="actions"><button class="btn" id="csv">${icon('download')} ส่งออก CSV</button>
      <button class="btn btn-primary" id="add">${icon('plus')} เพิ่มพนักงาน</button></div></div>
    <div class="filters">
      <input type="search" id="s" placeholder="ค้นหาชื่อ เบอร์โทร ตำแหน่ง" aria-label="ค้นหา">
      <select id="fb" aria-label="สาขา">${optionList(branches, '', { empty: 'ทุกสาขา' })}</select>
      <select id="fs" aria-label="สถานะ"><option value="">ทุกสถานะ</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
    </div>
    <div class="panel"><div class="table-wrap"><table class="nowrap">
      <thead><tr><th>ชื่อ-สกุล</th><th>เลขบัตรประชาชน</th><th>วันเกิด</th><th>เบอร์โทร</th><th>บัญชีธนาคาร</th>
        <th>สาขา</th><th>ตำแหน่ง</th><th>สถานะ</th><th></th></tr></thead>
      <tbody id="rows"></tbody></table></div><div id="none"></div></div>`;

  const draw = () => {
    const s = page.querySelector('#s').value.trim().toLowerCase();
    const fb = page.querySelector('#fb').value, fs = page.querySelector('#fs').value;
    const list = emps.filter((e) => (!fb || String(e.branch_id) === fb) && (!fs || e.status === fs) &&
      (!s || `${e.first_name} ${e.last_name} ${e.phone} ${e.position}`.toLowerCase().includes(s)));
    page.querySelector('#rows').innerHTML = list.map((e) => `<tr>
      <td><b>${esc(e.first_name)} ${esc(e.last_name)}</b></td>
      <td>${secret(maskThaiId(e.national_id), formatThaiId(e.national_id))}</td>
      <td>${fmtDate(e.birth_date)}${e.birth_date ? `<div class="small muted">${age(e.birth_date)} ปี</div>` : ''}</td>
      <td>${e.phone ? `<a href="tel:${esc(digits(e.phone))}">${esc(e.phone)}</a>` : '-'}</td>
      <td>${e.bank_account ? `${secret(maskBank(e.bank_account), formatBank(e.bank_account))}<div class="small muted">${esc(e.bank_name || '')}</div>` : '-'}</td>
      <td>${esc(bName[e.branch_id] || '-')}</td><td>${esc(e.position || '-')}</td>
      <td><span class="badge ${e.status === 'ปฏิบัติงาน' ? 'b-delivered' : e.status === 'ลาออก' ? 'b-cancelled' : 'b-shipping'}">${esc(e.status)}</span></td>
      <td class="r"><button class="btn btn-sm" data-edit="${e.id}">${icon('edit')} แก้ไข</button></td></tr>`).join('');
    page.querySelector('#none').innerHTML = list.length ? '' :
      `<div class="empty">${emps.length ? 'ไม่พบพนักงานตามเงื่อนไขที่เลือก' : 'ยังไม่มีข้อมูลพนักงาน กด "เพิ่มพนักงาน" เพื่อเริ่ม'}</div>`;
    page.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () =>
      edit(emps.find((x) => x.id == b.dataset.edit), branches, () => render(page)));
  };
  ['#s', '#fb', '#fs'].forEach((id) => page.querySelector(id).addEventListener('input', draw));
  draw();

  page.querySelector('#add').onclick = () => edit(null, branches, () => render(page));
  page.querySelector('#csv').onclick = async () => {
    if (!await confirmDialog('ไฟล์ CSV จะมีเลขบัตรประชาชนและเลขบัญชีแบบเต็ม เก็บไฟล์ไว้ในที่ปลอดภัย ดำเนินการต่อ?', { ok: 'ส่งออก' })) return;
    const rows = [['ชื่อ', 'นามสกุล', 'เลขบัตรประชาชน', 'วันเกิด', 'เบอร์โทร', 'ธนาคาร', 'เลขบัญชี', 'สถานะ', 'สาขา', 'ตำแหน่ง'],
      ...emps.map((e) => [e.first_name, e.last_name, `'${e.national_id}`, e.birth_date, e.phone, e.bank_name, `'${e.bank_account || ''}`,
        e.status, bName[e.branch_id] || '', e.position])];
    downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), 'พนักงาน.csv');
  };
}

function edit(e, branches, reload) {
  const v = e || { status: 'ปฏิบัติงาน' };
  const { el, close } = modal({
    title: e ? `แก้ไขข้อมูล ${e.first_name} ${e.last_name}` : 'เพิ่มพนักงาน',
    wide: true,
    body: `<form id="f" novalidate><div class="grid-2">
      <div class="field"><label>ชื่อ *</label><input name="first_name" required value="${esc(v.first_name || '')}"></div>
      <div class="field"><label>นามสกุล *</label><input name="last_name" required value="${esc(v.last_name || '')}"></div></div>
      <div class="grid-3">
      <div class="field"><label>เลขบัตรประชาชน 13 หลัก *</label>
        <input name="national_id" id="nid" inputmode="numeric" maxlength="17" required value="${esc(formatThaiId(v.national_id || ''))}" placeholder="x-xxxx-xxxxx-xx-x">
        <div class="err hidden" id="nidErr"></div></div>
      <div class="field"><label>วันเดือนปีเกิด</label><input type="date" name="birth_date" value="${esc(v.birth_date || '')}"></div>
      <div class="field"><label>เบอร์โทรติดต่อ</label><input name="phone" inputmode="tel" value="${esc(v.phone || '')}" placeholder="08x-xxx-xxxx"></div></div>
      <div class="grid-2">
      <div class="field"><label>ธนาคาร</label><select name="bank_name"><option value="">- เลือกธนาคาร -</option>
        ${BANKS.map((b) => `<option ${b === v.bank_name ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>เลขบัญชีธนาคาร</label><input name="bank_account" inputmode="numeric" value="${esc(v.bank_account || '')}"></div></div>
      <div class="grid-3">
      <div class="field"><label>ปฏิบัติงานที่สาขา</label><select name="branch_id">${optionList(branches, v.branch_id, { empty: '- เลือกสาขา -' })}</select></div>
      <div class="field"><label>ตำแหน่ง</label><input name="position" list="positions" value="${esc(v.position || '')}">
        <datalist id="positions">${POSITIONS.map((p) => `<option value="${p}">`).join('')}</datalist></div>
      <div class="field"><label>สถานะ</label><select name="status">${STATUSES.map((s) => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      </form>`,
    foot: `${e ? `<button class="btn btn-danger" data-del>${icon('trash')} ลบ</button><span class="spacer"></span>` : ''}
      <button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" data-save>บันทึกพนักงาน</button>`,
  });

  const nid = el.querySelector('#nid'), nidErr = el.querySelector('#nidErr');
  const checkNid = () => {
    const d = digits(nid.value);
    let msg = '';
    if (d.length && d.length !== 13) msg = `ต้องมี 13 หลัก (ตอนนี้ ${d.length} หลัก)`;
    else if (d.length === 13 && !isValidThaiId(d)) msg = 'เลขบัตรไม่ถูกต้องตามหลักตรวจสอบ กรุณาตรวจสอบอีกครั้ง';
    nidErr.textContent = msg; nidErr.classList.toggle('hidden', !msg);
    nid.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return d.length === 13 && !msg;
  };
  nid.addEventListener('input', () => { if (digits(nid.value).length === 13) nid.value = formatThaiId(nid.value); checkNid(); });

  el.querySelector('[data-save]').onclick = (ev) => busy(ev.currentTarget, async () => {
    const f = formData(el.querySelector('#f'));
    if (!f.first_name?.trim() || !f.last_name?.trim()) return toast('กรุณากรอกชื่อและนามสกุล', 'error');
    if (!checkNid()) return toast('เลขบัตรประชาชนไม่ถูกต้อง', 'error');
    const acc = digits(f.bank_account);
    if (acc && (acc.length < 6 || acc.length > 20)) return toast('เลขบัญชีธนาคารไม่ถูกต้อง', 'error');
    const row = {
      first_name: f.first_name.trim(), last_name: f.last_name.trim(), national_id: digits(f.national_id),
      birth_date: f.birth_date || null, phone: f.phone || null, bank_name: f.bank_name || null,
      bank_account: acc || null, branch_id: f.branch_id || null, position: f.position || null, status: f.status,
    };
    try {
      await q(e ? sb.from('employees').update(row).eq('id', e.id) : sb.from('employees').insert(row));
      toast('บันทึกข้อมูลพนักงานแล้ว', 'ok'); close(); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog(`ลบข้อมูลพนักงาน ${e.first_name} ${e.last_name}? หากพนักงานลาออก แนะนำให้เปลี่ยนสถานะเป็น "ลาออก" แทน`, { ok: 'ลบพนักงาน', danger: true })) return;
    try { await q(sb.from('employees').delete().eq('id', e.id)); toast('ลบข้อมูลพนักงานแล้ว', 'ok'); close(); reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  });
}
