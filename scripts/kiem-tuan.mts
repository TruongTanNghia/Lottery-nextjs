/**
 * Bài kiểm tab Tuần (src/lib/tuan.ts) — khách 09/11/2026.
 *
 *   npm run test:tuan
 *
 * 1. Tuần ISO: thứ 2 → chủ nhật, số tuần, tuần trong tháng, cuối tháng.
 * 2. Gom tuần = cộng tay; hai phía nhìn đối dấu; nhận đều = C(h,2).
 * 3. Luật chọn tuần đúng định nghĩa; đánh giá: mốc "luôn" may rủi = 1.
 * 4. Phép hoán vị: dữ liệu ngẫu nhiên thì hiếm luật "vượt"; dữ liệu gài chu kỳ
 *    lẻ/chẵn thì luật tuần lẻ vượt rõ; lặp lại cho cùng kết quả (seed).
 * 5. Đọc kho dài, gộp kho: trùng ngày lấy kho đang chạy.
 */
import { GIA_DA, TRUNG_DA } from "../src/lib/da";
import {
  CAC_LUAT, chonTuan, chuoiDaiNhat, danhGiaLuat, docKhoDai, gomTuan, gopKho, laiNgayDeu, loiKhuyenTuan, phanTichTuan, thuTuan, tuongQuanTre1, xacSuatMayRui,
  type NgayLai, type Tuan,
} from "../src/lib/tuan";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
let seed = 9112026;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const ngay = (i: number, goc = Date.UTC(2024, 0, 1)) => new Date(goc + i * 86_400_000).toISOString().slice(0, 10);
function lichSu(soKy: number, goc?: number) {
  const out: { date: string; hits: Record<string, number> }[] = [];
  for (let i = 0; i < soKy; i++) {
    const hits: Record<string, number> = {};
    for (let g = 0; g < 36; g++) { const lo = LOS[Math.floor(rnd() * 100)]; hits[lo] = (hits[lo] ?? 0) + 1; }
    out.push({ date: ngay(i, goc), hits });
  }
  return out;
}
const gan = (a: number, b: number) => Math.abs(a - b) < 1e-6;

console.log("\n===== 1. Tuần ISO =====");
{
  const a = thuTuan("2026-01-01");
  ok("01/01/2026 (thứ 5) thuộc tuần 2026-W01, thứ 2 là 29/12/2025, CN 04/01/2026", a.khoa === "2026-W01" && a.thu2 === "2025-12-29" && a.cn === "2026-01-04");
  const b = thuTuan("2024-12-30");
  ok("30/12/2024 (thứ 2) thuộc tuần 2025-W01", b.khoa === "2025-W01" && b.thu2 === "2024-12-30");
  const c = thuTuan("2026-11-08");
  ok("08/11/2026 (CN) thuộc 2026-W45, thứ 2 là 02/11, tuần thứ 1 trong tháng", c.khoa === "2026-W45" && c.thu2 === "2026-11-02" && c.thuTrongThang === 1 && !c.cuoiThang);
  const d = thuTuan("2026-11-27");
  ok("27/11/2026 → thứ 2 là 23/11, tuần thứ 4, chưa phải cuối tháng (23+7 = 30, không quá 30)", d.thu2 === "2026-11-23" && d.thuTrongThang === 4 && !d.cuoiThang);
  const d2 = thuTuan("2026-12-02");
  ok("02/12/2026 → thứ 2 là 30/11, tuần thứ 5 của tháng 11, là tuần cuối tháng", d2.thu2 === "2026-11-30" && d2.thuTrongThang === 5 && d2.cuoiThang);
  const e = thuTuan("2026-11-16");
  ok("16/11/2026 → tuần thứ 3, không phải cuối tháng", e.thuTrongThang === 3 && !e.cuoiThang);
  ok("7 ngày liền từ thứ 2 cùng một khoá tuần, ngày thứ 8 sang tuần mới", Array.from({ length: 7 }, (_, i) => thuTuan(ngay(i, Date.UTC(2026, 10, 2))).khoa).every((k) => k === "2026-W45") && thuTuan("2026-11-09").khoa === "2026-W46");
}

