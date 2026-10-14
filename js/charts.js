// ตัวช่วยกราฟ (Chart.js)
export const SERIES = ['#123F3A', '#D99A00', '#2B5C8A', '#B83227', '#6B4FA0', '#23794D', '#C2571A', '#5D6B67', '#0E8A8A', '#8A5A2B'];

export async function chartReady() {
  for (let i = 0; i < 50 && !window.Chart; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.Chart) throw new Error('โหลดตัวสร้างกราฟไม่สำเร็จ');
  const C = window.Chart;
  C.defaults.font.family = "'Anuphan', system-ui, sans-serif";
  C.defaults.color = '#5D6B67';
  C.defaults.borderColor = '#E3E9E7';
  C.defaults.plugins.legend.labels.boxWidth = 12;
  C.defaults.maintainAspectRatio = false;
  return C;
}

const live = new WeakMap();
export async function drawChart(canvas, config) {
  const C = await chartReady();
  live.get(canvas)?.destroy();
  const ch = new C(canvas, config);
  live.set(canvas, ch);
  return ch;
}

// เส้นแนวโน้มแบบถดถอยเชิงเส้น: คืนค่า slope, intercept, ค่าพยากรณ์ถัดไป
export function linearTrend(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, next: ys[0] || 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  const slope = sxx ? sxy / sxx : 0, intercept = my - slope * mx;
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, next: Math.max(0, intercept + slope * n), r2, mean: my };
}
