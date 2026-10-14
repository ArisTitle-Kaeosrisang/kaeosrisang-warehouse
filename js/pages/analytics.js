// วิเคราะห์แนวโน้มปริมาณการใช้สินค้าของแต่ละสาขา
// ใช้ข้อมูลใบส่งที่ "ส่งแล้ว" รายเดือน คำนวณเส้นแนวโน้ม (linear regression) และพยากรณ์เดือนถัดไป
import { sb, q, getProducts, getCategories, invalidate } from '../store.js';
import { esc, toast, errMsg, fmtNum, fmtMoney, fmtMonth, monthKey } from '../ui.js';
import { drawChart, SERIES, linearTrend } from '../charts.js';

function lastMonths(n) {
  const out = [], d = new Date();
  d.setDate(1);
  for (let i = n; i >= 1; i--) out.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  return out;
}

function trendLabel(t) {
  if (!t.mean) return { txt: 'ไม่มีข้อมูล', cls: 'trend-flat', pct: 0 };
  const pct = (t.slope / t.mean) * 100;
  if (pct > 5) return { txt: `▲ เพิ่มขึ้น ${pct.toFixed(1)}%/เดือน`, cls: 'trend-up', pct };
  if (pct < -5) return { txt: `▼ ลดลง ${Math.abs(pct).toFixed(1)}%/เดือน`, cls: 'trend-down', pct };
  return { txt: '● คงที่', cls: 'trend-flat', pct };
}