console.log("\n===== 2. Gom tuần, hai phía, nhận đều =====");
{
  const draws = lichSu(100);
  for (const region of ["xsmn", "xsmb"] as const) {
    const ngayL = draws.map((d) => laiNgayDeu(d, region));
    const tay = draws.map((d) => { const h = Object.values(d.hits).filter((x) => x > 0).length; return { xac: 4950 * GIA_DA[region], trung: (h * (h - 1) / 2) * TRUNG_DA[region] }; });
    ok(`${region}: nhận đều = 4.950 × giá, C(h,2) × trúng, 100 ngày`, ngayL.every((n, i) => n.xac === tay[i].xac && n.trung === tay[i].trung && n.danh));
    const tNhan = gomTuan(ngayL, "nhan"), tGui = gomTuan(ngayL, "gui");
    const tongNgay = tay.reduce((s, x) => s + x.xac - x.trung, 0);
    ok(`${region}: tổng lãi các tuần (phía nhận) = tổng ngày; phía gửi đối dấu; tổng kỳ = 100`, gan(tNhan.reduce((s, t) => s + t.lai, 0), tongNgay) && tGui.every((t, i) => gan(t.lai, -tNhan[i].lai)) && tNhan.reduce((s, t) => s + t.soKy, 0) === 100);
    ok(`${region}: tuần cũ → mới, mỗi tuần ≤ 7 kỳ, tuần giữa đủ 7`, tNhan.every((t, i) => i === 0 || t.thu2 > tNhan[i - 1].thu2) && tNhan.every((t) => t.soKy <= 7) && tNhan.slice(1, -1).every((t) => t.soKy === 7));
  }
  const ngayCho: NgayLai[] = [{ date: "2026-11-02", xac: 0, trung: 0, danh: false }, { date: "2026-11-03", xac: 100, trung: 40, danh: true }];
  const t = gomTuan(ngayCho, "nhan")[0];
  ok("ngày chờ dữ liệu: tính kỳ nhưng không tính ngày đánh", t.soKy === 2 && t.soNgayDanh === 1 && t.lai === 60);
}

console.log("\n===== 3. Luật chọn tuần; đánh giá =====");
{
  const lam = (lai: number[], goc = Date.UTC(2026, 0, 5)): Tuan[] => lai.map((l, i) => { const tt = thuTuan(ngay(i * 7, goc)); return { ...tt, soKy: 7, soNgayDanh: 7, xac: 1000, trung: 1000 - l, lai: l }; });
  const tuan = lam([5, -3, -4, 2, 6, 7, -1, -2, -8, 3]);
  ok("luôn: đánh hết", chonTuan(tuan, "luon").every(Boolean));
  ok("sau ăn: tuần 2, 5, 6, 7 (sau các tuần lãi dương)", chonTuan(tuan, "sauAn").map((c, i) => c ? i : -1).filter((i) => i >= 0).join() === "1,4,5,6");
  ok("sau thua: 3, 4, 8, 9, 10", chonTuan(tuan, "sauThua").map((c, i) => c ? i : -1).filter((i) => i >= 0).join() === "2,3,7,8,9");
  ok("hai tuần ăn liền: 6, 7; hai tuần thua liền: 4, 9, 10", chonTuan(tuan, "sau2An").map((c, i) => c ? i : -1).filter((i) => i >= 0).join() === "5,6" && chonTuan(tuan, "sau2Thua").map((c, i) => c ? i : -1).filter((i) => i >= 0).join() === "3,8,9");
  ok("tuần lẻ + tuần chẵn = mọi tuần, không trùng", chonTuan(tuan, "tuanLe").every((c, i) => c !== chonTuan(tuan, "tuanChan")[i]));
  const dg = danhGiaLuat(tuan, "luon");
  ok("mốc 'luôn': 10 tuần, 5 ăn, 5 thua, lãi 5, may rủi = 1, không 'vượt'", dg.tuanDanh === 10 && dg.tuanAn === 5 && dg.tuanThua === 5 && dg.lai === 5 && dg.mayRui === 1 && !dg.vuot);
  const sa = danhGiaLuat(tuan, "sauAn");
  ok("sau ăn: 4 tuần, lãi −3 + 6 + 7 − 1 = 9, TB 2,25 so với mốc 0,5", sa.tuanDanh === 4 && sa.lai === 9 && gan(sa.laiTB, 2.25) && gan(sa.laiTBLuon, 0.5));
  ok("may rủi: cùng tham số ra cùng số (seed cố định); k=0 hay k=n → 1", xacSuatMayRui([1, 2, 3, 4], 2, 7) === xacSuatMayRui([1, 2, 3, 4], 2, 7) && xacSuatMayRui([1, 2], 0, 0) === 1 && xacSuatMayRui([1, 2], 2, 3) === 1);
  ok("may rủi: chọn 2/4 mà đạt tổng 7 (max) → hiếm (~1/6); đạt tổng 3 (min) → gần 1", xacSuatMayRui([1, 2, 3, 4], 2, 7) < 0.25 && xacSuatMayRui([1, 2, 3, 4], 2, 3) > 0.95);
  const ch = chuoiDaiNhat(tuan);
  ok("chuỗi ăn dài nhất 3 tuần (2, 6, 7 → tuần 4–6), thua dài nhất 3 tuần (−1 −2 −8)", ch.an.soTuan === 3 && ch.an.lai === 15 && ch.thua.soTuan === 3 && ch.thua.lai === -11);
  ok("tương quan trễ 1 của dãy xen kẽ +1 −1 là −1; dãy tăng đều là +1", gan(tuongQuanTre1([1, -1, 1, -1, 1, -1, 1, -1]), -1) && gan(tuongQuanTre1([1, 2, 3, 4, 5, 6]), 1));
}

