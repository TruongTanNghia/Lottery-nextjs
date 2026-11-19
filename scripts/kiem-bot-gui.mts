/**
 * Bài kiểm bot gửi tự động — phần thuần (src/lib/bot-gui-thuan.ts) sau khi khách
 * chốt 18/10/2026: khung giờ mới, nội dung = số nhận đá PA2, chia tin ngắn,
 * gửi nối tiếp cho tới hết (tiến độ từng miền).
 *
 *   npm run test:botgui
 */
import {
  DO_DAI_TIN_MAC_DINH, MAC_DINH_BOT_GUI, MAC_DINH_NHOM_2, batDauTu, chuanHoaBotGui, chuoiLoGui, daGuiHomNay, gioVN, khoiLoGui, chiaTin, lenhNhom, tenNoiDungGui, phutConLai, soTinLuotNay, tachNhom, tenNhomSo, trongKhung,
} from "../src/lib/bot-gui-thuan";
import { chuoiNhanDeu, chuoiNhanMien, nhomNhanDa } from "../src/lib/da-nhan";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
/** Một thời điểm giờ VN hôm 2026-10-20. */
const luc = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+07:00`);

console.log("\n===== Khung giờ khách chốt 18/10 =====");
ok("mặc định (khách 22/10): Mn 15:40–16:08, Mt 16:40–17:08, Mb 17:40–18:08; tiền tố Mn 2d / Mt 2d / Mb ", MAC_DINH_BOT_GUI.mien.xsmn.tu === "15:40" && MAC_DINH_BOT_GUI.mien.xsmn.den === "16:08" && MAC_DINH_BOT_GUI.mien.xsmt.tu === "16:40" && MAC_DINH_BOT_GUI.mien.xsmb.tu === "17:40" && MAC_DINH_BOT_GUI.mien.xsmb.den === "18:08" && MAC_DINH_BOT_GUI.mien.xsmn.tienTo === "Mn 2d" && MAC_DINH_BOT_GUI.mien.xsmt.tienTo === "Mt 2d" && MAC_DINH_BOT_GUI.mien.xsmb.tienTo === "Mb ");
ok("15:39 ngoài khung Mn, 15:40 và 16:08 trong khung, 16:09 ngoài", !trongKhung(luc("15:39"), MAC_DINH_BOT_GUI.mien.xsmn) && trongKhung(luc("15:40"), MAC_DINH_BOT_GUI.mien.xsmn) && trongKhung(luc("16:08"), MAC_DINH_BOT_GUI.mien.xsmn) && !trongKhung(luc("16:09"), MAC_DINH_BOT_GUI.mien.xsmn));
{
  // Bản lưu từ trước (khung cũ, do /nhomgui hay /batgui lưu cả cấu hình) → đọc lên thành khung mới.
  const cu = chuanHoaBotGui({ nhom: 1, mien: { xsmn: { bat: true, tu: "15:30", den: "16:05", tienTo: "2d" }, xsmt: { bat: false, tu: "16:40", den: "17:05", tienTo: "2d" }, xsmb: { bat: false, tu: "17:40", den: "18:05", tienTo: "mb " } } });
  ok("bản lưu còn y khung cũ (15:30/16:40/17:40) → tự thành khung mới, giữ nguyên bật/tắt và tiền tố", cu.mien.xsmn.tu === "15:40" && cu.mien.xsmt.tu === "16:40" && cu.mien.xsmb.tu === "17:40" && cu.mien.xsmn.bat === true && cu.mien.xsmb.tienTo === "mb ");
  const cu2 = chuanHoaBotGui({ mien: { xsmn: { tu: "15:50", den: "16:05" }, xsmt: { tu: "16:50", den: "17:05" }, xsmb: { tu: "17:50", den: "18:05" } } });
  ok("bản lưu khung đợt 18/10 (15:50/16:50/17:50) → cũng thành khung mới", cu2.mien.xsmn.den === "16:08" && cu2.mien.xsmt.tu === "16:40" && cu2.mien.xsmb.den === "18:08");
  const tay = chuanHoaBotGui({ mien: { xsmn: { tu: "15:35", den: "16:00" } } });
  ok("khung khách đặt tay (15:35–16:00) thì giữ nguyên", tay.mien.xsmn.tu === "15:35" && tay.mien.xsmn.den === "16:00");
}

console.log("\n===== Nội dung gửi, độ dài tin =====");
{
  const md = chuanHoaBotGui(null);
  ok(`mặc định: nội dung = số nhận đá PA2, mỗi tin ≤ ${DO_DAI_TIN_MAC_DINH}`, md.noiDung === "da2" && md.doDaiTin === DO_DAI_TIN_MAC_DINH);
  ok("đặt 'lo' thì ra 'lo'; chữ lạ thì về 'da2'", chuanHoaBotGui({ noiDung: "lo" }).noiDung === "lo" && chuanHoaBotGui({ noiDung: "xyz" }).noiDung === "da2");
  ok("độ dài tin kẹp 500–3400; lạ thì về mặc định", chuanHoaBotGui({ doDaiTin: 100 }).doDaiTin === 500 && chuanHoaBotGui({ doDaiTin: 9999 }).doDaiTin === 3400 && chuanHoaBotGui({ doDaiTin: "abc" }).doDaiTin === DO_DAI_TIN_MAC_DINH && chuanHoaBotGui({ doDaiTin: 1500 }).doDaiTin === 1500);
}

console.log("\n===== Tiến độ: gửi nối tiếp cho tới hết, không gửi lại =====");
{
  const now = luc("15:52");
  const ngay = gioVN(now).ngay;
  ok("chưa có tiến độ → bắt đầu từ phần 0", batDauTu(now, undefined) === 0);
  ok("hôm nay đã gửi 3/7 → bắt đầu từ phần 3 (phần thứ 4)", batDauTu(now, { ngay, daGui: 3, tong: 7 }) === 3);
  ok("hôm nay đã gửi đủ 7/7 → về 0 (bên gọi còn chốt 'đã gửi đủ' riêng)", batDauTu(now, { ngay, daGui: 7, tong: 7 }) === 0);
  ok("tiến độ của ngày hôm qua → bỏ, bắt đầu từ 0", batDauTu(now, { ngay: "2026-10-19", daGui: 3, tong: 7 }) === 0);
  const c = chuanHoaBotGui({ tienDo: { xsmn: { ngay, daGui: 2, tong: 5 }, xsmt: { ngay: "x", daGui: 1, tong: 2 }, xsmb: { ngay, daGui: 9, tong: 5 } } });
  ok("đọc tiến độ từ bản lưu: hợp lệ giữ, ngày sai / đã gửi > tổng thì bỏ", c.tienDo.xsmn?.daGui === 2 && !c.tienDo.xsmt && !c.tienDo.xsmb);
  ok("'đã gửi đủ hôm nay' vẫn theo mốc daGui (ISO) như trước", daGuiHomNay(now, luc("15:40").toISOString()) && !daGuiHomNay(now, new Date("2026-10-19T09:00:00+07:00").toISOString()));
}

console.log("\n===== Chia tin: mỗi tin ≤ độ dài, mở bằng tiền tố, ghép lại = đủ cặp =====");
{
  // 100 con, bảng nhận hết ở mức 1 → 4.950 cặp, chuỗi rất dài → nhiều phần.
  const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  const cap: [string, string, number][] = [];
  for (let x = 0; x < 100; x++) for (let y = x + 1; y < 100; y++) cap.push([LOS[y], LOS[x], (x + y) % 3 === 0 ? 2 : 1]);
  for (const doDai of [500, 2000, 3400]) {
    const khoi = chuoiNhanMien("2d", nhomNhanDa(cap), "xsmn", doDai);
    const u = new Set<string>(); let viet = 0;
    for (const k of khoi) { let con: string[] = []; for (const tu of k.slice(2).trim().split(/\s+/)) { if (/^\d\d$/.test(tu)) { con.push(tu); continue; } const g = tu.match(/^(\d\d)?dx(\d+)n$/); if (!g) { con = []; continue; } if (g[1]) con.push(g[1]); for (let i = 0; i < con.length; i++) for (let j = i + 1; j < con.length; j++) { viet++; u.add([con[i], con[j]].sort().join("-")); } con = []; } }
    ok(`độ dài ${doDai}: ${khoi.length} phần, phần nào cũng ≤ ${doDai} ký tự và mở bằng "2d"; ghép lại đủ 4.950 cặp, không cặp nào hai lần`, khoi.every((k) => k.length <= doDai && k.startsWith("2d")) && u.size === 4950 && viet === 4950, `${khoi.length} phần, viết ${viet}`);
  }
}

console.log("\n===== Gửi từ từ (khách 22/10): 50 tin mỗi miền, 2 tin/phút, chia đều theo cặp =====");
{
  const md = chuanHoaBotGui(null);
  ok("mặc định 50 tin/miền, 2 tin/phút; kẹp 1–200 và 1–10", md.soTin === 50 && md.tinMoiPhut === 2 && chuanHoaBotGui({ soTin: 0 }).soTin === 50 && chuanHoaBotGui({ soTin: 80 }).soTin === 80 && chuanHoaBotGui({ tinMoiPhut: 99 }).tinMoiPhut === 2 && chuanHoaBotGui({ tinMoiPhut: 3 }).tinMoiPhut === 3);
  const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
  const cap: [string, string, number][] = [];
  for (let x = 0; x < 100; x++) for (let y = x + 1; y < 100; y++) if ((x * 7 + y) % 11 === 0) cap.push([LOS[y], LOS[x], (x + y) % 2 ? 10 : 5]);
  const khoi = chuoiNhanDeu("Mn 2d", cap, 50, "xsmn", 2000);
  const dem = khoi.map((k) => (k.match(/dx\d+n/g) ?? []).length);
  const u = new Map<string, number>(); let viet = 0;
  for (const k of khoi) for (const m of k.slice(5).matchAll(/(\d\d) (\d\d)dx(\d+)n/g)) { viet++; u.set(m[1] + "-" + m[2], Number(m[3])); }
  ok(`${cap.length} cặp → 50 tin, mỗi tin ${Math.min(...dem)}–${Math.max(...dem)} cặp (lệch ≤ 1), mở bằng "Mn 2d", từng cặp "a bdxNn"`, khoi.length === 50 && Math.max(...dem) - Math.min(...dem) <= 1 && khoi.every((k) => /^Mn 2d\d\d \d\ddx\d+n/.test(k)), `${khoi.length} tin`);
  ok("ghép 50 tin = đúng tập cặp, đúng điểm, mỗi cặp đúng 1 lần, con nhỏ đứng trước", viet === cap.length && u.size === cap.length && cap.every(([a, b, d]) => u.get((a < b ? a : b) + "-" + (a < b ? b : a)) === d) && [...u.keys()].every((k) => k.slice(0, 2) < k.slice(3)));
  ok("ít cặp hơn số tin (7 cặp, 50 tin) → 7 tin, mỗi tin 1 cặp", chuoiNhanDeu("2d", cap.slice(0, 7), 50, "xsmn", 2000).length === 7);
  const mb = chuoiNhanDeu("Mb ", cap.slice(0, 3), 1, "xsmb", 2000)[0];
  ok("Bắc: tiền tố 'Mb ', đuôi daNn", mb.startsWith("Mb ") && /da(5|10)n/.test(mb) && !mb.includes("dx"));
  ok("trần ký tự: 3 tin với doDai 120 → tự tách thêm, không tin nào quá 120", chuoiNhanDeu("2d", cap, 3, "xsmn", 120).every((k) => k.length <= 120));
  const k = { tu: "15:40", den: "16:08" };
  ok("15:40 còn 29 lượt; 16:08 còn 1; 16:09 còn 0", phutConLai(luc("15:40"), k) === 29 && phutConLai(luc("16:08"), k) === 1 && phutConLai(luc("16:09"), k) === 0);
  ok("đúng nhịp: còn 50 tin, 29 lượt, 2 tin/phút → lượt này 2 tin", soTinLuotNay(50, 29, 2) === 2);
  ok("bắt đầu trễ: còn 50 tin mà chỉ 10 lượt → 5 tin/lượt để kịp", soTinLuotNay(50, 10, 2) === 5);
  ok("gần xong: còn 1 tin → 1; hết → 0; hết lượt mà còn 7 tin → gửi cả 7", soTinLuotNay(1, 20, 2) === 1 && soTinLuotNay(0, 5, 2) === 0 && soTinLuotNay(7, 0, 2) === 7);
}

console.log("\n===== Chuỗi lô (nội dung 'lo') vẫn như cũ =====");
ok("2d16b100, 15b50 — lô 0 điểm bị bỏ", chuoiLoGui([{ lo_number: "16", current_limit: 100 }, { lo_number: "15", current_limit: 50 }, { lo_number: "01", current_limit: 0 }], "2d") === "2d15b50, 16b100");

console.log("\n===== Nhóm 2 (khách 19/11: gửi thêm 1 nhóm, lô 2 số từ 15:00) =====");
{
  const n2 = chuanHoaBotGui(null, 2);
  ok("nhóm 2 mặc định (khách 20/11): số dự báo THEO Ô KHÁCH CHỌN trên tab; chưa chọn nhóm, cả 3 miền TẮT, khung 15:00 → 16:08 / 17:08 / 18:08, tiền tố như nhóm 1", n2.noiDung === "dubao" && n2.duBao.cach === "chon" && n2.duBao.soCon === 10 && n2.duBao.diem === 1 && n2.nhom === null && !n2.mien.xsmn.bat && !n2.mien.xsmt.bat && !n2.mien.xsmb.bat && n2.mien.xsmn.tu === "15:00" && n2.mien.xsmt.tu === "15:00" && n2.mien.xsmb.tu === "15:00" && n2.mien.xsmn.den === "16:08" && n2.mien.xsmt.den === "17:08" && n2.mien.xsmb.den === "18:08" && n2.mien.xsmn.tienTo === "Mn 2d" && n2.mien.xsmb.tienTo === "Mb ");
  const n1 = chuanHoaBotGui(null);
  ok("nhóm 1 mặc định KHÔNG đổi: đá PA2, khung 15:40 / 16:40 / 17:40", n1.noiDung === "da2" && n1.mien.xsmn.tu === "15:40" && n1.mien.xsmt.tu === "16:40" && n1.mien.xsmb.tu === "17:40" && JSON.stringify(n1) === JSON.stringify(chuanHoaBotGui(null, 1)));
  ok("15:00 trong khung Mn nhóm 2, 14:59 ngoài; 15:00 vẫn ngoài khung nhóm 1", trongKhung(luc("15:00"), n2.mien.xsmn) && !trongKhung(luc("14:59"), n2.mien.xsmn) && !trongKhung(luc("15:00"), n1.mien.xsmn));
  const da = chuanHoaBotGui({ noiDung: "da2", nhom: -5001, tenNhom: "Mới", mien: { xsmn: { bat: true, tu: "15:30", den: "16:05", tienTo: "Mn 2d" } } }, 2);
  ok("nhóm 2 lưu 'da2' thì giữ da2; khung 15:30–16:05 KHÔNG bị đổi như khung cũ nhóm 1; giữ nhóm, bật", da.noiDung === "da2" && da.mien.xsmn.tu === "15:30" && da.mien.xsmn.den === "16:05" && da.nhom === -5001 && da.mien.xsmn.bat && da.mien.xsmt.tu === "15:00");
  ok("nhóm 2 lưu nội dung lạ → về mặc định của nhóm 2 (dubao); nhóm 1 lạ → da2; 'lo' và 'dubao' giữ nguyên", chuanHoaBotGui({ noiDung: "x" }, 2).noiDung === "dubao" && chuanHoaBotGui({ noiDung: "x" }).noiDung === "da2" && chuanHoaBotGui({ noiDung: "lo" }, 2).noiDung === "lo" && chuanHoaBotGui({ noiDung: "dubao" }).noiDung === "dubao");
  const dbx = chuanHoaBotGui({ duBao: { cach: "loi", soCon: 20, diem: 7 } }, 2), dby = chuanHoaBotGui({ duBao: { cach: "?", soCon: 12, diem: 0 } }, 2);
  ok("cấu hình dự báo: 'loi', 20 con, 7 điểm giữ nguyên; lạ ('?', 12 con, 0 điểm) → chon, 10, 1", dbx.duBao.cach === "loi" && dbx.duBao.soCon === 20 && dbx.duBao.diem === 7 && dby.duBao.cach === "chon" && dby.duBao.soCon === 10 && dby.duBao.diem === 1);
  ok("bản lưu 19/11 (cach 'tot', chưa có v) → đọc thành 'chon'; 'tot' lưu sau 20/11 (v 2) thì giữ; luôn ghi v 2", chuanHoaBotGui({ duBao: { cach: "tot" } }, 2).duBao.cach === "chon" && chuanHoaBotGui({ duBao: { cach: "tot", v: 2 } }, 2).duBao.cach === "tot" && chuanHoaBotGui({ duBao: { cach: "chon", v: 2 } }, 2).duBao.cach === "chon" && chuanHoaBotGui(null, 2).duBao.v === 2);
  ok("tên nội dung: dubao/chon ghi 'theo ô anh chọn trên tab'; tot ghi 'ô lời nhất…, 10 con × 1 điểm'; lo ghi 'hạn mức'", tenNoiDungGui(n2).includes("theo ô anh chọn trên tab Dự Báo") && tenNoiDungGui({ noiDung: "dubao", duBao: { ...n2.duBao, cach: "tot" } }).includes("ô lời nhất của thứ hôm đó, 10 con × 1 điểm") && tenNoiDungGui({ noiDung: "lo", duBao: n2.duBao }).includes("hạn mức") && tenNoiDungGui(dbx).includes("gộp hết ô đang lời"));
  ok("MAC_DINH_NHOM_2 không dính tiến độ / đã gửi của nhóm 1", JSON.stringify(MAC_DINH_NHOM_2.daGui) === "{}" && JSON.stringify(MAC_DINH_NHOM_2.tienDo) === "{}");
  ok("câu chữ: nhóm 1 để trống như cũ, nhóm 2 ghi ' nhóm 2'; lệnh gợi ý '/guingay 2 mn'", tenNhomSo(1) === "" && tenNhomSo(2) === " nhóm 2" && "/guingay " + lenhNhom(2) + "mn" === "/guingay 2 mn" && "/guingay " + lenhNhom(1) + "mn" === "/guingay mn");
}
{
  const t = (a: string[], laSo = false) => { const r = tachNhom(a, laSo); return r.so + ":" + r.con.join(","); };
  ok("tách nhóm: '2 all' → 2:all; 'n2 mn' → 2:mn; 'nhom2 mn' → 2:mn; 'mn' → 1:mn; '1 mn' → 1:mn", t(["2", "all"]) === "2:all" && t(["n2", "mn"]) === "2:mn" && t(["nhom2", "mn"]) === "2:mn" && t(["mn"]) === "1:mn" && t(["1", "mn"]) === "1:mn");
  ok("lệnh giá trị là số: '/sotin 2' = nhóm 1 giá trị 2; '/sotin 2 50' = nhóm 2 giá trị 50; '3' không phải nhóm", t(["2"], true) === "1:2" && t(["2", "50"], true) === "2:50" && t(["3", "mn"]) === "1:3,mn" && t([]) === "1:");
}
{
  const rows = Array.from({ length: 100 }, (_, i) => ({ lo_number: String(i).padStart(2, "0"), current_limit: i % 3 === 0 ? 0 : (i % 7) + 1 }));
  const nhan = rows.filter((r) => r.current_limit > 0);
  const mot = khoiLoGui(rows, "Mn 2d", 2000);
  ok("lô một tin khi đủ ngắn: = chuoiLoGui cũ", mot.length === 1 && mot[0] === chuoiLoGui(rows, "Mn 2d"), mot[0].length + " ký tự");
  const nhieu = khoiLoGui(rows, "Mn 2d", 120);
  const doc = nhieu.flatMap((k) => k.replace(/^Mn 2d/, "").split(", "));
  ok("độ dài 120: nhiều tin, mỗi tin ≤ 120 và mở bằng 'Mn 2d'; ghép lại đúng " + nhan.length + " lô, đúng điểm, không trùng", nhieu.length > 1 && nhieu.every((k) => k.length <= 120 && k.startsWith("Mn 2d")) && doc.length === nhan.length && new Set(doc).size === doc.length && nhan.every((r) => doc.includes(r.lo_number + "b" + r.current_limit)), nhieu.length + " tin");
  const muc = ["85b1", "00b1", "04b1", "07b1", "12b1"];
  ok("chiaTin giữ NGUYÊN thứ tự (như chuỗi Gộp số trên tab), không sắp lại", chiaTin(muc, "Mn 2d", 2000)[0] === "Mn 2d85b1, 00b1, 04b1, 07b1, 12b1" && chiaTin(muc, "Mn 2d", 20).every((k) => k.length <= 20 && k.startsWith("Mn 2d")) && chiaTin(muc, "Mn 2d", 20).flatMap((k) => k.slice(5).split(", ")).join() === muc.join() && chiaTin([], "x", 100).length === 0);
  ok("không lô nào nhận → không tin nào", khoiLoGui(rows.map((r) => ({ ...r, current_limit: 0 })), "Mn 2d", 2000).length === 0);
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
