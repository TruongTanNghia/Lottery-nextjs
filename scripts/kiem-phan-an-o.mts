/**
 * Bài kiểm % lời/lỗ từng ô của bảng hạn mức (src/lib/phan-an-o.ts).
 *
 *   npm run test:phanan
 *
 * Đường tính độc lập: với MỖI kỳ, dựng lại trạng thái 100 lô bằng đúng hàm của
 * bộ máy hạn mức (dungTrangThai trên các kỳ TRƯỚC kỳ đó) rồi xếp ô bằng oCua —
 * không đi qua dungKy. Hai đường phải ra cùng số lượt lô, số nháy, thu, trả.
 */
import { dungTrangThai, khoaO, moiO, oCua } from "../src/lib/lich-han-muc";
import { SO_VACH, phanAnTheoO } from "../src/lib/phan-an-o";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const ngay = (i: number) => new Date(Date.UTC(2026, 3, 1 + i)).toISOString().slice(0, 10);
function lichSu(soKy: number) {
  const out: { date: string; hits: Record<string, number> }[] = [];
  for (let i = 0, d = 0; i < soKy; i++, d++) {
    if (rnd() < 0.05) d++;
    const hits: Record<string, number> = {};
    for (const lo of LOS) if (rnd() < 0.3) hits[lo] = 1 + (rnd() < 0.2 ? 1 : 0) + (rnd() < 0.05 ? 1 : 0);
    out.push({ date: ngay(d), hits });
  }
  return out;
}

console.log("\n===== % TỪNG Ô = tính lại độc lập bằng hàm của bộ máy hạn mức =====");
for (const [region, soKy] of [["xsmn", 30], ["xsmb", 30], ["xsmt", 60], ["xsmn", 90]] as const) {
  const draws = lichSu(140);
  const kq = phanAnTheoO(draws, region, soKy);
  const gia = region === "xsmb" ? 20_250 : 27_000;
  const tay: Record<string, { soLo: number; nhay: number }> = {};
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  for (let d = sap.length - soKy; d < sap.length; d++) {
    const truoc = sap.slice(0, d).flatMap((x) => Object.keys(x.hits).map((lo) => ({ date: x.date, lo_number: lo })));
    const st = dungTrangThai(truoc).lo;
    for (const lo of LOS) {
      const s = st.get(lo)!;
      // Lô chưa từng về trong kho: dungTrangThai đếm số kỳ — cùng luật với bộ máy.
      const key = khoaO(oCua(s.days, s.consec));
      const x = (tay[key] ??= { soLo: 0, nhay: 0 });
      x.soLo++;
      x.nhay += Number(sap[d].hits[lo]) || 0;
    }
  }
  let lech = 0;
  for (const o of moiO()) {
    const k = khoaO(o), a = kq.o[k], b = tay[k];
    if (!a && !b) continue;
    if (!a || !b || a.soLo !== b.soLo || a.nhay !== b.nhay || a.thu !== b.soLo * gia || a.tra !== b.nhay * 75_000) lech++;
  }
  const tong = Object.values(kq.o).reduce((s, x) => s + x.soLo, 0);
  ok(`${region} ${soKy} kỳ: 24 ô khớp (số lượt lô, nháy, thu, trả); mỗi kỳ đủ 100 lô`, lech === 0 && tong === 100 * soKy && kq.soKy === soKy, `lệch ${lech}, tổng ${tong}`);
}
{
  const draws = lichSu(140);
  const kq = phanAnTheoO(draws, "xsmn", 30);
  const x = Object.values(kq.o).find((v) => v.soLo > 0)!;
  ok("phần ăn = (thu − trả) / thu × 100", Math.abs(x.bien! - ((x.thu - x.tra) / x.thu) * 100) < 1e-9);
  const coChuoi = Object.keys(kq.o).some((k) => k.startsWith("chuoi:"));
  ok("dữ liệu thử có lô ở ô liên tiếp", coChuoi);
}

console.log("\n===== 7 VẠCH: mỗi ô 7 kỳ gần nhất, lời/lỗ từng kỳ = tính lại độc lập =====");
for (const region of ["xsmn", "xsmb"] as const) {
  const draws = lichSu(120);
  const kq = phanAnTheoO(draws, region, 30);
  const gia = region === "xsmb" ? 20_250 : 27_000;
  const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
  let lech = 0, xanh = 0, do_ = 0, xam = 0;
  for (let i = 0; i < SO_VACH; i++) {
    const d = sap.length - SO_VACH + i;
    const truoc = sap.slice(0, d).flatMap((x) => Object.keys(x.hits).map((lo) => ({ date: x.date, lo_number: lo })));
    const st = dungTrangThai(truoc).lo;
    const tay: Record<string, { soLo: number; lai: number }> = {};
    for (const lo of LOS) {
      const s = st.get(lo)!;
      const x = (tay[khoaO(oCua(s.days, s.consec))] ??= { soLo: 0, lai: 0 });
      x.soLo++;
      x.lai += gia - (Number(sap[d].hits[lo]) || 0) * 75_000;
    }
    for (const o of moiO()) {
      const v = kq.vach[khoaO(o)][i], t = tay[khoaO(o)] ?? { soLo: 0, lai: 0 };
      if (v.date !== sap[d].date || v.soLo !== t.soLo || v.lai !== t.lai) lech++;
      if (v.lai > 0) xanh++; else if (v.lai < 0) do_++; else xam++;
    }
  }
  ok(`${region}: 24 ô × ${SO_VACH} vạch, đúng ngày, số lô và lời/lỗ từng kỳ`, lech === 0 && Object.values(kq.vach).every((v) => v.length === SO_VACH), `lệch ${lech}`);
  ok(`${region}: có đủ cả vạch xanh (lời), đỏ (lỗ), xám (hoà / ô trống)`, xanh > 0 && do_ > 0 && xam > 0, `${xanh} / ${do_} / ${xam}`);
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
