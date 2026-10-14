// ภาพรวม
import { sb, q, state, isAdmin } from '../store.js';
import { esc, icon, fmtNum, fmtMoney, fmtDate, statusBadge, monthKey } from '../ui.js';

export async function render(page) {
  const admin = isAdmin();
  const mk = monthKey(new Date());
  const [products, shipments, lines] = await Promise.all([
    q(sb.from('products').select('id, name, unit, stock_qty, min_qty, is_active').eq('is_active', true)),
    q(sb.from('shipments').select('id, doc_no, status, ship_date, branches(name)').order('created_at', { ascending: false }).limit(200)),
    q(sb.from('v_dispatch_lines').select('amount, month').eq('month', mk)),
  ]);
  const low = products.filter((p) => Number(p.stock_qty) <= Number(p.min_qty))
    .sort((a, b) => Number(a.stock_qty) - Number(b.stock_qty));
  const shipping = shipments.filter((s) => s.status === 'shipping');
  const drafts = shipments.filter((s) => s.status === 'draft');
  const monthValue = lines.reduce((s, l) => s + Number(l.amount), 0);
  const p = state.profile;

  page.innerHTML = `<div class="page-head"><div><h1>${p.full_name === 'โหมดทดสอบ' ? 'ภาพรวม' : `สวัสดี ${esc(p.full_name || '')}`}</h1>
      <p>${admin ? 'ภาพรวมคลังสินค้าและการจ่ายสินค้าไปสาขา' : `สาขา ${esc(p.branches?.name || '')}`} · ${fmtDate(new Date())}</p></div>
    ${admin ? `<div class="actions"><a class="btn btn-primary" href="#/shipments">${icon('truck')} ไปที่รับส่งสินค้า</a></div>` : ''}</div>
    <div class="stats">
      <div class="stat"><div class="v num">${fmtNum(shipping.length)}</div><div class="l">ใบส่งกำลังจัดส่ง</div></div>
      <div class="stat"><div class="v num">${fmtNum(drafts.length)}</div><div class="l">ใบส่งฉบับร่าง</div></div>
      <div class="stat"><div class="v num">${fmtMoney(monthValue)}</div><div class="l">มูลค่าที่ส่งแล้วเดือนนี้ (บาท)</div></div>
      <div class="stat ${low.length ? 'alert' : ''}"><div class="v num">${fmtNum(low.length)}</div><div class="l">สินค้าใกล้หมด</div></div>
    </div>
    <div class="two-col">
      <div class="panel"><div class="panel-head"><h2>${admin ? 'รอดำเนินการ' : 'สินค้าที่กำลังส่งมาที่สาขา'}</h2>
        <a href="#/shipments" class="small">ดูทั้งหมด</a></div>
        ${[...shipping, ...(admin ? drafts : [])].length ? `<div class="table-wrap"><table><tbody>
          ${[...shipping, ...(admin ? drafts : [])].slice(0, 10).map((s) => `<tr><td class="num"><b>${esc(s.doc_no)}</b></td>
            <td>${esc(s.branches?.name)}</td><td>${fmtDate(s.ship_date)}</td><td class="r">${statusBadge(s.status)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">ไม่มีใบส่งที่ค้างอยู่</div>'}</div>
      <div class="panel"><div class="panel-head"><h2>สินค้าใกล้หมด</h2><a href="#/products" class="small">ดูสต็อก</a></div>
        ${low.length ? `<div class="table-wrap"><table><tbody>${low.slice(0, 10).map((x) => `<tr><td>${esc(x.name)}</td>
          <td class="r num" style="color:var(--danger)"><b>${fmtNum(x.stock_qty)}</b> ${esc(x.unit)}</td>
          <td class="r small muted">ขั้นต่ำ ${fmtNum(x.min_qty)}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">สต็อกทุกรายการอยู่ในระดับปกติ</div>'}</div>
    </div>`;
}
