// ระบบจัดการสินค้าและสต็อก
import { sb, q, isAdmin, getCategories, invalidate } from '../store.js';
import {
  esc, icon, modal, toast, errMsg, formData, busy, confirmDialog, optionList, fmtMoney, fmtNum, fmtDateTime,
} from '../ui.js';

const UNITS = ['ชิ้น', 'อัน', 'ด้าม', 'ขวด', 'แกลลอน', 'ลิตร', 'กล่อง', 'แพ็ค', 'ถุง', 'กระสอบ', 'ม้วน', 'คู่', 'ชุด', 'เครื่อง'];

export async function render(page) {
  invalidate('products');
  const [products, cats] = await Promise.all([
    q(sb.from('products').select('*, categories(name)').order('name')),
    getCategories(),
  ]);
  const admin = isAdmin();
  const lowCount = products.filter((p) => p.is_active && Number(p.stock_qty) <= Number(p.min_qty)).length;
  const value = products.reduce((s, p) => s + Number(p.stock_qty) * Number(p.price), 0);

  page.innerHTML = `<div class="page-head"><div><h1>สินค้าและสต็อก</h1>
      <p>${products.length} รายการ · มูลค่าคงคลัง ${fmtMoney(value)} บาท${lowCount ? ` · <span class="low-flag">${lowCount} รายการใกล้หมด</span>` : ''}</p></div>
    ${admin ? `<div class="actions"><button class="btn btn-primary" id="add">${icon('plus')} เพิ่มสินค้า</button></div>` : ''}</div>
    <div class="filters">
      <input type="search" id="s" placeholder="ค้นหาชื่อหรือรหัสสินค้า" aria-label="ค้นหา">
      <select id="fc" aria-label="ประเภท">${optionList(cats, '', { empty: 'ทุกประเภท' })}</select>
      <select id="fl" aria-label="สต็อก"><option value="">สต็อกทั้งหมด</option><option value="low">เฉพาะใกล้หมด</option><option value="off">ปิดการขาย</option></select>
    </div>
    <div class="products" id="grid"></div><div id="none"></div>`;

  const draw = () => {
    const s = page.querySelector('#s').value.trim().toLowerCase();
    const fc = page.querySelector('#fc').value, fl = page.querySelector('#fl').value;
    const list = products.filter((p) => (!fc || String(p.category_id) === fc) &&
      (!s || `${p.name} ${p.sku || ''}`.toLowerCase().includes(s)) &&
      (fl === 'low' ? p.is_active && Number(p.stock_qty) <= Number(p.min_qty) : fl === 'off' ? !p.is_active : p.is_active));
    page.querySelector('#grid').innerHTML = list.map((p) => {
      const low = Number(p.stock_qty) <= Number(p.min_qty);
      return `<article class="product ${low ? 'low' : ''}">
        <div class="img" style="${p.image_url ? `background-image:url('${esc(p.image_url)}')` : ''}">${p.image_url ? '' : icon('image')}</div>
        <div class="body">
          <div><span class="chip">${esc(p.categories?.name || 'ไม่ระบุประเภท')}</span></div>
          <div class="name">${esc(p.name)}</div>
          ${p.sku ? `<div class="small muted">รหัส ${esc(p.sku)}</div>` : ''}
          <div class="row"><span class="muted small">ราคา/${esc(p.unit)}</span><span class="num">${fmtMoney(p.price)}</span></div>
          <div class="row"><span class="muted small">คงเหลือ${low ? ' <span class="low-flag">ใกล้หมด</span>' : ''}</span>
            <span><span class="stock">${fmtNum(p.stock_qty)}</span> <span class="small">${esc(p.unit)}</span></span></div>
        </div>
        ${admin ? `<div class="foot"><button class="btn btn-sm" data-stock="${p.id}">${icon('in')} รับเข้า/ปรับยอด</button>
          <button class="btn btn-sm btn-icon" data-edit="${p.id}" aria-label="แก้ไข ${esc(p.name)}" title="แก้ไข">${icon('edit')}</button></div>` : ''}
      </article>`;
    }).join('');
    page.querySelector('#none').innerHTML = list.length ? '' : `<div class="empty">${products.length
      ? 'ไม่พบสินค้าตามเงื่อนไขที่เลือก' : `ยังไม่มีสินค้าในคลัง${admin ? ' กด "เพิ่มสินค้า" เพื่อเริ่ม' : ''}`}</div>`;
    page.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(products.find((x) => x.id == b.dataset.edit), cats, () => render(page)));
    page.querySelectorAll('[data-stock]').forEach((b) => b.onclick = () => adjust(products.find((x) => x.id == b.dataset.stock), () => render(page)));
  };
  ['#s', '#fc', '#fl'].forEach((id) => page.querySelector(id).addEventListener('input', draw));
  draw();
  page.querySelector('#add')?.addEventListener('click', () => edit(null, cats, () => render(page)));
}

