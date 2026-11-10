/**
 * Bài kiểm tab Dự Báo (src/lib/du-bao.ts) — khách 10/11/2026.
 *
 *   npm run test:dubao
 *
 * 1. Từng mô hình ra điểm đúng như tính tay trên lịch sử nhỏ.
 * 2. Không nhìn trộm: con chỉ về đúng ngày đang chấm thì không mô hình nào chọn được nhờ ngày đó.
 * 3. Chấm tiền: xác = N × giá miền, trả = nháy × 75.000; kỳ vọng mỗi điểm = 0 đúng cả 3 miền.
 * 4. May rủi: kết quả ngẫu nhiên → trung bình ≈ 0, hiếm mô hình "vượt"; kết quả gài (10 con luôn về) → "về nhiều" vượt rõ.
 * 5. Lặp lại cùng seed cho cùng số; đổi N không phải chạy lại; dự báo kỳ tới = ngày cuối + 1, N con khác nhau.
 */
import { POSITIONS, STAKE_PRICE, WIN_PER_POINT } from "../src/lib/exposure";
import {
  CAC_MO_HINH, CUA_SO, LOS, chamKy, chayDuBao, chonKy, chuoiDanh, dao, duBaoKyToi, laiKyVongMoiDiem, mhChuyenTiep, mhDao, mhDiCap, mhGan, mhLienTiep,
  mhNongLen, mhTheoThu, mhVeGan, mhVeNhieu, nhayCanDeLoi, nhayKyVong, phanPhoiMayRui, phanTichDuBao, xacSuatMayRui, xepHang,
} from "../src/lib/du-bao";
import type { Region } from "../src/lib/types";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
// Dùng mulberry32 (như trong lib) chứ không dùng LCG 2^31: LCG có tương quan ngắn hạn, mô hình "về gần"/"liên tiếp" bắt được → bài kiểm may rủi sai.
let seed = 10112026 >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ngay = (i: number, goc = Date.UTC(2024, 0, 1)) => new Date(goc + i * 86_400_000).toISOString().slice(0, 10);
const gan = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
type D = { date: string; hits: Record<string, number> };
function kyNgau(region: Region): Record<string, number> {
  const hits: Record<string, number> = {};
  for (let g = 0; g < POSITIONS[region]; g++) { const lo = LOS[Math.floor(rnd() * 100)]; hits[lo] = (hits[lo] ?? 0) + 1; }
  return hits;
}
const lichSu = (soKy: number, region: Region = "xsmn"): D[] => Array.from({ length: soKy }, (_, i) => ({ date: ngay(i), hits: kyNgau(region) }));
const ky = (date: string, ...cons: string[]): D => ({ date, hits: Object.fromEntries(cons.map((c) => [c, (cons.filter((x) => x === c).length)])) });

