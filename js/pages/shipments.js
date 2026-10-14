// เมนูรับส่งสินค้า: สร้าง/แก้ไขใบส่ง เปลี่ยนสถานะ ยืนยันส่งแล้ว (ตัดสต็อก) PDF และแชร์ LINE
import { sb, q, isAdmin, getBranches, getProducts, invalidate } from '../store.js';
import {
  esc, icon, modal, toast, errMsg, busy, confirmDialog, optionList, fmtMoney, fmtNum, fmtDate, fmtDateTime,
  statusBadge, STATUS, todayISO,
} from '../ui.js';
import { htmlToPdfBlob, shipmentHTML, shipmentText, shareToLine } from '../pdf.js';
import { downloadBlob } from '../ui.js';

const sum = (items) => items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);

export async function render(page) {
  const admin = isAdmin();
  const [list, branches] = await Promise.all([
    q(sb.from('shipments').select('*, branches(name), shipment_items(qty, unit_price)')
      .order('created_at', { ascending: false }).limit(1000)),
    getBranches(),
  ]);
  const counts = list.reduce((c, s) => ({ ...c, [s.status]: (c[s.status] || 0) + 1 }), {});
  let tab = new URLSearchParams(location.hash.split('?')[1]).get('status') || (counts.shipping ? 'shipping' : '');

  page.innerHTML = `<div class="page-head"><div><h1>รับส่งสินค้า</h1>
      <p>ใบส่งสินค้าที่ยืนยัน "ส่งแล้ว" จะตัดยอดสต็อกออกจากคลังอัตโนมัติ</p></div>
    ${admin ? `<div class="actions"><button class="btn btn-primary" id="add">${icon('plus')} สร้างใบส่งสินค้า</button></div>` : ''}</div>
    <div class="filters tabs" role="tablist" id="tabs"></div>
    <div class="filters">
      <input type="search" id="s" placeholder="ค้นหาเลขที่เอกสาร หรือหมายเหตุ" aria-label="ค้นหา">
      ${admin ? `<select id="fb" aria-label="สาขา">${optionList(branches, '', { empty: 'ทุกสาขา' })}</select>` : ''}
      <input type="month" id="fm" aria-label="เดือน" title="เดือนที่ส่ง">
    </div>
    <div class="panel"><div class="table-wrap"><table>
      <thead><tr><th>เลขที่</th><th>วันที่ส่ง</th><th>สาขา</th><th class="r">รายการ</th><th class="r">มูลค่า (บาท)</th><th>สถานะ</th><th></th></tr></thead>
      <tbody id="rows"></tbody></table></div><div id="none"></div></div>`;

  const tabs = [['', 'ทั้งหมด', list.length], ...Object.entries(STATUS).map(([k, v]) => [k, v.label, counts[k] || 0])];
  const drawTabs = () => {
    page.querySelector('#tabs').innerHTML = tabs.map(([k, l, n]) =>
      `<button class="btn btn-sm ${tab === k ? 'btn-primary' : ''}" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l} <span class="num">${n}</span></button>`).join('');
    page.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; drawTabs(); draw(); });
  };

  const draw = () => {
    const s = page.querySelector('#s').value.trim().toLowerCase();
    const fb = page.querySelector('#fb')?.value || '', fm = page.querySelector('#fm').value;
    const rows = list.filter((x) => (!tab || x.status === tab) && (!fb || String(x.branch_id) === fb) &&
      (!fm || x.ship_date.startsWith(fm)) && (!s || `${x.doc_no} ${x.note || ''}`.toLowerCase().includes(s)));
    page.querySelector('#rows').innerHTML = rows.map((x) => `<tr class="clickable" data-id="${x.id}" tabindex="0">
      <td class="num"><b>${esc(x.doc_no)}</b></td><td>${fmtDate(x.ship_date)}</td><td>${esc(x.branches?.name)}</td>
      <td class="r num">${x.shipment_items.length}</td><td class="r num">${fmtMoney(sum(x.shipment_items))}</td>
      <td>${statusBadge(x.status)}</td><td class="r"><span class="btn btn-sm">เปิด</span></td></tr>`).join('');
    page.querySelector('#none').innerHTML = rows.length ? '' : `<div class="empty">${list.length
      ? 'ไม่มีใบส่งสินค้าตามเงื่อนไขที่เลือก' : `ยังไม่มีใบส่งสินค้า${admin ? `<br><button class="btn btn-primary" id="add2">${icon('plus')} สร้างใบส่งสินค้าใบแรก</button>` : ''}`}</div>`;
    page.querySelector('#add2')?.addEventListener('click', () => editor(null, reload));
    page.querySelectorAll('tr[data-id]').forEach((tr) => {
      const open = () => detail(Number(tr.dataset.id), reload);
      tr.onclick = open; tr.onkeydown = (e) => { if (e.key === 'Enter') open(); };
    });
  };
  const reload = () => render(page);
  ['#s', '#fb', '#fm'].forEach((id) => page.querySelector(id)?.addEventListener('input', draw));
  drawTabs(); draw();
  page.querySelector('#add')?.addEventListener('click', () => editor(null, reload));
}