async function uploadImage(file) {
  if (file.size > 3 * 1024 * 1024) throw new Error('รูปภาพต้องมีขนาดไม่เกิน 3 MB');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

function edit(p, cats, reload) {
  const v = p || { unit: 'ชิ้น', price: 0, stock_qty: 0, min_qty: 0, is_active: true, category_id: cats[0]?.id };
  const { el, close } = modal({
    title: p ? `แก้ไขสินค้า ${p.name}` : 'เพิ่มสินค้า',
    wide: true,
    body: `<form id="f" novalidate><div style="display:grid;grid-template-columns:200px 1fr;gap:1.25rem" class="pform">
      <div><label>รูปภาพประกอบ</label>
        <div class="product" style="border-style:dashed"><div class="img" id="prev" style="${v.image_url ? `background-image:url('${esc(v.image_url)}')` : ''}">${v.image_url ? '' : icon('image')}</div></div>
        <input type="file" id="img" accept="image/*" style="margin-top:.5rem">
        <div class="hint small muted">ไม่เกิน 3 MB</div></div>
      <div>
        <div class="grid-2">
          <div class="field"><label>ชื่อสินค้า *</label><input name="name" required value="${esc(v.name || '')}"></div>
          <div class="field"><label>รหัสสินค้า</label><input name="sku" value="${esc(v.sku || '')}" placeholder="ไม่บังคับ"></div></div>
        <div class="grid-2">
          <div class="field"><label>ประเภท</label><select name="category_id">${optionList(cats, v.category_id)}</select></div>
          <div class="field"><label>หน่วยนับ</label><input name="unit" list="units" value="${esc(v.unit)}">
            <datalist id="units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></div></div>
        <div class="grid-3">
          <div class="field"><label>ราคา (บาท)</label><input name="price" type="number" min="0" step="0.01" value="${esc(v.price)}"></div>
          <div class="field"><label>${p ? 'คงเหลือ' : 'จำนวนเริ่มต้น'}</label>
            <input name="stock_qty" type="number" min="0" step="0.01" value="${esc(v.stock_qty)}" ${p ? 'disabled' : ''}>
            ${p ? '<div class="hint">แก้ยอดผ่านปุ่ม "รับเข้า/ปรับยอด"</div>' : ''}</div>
          <div class="field"><label>แจ้งเตือนเมื่อเหลือ ≤</label><input name="min_qty" type="number" min="0" step="0.01" value="${esc(v.min_qty)}"></div></div>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="is_active" style="width:auto" ${v.is_active ? 'checked' : ''}> เปิดให้เลือกในใบส่งสินค้า</label>
      </div></div></form>
      <style>@media(max-width:600px){.pform{grid-template-columns:1fr!important}}</style>`,
    foot: `${p ? `<button class="btn" data-hist>ประวัติสต็อก</button><button class="btn btn-danger" data-del>${icon('trash')} ลบ</button><span class="spacer"></span>` : ''}
      <button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" data-save>บันทึกสินค้า</button>`,
  });
  let file = null;
  el.querySelector('#img').addEventListener('change', (e) => {
    file = e.target.files[0] || null;
    const prev = el.querySelector('#prev');
    if (file) { prev.style.backgroundImage = `url('${URL.createObjectURL(file)}')`; prev.innerHTML = ''; }
  });
  el.querySelector('[data-save]').onclick = (ev) => busy(ev.currentTarget, async () => {
    const f = formData(el.querySelector('#f'));
    if (!f.name?.trim()) return toast('กรุณากรอกชื่อสินค้า', 'error');
    try {
      const row = {
        name: f.name.trim(), sku: f.sku?.trim() || null, category_id: f.category_id || null,
        unit: f.unit?.trim() || 'ชิ้น', price: Number(f.price || 0), min_qty: Number(f.min_qty || 0), is_active: !!f.is_active,
      };
      if (file) row.image_url = await uploadImage(file);
      if (p) await q(sb.from('products').update(row).eq('id', p.id));
      else {
        const created = await q(sb.from('products').insert(row).select('id').single());
        const init = Number(f.stock_qty || 0);
        if (init > 0) await q(sb.rpc('adjust_stock', { p_product_id: created.id, p_change: init, p_reason: 'ยอดยกมา' }));
      }
      invalidate('products'); toast('บันทึกสินค้าแล้ว', 'ok'); close(); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
  el.querySelector('[data-hist]')?.addEventListener('click', () => history(p));
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!await confirmDialog(`ลบสินค้า "${p.name}"? หากเคยจ่ายไปสาขาแล้วจะลบไม่ได้ ให้ปิดการใช้งานแทน`, { ok: 'ลบสินค้า', danger: true })) return;
    try { await q(sb.from('products').delete().eq('id', p.id)); invalidate('products'); toast('ลบสินค้าแล้ว', 'ok'); close(); reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  });
}

function adjust(p, reload) {
  const { el, close } = modal({
    title: `รับเข้า/ปรับยอด: ${p.name}`,
    body: `<p class="muted" style="margin-top:0">คงเหลือปัจจุบัน <b class="num">${fmtNum(p.stock_qty)}</b> ${esc(p.unit)}</p>
      <form id="f"><div class="field"><label>ประเภทรายการ</label><select name="type">
        <option value="in">รับสินค้าเข้าคลัง (+)</option><option value="out">ตัดออก เช่น ชำรุด/สูญหาย (−)</option></select></div>
      <div class="field"><label>จำนวน (${esc(p.unit)})</label><input name="qty" type="number" min="0.01" step="0.01" required></div>
      <div class="field"><label>หมายเหตุ</label><input name="reason" placeholder="เช่น รับจากผู้ขาย / ชำรุด"></div></form>`,
    foot: `<button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" data-save>บันทึกยอด</button>`,
  });
  el.querySelector('[data-save]').onclick = (ev) => busy(ev.currentTarget, async () => {
    const f = formData(el.querySelector('#f'));
    const n = Number(f.qty);
    if (!(n > 0)) return toast('กรุณากรอกจำนวนมากกว่า 0', 'error');
    const change = f.type === 'out' ? -n : n;
    try {
      const left = await q(sb.rpc('adjust_stock', { p_product_id: p.id, p_change: change,
        p_reason: f.reason || (change > 0 ? 'รับเข้าคลัง' : 'ตัดออก') }));
      invalidate('products'); toast(`บันทึกแล้ว คงเหลือ ${fmtNum(left)} ${p.unit}`, 'ok'); close(); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

async function history(p) {
  const rows = await q(sb.from('stock_movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(100));
  modal({
    title: `ประวัติสต็อก: ${p.name}`, wide: true,
    body: rows.length ? `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>รายการ</th><th class="r">จำนวน (${esc(p.unit)})</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${fmtDateTime(r.created_at)}</td><td>${esc(r.reason)}</td>
        <td class="r num" style="color:${r.change_qty < 0 ? 'var(--danger)' : 'var(--ok)'}">${r.change_qty > 0 ? '+' : ''}${fmtNum(r.change_qty)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">ยังไม่มีการเคลื่อนไหวของสต็อก</div>',
  });
}