console.log("\n===== 4. Ngẫu nhiên thì hiếm luật vượt; gài chu kỳ thì bắt được =====");
{
  let vuotNgau = 0, tongLuat = 0;
  for (let lan = 0; lan < 20; lan++) {
    const kq = phanTichTuan(lichSu(400), "xsmn", "deu", "gui", 1000 + lan);
    vuotNgau += kq.luat.filter((l) => l.vuot).length;
    tongLuat += kq.soPhepThu;
  }
  ok(`20 bộ ngẫu nhiên × 8 luật: số luật "vượt" ít (${vuotNgau}/${tongLuat}, kỳ vọng ≈ 5% × một nửa vì phải hơn mốc)`, vuotNgau <= Math.ceil(tongLuat * 0.12), String(vuotNgau));
  // Gài: tuần lẻ toàn con về ít (nhận ăn), tuần chẵn con về nhiều.
  const draws = lichSu(364, Date.UTC(2025, 0, 6));
  for (const d of draws) {
    const le = thuTuan(d.date).so % 2 === 1;
    const hits: Record<string, number> = {};
    const soCon = le ? 24 : 34;
    for (let i = 0; i < soCon; i++) hits[LOS[(i * 7 + (le ? 3 : 0)) % 100]] = 1;
    d.hits = hits;
  }
  const kq = phanTichTuan(draws, "xsmn", "deu", "nhan");
  const le = kq.luat.find((l) => l.luat === "tuanLe")!, chan = kq.luat.find((l) => l.luat === "tuanChan")!;
  ok("gài chu kỳ: 'tuần lẻ' vượt (may rủi < 5%), 'tuần chẵn' không; kết luận nêu luật và số phép thử", le.vuot && !chan.vuot && kq.ketLuan.includes("Chỉ đánh tuần lẻ") && kq.ketLuan.includes(`${kq.soPhepThu} luật`), `${le.mayRui} / ${chan.mayRui}`);
  ok("xác suất lọt ngẫu nhiên với 8 phép thử ≈ 34%", kq.soPhepThu === CAC_LUAT.length - 1 && Math.abs(kq.xacSuatLotNgau - 0.337) < 0.01);
  const kq0 = phanTichTuan(lichSu(10), "xsmn", "deu", "gui");
  ok("ít tuần: kết luận 'chưa đủ'", kq0.ketLuan.includes("chưa đủ"));
  const kh = phanTichTuan(lichSu(200), "xsmt", "khach", "gui");
  ok("luật khách: có tuần, có ngày chờ (không đánh), kỳ = 200 − 30 khởi động", kh.tuan.length > 0 && kh.tuan.reduce((s, t) => s + t.soKy, 0) === 170 && kh.tuan.some((t) => t.soNgayDanh < t.soKy));
  const g = phanTichTuan(lichSu(120), "xsmb", "deu", "gui", 7), n = phanTichTuan(lichSu(120), "xsmb", "deu", "nhan", 7);
  void g; void n;
  const draws2 = lichSu(120);
  const g2 = phanTichTuan(draws2, "xsmb", "deu", "gui"), n2 = phanTichTuan(draws2, "xsmb", "deu", "nhan");
  ok("cùng dữ liệu, hai phía: lãi từng tuần đối dấu, theo năm đối dấu", g2.tuan.every((t, i) => gan(t.lai, -n2.tuan[i].lai)) && g2.theoNam.every((y, i) => gan(y.lai, -n2.theoNam[i].lai)));
}

