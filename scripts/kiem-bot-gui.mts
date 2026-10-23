/**
 * Bài kiểm bot gửi tự động — phần thuần (src/lib/bot-gui-thuan.ts) sau khi khách
 * chốt 18/10/2026: khung giờ mới, nội dung = số nhận đá PA2, chia tin ngắn,
 * gửi nối tiếp cho tới hết (tiến độ từng miền).
 *
 *   npm run test:botgui
 */
import {
  DO_DAI_TIN_MAC_DINH, MAC_DINH_BOT_GUI, batDauTu, chuanHoaBotGui, chuoiLoGui, daGuiHomNay, gioVN, phutConLai, soTinLuotNay, trongKhung,
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

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
