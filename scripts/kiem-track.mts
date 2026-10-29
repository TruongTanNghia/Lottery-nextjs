/**
 * Bài kiểm tab Track (src/lib/track-thang.ts) — luật khách 29/10: bám tháng hiện tại,
 * ô −% → 1n, ô +% → 0n, ít cặp → 0n; tháng nào riêng tháng đó.
 *
 *   npm run test:track
 *
 * Đường tính độc lập: với từng ngày, tự đếm cặp/cùng về của các ngày trước trong
 * tháng từ bậc của từng con (không qua demCapTheoNgay), chọn ô, chấm tiền.
 */
import { dungKy } from "../src/lib/slot-stats";
import { DIP_TOI_THIEU, GIA_DA, TRUNG_DA, bacDa, type KyDa } from "../src/lib/da";
import { oCai1n, tomTat, trackTheoThang, type NgayTrack } from "../src/lib/track-thang";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
let seed = 2910;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const ngay = (i: number) => new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
function lichSu(soKy: number) {
  const out: { date: string; hits: Record<string, number> }[] = [];
  for (let i = 0, d = 0; i < soKy; i++, d++) {
    if (rnd() < 0.05) d++;
    const hits: Record<string, number> = {};
    for (const lo of LOS) if (rnd() < 0.3) hits[lo] = 1 + (rnd() < 0.15 ? 1 : 0);
    out.push({ date: ngay(d), hits });
  }
  return out;
}

console.log("\n===== Track = tính tay độc lập từng ngày (3 miền, 2 chiều) =====");
for (const region of ["xsmn", "xsmt", "xsmb"] as const) {
  const ky: KyDa[] = dungKy(lichSu(110));
  const gia = GIA_DA[region], trung = TRUNG_DA[region];
  for (const chieu of ["am", "duong"] as const) {
    const kq = trackTheoThang(ky, region, chieu);
    let lech = 0, soNgay = 0, coCho = 0, coNhan = 0;
    for (const t of kq.cacThang) {
      const kyThang = ky.filter((k) => k.date.slice(0, 7) === t.thang);
      ok(`${region}/${chieu} ${t.thang}: đủ ${kyThang.length} ngày, mỗi ngày một dòng`, t.ngay.length === kyThang.length && t.ngay.every((n, i) => n.date === kyThang[i].date));
      let don = 0;
      for (let d = 0; d < kyThang.length; d++) {
        // Tay: cộng dồn các ngày TRƯỚC d trong tháng, theo bậc từng con.
        const tong: Record<string, { dip: number; ca: number }> = {};
        for (let e = 0; e < d; e++) {
          const k = kyThang[e];
          const bac = LOS.map((lo) => bacDa(k.kho[lo], k.lienTiep?.[lo] ?? 0));
          for (let x = 0; x < 100; x++) for (let y = x + 1; y < 100; y++) {
            const key = `${Math.min(bac[x], bac[y])}-${Math.max(bac[x], bac[y])}`;
            const a = (tong[key] ??= { dip: 0, ca: 0 }); a.dip++;
            if ((k.ve[LOS[x]] ?? 0) > 0 && (k.ve[LOS[y]] ?? 0) > 0) a.ca++;
          }
        }
        const oTay = Object.entries(tong).filter(([, v]) => v.dip >= DIP_TOI_THIEU && (chieu === "am" ? v.dip * gia - v.ca * trung < 0 : v.dip * gia - v.ca * trung > 0)).map(([k]) => k).sort();
        const k = kyThang[d];
        const bac = LOS.map((lo) => bacDa(k.kho[lo], k.lienTiep?.[lo] ?? 0));
        const oSet = new Set(oTay);
        let soCap = 0, capTrung = 0;
        for (let x = 0; x < 100; x++) for (let y = x + 1; y < 100; y++) {
          if (!oSet.has(`${Math.min(bac[x], bac[y])}-${Math.max(bac[x], bac[y])}`)) continue;
          soCap++;
          if ((k.ve[LOS[x]] ?? 0) > 0 && (k.ve[LOS[y]] ?? 0) > 0) capTrung++;
        }
        const r = t.ngay[d];
        const lai = soCap * gia - capTrung * trung;
        if (oTay.length) don += lai;
        if (r.o.join(",") !== oTay.join(",") || r.soCap !== soCap || r.capTrung !== capTrung || r.thu !== soCap * gia || r.tra !== capTrung * trung || r.don !== don || r.cho !== (oTay.length === 0)) lech++;
        soNgay++;
        if (r.cho) coCho++; else coNhan++;
      }
    }
    ok(`${region}/${chieu}: ${soNgay} ngày — ô 1n, cặp nhận, cặp trúng, thu, trả, lũy kế đều = tay`, lech === 0, `lệch ${lech}`);
    ok(`${region}/${chieu}: có ngày "chờ dữ liệu" đầu tháng (${coCho}) và ngày có nhận (${coNhan})`, coCho > 0 && coNhan > 0);
  }
  const am = trackTheoThang(ky, region, "am"), duong = trackTheoThang(ky, region, "duong");
  const giao = am.cacThang.flatMap((t, i) => t.ngay.map((n, d) => n.o.filter((k) => duong.cacThang[i].ngay[d].o.includes(k)).length)).reduce((a, b) => a + b, 0);
  ok(`${region}: hai chiều không bao giờ cùng cài 1n một ô trong cùng ngày`, giao === 0, String(giao));
}

