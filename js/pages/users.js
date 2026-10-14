// ผู้ใช้ระบบ: อนุมัติบัญชี กำหนดสิทธิ์และสาขา (แอดมิน)
import { sb, q, state, getBranches } from '../store.js';
import { esc, toast, errMsg, optionList, fmtDate } from '../ui.js';

const ROLES = [{ id: 'pending', name: 'รออนุมัติ' }, { id: 'staff', name: 'พนักงานสาขา' }, { id: 'admin', name: 'แอดมิน' }];

export async function render(page) {
  const [users, branches] = await Promise.all([
    q(sb.from('profiles').select('*').order('created_at', { ascending: false })),
    getBranches(),
  ]);
  const pending = users.filter((u) => u.role === 'pending').length;
  page.innerHTML = `<div class="page-head"><div><h1>ผู้ใช้ระบบ</h1>
      <p>${pending ? `<b>${pending} บัญชีรออนุมัติ</b> · ` : ''}พนักงานสาขาเห็นและยืนยันรับสินค้าได้เฉพาะสาขาของตัวเอง</p></div></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สมัครเมื่อ</th><th>สิทธิ์</th><th>สาขา</th></tr></thead>
      <tbody>${users.map((u) => `<tr data-id="${u.id}">
        <td><b>${esc(u.full_name || '-')}</b></td><td>${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td>
        <td><select data-f="role" aria-label="สิทธิ์ของ ${esc(u.email)}" ${u.id === state.user.id ? 'disabled title="เปลี่ยนสิทธิ์ตัวเองไม่ได้"' : ''}>${optionList(ROLES, u.role)}</select></td>
        <td><select data-f="branch_id" aria-label="สาขาของ ${esc(u.email)}">${optionList(branches, u.branch_id, { empty: '- ไม่ระบุ -' })}</select></td>
      </tr>`).join('')}</tbody></table></div>
      ${users.length ? '' : '<div class="empty">ยังไม่มีผู้ใช้</div>'}</div>
    <p class="small muted">ให้พนักงานเปิดเว็บไซต์แล้วกด "สมัครใช้งาน" จากนั้นกลับมาอนุมัติและเลือกสาขาที่หน้านี้</p>`;

  page.querySelectorAll('select[data-f]').forEach((sel) => sel.addEventListener('change', async () => {
    const tr = sel.closest('tr'), id = tr.dataset.id;
    const role = tr.querySelector('[data-f=role]').value, branch = tr.querySelector('[data-f=branch_id]').value;
    if (role === 'staff' && !branch) toast('กรุณาเลือกสาขาให้พนักงานด้วย ไม่เช่นนั้นจะไม่เห็นใบส่งสินค้า', 'error');
    try {
      await q(sb.from('profiles').update({ role, branch_id: branch || null }).eq('id', id));
      toast('บันทึกสิทธิ์แล้ว', 'ok');
    } catch (e) { toast(errMsg(e), 'error'); }
  }));
}