console.log("\n===== 1. Từng mô hình tính tay =====");
{
  const cs = [ky("2024-01-01", "11", "22"), ky("2024-01-02", "11", "33"), ky("2024-01-03", "11", "22", "44")];
  const f = mhVeNhieu(cs);
  ok("về nhiều: 11 về 3/3 = 1, 22 về 2/3, 33 1/3, 55 = 0", gan(f["11"], 1) && gan(f["22"], 2 / 3) && gan(f["33"], 1 / 3) && f["55"] === 0);
  const r = mhVeGan(cs, 1);
  ok("về gần (nửa đời 1 ngày): 33 về cách 1 ngày nặng 0,5; 44 về hôm nay nặng 1 → 44 > 33 > 22 > 55", r["44"] > r["33"] && r["33"] < r["22"] && r["22"] > r["55"], `44=${r["44"].toFixed(3)} 33=${r["33"].toFixed(3)} 22=${r["22"].toFixed(3)}`);
  const g = mhGan(cs);
  ok("gan: 33 (về 1/3, cách 2 ngày) = 1−e^(−1/3·2); 11 vừa về gap 1 = 1−e^(−1); 55 chưa về = 0", gan(g["33"], 1 - Math.exp(-2 / 3)) && gan(g["11"], 1 - Math.exp(-1)) && g["55"] === 0);
  const m = mhChuyenTiep(cs);
  // hôm qua = ngày 3 (11,22,44). 11 từng đứng trước 2 lần → mai 11 (2/2), 33 (1/2), 22 (1/2), 44 (1/2). 22 trước 1 lần → 11,33. 44 chưa từng trước.
  ok("chuyển tiếp: điểm 11 = (1 + 1 + 0)/3, điểm 33 = (0,5 + 1)/3, 44 = 0,5/3", gan(m["11"], 2 / 3) && gan(m["33"], 1.5 / 3) && gan(m["44"], 0.5 / 3), `11=${m["11"]} 33=${m["33"]} 44=${m["44"]}`);
  const p = mhDiCap(cs);
  // hôm qua 11,22,44. cùng ngày với 11 (3 lần xuất hiện): 22 ×2, 33 ×1, 44 ×1. với 22 (2 lần): 11 ×2, 44 ×1. với 44 (1 lần): 11, 22.
  ok("đi cặp: điểm 11 = (0 + 2/2 + 1)/3, 33 = (1/3)/3, 55 = 0", gan(p["11"], 2 / 3) && gan(p["33"], 1 / 9) && p["55"] === 0, `11=${p["11"]} 33=${p["33"]}`);
  const s = mhLienTiep(cs);
  ok("liên tiếp: 11 ba ngày liền = 0,75; 22 chỉ hôm nay = 0,3; 33 = 0", s["11"] === 0.75 && s["22"] === 0.3 && s["33"] === 0);
  const d = mhDao(cs);
  ok("đảo: điểm của 11 = tần suất 11; điểm 22 = tần suất 22; điểm 12 = tần suất 21 = 0; dao('12')='21'", gan(d["11"], 1) && gan(d["22"], 2 / 3) && d["12"] === 0 && dao("12") === "21");
  const t = mhTheoThu(cs, "2024-01-08"); // thứ 2; 01/01/2024 là thứ 2
  ok("theo thứ: dự báo thứ 2 chỉ đếm 01/01 (thứ 2) → 11 = 22 = 1, 33 = 0", t["11"] === 1 && t["22"] === 1 && t["33"] === 0);
  const nong = mhNongLen(cs, 1);
  ok("nóng lên: 44 (hôm nay về, thường thấp) nóng hơn 33 (hôm nay không về)", nong["44"] > nong["33"] && nong["44"] > 0.5 && nong["33"] < 0.5);
  const xh = xepHang({ ...Object.fromEntries(LOS.map((l) => [l, 0])), "07": 1, "99": 1, "50": 0.5 });
  ok("xếp hạng: điểm cao trước, bằng điểm thì con nhỏ trước: 07, 99, 50, 00…", xh.slice(0, 4).join(" ") === "07 99 50 00");
}

console.log("\n===== 2. Không nhìn trộm =====");
{
  const cs = lichSu(CUA_SO + 5);
  // Xoá con 'hiem' khỏi cả 60 kỳ cửa sổ, rồi cho nó về 36 nháy đúng ngày chấm → không mô hình nào được chọn nó (chọn được là nhìn trộm).
  const hiem = "73";
  for (const d of cs.slice(0, CUA_SO)) delete d.hits[hiem];
  cs[CUA_SO] = { date: cs[CUA_SO].date, hits: { [hiem]: 36 } };
  ok("đã xoá con 73 khỏi 60 kỳ cửa sổ", cs.slice(0, CUA_SO).every((d) => !(hiem in d.hits)));
  const kq = chayDuBao(cs, "xsmn", CUA_SO, CUA_SO + 1);
  ok(`kỳ ${CUA_SO + 1} dự báo chỉ bằng ${CUA_SO} kỳ trước: con ${hiem} (chỉ về đúng ngày đó) không mô hình nào chọn`, kq.length === 1 && CAC_MO_HINH.every((m) => !kq[0].chon[m.khoa].includes(hiem)));
  const lai = chayDuBao(cs, "xsmn");
  ok(`chạy cả kho ${cs.length} kỳ → ${cs.length - CUA_SO} kỳ được chấm, kỳ đầu là ngày thứ ${CUA_SO + 1}`, lai.length === 5 && lai[0].date === cs[CUA_SO].date);
  ok("mỗi mô hình giữ 20 hạng, 20 con khác nhau", lai.every((k) => CAC_MO_HINH.every((m) => k.chon[m.khoa].length === 20 && new Set(k.chon[m.khoa]).size === 20)));
  const chon = chonKy(cs.slice(0, CUA_SO), cs[CUA_SO].date, "xsmn");
  ok("chonKy trực tiếp = chayDuBao cho cùng kỳ", JSON.stringify(chon) === JSON.stringify(kq[0].chon));
}