console.log("\n===== Ô 1n: dưới 500 cặp là 0n; phần ăn đúng dấu =====");
{
  const m = new Map<string, { dip: number; caHai: number }>([
    ["0-1", { dip: 499, caHai: 0 }],    // ít cặp → không bao giờ 1n
    ["0-2", { dip: 1000, caHai: 100 }], // MN: thu 54tr, trả 58tr → âm → 1n chiều "am"
    ["0-3", { dip: 1000, caHai: 80 }],  // thu 54tr, trả 46,4tr → dương → 1n chiều "duong"
    ["0-4", { dip: 1000, caHai: 0 }],   // dương
  ]);
  ok("chiều khách (am): chỉ ô 0-2", oCai1n(m, "xsmn", "am").join(",") === "0-2");
  ok("chiều ngược (duong): 0-3, 0-4; ô 499 cặp bị loại ở cả hai chiều", oCai1n(m, "xsmn", "duong").join(",") === "0-3,0-4");
  ok("Bắc dùng giá 40.500/700.000: ô 1000 cặp, 60 cùng về → 40,5tr − 42tr âm → 1n", oCai1n(new Map([["5-5", { dip: 1000, caHai: 60 }]]), "xsmb", "am").length === 1);
}

console.log("\n===== Tóm tắt tháng: chuỗi thua, sụt từ đỉnh =====");
{
  const d = (date: string, lai: number, cho = false): NgayTrack => ({ date, soO: cho ? 0 : 1, o: [], soCap: 0, capTrung: 0, thu: 100, tra: 100 - lai, lai, don: 0, cho });
  const ds = [d("2026-10-01", 0, true), d("2026-10-02", 5), d("2026-10-03", -3), d("2026-10-04", -4), d("2026-10-05", -2), d("2026-10-06", 10), d("2026-10-07", -1), d("2026-10-08", 0)];
  let don = 0; for (const x of ds) { if (!x.cho) don += x.lai; x.don = don; }
  const s = tomTat(ds);
  ok("ngày ăn 2, thua 4, hoà 1, chờ 1", s.ngayAn === 2 && s.ngayThua === 4 && s.ngayHoa === 1 && s.ngayCho === 1 && s.soNgay === 8);
  ok("thua dài nhất 3 ngày (03→05/10)", s.thuaDai.soNgay === 3 && s.thuaDai.tu === "2026-10-03" && s.thuaDai.den === "2026-10-05");
  ok("thua sâu nhất 9 (đỉnh +5 ngày 02 → đáy −4 ngày 05)", s.sutSau.tien === 9 && s.sutSau.tu === "2026-10-02" && s.sutSau.den === "2026-10-05");
  ok("lãi tháng = tổng ngày có nhận = +5", s.lai === 5 && s.thu === 700);
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
