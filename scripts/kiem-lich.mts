/**
 * Bài kiểm của lịch hạn mức lô (src/lib/lich-han-muc.ts). Hàm thuần, không cần DB:
 *
 *   npm run test:lich
 *
 * Giữ ba điều khách chốt sau lần "cài 0 mà máy không chặn":
 *   1. bảng luôn đủ 24 ô — bản lưu thiếu ô nào thì ô đó là 0 và được kể tên;
 *   2. mỗi trạng thái của lô rơi vào đúng MỘT ô, không ô nào lùi về ô khác;
 *   3. ô nào 0 thì đúng và chỉ các lô của ô đó bị chặn (thử cả 24 ô, hai chiều).
 * Kèm phần dựng trạng thái từ lịch sử (liên tiếp mấy kỳ, khô mấy ngày).
 *
 * Sửa lich-han-muc.ts mà bài này đỏ thì đừng đẩy lên: đây là tiền của khách.
 */
import {
  CHUOI_TOI_DA, MUC_TOI_DA, SCHEDULE_SLOTS, chuanHoaLich, datO, docO, dungTrangThai, khoaO, lichMacDinh, moiO, mucTheoLich, oCua, oDangChan, tenO,
  type OLich, type Schedule,
} from "../src/lib/lich-han-muc.ts";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const khoa = (os: OLich[]) => os.map(khoaO);

// May cu (ban dang chay truoc khi sua), chep nguyen de so sanh: o lien tiep thieu thi lui ve o ngay, o ngay thieu thi lui ve min_limit.
const mucCu = (raw: any, days: number, consec: number): number => {
  const ra = Number(raw.consecutive_reset_after ?? 4);
  const rieng = consec > ra ? null : (raw.consecutive?.[consec] ?? null);
  if (rieng !== null) return Number(rieng);
  return Number(raw.base?.[days] ?? raw.min_limit);
};
// moi trang thai co that: chuoi > 0 thi ngay = 0
const TRANG_THAI: [number, number][] = [];
for (let c = 0; c <= CHUOI_TOI_DA; c++) TRANG_THAI.push([0, c]);
for (let d = 1; d <= 45; d++) TRANG_THAI.push([d, 0]);

console.log("===== 1. BANG CO DUNG 24 O =====");
ok("24 o: 20 o ngay + 20+ + 3 o lien tiep", moiO().length === 24 && SCHEDULE_SLOTS === 20 && CHUOI_TOI_DA === 4);
ok("khoa o khong trung nhau", new Set(khoa(moiO())).size === 24);
ok("ten o doc duoc", tenO({ loai: "ngay", so: 0 }) === "ngày 0 (vừa về)" && tenO({ loai: "ngay", so: 7 }) === "ngày 7" && tenO({ loai: "tren" }) === "20+ ngày" && tenO({ loai: "chuoi", so: 3 }) === "liên tiếp 3 kỳ");

console.log("\n===== 2. DUNG TINH HUONG CUA KHACH (Mien Nam) =====");
const baseKhach: Record<string, number> = {};
for (let d = 0; d < 20; d++) baseKhach[d] = [0, 4, 6, 7].includes(d) ? 100 : 0;
const RAW_KHACH = { base: baseKhach, min_limit: 0, consecutive: { "2": 100 }, consecutive_reset_after: 4 };
{
  const { lich, thieu } = chuanHoaLich(RAW_KHACH);
  ok("may CU: lo lien tiep 3 ky duoc nhan 100n (lui ve o ngay 0)", mucCu(RAW_KHACH, 0, 3) === 100 && mucCu(RAW_KHACH, 0, 4) === 100);
  ok("man hinh cu ve o do la:  consecutive['3'] ?? 0  = 0", ((RAW_KHACH.consecutive as any)["3"] ?? 0) === 0);
  ok("may MOI: lo lien tiep 3 ky = 0 (chan), 4 ky = 0 (chan)", mucTheoLich(lich, 0, 3) === 0 && mucTheoLich(lich, 0, 4) === 0);
  ok("lien tiep 2 van 100, vua ve van 100, ngay 4/6/7 van 100", mucTheoLich(lich, 0, 2) === 100 && mucTheoLich(lich, 0, 1) === 100 && [4, 6, 7].every((d) => mucTheoLich(lich, d, 0) === 100));
  ok("bao dung 2 o thieu: lien tiep 3, lien tiep 4", eq(khoa(thieu), ["chuoi:3", "chuoi:4"]), khoa(thieu).join(","));
  ok("o dang chan = 16 o ngay + 20+ + 2 o lien tiep = 19", oDangChan(lich).length === 19, String(oDangChan(lich).length));
}