async function loadFull(id) {
  return q(sb.from('shipments')
    .select('*, branches(*), shipment_items(id, product_id, qty, unit_price, products(name, unit, stock_qty))')
    .eq('id', id).single());
}

// ---------------- รายละเอียดใบส่ง ----------------
async function detail(id, reload) {
  let s;
  try { s = await loadFull(id); } catch (e) { return toast(errMsg(e), 'error'); }
  const admin = isAdmin(), items = s.shipment_items;
  const shortItems = items.filter((i) => Number(i.products?.stock_qty) < Number(i.qty));
  const step = (k, label) => {
    const order = ['draft', 'shipping', 'delivered'], cur = order.indexOf(s.status), me = order.indexOf(k);
    return `<div class="step ${s.status !== 'cancelled' && me <= cur ? 'done' : ''} ${s.status === k && k === 'shipping' ? 'now' : ''}">${label}</div>`;
  };
  const canConfirm = ['draft', 'shipping'].includes(s.status) && (admin || s.status === 'shipping');

  const btn = [];
  if (admin && ['draft', 'shipping'].includes(s.status)) btn.push(`<button class="btn" data-a="edit">${icon('edit')} แก้ไข</button>`);
  if (admin && s.status === 'draft') btn.push(`<button class="btn" data-a="ship">${icon('truck')} เริ่มจัดส่ง</button>`);
  if (canConfirm) btn.push(`<button class="btn btn-ok" data-a="confirm">${icon('check')} ${admin ? 'ยืนยันส่งแล้ว' : 'ยืนยันรับสินค้าแล้ว'}</button>`);
  if (admin && s.status === 'delivered') btn.push(`<button class="btn btn-danger" data-a="revert">${icon('undo')} ยกเลิกการยืนยัน</button>`);
  if (admin && ['draft', 'shipping'].includes(s.status)) btn.push(`<button class="btn btn-danger" data-a="cancel">ยกเลิกใบส่ง</button>`);
  if (admin && s.status === 'cancelled') btn.push(`<button class="btn" data-a="reopen">${icon('undo')} เปิดเป็นร่างอีกครั้ง</button>`);
  if (admin && ['draft', 'cancelled'].includes(s.status)) btn.push(`<button class="btn btn-danger" data-a="delete">${icon('trash')} ลบ</button>`);

  const { el, close } = modal({
    title: `ใบส่งสินค้า ${s.doc_no}`, wide: true,
    body: `${s.status === 'cancelled' ? '<div class="notice err" style="margin-bottom:1rem">ใบส่งสินค้านี้ถูกยกเลิก</div>'
        : `<div class="timeline">${step('draft', 'ร่าง')}${step('shipping', 'กำลังจัดส่ง')}${step('delivered', 'ส่งแล้ว · ตัดสต็อก')}</div>`}
      <div class="doc-meta">
        <div><span>สาขาปลายทาง</span><b>${esc(s.branches?.name)}</b></div>
        <div><span>วันที่ส่ง</span>${fmtDate(s.ship_date)}</div>
        <div><span>สถานะ</span>${statusBadge(s.status)}</div>
        <div><span>ยืนยันส่งถึง</span>${s.delivered_at ? fmtDateTime(s.delivered_at) : '-'}</div>
      </div>
      ${shortItems.length && s.status !== 'delivered' ? `<div class="notice err" style="margin-bottom:1rem">สต็อกไม่พอสำหรับ ${shortItems.map((i) => esc(i.products.name)).join(', ')} ต้องรับสินค้าเข้าคลังก่อนจึงจะยืนยันส่งได้</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>สินค้า</th><th class="r">จำนวน</th><th>หน่วย</th>
        ${s.status !== 'delivered' ? '<th class="r">คงเหลือในคลัง</th>' : ''}<th class="r">ราคา/หน่วย</th><th class="r">จำนวนเงิน</th></tr></thead>
      <tbody>${items.map((i) => `<tr><td>${esc(i.products?.name)}</td><td class="r num">${fmtNum(i.qty)}</td><td>${esc(i.products?.unit)}</td>
        ${s.status !== 'delivered' ? `<td class="r num" style="${Number(i.products?.stock_qty) < Number(i.qty) ? 'color:var(--danger);font-weight:600' : ''}">${fmtNum(i.products?.stock_qty)}</td>` : ''}
        <td class="r num">${fmtMoney(i.unit_price)}</td><td class="r num">${fmtMoney(i.qty * i.unit_price)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${s.status !== 'delivered' ? 5 : 4}" class="r">รวมทั้งสิ้น (บาท)</td><td class="r num">${fmtMoney(sum(items))}</td></tr></tfoot></table></div>
      ${s.note ? `<p><b>หมายเหตุ:</b> ${esc(s.note)}</p>` : ''}`,
    foot: `${btn.join('')}<span class="spacer"></span>
      <button class="btn" data-a="pdf">${icon('pdf')} บันทึก PDF</button>
      <button class="btn btn-line" data-a="line">${icon('line')} แชร์ LINE</button>`,
  });

  const fname = `ใบส่งสินค้า-${s.doc_no}.pdf`;
  const after = (msg) => { invalidate('products'); toast(msg, 'ok'); close(); reload(); };
  const setStatus = async (status, msg) => {
    try { await q(sb.from('shipments').update({ status }).eq('id', s.id)); after(msg); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const actions = {
    edit: () => { close(); editor(s, reload); },
    ship: () => setStatus('shipping', 'เปลี่ยนสถานะเป็นกำลังจัดส่งแล้ว'),
    cancel: async () => { if (await confirmDialog(`ยกเลิกใบส่งสินค้า ${s.doc_no}?`, { ok: 'ยกเลิกใบส่ง', danger: true })) setStatus('cancelled', 'ยกเลิกใบส่งสินค้าแล้ว'); },
    reopen: () => setStatus('draft', 'เปิดใบส่งสินค้าเป็นร่างแล้ว'),
    confirm: async () => {
      if (!await confirmDialog(`ยืนยันว่าสินค้าในใบ ${s.doc_no} ส่งถึงสาขา ${s.branches?.name} แล้ว? ระบบจะตัดยอดสต็อก ${items.length} รายการ`, { ok: 'ยืนยันส่งแล้ว' })) return;
      try { await q(sb.rpc('confirm_delivery', { p_shipment_id: s.id })); after('ยืนยันส่งแล้ว และตัดยอดสต็อกเรียบร้อย'); }
      catch (e) { toast(errMsg(e), 'error'); }
    },
    revert: async () => {
      if (!await confirmDialog(`ยกเลิกการยืนยันใบ ${s.doc_no}? ระบบจะคืนยอดสต็อก และเปลี่ยนสถานะกลับเป็น "กำลังจัดส่ง" เพื่อแก้ไขได้`, { ok: 'ยกเลิกการยืนยัน', danger: true })) return;
      try { await q(sb.rpc('revert_delivery', { p_shipment_id: s.id })); after('คืนยอดสต็อกแล้ว ใบส่งกลับเป็นกำลังจัดส่ง'); }
      catch (e) { toast(errMsg(e), 'error'); }
    },
    delete: async () => {
      if (!await confirmDialog(`ลบใบส่งสินค้า ${s.doc_no} ถาวร?`, { ok: 'ลบ', danger: true })) return;
      try { await q(sb.from('shipments').delete().eq('id', s.id)); after('ลบใบส่งสินค้าแล้ว'); }
      catch (e) { toast(errMsg(e), 'error'); }
    },
    pdf: async (b) => busy(b, async () => {
      try { downloadBlob(await htmlToPdfBlob(shipmentHTML(s, items, s.branches), fname), fname); }
      catch (e) { toast(errMsg(e), 'error'); }
    }),
    line: async (b) => busy(b, async () => {
      try {
        const blob = await htmlToPdfBlob(shipmentHTML(s, items, s.branches), fname).catch(() => null);
        await shareToLine({ text: shipmentText(s, items, s.branches), pdfBlob: blob, filename: fname });
      } catch (e) { toast(errMsg(e), 'error'); }
    }),
  };
  el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => actions[b.dataset.a](b));
}

// ---------------- สร้าง / แก้ไขใบส่ง ----------------
async function editor(s, reload) {
  invalidate('products');
  const [branches, products] = await Promise.all([getBranches(), getProducts()]);
  const activeBranches = branches.filter((b) => b.is_active || b.id === s?.branch_id);
  const pick = products.filter((p) => p.is_active || s?.shipment_items?.some((i) => i.product_id === p.id));
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const groups = {};
  pick.forEach((p) => { (groups[p.categories?.name || 'ไม่ระบุประเภท'] ??= []).push(p); });
  const productOptions = (sel) => `<option value="">- เลือกสินค้า -</option>` + Object.entries(groups).map(([g, ps]) =>
    `<optgroup label="${esc(g)}">${ps.map((p) => `<option value="${p.id}" ${p.id == sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('');

  let lines = s ? s.shipment_items.map((i) => ({ product_id: i.product_id, qty: Number(i.qty), unit_price: Number(i.unit_price) }))
    : [{ product_id: '', qty: 1, unit_price: 0 }];

  if (!activeBranches.length) return toast('ยังไม่มีสาขา กรุณาเพิ่มสาขาที่เมนู "สาขา" ก่อน', 'error');
  if (!pick.length) return toast('ยังไม่มีสินค้า กรุณาเพิ่มสินค้าที่เมนู "สินค้าและสต็อก" ก่อน', 'error');

  const { el, close } = modal({
    title: s ? `แก้ไขใบส่งสินค้า ${s.doc_no}` : 'สร้างใบส่งสินค้า', wide: true,
    body: `<div class="grid-3">
        <div class="field"><label>สาขาปลายทาง *</label><select id="branch">${optionList(activeBranches, s?.branch_id, { empty: '- เลือกสาขา -' })}</select></div>
        <div class="field"><label>วันที่ส่ง</label><input type="date" id="date" value="${esc(s?.ship_date || todayISO())}"></div>
        <div class="field"><label>หมายเหตุ</label><input id="note" value="${esc(s?.note || '')}"></div></div>
      <div class="table-wrap"><table class="items"><thead><tr><th>สินค้า</th><th>จำนวน</th><th>ราคา/หน่วย</th><th class="r">รวม</th><th></th></tr></thead>
        <tbody id="lines"></tbody>
        <tfoot><tr><td colspan="3"><button class="btn btn-sm" id="addLine" type="button">${icon('plus')} เพิ่มรายการ</button></td>
          <td class="r num" id="total"></td><td></td></tr></tfoot></table></div>`,
    foot: `<button class="btn" data-close>ยกเลิก</button>
      <button class="btn" data-save="draft">บันทึกร่าง</button>
      <button class="btn" data-save="shipping">${icon('truck')} บันทึกและเริ่มจัดส่ง</button>
      <button class="btn btn-ok" data-save="delivered">${icon('check')} บันทึกและยืนยันส่งแล้ว</button>`,
  });

  const tbody = el.querySelector('#lines');
  // การแทนที่แถวขณะช่องกรอกมีโฟกัสจะเกิด change ซ้อน จึงกันการวาดซ้อนและวาดใหม่อีกรอบหลังจบ
  let drawing = false, again = false;
  const drawLines = () => {
    if (drawing) { again = true; return; }
    drawing = true;
    try { renderLines(); } finally { drawing = false; }
    if (again) { again = false; queueMicrotask(drawLines); }
  };
  const renderLines = () => {
    tbody.innerHTML = lines.map((l, i) => {
      const p = byId[l.product_id];
      const short = p && Number(l.qty) > Number(p.stock_qty);
      return `<tr data-i="${i}">
        <td style="min-width:220px"><select data-f="product_id" aria-label="สินค้า">${productOptions(l.product_id)}</select>
          ${p ? `<div class="stock-hint ${short ? 'short' : ''}">คงเหลือ ${fmtNum(p.stock_qty)} ${esc(p.unit)}${short ? ' · ไม่พอส่ง' : ''}</div>` : ''}</td>
        <td><input class="qty" data-f="qty" type="number" min="0.01" step="0.01" value="${l.qty}" aria-label="จำนวน"></td>
        <td><input class="price" data-f="unit_price" type="number" min="0" step="0.01" value="${l.unit_price}" aria-label="ราคาต่อหน่วย"></td>
        <td class="r num">${fmtMoney(l.qty * l.unit_price)}</td>
        <td><button class="btn btn-ghost btn-icon" data-rm type="button" aria-label="ลบรายการ">${icon('trash')}</button></td></tr>`;
    }).join('');
    el.querySelector('#total').textContent = fmtMoney(lines.reduce((t, l) => t + l.qty * l.unit_price, 0));
  };
  tbody.addEventListener('change', (e) => {
    const tr = e.target.closest('tr'), i = Number(tr.dataset.i), f = e.target.dataset.f;
    if (!f) return;
    if (f === 'product_id') {
      lines[i].product_id = e.target.value ? Number(e.target.value) : '';
      lines[i].unit_price = Number(byId[lines[i].product_id]?.price || 0);
    } else lines[i][f] = Number(e.target.value || 0);
    drawLines();
  });
  tbody.addEventListener('click', (e) => {
    if (!e.target.closest('[data-rm]')) return;
    lines.splice(Number(e.target.closest('tr').dataset.i), 1);
    if (!lines.length) lines.push({ product_id: '', qty: 1, unit_price: 0 });
    drawLines();
  });
  el.querySelector('#addLine').onclick = () => { lines.push({ product_id: '', qty: 1, unit_price: 0 }); drawLines(); };
  drawLines();

  el.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => busy(b, async () => {
    const target = b.dataset.save;
    const branch = el.querySelector('#branch').value;
    const valid = lines.filter((l) => l.product_id);
    if (!branch) return toast('กรุณาเลือกสาขาปลายทาง', 'error');
    if (!valid.length) return toast('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ', 'error');
    if (valid.some((l) => !(l.qty > 0))) return toast('จำนวนสินค้าต้องมากกว่า 0', 'error');
    if (target === 'delivered') {
      const short = valid.filter((l) => l.qty > Number(byId[l.product_id].stock_qty));
      if (short.length) return toast(`สต็อกไม่พอ: ${short.map((l) => byId[l.product_id].name).join(', ')}`, 'error');
      const bn = activeBranches.find((x) => x.id == branch)?.name;
      if (!await confirmDialog(`ยืนยันส่งสินค้า ${valid.length} รายการไปสาขา ${bn} แล้ว? ระบบจะตัดยอดสต็อกทันที`, { ok: 'ยืนยันส่งแล้ว' })) return;
    }
    try {
      const id = await q(sb.rpc('save_shipment', {
        p_id: s?.id ?? null, p_branch_id: Number(branch), p_ship_date: el.querySelector('#date').value || null,
        p_note: el.querySelector('#note').value || null, p_status: target === 'delivered' ? 'shipping' : target,
        p_items: valid.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })),
      }));
      if (target === 'delivered') await q(sb.rpc('confirm_delivery', { p_shipment_id: id }));
      invalidate('products');
      toast(target === 'delivered' ? 'บันทึกและตัดยอดสต็อกแล้ว' : target === 'shipping' ? 'บันทึกแล้ว สถานะกำลังจัดส่ง' : 'บันทึกร่างแล้ว', 'ok');
      close(); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  }));
}