export async function render(page) {
  invalidate('products');
  const [products, cats] = await Promise.all([getProducts(), getCategories()]);
  page.innerHTML = `<div class="page-head"><div><h1>แนวโน้มการใช้สินค้า</h1>
      <p>คำนวณจากสินค้าที่ส่งถึงสาขาแล้ว รายเดือน ใช้เดือนที่ครบเดือนเป็นฐาน และพยากรณ์เดือนนี้</p></div></div>
    <div class="filters">
      <select id="metric" aria-label="สิ่งที่วิเคราะห์">
        <option value="">มูลค่าสินค้าทั้งหมด (บาท)</option>
        <optgroup label="มูลค่าตามประเภท (บาท)">${cats.map((c) => `<option value="c:${c.id}">${esc(c.name)}</option>`).join('')}</optgroup>
        <optgroup label="ปริมาณรายสินค้า">${products.map((p) => `<option value="p:${p.id}">${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</optgroup>
      </select>
      <select id="range" aria-label="ช่วงเวลา"><option value="6">6 เดือนล่าสุด</option><option value="12" selected>12 เดือนล่าสุด</option><option value="24">24 เดือนล่าสุด</option></select>
    </div><div id="out"><div class="empty">กำลังวิเคราะห์…</div></div>`;

  let data = [], months = [], cur = monthKey(new Date());
  const load = async () => {
    months = lastMonths(Number(page.querySelector('#range').value));
    const [y, m] = months[0].split('-').map(Number);
    try {
      data = await q(sb.from('v_dispatch_lines').select('branch_id, branch_name, month, product_id, category_id, qty, amount')
        .gte('delivered_at', new Date(y, m - 1, 1).toISOString()).limit(50000));
    } catch (e) { return toast(errMsg(e), 'error'); }
    draw();
  };

  const draw = () => {
    const out = page.querySelector('#out');
    const metric = page.querySelector('#metric').value;
    const [kind, mid] = metric.split(':');
    const isQty = kind === 'p';
    const unit = isQty ? products.find((p) => p.id == mid)?.unit : 'บาท';
    const rows = data.filter((d) => !kind || (kind === 'c' ? d.category_id == mid : d.product_id == mid));
    const val = (d) => Number(isQty ? d.qty : d.amount);

    const branches = [...new Map(data.map((d) => [d.branch_id, d.branch_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'));
    if (!data.length) { out.innerHTML = '<div class="panel"><div class="empty">ยังไม่มีข้อมูลการส่งสินค้าในช่วงนี้ เมื่อมีใบส่งที่ยืนยัน "ส่งแล้ว" ระบบจะแสดงแนวโน้มที่นี่</div></div>'; return; }

    const series = branches.map(([id, name]) => {
      const byM = {};
      rows.filter((d) => d.branch_id === id).forEach((d) => { byM[d.month] = (byM[d.month] || 0) + val(d); });
      const ys = months.map((mm) => byM[mm] || 0);
      const t = linearTrend(ys);
      const last3 = ys.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, ys.length);
      return { id, name, ys, t, label: trendLabel(t), mtd: byM[cur] || 0, last3, total: ys.reduce((a, b) => a + b, 0) };
    });
    const fmt = isQty ? fmtNum : fmtMoney;

    // สรุปสาขาที่โตเร็วที่สุด / ลดลงมากที่สุด
    const active = series.filter((s) => s.total > 0);
    const up = [...active].sort((a, b) => b.label.pct - a.label.pct)[0];
    const down = [...active].sort((a, b) => a.label.pct - b.label.pct)[0];

    out.innerHTML = `${active.length ? `<div class="panel" style="margin-bottom:1.25rem"><div class="panel-body">
        <p style="margin:0">${up && up.label.pct > 5 ? `สาขา <b>${esc(up.name)}</b> ใช้เพิ่มขึ้นเร็วที่สุด (${up.label.pct.toFixed(1)}% ต่อเดือน)` : 'ไม่มีสาขาที่การใช้เพิ่มขึ้นอย่างชัดเจน'}
        ${down && down.label.pct < -5 ? ` ส่วนสาขา <b>${esc(down.name)}</b> ใช้ลดลงมากที่สุด (${Math.abs(down.label.pct).toFixed(1)}% ต่อเดือน)` : ''}
        · คาดว่าเดือนนี้ทุกสาขารวมจะใช้ประมาณ <b class="num">${fmt(active.reduce((s, x) => s + x.t.next, 0))}</b> ${esc(unit)}</p></div></div>` : ''}
      <div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>การใช้รายเดือนแยกสาขา (${esc(unit)})</h2></div>
        <div class="panel-body"><div class="chart-box"><canvas id="c" aria-label="กราฟแนวโน้มการใช้สินค้ารายเดือนแยกสาขา"></canvas></div></div></div>
      <div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>แนวโน้มรายสาขา</h2></div><div class="table-wrap"><table>
        <thead><tr><th>สาขา</th><th class="r">เฉลี่ย/เดือน</th><th class="r">เฉลี่ย 3 เดือนล่าสุด</th><th>แนวโน้ม</th>
          <th class="r">พยากรณ์เดือนนี้</th><th class="r">ใช้ไปแล้วเดือนนี้</th><th class="r">ความเชื่อมั่น</th></tr></thead>
        <tbody>${series.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="r num">${fmt(s.t.mean)}</td><td class="r num">${fmt(s.last3)}</td>
          <td class="${s.label.cls}">${s.label.txt}</td><td class="r num"><b>${fmt(s.t.next)}</b></td>
          <td class="r num">${fmt(s.mtd)}${s.t.next ? ` <span class="small muted">(${Math.round((s.mtd / s.t.next) * 100)}%)</span>` : ''}</td>
          <td class="r">${s.total ? (s.t.r2 >= .6 ? 'สูง' : s.t.r2 >= .3 ? 'ปานกลาง' : 'ต่ำ') : '-'}</td></tr>`).join('')}</tbody></table></div>
        <div class="panel-body small muted">ความเชื่อมั่นมาจากค่า R² ของเส้นแนวโน้ม: ถ้าการใช้แต่ละเดือนขึ้นลงไม่สม่ำเสมอ ค่าพยากรณ์จะคลาดเคลื่อนได้มาก</div></div>
      <div class="panel"><div class="panel-head"><h2>สินค้าที่ควรเตรียมสต็อกสำหรับเดือนนี้</h2></div><div class="table-wrap" id="reorder"></div></div>`;

    drawChart(out.querySelector('#c'), {
      type: 'line',
      data: {
        labels: [...months.map(fmtMonth), `${fmtMonth(cur)} (คาด)`],
        datasets: series.map((s, i) => ({
          label: s.name, data: [...s.ys, s.t.next], borderColor: SERIES[i % SERIES.length], backgroundColor: SERIES[i % SERIES.length],
          tension: .25, pointRadius: 3, borderWidth: 2,
          segment: { borderDash: (c) => (c.p1DataIndex === months.length ? [5, 4] : undefined) },
        })),
      },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtNum(v) } }, x: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw)} ${unit}` } } } },
    });

    // พยากรณ์รายสินค้า (ทุกสาขารวม) เทียบสต็อกคงเหลือ
    const byP = {};
    data.forEach((d) => { byP[d.product_id] ??= {}; byP[d.product_id][d.month] = (byP[d.product_id][d.month] || 0) + Number(d.qty); });
    const reorder = products.filter((p) => byP[p.id]).map((p) => {
      const ys = months.map((mm) => byP[p.id][mm] || 0), t = linearTrend(ys);
      const remain = Math.max(0, t.next - (byP[p.id][cur] || 0));
      return { p, t, remain, short: remain - Number(p.stock_qty), label: trendLabel(t) };
    }).sort((a, b) => b.short - a.short);
    out.querySelector('#reorder').innerHTML = reorder.length ? `<table><thead><tr><th>สินค้า</th><th>แนวโน้ม</th><th class="r">พยากรณ์ทั้งเดือน</th>
        <th class="r">ยังต้องจ่ายอีก</th><th class="r">คงเหลือในคลัง</th><th class="r">ควรรับเข้าเพิ่ม</th></tr></thead>
      <tbody>${reorder.map((r) => `<tr><td>${esc(r.p.name)}</td><td class="${r.label.cls}">${r.label.txt}</td>
        <td class="r num">${fmtNum(r.t.next)}</td><td class="r num">${fmtNum(r.remain)}</td><td class="r num">${fmtNum(r.p.stock_qty)}</td>
        <td class="r num">${r.short > 0 ? `<b style="color:var(--danger)">${fmtNum(Math.ceil(r.short))} ${esc(r.p.unit)}</b>` : '<span class="muted">พอ</span>'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">ยังไม่มีข้อมูลพอสำหรับพยากรณ์</div>';
  };

  page.querySelector('#metric').addEventListener('change', draw);
  page.querySelector('#range').addEventListener('change', load);
  load();
}
