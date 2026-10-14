// สร้าง PDF (html2pdf.js) และแชร์ทาง LINE
import { COMPANY } from './config.js';
import { esc, fmtNum, fmtMoney, fmtDate, fmtDateTime, STATUS, toast, downloadBlob } from './ui.js';

const OPTS = (filename) => ({
  margin: [8, 0, 10, 0],
  filename,
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
});

async function ready() {
  for (let i = 0; i < 50 && !window.html2pdf; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.html2pdf) throw new Error('โหลดตัวสร้าง PDF ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  await document.fonts?.ready;
}

// แปลง HTML เป็น PDF Blob
export async function htmlToPdfBlob(html, filename) {
  await ready();
  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = `<div class="pdf-doc">${html}</div>`;
  try {
    return await window.html2pdf().set(OPTS(filename)).from(stage.firstElementChild).outputPdf('blob');
  } finally { stage.innerHTML = ''; }
}

export const pdfHeader = (title, sub = '') => `<div class="pdf-head">
  <div><h1>${esc(title)}</h1><div>${esc(COMPANY.name)}${COMPANY.address ? ` · ${esc(COMPANY.address)}` : ''}${COMPANY.phone ? ` · โทร ${esc(COMPANY.phone)}` : ''}</div></div>
  <div style="text-align:right">${sub}</div></div><div class="pdf-tape"></div>`;

export function shipmentHTML(s, items, branch) {
  const total = items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);
  return `${pdfHeader('ใบส่งสินค้า', `<div style="font-size:16px;font-weight:700">${esc(s.doc_no)}</div>
      <div>สถานะ: ${esc(STATUS[s.status]?.label)}</div>`)}
    <table style="margin-bottom:14px"><tr>
      <td style="width:50%;border:0;padding:0"><b>ส่งถึง:</b> ${esc(branch?.name || '')}<br>${esc(branch?.address || '')}${branch?.phone ? `<br>โทร ${esc(branch.phone)}` : ''}</td>
      <td style="border:0;padding:0;text-align:right">วันที่ส่ง: ${fmtDate(s.ship_date)}<br>
        ${s.delivered_at ? `ยืนยันส่งถึง: ${fmtDateTime(s.delivered_at)}` : ''}</td></tr></table>
    <table><thead><tr><th style="width:40px">ลำดับ</th><th>รายการสินค้า</th><th style="text-align:right">จำนวน</th><th>หน่วย</th>
      <th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">จำนวนเงิน</th></tr></thead>
    <tbody>${items.map((i, n) => `<tr><td style="text-align:center">${n + 1}</td><td>${esc(i.products?.name)}</td>
      <td style="text-align:right">${fmtNum(i.qty)}</td><td>${esc(i.products?.unit)}</td>
      <td style="text-align:right">${fmtMoney(i.unit_price)}</td><td style="text-align:right">${fmtMoney(i.qty * i.unit_price)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5" style="text-align:right">รวมทั้งสิ้น</td><td style="text-align:right">${fmtMoney(total)}</td></tr></tfoot></table>
    ${s.note ? `<p><b>หมายเหตุ:</b> ${esc(s.note)}</p>` : ''}
    <div class="sign"><div>ผู้จัดสินค้า</div><div>ผู้ส่งสินค้า</div><div>ผู้รับสินค้า (สาขา)</div></div>`;
}

export function shipmentText(s, items, branch) {
  const total = items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price), 0);
  return [`📦 ใบส่งสินค้า ${s.doc_no}`, `${COMPANY.name}`, `ส่งถึง: ${branch?.name || ''}`,
    `วันที่: ${fmtDate(s.ship_date)}`, `สถานะ: ${STATUS[s.status]?.label}`, '',
    ...items.map((i, n) => `${n + 1}. ${i.products?.name} × ${fmtNum(i.qty)} ${i.products?.unit || ''}`),
    '', `รวม ${items.length} รายการ มูลค่า ${fmtMoney(total)} บาท`, ...(s.note ? [`หมายเหตุ: ${s.note}`] : [])].join('\n');
}

// แชร์ทาง LINE: มือถือแนบไฟล์ PDF ผ่านเมนูแชร์ของเครื่อง (เลือกแอป LINE ได้)
// คอมพิวเตอร์: เปิดหน้าแชร์ของ LINE พร้อมข้อความสรุป และดาวน์โหลด PDF ให้แนบเอง
export async function shareToLine({ text, pdfBlob, filename }) {
  const file = pdfBlob ? new File([pdfBlob], filename, { type: 'application/pdf' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text, title: filename }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (pdfBlob) {
    downloadBlob(pdfBlob, filename);
    toast('เปิดหน้าแชร์ LINE แล้ว และดาวน์โหลดไฟล์ PDF ไว้ให้แนบในแชทได้', 'ok');
  }
}