console.log("\n===== 5. Kho dài =====");
{
  const kho = { nguon: "xsmn.mobi", capNhat: "2026-11-09", tu: "2024-01-01", den: "2024-01-02", ky: [["2024-01-02", "05:1 27:2"], ["2024-01-01", "11:1"]] as [string, string][] };
  const dai = docKhoDai(kho);
  ok("đọc kho: 'lo:count' → hits", dai[0].hits["05"] === 1 && dai[0].hits["27"] === 2 && dai[1].hits["11"] === 1);
  const gop = gopKho(dai, [{ date: "2024-01-02", hits: { "99": 1 } }, { date: "2024-01-03", hits: { "01": 1 } }]);
  ok("gộp: trùng ngày lấy kho đang chạy, sắp theo ngày", gop.length === 3 && gop[0].date === "2024-01-01" && gop[1].hits["99"] === 1 && gop[1].hits["05"] === undefined && gop[2].date === "2024-01-03");
}

console.log("\n===== 6. Lời khuyên: tuần này / tuần tới có nên đánh =====");
{
  // 2024-01-01 là thứ 2. Kho ngẫu nhiên 40 tuần trọn (280 kỳ) → kỳ cuối là chủ nhật → hỏi "tuần tới"
  const csDai = lichSu(283, Date.UTC(2024, 0, 1)), cs = csDai.slice(0, 280);
  const pt = phanTichTuan(cs, "xsmn", "deu", "gui");
  const lk = loiKhuyenTuan(pt)!;
  ok("kỳ cuối chủ nhật 06/10/2024 → tuần hỏi là tuần tới 07/10 → 13/10, chưa bắt đầu, 8 tuần gần nhất là 8 tuần trọn cuối", lk.tuan.thu2 === "2024-10-07" && lk.tuan.cn === "2024-10-13" && !lk.daBatDau && lk.soKyDaXo === 0 && lk.tuanGan.length === 8 && lk.tuanGan[7].khoa === pt.tuan[pt.tuan.length - 1].khoa, `${lk.tuan.thu2} ${lk.daBatDau}`);
  const tuanCuoi = pt.tuan[pt.tuan.length - 1], tuanKe = pt.tuan[pt.tuan.length - 2];
  const noi = (k: string) => lk.luat.find((l) => l.luat === k)!;
  ok("luật 'tuần trước ăn' bảo đánh ⇔ tuần trọn cuối lãi > 0; 'tuần trước thua' ngược lại", noi("sauAn").danh === tuanCuoi.lai > 0 && noi("sauThua").danh === tuanCuoi.lai < 0);
  ok("'hai tuần ăn liền' ⇔ hai tuần trọn cuối đều > 0", noi("sau2An").danh === (tuanCuoi.lai > 0 && tuanKe.lai > 0));
  ok("tuần 41 lẻ → 'tuần lẻ' đánh, 'tuần chẵn' nghỉ; thứ 2 = 07/10 rơi vào 1–7 → đầu tháng đánh, cuối tháng nghỉ", lk.tuan.so === 41 && noi("tuanLe").danh && !noi("tuanChan").danh && noi("tuanDauThang").danh && !noi("tuanCuoiThang").danh);
  ok("8 luật, không có mốc 'luôn'", lk.luat.length === 8 && !lk.luat.some((l) => l.luat === "luon"));
  if (!pt.luat.some((l) => l.vuot)) ok("không luật nào vượt → kết 'như nhau', lý do nhắc 'gieo đồng xu' và luật ăn nhất", lk.ket === "nhuNhau" && lk.lyDo.includes("gieo đồng xu") && (lk.tot === null || lk.lyDo.includes(lk.tot.ten)), lk.lyDo);
  else ok("có luật vượt → kết đánh/nghỉ, lý do nhắc may rủi", lk.ket !== "nhuNhau" && lk.lyDo.includes("may rủi"), lk.lyDo);
  // Kỳ cuối thứ 4 → tuần đang dở: đã xổ 3 kỳ, lãi đang có = lãi tuần dở, luật nhìn tuần trọn trước đó
  const cs2 = csDai;
  const pt2 = phanTichTuan(cs2, "xsmn", "deu", "gui");
  const lk2 = loiKhuyenTuan(pt2)!;
  const doDang = pt2.tuan[pt2.tuan.length - 1], tronCuoi = pt2.tuan[pt2.tuan.length - 2];
  ok("kỳ cuối thứ 4 09/10 → tuần này 07/10 → 13/10 đã bắt đầu, đã xổ 3 kỳ, lãi đang có = lãi tuần dở", lk2.daBatDau && lk2.tuan.thu2 === "2024-10-07" && lk2.soKyDaXo === 3 && lk2.laiDangCo === doDang.lai);
  ok("tuần dở không tính vào '8 tuần gần nhất'; luật 'tuần trước ăn' nhìn tuần trọn 30/09 → 06/10", lk2.tuanGan[7].khoa === tronCuoi.khoa && lk2.luat.find((l) => l.luat === "sauAn")!.danh === tronCuoi.lai > 0);
  // Gài: tuần lẻ luôn ăn, tuần chẵn luôn thua (phía nhận) → tuần tới lẻ thì ĐÁNH, chẵn thì NGHỈ
  const gai: NgayLai[] = [];
  for (let i = 0; i < 280; i++) { const d = ngay(i, Date.UTC(2024, 0, 1)); const t = thuTuan(d); gai.push({ date: d, xac: 1_000_000, trung: t.so % 2 === 1 ? 500_000 : 1_500_000, danh: true }); }
  const tuanG = gomTuan(gai, "nhan");
  const ptG = { ...phanTichTuan(cs, "xsmn", "deu", "nhan"), tuan: tuanG, luat: CAC_LUAT.map((l) => danhGiaLuat(tuanG, l.khoa)) };
  const lkG = loiKhuyenTuan(ptG)!;
  ok("gài tuần lẻ ăn, chẵn thua: tuần tới 41 (lẻ) → ĐÁNH, luật 'tuần lẻ' nổi lên", lkG.ket === "danh" && lkG.luat.find((l) => l.luat === "tuanLe")!.vuot && lkG.lyDo.includes("ĐÁNH"), lkG.lyDo);
  const gai2 = gai.concat(Array.from({ length: 7 }, (_, i) => ({ date: ngay(280 + i, Date.UTC(2024, 0, 1)), xac: 1_000_000, trung: 500_000, danh: true })));
  const tuanG2 = gomTuan(gai2, "nhan");
  const lkG2 = loiKhuyenTuan({ ...ptG, denNgay: "2024-10-13", tuan: tuanG2, luat: CAC_LUAT.map((l) => danhGiaLuat(tuanG2, l.khoa)) })!;
  ok("thêm tuần 41 (ăn) → tuần tới 42 chẵn → NGHỈ", lkG2.tuan.so === 42 && lkG2.ket === "nghi", lkG2.lyDo);
  ok("kho rỗng → null", loiKhuyenTuan({ ...pt, denNgay: null, tuan: [] }) === null);
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