console.log("\n===== 3. BAN LUU THIEU O: chi o THIEU doi (ve 0), o CO SO giu nguyen =====");
{
  let hat = 20261001;
  const rnd = () => ((hat = (hat * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let lech = 0, saiThieu = 0, dem = 0;
  for (let lan = 0; lan < 400; lan++) {
    const raw: any = { base: {}, consecutive: {}, consecutive_reset_after: 4 };
    for (let d = 0; d < 20; d++) if (rnd() < 0.7) raw.base[d] = Math.floor(rnd() * 250);
    if (rnd() < 0.9) raw.min_limit = Math.floor(rnd() * 60);
    for (let n = 2; n <= 4; n++) if (rnd() < 0.6) raw.consecutive[n] = Math.floor(rnd() * 250);
    if (Object.keys(raw.base).length === 0) raw.base[0] = 5;
    const { lich, thieu } = chuanHoaLich(raw);
    const thieuSet = new Set(khoa(thieu));
    for (const [d, c] of TRANG_THAI) {
      dem++;
      const o = oCua(d, c), k = khoaO(o);
      const coSo = o.loai === "tren" ? raw.min_limit !== undefined : o.loai === "chuoi" ? raw.consecutive[o.so] !== undefined : raw.base[o.so] !== undefined;
      const moi = mucTheoLich(lich, d, c);
      if (coSo) { if (moi !== mucCu(raw, d, c)) lech++; if (thieuSet.has(k)) saiThieu++; }
      else { if (moi !== 0) lech++; if (!thieuSet.has(k)) saiThieu++; }
    }
  }
  ok(`400 ban luu ngau nhien x ${TRANG_THAI.length} trang thai: o co so -> y nhu may cu; o thieu -> 0`, lech === 0, `${lech} lech / ${dem}`);
  ok("danh sach 'thieu' ke dung va du cac o thieu", saiThieu === 0, String(saiThieu));
}
{
  // ban luu thoi 10 o (truoc 19/08): ngay 10..19 khong co
  const raw = { base: { 0: 15, 1: 200, 2: 150, 3: 113, 4: 85, 5: 64, 6: 48, 7: 36, 8: 27, 9: 20 }, min_limit: 15, consecutive: { 2: 15, 3: 15, 4: 15 }, consecutive_reset_after: 4 };
  const { lich, thieu } = chuanHoaLich(raw);
  ok("ban luu 10 o: ngay 10..19 thieu -> 0 va duoc ke ten", eq(khoa(thieu), Array.from({ length: 10 }, (_, i) => `ngay:${i + 10}`)) && [10, 15, 19].every((d) => mucTheoLich(lich, d, 0) === 0));
  ok("ban luu 10 o: 20+ van la min_limit 15, ngay 0..9 giu nguyen", mucTheoLich(lich, 20, 0) === 15 && mucTheoLich(lich, 33, 0) === 15 && mucTheoLich(lich, 3, 0) === 113);
}

console.log("\n===== 4. THU LA THI KHONG DOAN: ve 0 va bao ra =====");
{
  const raw = { base: { 0: "abc", 1: null, 2: -5, 3: 3.7, 4: 1e9, 5: true, 6: [], 7: {}, 8: "", 9: " 12 ", 10: "40", 11: NaN, 12: Infinity, 13: 0, 14: "0", 25: 99, x: 5 }, min_limit: "7", consecutive: { 1: 55, 2: "x", 3: 30, 5: 77 }, consecutive_reset_after: 9 };
  const { lich, thieu } = chuanHoaLich(raw);
  const t = new Set(khoa(thieu));
  ok("chu, null, true, [], {}, '', NaN, Infinity -> khong phai so -> 0 + bao", ["ngay:0", "ngay:1", "ngay:5", "ngay:6", "ngay:7", "ngay:8", "ngay:11", "ngay:12"].every((k) => t.has(k)) && [0, 1, 5, 6, 7, 8, 11, 12].every((d) => lich.base[d] === 0));
  ok("so am -> 0 (khong bao thieu, vi co so)", lich.base[2] === 0 && !t.has("ngay:2"));
  ok("so le lam tron, so qua lon bi chan tran", lich.base[3] === 4 && lich.base[4] === MUC_TOI_DA);
  ok("chuoi so ' 12 ' va '40' doc duoc; 0 va '0' la 0 that (khong bao thieu)", lich.base[9] === 12 && lich.base[10] === 40 && lich.base[13] === 0 && lich.base[14] === 0 && !t.has("ngay:13") && !t.has("ngay:14"));
  ok("khoa la (ngay 25, 'x', lien tiep 1, lien tiep 5) bi bo — khong co o tang hinh", Object.keys(lich.base).length === 20 && eq(Object.keys(lich.consecutive), ["2", "3", "4"]));
  ok("lien tiep: 'x' -> 0 + bao; 3 giu 30; 4 thieu -> 0 + bao", lich.consecutive[2] === 0 && lich.consecutive[3] === 30 && lich.consecutive[4] === 0 && t.has("chuoi:2") && t.has("chuoi:4") && !t.has("chuoi:3"));
  ok("min_limit '7' doc duoc; consecutive_reset_after luon la 4", lich.min_limit === 7 && lich.consecutive_reset_after === 4);
  const lan2 = chuanHoaLich(lich);
  ok("chuan hoa lan hai khong doi gi, khong con o thieu", eq(lan2.lich, lich) && lan2.thieu.length === 0);
  ok("chua luu gi (null / undefined / chuoi) -> bang mac dinh du 24 o, khong o thieu", [null, undefined, "x", 5].every((r) => { const k = chuanHoaLich(r); return eq(k.lich, lichMacDinh()) && k.thieu.length === 0; }));
  ok("object rong {} -> moi o 0, ke du 24 o thieu (ban luu hong: chan het chu khong nhan bua)", chuanHoaLich({}).thieu.length === 24 && oDangChan(chuanHoaLich({}).lich).length === 24);
  const md = lichMacDinh();
  ok("bang mac dinh: 200,180..20 roi 10 cho ngay 10..19, 20+ = 10, lien tiep 150/100/50", [200, 180, 160, 140, 120, 100, 80, 60, 40, 20].every((v, d) => md.base[d] === v) && [10, 11, 19].every((d) => md.base[d] === 10) && md.min_limit === 10 && eq(md.consecutive, { 2: 150, 3: 100, 4: 50 }));
}

console.log("\n===== 5. TRANG THAI NAO -> O NAO (dung MOT o) =====");
{
  let sai = 0;
  for (let d = 0; d <= 60; d++) for (let c = 0; c <= 9; c++) {
    const o = oCua(d, c);
    const mong: OLich = d === 0 && c >= 2 && c <= 4 ? { loai: "chuoi", so: c } : d >= 20 ? { loai: "tren" } : { loai: "ngay", so: d };
    if (khoaO(o) !== khoaO(mong)) sai++;
  }
  ok("61 muc ngay x 10 muc chuoi: lien tiep 2-4 (ngay 0) -> o lien tiep; ngay >= 20 -> 20+; con lai -> o ngay", sai === 0, String(sai));
  ok("da truot ky (ngay > 0) thi KHONG con o lien tiep, du so chuoi ghi gi", [1, 2, 5, 19].every((d) => [2, 3, 4].every((c) => oCua(d, c).loai === "ngay")) && oCua(25, 3).loai === "tren");
  ok("chuoi 1 va chuoi > 4 (da dem lai) -> o ngay 0", khoaO(oCua(0, 1)) === "ngay:0" && khoaO(oCua(0, 5)) === "ngay:0" && khoaO(oCua(0, 0)) === "ngay:0");
  ok("so xau (NaN, am, le) khong lam sap: am -> ngay 0, 3.9 -> ngay 3, NaN -> 20+", khoaO(oCua(-3, 0)) === "ngay:0" && khoaO(oCua(3.9, 0)) === "ngay:3" && khoaO(oCua(NaN, 0)) === "tren" && khoaO(oCua(0, NaN)) === "ngay:0");
}

console.log("\n===== 6. TUNG O RIENG BIET: o nao 0 thi dung lo cua o do bi chan, khong lan sang o khac =====");
{
  let saiChan = 0, saiMo = 0;
  for (const o of moiO()) {
    // (a) chi o nay = 0, 23 o kia = 777
    let l = lichMacDinh();
    for (const x of moiO()) l = datO(l, x, khoaO(x) === khoaO(o) ? 0 : 777);
    for (const [d, c] of TRANG_THAI) {
      const cuaO = khoaO(oCua(d, c)) === khoaO(o);
      if (mucTheoLich(l, d, c) !== (cuaO ? 0 : 777)) saiChan++;
    }
    // (b) chi o nay = 555, 23 o kia = 0
    let m = lichMacDinh();
    for (const x of moiO()) m = datO(m, x, khoaO(x) === khoaO(o) ? 555 : 0);
    for (const [d, c] of TRANG_THAI) {
      const cuaO = khoaO(oCua(d, c)) === khoaO(o);
      if (mucTheoLich(m, d, c) !== (cuaO ? 555 : 0)) saiMo++;
    }
  }
  ok("24 o, moi o lan luot la o DUY NHAT bi chan: dung va chi lo cua o do ve 0", saiChan === 0, String(saiChan));
  ok("24 o, moi o lan luot la o DUY NHAT duoc nhan: dung va chi lo cua o do duoc nhan", saiMo === 0, String(saiMo));
  const coTrangThai = new Set(TRANG_THAI.map(([d, c]) => khoaO(oCua(d, c))));
  ok("o nao cung co trang thai roi vao (khong o chet)", moiO().every((o) => coTrangThai.has(khoaO(o))));
  const l0 = lichMacDinh();
  const l1 = datO(l0, { loai: "chuoi", so: 3 }, 0);
  ok("datO khong sua ban goc, chi doi dung 1 o", docO(l0, { loai: "chuoi", so: 3 }) === 100 && docO(l1, { loai: "chuoi", so: 3 }) === 0 && moiO().filter((o) => docO(l0, o) !== docO(l1, o)).length === 1);
  ok("docO tren lich CHUA chuan hoa ma thieu o -> 0 (cung luat)", docO(RAW_KHACH as unknown as Schedule, { loai: "chuoi", so: 3 }) === 0 && mucTheoLich(RAW_KHACH as unknown as Schedule, 0, 3) === 0);
}

console.log("\n===== 7. TRANG THAI DUNG TU LICH SU =====");
{
  const ngay = (i: number) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
  const R = (bang: Record<string, number[]>) => { const out: { date: string; lo_number: string }[] = []; for (const [lo, ds] of Object.entries(bang)) for (const i of ds) out.push({ date: ngay(i), lo_number: lo }); return out; };
  // 10 ky lien (ngay 0..9); 99 ve moi ky de ky nao cung co mat trong kho
  const moiKy = Array.from({ length: 10 }, (_, i) => i);
  const rows = R({ "99": moiKy, "01": [7, 8, 9], "02": [8, 9], "03": [9], "04": [6, 7, 8], "05": [4, 5, 6, 7, 8, 9], "06": [2], "07": [5, 7, 9], "08": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const { ngayCuoi, lo } = dungTrangThai(rows);
  const s = (x: string) => lo.get(x)!;
  ok("ky moi nhat = ngay cuoi trong kho", ngayCuoi === ngay(9));
  ok("01 ve 3 ky lien toi ky cuoi -> lien tiep 3, ngay 0", s("01").consec === 3 && s("01").days === 0 && s("01").last === ngay(9));
  ok("02 -> lien tiep 2; 03 -> vua ve (1)", s("02").consec === 2 && s("03").consec === 1 && s("03").days === 0);
  ok("04 ve 3 ky roi TRUOT ky cuoi -> chuoi 0, 1 ngay chua ve", s("04").consec === 0 && s("04").days === 1);
  ok("05 ve 6 ky lien -> dem lai sau 4: 1,2,3,4,1,2 -> lien tiep 2", s("05").consec === 2 && s("05").days === 0);
  ok("08 ve 10 ky lien -> 1,2,3,4,1,2,3,4,1,2 -> lien tiep 2", s("08").consec === 2);
  ok("06 ve mot lan o ky thu 3 -> 7 ngay chua ve", s("06").consec === 0 && s("06").days === 7);
  ok("07 ve cach ky (5,7,9) -> khong thanh chuoi: lien tiep 1", s("07").consec === 1 && s("07").days === 0);
  ok("lo chua tung ve -> last null, chuoi 0", s("50").last === null && s("50").consec === 0 && s("50").days === 10);
  ok("du 100 lo", lo.size === 100);
  // thu tu dong khong anh huong
  const dao = [...rows].reverse();
  const xao = [...rows].sort((a, b) => (a.lo_number + a.date < b.lo_number + b.date ? -1 : 1));
  const nhu = (a: ReturnType<typeof dungTrangThai>, b: ReturnType<typeof dungTrangThai>) => a.ngayCuoi === b.ngayCuoi && [...a.lo].every(([k, v]) => eq(v, b.lo.get(k)));
  ok("dao / xao thu tu dong -> cung trang thai", nhu(dungTrangThai(dao), dungTrangThai(rows)) && nhu(dungTrangThai(xao), dungTrangThai(rows)));
  // kho hong mot ngay (khong co ky ngay 8): chuoi qua lo hong bi cat
  const hong = R({ "99": [0, 1, 2, 3, 4, 5, 6, 7, 9], "01": [7, 9], "08": [5, 6, 7, 9] });
  const h = dungTrangThai(hong).lo;
  ok("kho hong 1 ngay: ve ngay 7 va ngay 9 (khong co ky ngay 8) -> KHONG tinh lien tiep", h.get("01")!.consec === 1 && h.get("08")!.consec === 1);
  ok("kho rong -> khong sap, ngayCuoi null", dungTrangThai([]).ngayCuoi === null && dungTrangThai([]).lo.size === 100);
  // "dai chua xo xong": xu ly ky cuoi 2 lan (nua dau roi du) phai ra y nhu xu ly 1 lan
  const nuaDau = rows.filter((r) => !(r.date === ngay(9) && ["01", "02"].includes(r.lo_number)));
  const giua = dungTrangThai(nuaDau).lo;
  ok("ket qua moi co mot nua (01, 02 chua xo): luc do 01 dang 0 chuoi", giua.get("01")!.consec === 0 && giua.get("01")!.days === 1);
  ok("co du ket qua thi 01 ve lai dung lien tiep 3 — khong bi 'cat chuoi ve 1' nhu duong cap nhat tung ngay cu", dungTrangThai(rows).lo.get("01")!.consec === 3);
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
