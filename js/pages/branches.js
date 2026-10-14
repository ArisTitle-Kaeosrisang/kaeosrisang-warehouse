// ระบบจัดการสาขา (แอดมิน)
import { sb, q, invalidate } from '../store.js';
import { esc, icon, modal, toast, errMsg, formData, busy, confirmDialog, fmtMoney } from '../ui.js';

export async function render(page) {
  const [branches, emps, lines] = await Promise.all([
    q(sb.from('branches').select('*').order('code')),
    q(sb.from('employees').select('branch_id, status')),
    q(sb.from('v_dispatch_lines').select('branch_id, amount')),
  ]);
  const empCount = {}, value = {};
  emps.filter((e) => e.status === 'ปฏิบัติงาน').forEach((e) => { empCount[e.branch_id] = (empCount[e.branch_id] || 0) + 1; });
  lines.forEach((l) => { value[l.branch_id] = (value[l.branch_id] || 0) + Number(l.amount); });

  page.innerHTML = `<div class="page-head"><div><h1>สาขา</h1><p>${branches.length} สาขา</p></div>
    <div class="actions"><button class="btn btn-primary" id="add">${icon('plus')} เพิ่มสาขา</button></div></div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>รหัส</th><th>ชื่อสาขา</th><th>ที่อยู่</th><th>โทร</th><th>ผู้จัดการ</th>
        <th class="r">พนักงาน</th><th class="r">มูลค่าสินค้าที่จ่ายสะสม (บาท)</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${branches.map((b) => `<tr>
        <td class="num">${esc(b.code)}</td><td><b>${esc(b.name)}</b></td>
        <td class="small">${esc(b.address || '-')}</td><td>${esc(b.phone || '-')}</td><td>${esc(b.manager || '-')}</td>
        <td class="r num">${empCount[b.id] || 0}</td><td class="r num">${fmtMoney(value[b.id])}</td>
        <td>${b.is_active ? '<span class="badge b-delivered">เปิดใช้งาน</span>' : '<span class="badge b-draft">ปิด</span>'}</td>
        <td class="r"><button class="btn btn-sm" data-edit="${b.id}">${icon('edit')} แก้ไข</button></td></tr>`).join('')}</tbody>
    </table></div>
    ${branches.length ? '' : `<div class="empty">ยังไม่มีสาขา เพิ่มสาขาแรกเพื่อเริ่มจ่ายสินค้า<br><button class="btn btn-primary" id="add2">${icon('plus')} เพิ่มสาขา</button></div>`}
    </div>`;

  const reload = () => render(page);
  page.querySelector('#add').onclick = () => edit(null, reload);
  page.querySelector('#add2')?.addEventListener('click', () => edit(null, reload));
  page.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () =>
    edit(branches.find((x) => x.id == b.dataset.edit), reload));
}

function edit(b, reload) {
  const v = b || { is_active: true };
  const { el, close } = modal({
    title: b ? `แก้ไขสาขา ${b.name}` : 'เพิ่มสาขา',
    body: `<form id="f"><div class="grid-2">
      <div class="field"><label>รหัสสาขา *</label><input name="code" required value="${esc(v.code || '')}" placeholder="เช่น B01"></div>
      <div class="field"><label>ชื่อสาขา *</label><input name="name" required value="${esc(v.name || '')}"></div></div>
      <div class="field"><label>ที่อยู่</label><textarea name="address" rows="2">${esc(v.address || '')}</textarea></div>
      <div class="grid-2">
      <div class="field"><label>เบอร์โทร</label><input name="phone" inputmode="tel" value="${esc(v.phone || '')}"></div>
      <div class="field"><label>ผู้จัดการสาขา</label><input name="manager" value="${esc(v.manager || '')}"></div></div>
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="is_active" style="width:auto" ${v.is_active ? 'checked' : ''}> เปิดใช้งานสาขานี้</label>
      </form>`,
    foot: `${b ? `<button class="btn btn-danger" data-del>${icon('trash')} ลบ</button><span class="spacer"></span>` : ''}
      <button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" data-save>บันทึกสาขา</button>`,
  });
  el.querySelector('[data-save]').onclick = (e) => busy(e.currentTarget, async () => {
    const f = formData(el.querySelector('#f'));
    if (!f.code?.trim() || !f.name?.trim()) return toast('กรุณากรอกรหัสและชื่อสาขา', 'error');
    const row = { code: f.code.trim(), name: f.name.trim(), address: f.address || null, phone: f.phone || null,
      manager: f.manager || null, is_active: !!f.is_active };
    try {
      await q(b ? sb.from('branches').update(row).eq('id', b.id) : sb.from('branches').insert(row));
      invalidate('branches'); toast('บันทึกสาขาแล้ว', 'ok'); close(); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog(`ลบสาขา "${b.name}"? ถ้ามีใบส่งสินค้าอ้างอิงจะลบไม่ได้ ให้ปิดใช้งานแทน`, { ok: 'ลบสาขา', danger: true })) return;
    try { await q(sb.from('branches').delete().eq('id', b.id)); invalidate('branches'); toast('ลบสาขาแล้ว', 'ok'); close(); reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  });
}
