// ผู้ใช้ระบบ: อนุมัติบัญชี กำหนดชื่อผู้ใช้ สิทธิ์ สาขา และลบผู้ใช้ (แอดมิน)
import { sb, q, state, getBranches } from '../store.js';
import { esc, icon, toast, errMsg, optionList, fmtDate, confirmDialog } from '../ui.js';

const ROLES = [{ id: 'pending', name: 'รออนุมัติ' }, { id: 'staff', name: 'พนักงานสาขา' }, { id: 'admin', name: 'แอดมิน' }];

export async function render(page) {
  const [users, branches] = await Promise.all([
    q(sb.from('profiles').select('*').order('created_at', { ascending: false })),
    getBranches(),
  ]);
  const pending = users.filter((u) => u.role === 'pending').length;
  page.innerHTML = `<div class="page-head"><div><h1>ผู้ใช้ระบบ</h1>
      <p>${pending ? `<b>${pending} บัญชีรออนุมัติ</b> · ` : ''}แอดมินทำได้ทุกอย่าง ส่วนพนักงานสาขาเห็นและยืนยันรับสินค้าได้เฉพาะสาขาของตัวเอง</p></div></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>ชื่อ-สกุล</th><th>ชื่อผู้ใช้ (ล็อกอิน)</th><th>อีเมล</th><th>สมัครเมื่อ</th><th>สิทธิ์</th><th>สาขา</th><th></th></tr></thead>
      <tbody>${users.map((u) => {
        const me = u.id === state.user.id;
        return `<tr data-id="${u.id}">
        <td><input data-f="full_name" value="${esc(u.full_name || '')}" aria-label="ชื่อ-สกุล" style="min-width:160px"></td>
        <td><input data-f="username" value="${esc(u.username || '')}" aria-label="ชื่อผู้ใช้" placeholder="ยังไม่ได้ตั้ง" style="min-width:150px"></td>
        <td class="small">${esc(u.email)}</td><td class="small">${fmtDate(u.created_at)}</td>
        <td><select data-f="role" aria-label="สิทธิ์" style="min-width:140px" ${me ? 'disabled title="เปลี่ยนสิทธิ์ตัวเองไม่ได้"' : ''}>${optionList(ROLES, u.role)}</select></td>
        <td><select data-f="branch_id" aria-label="สาขา" style="min-width:150px">${optionList(branches, u.branch_id, { empty: '- ไม่ระบุ -' })}</select></td>
        <td class="r">${me ? '<span class="small muted">บัญชีของคุณ</span>'
          : `<button class="btn btn-sm btn-danger" data-del aria-label="ลบผู้ใช้ ${esc(u.email)}">${icon('trash')} ลบ</button>`}</td>
      </tr>`; }).join('')}</tbody></table></div>
      ${users.length ? '' : '<div class="empty">ยังไม่มีผู้ใช้</div>'}</div>
    <p class="small muted">ให้พนักงานเปิดเว็บไซต์แล้วกด "สมัครใช้งาน" จากนั้นกลับมาอนุมัติและเลือกสาขาที่หน้านี้ แก้ช่องใดก็ตามระบบบันทึกให้ทันที</p>`;

  page.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', async () => {
    const tr = inp.closest('tr'), id = tr.dataset.id, f = inp.dataset.f;
    let v = inp.value.trim();
    if (f === 'username' && !v) v = null;
    if (f === 'branch_id' && !v) v = null;
    const role = tr.querySelector('[data-f=role]').value;
    if (f !== 'full_name' && f !== 'username' && role === 'staff' && !tr.querySelector('[data-f=branch_id]').value)
      toast('กรุณาเลือกสาขาให้พนักงานด้วย ไม่เช่นนั้นจะไม่เห็นใบส่งสินค้า', 'error');
    try {
      await q(sb.from('profiles').update({ [f]: v }).eq('id', id));
      if (id === state.user.id) Object.assign(state.profile, { [f]: v });
      toast('บันทึกแล้ว', 'ok');
    } catch (e) {
      toast(/profiles_username_key|duplicate/.test(e.message) ? 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' : errMsg(e), 'error');
    }
  }));

  page.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const tr = b.closest('tr'), u = users.find((x) => x.id === tr.dataset.id);
    if (!await confirmDialog(`ลบผู้ใช้ ${u.full_name || u.email}? บัญชีนี้จะเข้าสู่ระบบไม่ได้อีก (ใบส่งสินค้าที่เคยทำยังอยู่ครบ)`, { ok: 'ลบผู้ใช้', danger: true })) return;
    try { await q(sb.rpc('delete_user', { p_id: u.id })); toast('ลบผู้ใช้แล้ว', 'ok'); render(page); }
    catch (e) { toast(errMsg(e), 'error'); }
  }));
}
