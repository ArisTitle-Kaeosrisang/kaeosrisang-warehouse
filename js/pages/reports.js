// สรุปปริมาณสินค้าที่จ่ายไปยังสาขาต่างๆ (นับเฉพาะใบส่งที่ "ส่งแล้ว")
import { sb, q, isAdmin, getBranches, getCategories } from '../store.js';
import { esc, icon, toast, errMsg, busy, optionList, fmtMoney, fmtNum, fmtDate, todayISO, downloadBlob, toCSV } from '../ui.js';
import { drawChart, SERIES } from '../charts.js';
import { htmlToPdfBlob, pdfHeader } from '../pdf.js';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d; };

export async function render(page) {
  const admin = isAdmin();
  const [branches, cats] = await Promise.all([getBranches(), getCategories()]);
  const t = todayISO();
  page.innerHTML = `<div class="page-head"><div><h1>สรุปการจ่ายสินค้า</h1>
      <p>ปริมาณและมูลค่าสินค้าที่ส่งถึงแต่ละสาขา นับเฉพาะใบส่งที่ยืนยัน "ส่งแล้ว"</p></div>
    <div class="actions"><button class="btn" id="csv">${icon('download')} CSV</button>
      <button class="btn" id="pdf">${icon('pdf')} บันทึก PDF</button></div></div>
    <div class="filters">
      <label class="small" style="display:flex;align-items:center;gap:.4rem;margin:0">ตั้งแต่ <input type="date" id="from" value="${t.slice(0, 8)}01"></label>
      <label class="small" style="display:flex;align-items:center;gap:.4rem;margin:0">ถึง <input type="date" id="to" value="${t}"></label>
      ${admin ? `<select id="fb" aria-label="สาขา">${optionList(branches, '', { empty: 'ทุกสาขา' })}</select>` : ''}
      <select id="fc" aria-label="ประเภท">${optionList(cats, '', { empty: 'ทุกประเภท' })}</select>
      <select id="preset" aria-label="ช่วงเวลาสำเร็จรูป"><option value="">ช่วงเวลา…</option><option value="m0">เดือนนี้</option>
        <option value="m1">เดือนที่แล้ว</option><option value="q">3 เดือนล่าสุด</option><option value="y">ปีนี้</option></select>
    </div>
    <div id="out"><div class="empty">กำลังโหลด…</div></div>`;

  let data = [], ctx = {};
  const load = async () => {
    const from = page.querySelector('#from').value, to = page.querySelector('#to').value;
    const fb = page.querySelector('#fb')?.value, fc = page.querySelector('#fc').value;
    if (!from || !to) return;
    let qq = sb.from('v_dispatch_lines').select('*')
      .gte('delivered_at', new Date(from + 'T00:00:00').toISOString())
      .lt('delivered_at', addDays(to, 1).toISOString()).limit(20000);
    if (fb) qq = qq.eq('branch_id', fb);
    if (fc) qq = qq.eq('category_id', fc);
    try { data = await q(qq); } catch (e) { return toast(errMsg(e), 'error'); }
    ctx = { from, to, branch: branches.find((b) => b.id == fb)?.name, cat: cats.find((c) => c.id == fc)?.name };
    draw();
  };

  const draw = () => {
    const out = page.querySelector('#out');
    if (!data.length) {
      out.innerHTML = '<div class="panel"><div class="empty">ไม่มีสินค้าที่ส่งถึงสาขาในช่วงเวลานี้ ลองขยายช่วงวันที่</div></div>';
      return;
    }
    const bs = [...new Map(data.map((d) => [d.branch_id, d.branch_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'));
    const cs = [...new Set(data.map((d) => d.category_name))];
    const total = data.reduce((s, d) => s + Number(d.amount), 0);
    const docs = new Set(data.map((d) => d.shipment_id)).size;

    // มูลค่า สาขา × ประเภท
    const val = {};
    data.forEach((d) => { val[d.branch_id] ??= {}; val[d.branch_id][d.category_name] = (val[d.branch_id][d.category_name] || 0) + Number(d.amount); });
    // ปริมาณ สินค้า × สาขา
    const prod = new Map();
    data.forEach((d) => {
      const p = prod.get(d.product_id) || { name: d.product_name, unit: d.unit, cat: d.category_name, by: {}, qty: 0, amount: 0 };
      p.by[d.branch_id] = (p.by[d.branch_id] || 0) + Number(d.qty);
      p.qty += Number(d.qty); p.amount += Number(d.amount);
      prod.set(d.product_id, p);
    });
    const prods = [...prod.values()].sort((a, b) => a.cat.localeCompare(b.cat, 'th') || b.qty - a.qty);
    ctx.bs = bs; ctx.cs = cs; ctx.val = val; ctx.prods = prods; ctx.total = total; ctx.docs = docs;

    out.innerHTML = `<div class="stats">
        <div class="stat"><div class="v num">${fmtMoney(total)}</div><div class="l">มูลค่าที่จ่ายรวม (บาท)</div></div>
        <div class="stat"><div class="v num">${fmtNum(docs)}</div><div class="l">ใบส่งสินค้า</div></div>
        <div class="stat"><div class="v num">${fmtNum(prods.length)}</div><div class="l">รายการสินค้า</div></div>
        <div class="stat"><div class="v num">${fmtNum(bs.length)}</div><div class="l">สาขาที่รับสินค้า</div></div></div>
      <div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>มูลค่าที่จ่ายแยกตามสาขาและประเภท</h2></div>
        <div class="panel-body"><div class="chart-box" style="height:${Math.max(220, bs.length * 46 + 80)}px"><canvas id="c1" aria-label="กราฟมูลค่าสินค้าที่จ่ายแยกตามสาขา"></canvas></div></div>
        <div class="table-wrap">${valueTable(bs, cs, val, total)}</div></div>
      <div class="panel"><div class="panel-head"><h2>ปริมาณสินค้าที่จ่ายไปแต่ละสาขา</h2></div>
        <div class="table-wrap">${qtyTable(bs, prods)}</div></div>`;

    drawChart(out.querySelector('#c1'), {
      type: 'bar',
      data: { labels: bs.map((b) => b[1]), datasets: cs.map((c, i) => ({
        label: c, data: bs.map(([id]) => val[id]?.[c] || 0), backgroundColor: SERIES[i % SERIES.length], borderRadius: 3, maxBarThickness: 34 })) },
      options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { callback: (v) => fmtNum(v) } }, y: { stacked: true, grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.raw)} บาท` } } } },
    });
  };

  ['#from', '#to', '#fb', '#fc'].forEach((id) => page.querySelector(id)?.addEventListener('change', load));
  page.querySelector('#preset').addEventListener('change', (e) => {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth();
    const iso = (d) => { d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const set = (a, b) => { page.querySelector('#from').value = iso(a); page.querySelector('#to').value = iso(b); };
    ({ m0: () => set(new Date(y, m, 1), new Date()), m1: () => set(new Date(y, m - 1, 1), new Date(y, m, 0)),
      q: () => set(new Date(y, m - 2, 1), new Date()), y: () => set(new Date(y, 0, 1), new Date()) })[e.target.value]?.();
    e.target.value = ''; load();
  });

  page.querySelector('#csv').onclick = () => {
    if (!data.length) return toast('ไม่มีข้อมูลให้ส่งออก', 'error');
    const rows = [['สินค้า', 'ประเภท', 'หน่วย', ...ctx.bs.map((b) => b[1]), 'รวมจำนวน', 'มูลค่า (บาท)'],
      ...ctx.prods.map((p) => [p.name, p.cat, p.unit, ...ctx.bs.map(([id]) => p.by[id] || 0), p.qty, p.amount.toFixed(2)])];
    downloadBlob(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }), `สรุปการจ่ายสินค้า_${ctx.from}_${ctx.to}.csv`);
  };
  page.querySelector('#pdf').onclick = (e) => busy(e.currentTarget, async () => {
    if (!data.length) return toast('ไม่มีข้อมูลให้บันทึก', 'error');
    const sub = `ช่วง ${fmtDate(ctx.from)} ถึง ${fmtDate(ctx.to)}${ctx.branch ? `<br>สาขา ${esc(ctx.branch)}` : ''}${ctx.cat ? `<br>ประเภท ${esc(ctx.cat)}` : ''}`;
    const html = `${pdfHeader('สรุปการจ่ายสินค้าไปสาขา', sub)}
      <p>มูลค่ารวม <b>${fmtMoney(ctx.total)}</b> บาท จาก ${ctx.docs} ใบส่งสินค้า</p>
      <h3 style="margin:14px 0 6px">มูลค่าแยกตามสาขาและประเภท (บาท)</h3>${valueTable(ctx.bs, ctx.cs, ctx.val, ctx.total)}
      <h3 style="margin:18px 0 6px">ปริมาณสินค้าที่จ่ายไปแต่ละสาขา</h3>${qtyTable(ctx.bs, ctx.prods)}`;
    try { const name = `สรุปการจ่ายสินค้า_${ctx.from}_${ctx.to}.pdf`; downloadBlob(await htmlToPdfBlob(html, name), name); }
    catch (err) { toast(errMsg(err), 'error'); }
  });

  load();
}

function valueTable(bs, cs, val, total) {
  return `<table><thead><tr><th>สาขา</th>${cs.map((c) => `<th class="r">${esc(c)}</th>`).join('')}<th class="r">รวม</th><th class="r">สัดส่วน</th></tr></thead>
    <tbody>${bs.map(([id, n]) => { const t = cs.reduce((s, c) => s + (val[id]?.[c] || 0), 0);
      return `<tr><td>${esc(n)}</td>${cs.map((c) => `<td class="r num">${fmtMoney(val[id]?.[c] || 0)}</td>`).join('')}
        <td class="r num"><b>${fmtMoney(t)}</b></td><td class="r num">${total ? ((t / total) * 100).toFixed(1) : 0}%</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td>รวมทุกสาขา</td>${cs.map((c) => `<td class="r num">${fmtMoney(bs.reduce((s, [id]) => s + (val[id]?.[c] || 0), 0))}</td>`).join('')}
      <td class="r num">${fmtMoney(total)}</td><td class="r num">100%</td></tr></tfoot></table>`;
}

function qtyTable(bs, prods) {
  return `<table><thead><tr><th>สินค้า</th><th>หน่วย</th>${bs.map((b) => `<th class="r">${esc(b[1])}</th>`).join('')}<th class="r">รวม</th><th class="r">มูลค่า (บาท)</th></tr></thead>
    <tbody>${prods.map((p) => `<tr><td>${esc(p.name)}<div class="small muted">${esc(p.cat)}</div></td><td>${esc(p.unit)}</td>
      ${bs.map(([id]) => `<td class="r num">${p.by[id] ? fmtNum(p.by[id]) : '<span class="muted">-</span>'}</td>`).join('')}
      <td class="r num"><b>${fmtNum(p.qty)}</b></td><td class="r num">${fmtMoney(p.amount)}</td></tr>`).join('')}</tbody></table>`;
}