console.log("\n===== 3. Chấm tiền =====");
{
  const d = ky("2024-03-01", "23", "23", "45", "67");
  const k = chamKy(["23", "45", "88", "99"], d, "xsmn");
  ok("4 con 1 điểm MN: xác 108.000; 23 về 2 nháy + 45 về 1 = 3 nháy → trả 225.000, lãi +117.000", k.xac === 108_000 && k.soNhay === 3 && k.tra === 225_000 && k.lai === 117_000 && k.trung.length === 2);
  const kb = chamKy(["23", "45", "88", "99"], d, "xsmb");
  ok("cùng vậy MB: xác 81.000, lãi +144.000", kb.xac === 81_000 && kb.lai === 144_000);
  ok("kỳ vọng lãi mỗi điểm = 0 đúng cả 3 miền (36×75.000/100 = 27.000; 27×75.000/100 = 20.250)", (["xsmn", "xsmt", "xsmb"] as Region[]).every((r) => laiKyVongMoiDiem(r) === 0));
  ok("10 con MN xác 270.000 → cần 4 nháy mới lời; 10 con MB xác 202.500 → cần 3 nháy; 20 con MN → 8", nhayCanDeLoi(10, "xsmn") === 4 && nhayCanDeLoi(10, "xsmb") === 3 && nhayCanDeLoi(20, "xsmn") === 8);
  ok("may rủi cho 10 con MN trung bình 3,6 nháy, MB 2,7", gan(nhayKyVong(10, "xsmn"), 3.6) && gan(nhayKyVong(10, "xsmb"), 2.7));
  ok("chuỗi gửi: '2d23b1, 45b1, 88b1'", chuoiDanh(["23", "45", "88"], "2d") === "2d23b1, 45b1, 88b1");
  ok("giá dùng đúng exposure.ts: MN 27.000, MB 20.250, 75.000/nháy", STAKE_PRICE.xsmn === 27_000 && STAKE_PRICE.xsmb === 20_250 && WIN_PER_POINT === 75_000);
}

console.log("\n===== 4. May rủi: ngẫu nhiên và gài =====");
{
  const cs = lichSu(CUA_SO + 300);
  const kyDB = chayDuBao(cs, "xsmn");
  const pt = phanTichDuBao(kyDB, cs, 10, "xsmn");
  ok(`300 kỳ ngẫu nhiên: trung bình may rủi gần 0 (|tb| < 1,5tr trên xác 81tr)`, Math.abs(pt.mayRui.tb) < 1_500_000, `tb=${Math.round(pt.mayRui.tb)}`);
  ok("khoảng 90% may rủi: thấp < 0 < cao", pt.mayRui.thap < 0 && pt.mayRui.cao > 0, `${pt.mayRui.thap}…${pt.mayRui.cao}`);
  const soVuot = pt.moHinh.filter((m) => m.vuot).length;
  ok(`kết quả ngẫu nhiên: ít mô hình "vượt" (≤ 2 trong ${pt.moHinh.length})`, soVuot <= 2, `vượt=${soVuot}`);
  ok("tổng xác mỗi mô hình = 300 × 10 × 27.000; nháy kỳ vọng ghi 3,6", pt.moHinh.every((m) => m.tongXac === 300 * 270_000 && gan(m.nhayKyVong, 3.6)));
  ok("mỗi mô hình: kỳ ăn + thua + hoà = số kỳ; lãi = trả − xác; mô hình 'tốt' là lãi cao nhất", pt.moHinh.every((m) => m.kyAn + m.kyThua + m.kyHoa === m.soKy && m.lai === m.tongTra - m.tongXac) && pt.tot!.lai === Math.max(...pt.moHinh.map((m) => m.lai)));
  ok("may rủi trong (0,1]; kết luận nói 'cần từ 4 nháy'", pt.moHinh.every((m) => m.mayRui > 0 && m.mayRui <= 1) && pt.ketLuan.includes("cần từ 4 nháy"), pt.ketLuan.slice(0, 120));
  ok("xác suất lọt ngẫu nhiên khi thử 10 mô hình × 3 mức N = 30 phép thử ≈ 79%", pt.soPhepThu === 30 && gan(pt.xacSuatLotNgau, 1 - 0.95 ** 30));
  // Chuỗi và sụt sâu nhất tính tay trên mô hình đầu
  const m0 = pt.moHinh[0];
  let ca = 0, ct = 0, a = 0, t = 0, dinh = 0, cd = 0, sut = 0;
  for (const k of m0.ky) { if (k.lai > 0) { a++; t = 0; } else if (k.lai < 0) { t++; a = 0; } else { a = 0; t = 0; } ca = Math.max(ca, a); ct = Math.max(ct, t); cd += k.lai; dinh = Math.max(dinh, cd); sut = Math.min(sut, cd - dinh); }
  ok("chuỗi ăn/thua dài nhất và sụt sâu nhất khớp tính tay", m0.chuoiAn === ca && m0.chuoiThua === ct && m0.thuaSauNhat === sut);

  // Gài: 10 con 'vàng' luôn về mỗi kỳ (thêm vào kết quả) → "về nhiều" phải thắng lớn, may rủi không đuổi kịp
  const vang = ["01", "12", "23", "34", "45", "56", "67", "78", "89", "90"];
  const gai: D[] = cs.map((d) => ({ date: d.date, hits: { ...d.hits, ...Object.fromEntries(vang.map((v) => [v, (d.hits[v] ?? 0) + 1])) } }));
  const ptG = phanTichDuBao(chayDuBao(gai, "xsmn"), gai, 10, "xsmn");
  const vn = ptG.moHinh.find((m) => m.moHinh === "frequency")!;
  ok("gài 10 con luôn về: 'về nhiều' chọn đúng 10 con vàng, nháy TB ≥ 10, lãi dương lớn, vượt may rủi", vn.ky.every((k) => k.chon.every((c) => vang.includes(c))) && vn.nhayTB >= 10 && vn.lai > 100_000_000 && vn.vuot && vn.mayRui < 0.01, `lãi=${vn.lai} mayRui=${vn.mayRui}`);
  ok("kết luận khi có mô hình nổi lên nhắc xác suất lọt ngẫu nhiên và 'theo dõi thêm 60 kỳ'", ptG.ketLuan.includes("nổi lên") && ptG.ketLuan.includes("60 kỳ"));
}

console.log("\n===== 5. Lặp lại, đổi N, kỳ tới =====");
{
  const cs = lichSu(CUA_SO + 40);
  const kyDB = chayDuBao(cs, "xsmt");
  const a = phanTichDuBao(kyDB, cs, 10, "xsmt"), b = phanTichDuBao(kyDB, cs, 10, "xsmt");
  ok("cùng seed → cùng may rủi, cùng lãi", a.moHinh.every((m, i) => m.mayRui === b.moHinh[i].mayRui && m.lai === b.moHinh[i].lai));
  const c = phanTichDuBao(kyDB, cs, 5, "xsmt");
  ok("đổi N = 5 không chạy lại: 5 con đầu của 10 con; xác = 40 × 5 × 27.000", c.moHinh.every((m, i) => m.ky.every((k, j) => k.chon.join() === a.moHinh[i].ky[j].chon.slice(0, 5).join()) && m.tongXac === 40 * 135_000));
  const pp = phanPhoiMayRui(cs.slice(CUA_SO), 10, "xsmt", 200, 7);
  ok("phân phối may rủi 200 lần, sắp tăng dần; xác suất của giá trị nhỏ nhất ≈ 1, của giá trị rất lớn ≈ 1/201", pp.length === 200 && pp.every((v, i) => i === 0 || v >= pp[i - 1]) && gan(xacSuatMayRui(pp, pp[0]), 1) && gan(xacSuatMayRui(pp, 1e12), 1 / 201));
  const toi = duBaoKyToi(cs, "xsmt")!;
  ok(`kỳ tới = ngày cuối + 1 (${toi.date}); mỗi mô hình 20 con khác nhau, dạng 2 chữ số`, toi.date === ngay(CUA_SO + 40) && CAC_MO_HINH.every((m) => toi.chon[m.khoa].length === 20 && new Set(toi.chon[m.khoa]).size === 20 && toi.chon[m.khoa].every((x) => /^\d\d$/.test(x))));
  ok("kho dưới 60 kỳ: chưa dự báo được", duBaoKyToi(cs.slice(0, 30), "xsmt") === null && chayDuBao(cs.slice(0, 30), "xsmt").length === 0);
  ok("kho đưa vào lộn thứ tự vẫn ra cùng kết quả", JSON.stringify(duBaoKyToi([...cs].reverse(), "xsmt")) === JSON.stringify(toi));
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
