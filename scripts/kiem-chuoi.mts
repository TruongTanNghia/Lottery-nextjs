/**
 * Bài kiểm của tab Check (src/lib/kiem-chuoi.ts). Hàm thuần, không cần DB:
 *
 *   npm run test:chuoi
 *
 * Tab Check tính lại hạn mức bằng một đường RIÊNG để cãi lại bộ máy. Bài này
 * giữ ba điều:
 *  (1) khi bộ máy đúng thì hai đường ra cùng một số, trên lịch sử và bảng ngẫu nhiên;
 *  (2) khi bộ máy sai — dựng lại đúng lỗi 01/10 và các biến thể có cặp đảo — tab
 *      Check phải bắt được và chỉ đúng những số sai trong chuỗi;
 *  (3) mỗi lỗi mà đợt rà soát 02/10 đã xác nhận có một phép kiểm riêng (mục 6),
 *      đặt tên theo mã lỗi của đợt rà soát.
 * Phần nhịp đều / top được kiểm thật với bộ máy ở bài kiểm đầu-cuối trên máy
 * chủ, vì phần đó cần DB.
 */
import {
  bacDaMien, canCu, capDaBiChan, docChuoi, kiemDa, kiemLo, luatLoMien, trungGiuaDong, HAU_TO_DA,
  type CongTacGiam, type DongMay, type DuLieuMien, type KyVe, type LichDoc,
} from "../src/lib/kiem-chuoi.ts";
import { provincePrefix } from "../src/lib/provinces.ts";
import { chuanHoaLich, dungTrangThai, mucTheoLich } from "../src/lib/lich-han-muc.ts";
import { SO_O_DA, apChanLuat, bangMacDinh, capBiChan, chiaKhoiChanDa, chuanHoaBang, dongChanLq, khoKyToi, khoiChanLq, laBangCu, moRongDanhSachCu, nhomChanDa } from "../src/lib/da.ts";

type Region = "xsmn" | "xsmt" | "xsmb";
let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const NL = String.fromCharCode(10);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const DAU: Record<Region, string> = { xsmn: provincePrefix("xsmn"), xsmt: provincePrefix("xsmt"), xsmb: provincePrefix("xsmb") };
let hat = 20261002;
const rnd = () => ((hat = (hat * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ngay = (i: number) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
const tieuDe = (x: { ghiChu: { tieuDe: string }[] }) => x.ghiChu.map((g) => g.tieuDe).join(" | ");

/** Lịch sử ngẫu nhiên: `soKy` kỳ, có ngày hổng, mỗi kỳ ~30 lô về. */
function lichSu(soKy: number, hong = 0.08): KyVe[] {
  const out: KyVe[] = [];
  for (let i = 0, d = 0; i < soKy; i++, d++) {
    while (rnd() < hong) d++;
    const hits: Record<string, number> = {};
    for (const lo of LOS) if (rnd() < 0.3) hits[lo] = 1 + (rnd() < 0.15 ? 1 : 0);
    out.push({ date: ngay(d), hits });
  }
  return out;
}
const rows = (draws: KyVe[]) => draws.flatMap((d) => Object.keys(d.hits).map((lo) => ({ date: d.date, lo_number: lo })));
/** Công tắc giảm nửa: chỉ cặp đảo và danh sách tự thêm (nhịp/top cần DB, kiểm ở bài đầu-cuối). */
const congCo = (pair = true, tuThem: string[] = []): CongTacGiam => ({
  pair: { enabled: pair },
  top: { size: 10, dir: "hot", enabled: false, halve: true },
  watch: { enabled: false, halve: true, min_gap: 1, max_gap: 3 },
  manual: { los: tuThem, halve: true },
});
/** Số MÁY THẬT đưa ra cho cùng lịch sử + bảng: đúng các hàm bộ máy đang dùng, và luật giảm nửa của limit-engine. */
function mayThat(draws: KyVe[], raw: unknown, cong: CongTacGiam): { may: DongMay[]; lich: LichDoc } {
  const { lich } = chuanHoaLich(raw);
  const { lo } = dungTrangThai(rows(draws));
  const muc = new Map<string, number>();
  const tt = new Map<string, { days: number; consec: number }>();
  for (const [so, st] of lo) { const days = st.last ? st.days : 30; tt.set(so, { days, consec: st.consec }); muc.set(so, mucTheoLich(lich, days, st.consec)); }
  const may = LOS.map((so) => {
    const dao = so[1] + so[0];
    const inPair = cong.pair.enabled && dao !== so && muc.get(dao) === muc.get(so);
    const inManual = cong.manual.los.includes(so);
    const halve = (inManual && cong.manual.halve) || inPair;
    const v = muc.get(so)!;
    return { lo_number: so, days_since_last: tt.get(so)!.days, consecutive_days: tt.get(so)!.consec, current_limit: halve ? Math.round(v * 0.5) : v, limit_before_tracking: v, in_pair: inPair, in_manual: inManual, in_top: false, in_watch: false };
  });
  return { may, lich: JSON.parse(JSON.stringify(lich)) as LichDoc };
}
const lichNgauNhien = () => ({
  base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, rnd() < 0.3 ? 0 : Math.floor(rnd() * 200)])),
  min_limit: rnd() < 0.3 ? 0 : Math.floor(rnd() * 50),
  consecutive: { 2: Math.floor(rnd() * 150), 3: rnd() < 0.5 ? 0 : Math.floor(rnd() * 150), 4: Math.floor(rnd() * 150) },
});
const chuoiWeb = (may: DongMay[], r: Region, kieu: "dd" | "n" | "tran" = "dd", boChan = false) =>
  `${DAU[r]}: ` + may.filter((m) => !boChan || m.current_limit > 0).map((m) => (kieu === "dd" ? `${m.lo_number}b${m.current_limit}dd${m.current_limit}` : kieu === "n" ? `${m.lo_number}b${m.current_limit}n` : `${m.lo_number}b${m.current_limit}`)).join(", ");
const doc = (t: string) => docChuoi(t, DAU);
const K = (t: string, r: Region, dl: DuLieuMien) => { const L = luatLoMien(dl); return kiemLo(doc(t).khoi[0], r, L, dl, DAU); };

console.log("===== 1. ĐỌC CHUỖI — mọi kiểu app và bot chép ra =====");
{
  let k = doc(`${DAU.xsmn}: 00b15dd15, 01b200dd200, 02b0dd0`).khoi[0];
  ok("web kèm đề: miền Nam theo tên đài, 3 lô, đề = lô", k.loai === "lo-tien" && k.mien === "xsmn" && k.dauDaiChuan && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["00", 15, 15], ["01", 200, 200], ["02", 0, 0]]) && k.la.length === 0);
  k = doc(`${DAU.xsmt}: 00b15n, 01b200n`).khoi[0];
  ok("bot /copy (đuôi n): miền Trung, không có đề", k.mien === "xsmt" && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["00", 15, null], ["01", 200, null]]));
  k = doc("85b200ndd200n, 86b15ndd15n").khoi[0];
  ok("không tên đài + giữ chữ n: miền = null (dùng tab đang chọn)", k.mien === null && k.muc.length === 2 && k.muc[0].de === 200);
  k = doc("2d15b50, 16b100, 17b10").khoi[0];
  ok("bot gửi '2d15b50, 16b100': tiền tố 2d dính liền", k.tienTo === "2d" && k.mien === null && eq(k.muc.map((m) => [m.lo, m.diem]), [["15", 50], ["16", 100], ["17", 10]]));
  k = doc("mb 15b50, 16b100").khoi[0];
  ok("bot gửi 'mb 15b50': miền Bắc theo tiền tố", k.tienTo === "mb" && k.mien === "xsmb" && k.muc.length === 2 && k.la.length === 0);
  k = doc(`${DAU.xsmn}: 04 78 90`).khoi[0];
  ok("danh sách số có tên đài", k.loai === "lo-so" && k.mien === "xsmn" && eq(k.so, ["04", "78", "90"]) && !k.laChanso);
  const cs = doc(`Mn: 01 02${NL}Mt: —${NL}Mb: 03`).khoi;
  ok("/chanso 3 dòng: Mn 2 số, Mt trống, Mb 1 số — là danh sách chặn", cs.length === 3 && cs.every((x) => x.laChanso) && eq(cs.map((x) => [x.mien, x.so]), [["xsmn", ["01", "02"]], ["xsmt", []], ["xsmb", ["03"]]]));
  k = doc(`${DAU.xsmb}: 05b0n 17b0n`).khoi[0];
  ok("/chanlo 'mb: 05b0n 17b0n': miền Bắc, toàn 0", k.mien === "xsmb" && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["05", 0, null], ["17", 0, null]]));
  let da = doc(`/chanloai${NL}${DAU.xsmn}: 01 10 11dx0n 20 21dx0n 05dx0n`).khoi[0];
  ok("/chanloai: 2 vòng + mẩu một con (kiểu cũ) = con tròn", da.loai === "da" && da.lenh === "/chanloai" && eq(da.vong, [["01", "10", "11"], ["20", "21"]]) && eq(da.tron, ["05"]) && da.cut.length === 0 && !da.lenhLech);
  const lq = doc(`/chanlq${NL}${DAU.xsmn}: 07 12 30 dx0n .${NL}${DAU.xsmt}: 05 13 dx0n .${NL}mb: 09 28 da0n .`).khoi;
  ok("/chanlq 3 dòng: mỗi miền một danh sách con tròn, đúng hậu tố", lq.length === 3 && lq.every((x) => x.loai === "da" && x.lenh === "/chanlq" && x.vong.length === 0 && x.la.length === 0 && !x.lenhLech) && eq(lq.map((x) => [x.mien, x.tron, x.hauTo]), [["xsmn", ["07", "12", "30"], ["dx0n"]], ["xsmt", ["05", "13"], ["dx0n"]], ["xsmb", ["09", "28"], ["da0n"]]]));
  da = doc(`/chanloai${NL}${DAU.xsmn}: 01 10 11dx0n 20 21 22`).khoi[0];
  ok("chuỗi đá bị cắt cụt: 3 số cuối không có hậu tố được bắt", eq(da.cut, ["20", "21", "22"]) && da.vong.length === 1);
  const tap = doc(`🌴 Miền Nam · 36 lô · tổng 3.000n${NL}bỏ qua 64 lô đang khoá${NL}${NL}${DAU.xsmn}: 00b15n, xx, 01b20n${NL}phần 1/2`);
  ok("tin bot chép nguyên: dòng chữ bị bỏ qua, dòng chuỗi vẫn đọc; mẩu 'xx' là mẩu lạ; nhận ra 'phần 1/2'", tap.khoi.length === 1 && tap.boQua.length === 3 && eq(tap.khoi[0].la, ["xx"]) && tap.khoi[0].muc.length === 2 && tap.soPhan === 2);
  k = doc("st tv ag: 00b15n").khoi[0];
  ok("tên đài thiếu (3/21 đài): vẫn nhận miền Nam nhưng đánh dấu không chuẩn", k.mien === "xsmn" && !k.dauDaiChuan);
  ok("chữ thường không phải chuỗi → không có khối nào", doc("xin chào anh").khoi.length === 0 && doc("").khoi.length === 0);
  ok("số 1 chữ số / 3 chữ số không được đoán thành lô", doc("5b10, 123b10").khoi.length === 0);
  ok("CRLF, dấu phẩy thừa, chữ hoa B/N/DD vẫn đọc đúng", eq(doc(`${DAU.xsmn}: 00B15NDD15N, 01b20n,${String.fromCharCode(13)}${NL}`).khoi[0].muc.map((m) => [m.lo, m.diem, m.de]), [["00", 15, 15], ["01", 20, null]]));
}

console.log("\n===== 2. HAI ĐƯỜNG TÍNH RA CÙNG SỐ khi bộ máy đúng (lịch sử + bảng + cặp đảo + tự thêm ngẫu nhiên) =====");
{
  let lech = 0, lo = 0, saiChuoi = 0, coChia = 0;
  for (let lan = 0; lan < 150; lan++) {
    const draws = lichSu(20 + Math.floor(rnd() * 60), lan % 3 === 0 ? 0.15 : 0.03);
    const cong = congCo(lan % 4 !== 0, LOS.filter(() => rnd() < 0.05));
    const { may, lich } = mayThat(draws, lichNgauNhien(), cong);
    const dl: DuLieuMien = { region: "xsmn", draws, lich, may, cong };
    const luat = luatLoMien(dl);
    lech += luat.soLechMay; lo += 100;
    coChia += Object.values(luat.lo).filter((l) => l.chiaDoi).length;
    if (lan < 40) {
      const kq = kiemLo(doc(chuoiWeb(may, "xsmn")).khoi[0], "xsmn", luat, dl, DAU);
      if (kq.mucDo !== "dung" || kq.soDung !== 100 || kq.nhom !== "cả 100 lô") saiChuoi++;
    }
  }
  ok(`150 lịch sử ngẫu nhiên × bảng ngẫu nhiên × cặp đảo/tự thêm: ${lo} lô (${coChia} lô giảm nửa), tab Check và bộ máy khớp`, lech === 0, `${lech} lô lệch`);
  ok("chuỗi 'cả bảng' do chính bộ máy ra → 40/40 lần ĐÚNG, đủ 100 lô", saiChuoi === 0, String(saiChuoi));
}

console.log("\n===== 3. DỰNG LẠI LỖI 01/10: máy lấy nhầm ô — tab Check phải bắt được =====");
const RAW_0110 = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, [0, 4, 6, 7].includes(d) ? 100 : 0])), min_limit: 0, consecutive: { 2: 100 } };
/** Bộ máy CŨ: ô liên tiếp thiếu thì lùi về ô ngày 0. */
function mayCu(draws: KyVe[], raw: typeof RAW_0110, cong: CongTacGiam): DongMay[] {
  const st = dungTrangThai(rows(draws)).lo;
  const sched = new Map<string, number>();
  for (const [so, s] of st) {
    const days = s.last ? s.days : 30;
    const rieng = (raw.consecutive as Record<number, number>)[s.consec];
    sched.set(so, s.consec >= 2 && rieng !== undefined ? rieng : ((raw.base as Record<number, number>)[days] ?? raw.min_limit));
  }
  return [...st].map(([so, s]) => {
    const v = sched.get(so)!, dao = so[1] + so[0];
    const inPair = cong.pair.enabled && dao !== so && sched.get(dao) === v;
    return { lo_number: so, days_since_last: s.last ? s.days : 30, consecutive_days: s.consec, current_limit: inPair ? Math.round(v * 0.5) : v, limit_before_tracking: v, in_pair: inPair, in_manual: false, in_top: false, in_watch: false };
  });
}
let draws0110: KyVe[] = [];
for (let t = 0; t < 80; t++) { draws0110 = lichSu(40, 0); const st = dungTrangThai(rows(draws0110)).lo; if ([...st.values()].filter((s) => s.consec === 3).length >= 2) break; }
{
  const st = dungTrangThai(rows(draws0110)).lo;
  const ba = [...st].filter(([, s]) => s.consec === 3 || s.consec === 4).map(([l]) => l).sort();
  const cong = congCo(false);
  const may = mayCu(draws0110, RAW_0110, cong);
  const lich = JSON.parse(JSON.stringify(chuanHoaLich(RAW_0110).lich)) as LichDoc;
  const dl: DuLieuMien = { region: "xsmn", draws: draws0110, lich, may, cong };
  const luat = luatLoMien(dl);
  ok(`có ${ba.length} lô đang về liên tiếp 3–4 kỳ (${ba.join(" ")})`, ba.length >= 2);
  ok("tab Check báo MÁY LỆCH đúng các lô đó, không lô nào khác", luat.soLechMay === ba.length && eq(Object.values(luat.lo).filter((l) => l.lechMay.length).map((l) => l.lo).sort(), ba), String(luat.soLechMay));
  ok("lời báo nói rõ: máy lấy 100n, ô “liên tiếp 3 kỳ” đang cài 0", luat.lo[ba[0]].lechMay.some((t) => t.includes("100n") && t.includes("đang cài 0")), luat.lo[ba[0]].lechMay.join("; "));
  const kq = kiemLo(doc(chuoiWeb(may, "xsmn")).khoi[0], "xsmn", luat, dl, DAU);
  ok(`chuỗi máy cũ chép ra → SAI đúng ${ba.length} số, lý do "đang CHẶN mà chuỗi nhận 100"`, kq.mucDo === "sai" && eq(kq.loi.map((e) => e.lo).sort(), ba) && kq.loi.every((e) => e.loai === "chan-ma-nhan" && e.chuoi === 100) && kq.soSai === ba.length);
  ok("“vì sao” ghi ngày về và ô: 'về 3 kỳ liền (…) → … ô “liên tiếp 3 kỳ” … đang cài 0 → CHẶN'", /về [34] kỳ liền \(\d\d\/\d\d, \d\d\/\d\d, \d\d\/\d\d/.test(canCu(luat.lo[ba[0]])) && canCu(luat.lo[ba[0]]).includes("ô “liên tiếp 3 kỳ” trên bảng hạn mức đang cài 0") && canCu(luat.lo[ba[0]]).endsWith("CHẶN."), canCu(luat.lo[ba[0]]));
  const { may: mayMoi } = mayThat(draws0110, RAW_0110, cong);
  const dl2 = { ...dl, may: mayMoi };
  const luat2 = luatLoMien(dl2);
  ok("cùng bảng đó, MÁY MỚI: không lệch, chuỗi chép ra ĐÚNG", luat2.soLechMay === 0 && kiemLo(doc(chuoiWeb(mayMoi, "xsmn")).khoi[0], "xsmn", luat2, dl2, DAU).mucDo === "dung");
}

console.log("\n===== 4. CHUỖI LÔ: sửa 2 số thì bắt đúng 2 số =====");
{
  const draws = lichSu(60, 0.03);
  const raw = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, d === 1 || d === 3 ? 0 : 100 + d])), min_limit: 7, consecutive: { 2: 52, 3: 0, 4: 54 } };
  const cong = congCo(false);
  const { may, lich } = mayThat(draws, raw, cong);
  const dl: DuLieuMien = { region: "xsmt", draws, lich, may, cong };
  const k = (t: string) => K(t, "xsmt", dl);
  ok("máy khớp", luatLoMien(dl).soLechMay === 0);
  for (const [ten, kieu] of [["kèm đề", "dd"], ["đuôi n", "n"], ["trần (bot gửi)", "tran"]] as [string, "dd" | "n" | "tran"][]) {
    const r = k(chuoiWeb(may, "xsmt", kieu));
    ok(`chuỗi cả bảng ${ten} → ĐÚNG 100/100`, r.mucDo === "dung" && r.soDung === 100);
  }
  const boChan = k(chuoiWeb(may, "xsmt", "n", true));
  ok("chuỗi đã bỏ lô chặn (như /copy) → ĐÚNG, khớp nhóm 'mọi lô đang nhận', không báo thiếu", boChan.mucDo === "dung" && boChan.thieu.length === 0 && (boChan.nhom ?? "").includes("đang nhận"), String(boChan.nhom));
  const nhan = may.filter((m) => m.current_limit > 0), chan = may.filter((m) => m.current_limit === 0);
  const a = nhan[3], b = chan[1];
  const sua = chuoiWeb(may, "xsmt").replace(`${a.lo_number}b${a.current_limit}dd${a.current_limit}`, `${a.lo_number}b${a.current_limit + 5}dd${a.current_limit + 5}`).replace(`${b.lo_number}b0dd0`, `${b.lo_number}b100dd100`);
  const kq = k(sua);
  ok(`sửa 2 số (${a.lo_number}: +5, ${b.lo_number}: 0→100) → SAI đúng 2 số, soSai = 2`, kq.mucDo === "sai" && kq.loi.length === 2 && kq.soSai === 2 && kq.soDung === 98 && eq(kq.loi.map((e) => [e.lo, e.loai]).sort(), [[a.lo_number, "sai-tien"], [b.lo_number, "chan-ma-nhan"]].sort()), JSON.stringify(kq.loi.map((e) => e.chu)));
  ok("lời báo số nhận lố ghi 'NHIỀU hơn mức đúng'", kq.loi.find((e) => e.lo === a.lo_number)!.chu.includes("NHIỀU hơn"));
  const de = k(chuoiWeb(may, "xsmt").replace(`${a.lo_number}b${a.current_limit}dd${a.current_limit}`, `${a.lo_number}b${a.current_limit}dd${a.current_limit + 1}`));
  ok("tiền đề khác tiền lô → báo đúng 1 lỗi 'đề khác'", de.loi.length === 1 && de.loi[0].loai === "de-khac" && de.loi[0].lo === a.lo_number);
  const lap = k(chuoiWeb(may, "xsmt") + `, ${a.lo_number}b${a.current_limit}dd${a.current_limit}`);
  ok("một lô ghi hai lần → báo 'trùng'", lap.loi.length === 1 && lap.loi[0].loai === "trung");
  const cut = k(`${DAU.xsmt}: ` + nhan.slice(0, nhan.length - 4).map((m) => `${m.lo_number}b${m.current_limit}n`).join(", "));
  ok("chuỗi cụt mất 4 lô đang nhận → không sai tiền, lưu ý 'không có 4 lô đang nhận' kèm đúng 4 số", cut.loi.length === 0 && cut.mucDo === "luu-y" && eq(cut.thieu.map((l) => l.lo), nhan.slice(-4).map((m) => m.lo_number)) && cut.ghiChu.some((g) => g.tieuDe.includes("4 lô đang nhận") && eq(g.so, nhan.slice(-4).map((m) => m.lo_number)) && g.canLam.length > 0), tieuDe(cut));
  const lt = may.filter((m) => m.consecutive_days === 3);
  if (lt.length) {
    const g = k(`${DAU.xsmt}: ` + lt.map((m) => `${m.lo_number}b0dd0`).join(", "));
    ok(`lọc 'liên tiếp 3 ngày' (${lt.length} lô, ô cài 0) → ĐÚNG, nhận ra nhóm, không báo thiếu`, g.mucDo === "dung" && (g.nhom ?? "").includes("liên tiếp 3 ngày") && g.thieu.length === 0, String(g.nhom));
  }
  const khongDau = k(nhan.map((m) => `${m.lo_number}b${m.current_limit}n`).join(", "));
  ok("chuỗi không tên đài → tiền đúng, ghi chú 'đang hiểu là Miền Trung' + cần làm", khongDau.loi.length === 0 && khongDau.ghiChu.some((g) => g.tieuDe.includes("đang hiểu là Miền Trung") && g.canLam.includes("bấm tab")));
  const dsChan = chan.map((m) => m.lo_number);
  const cs = k(`Mt: ${dsChan.join(" ")}`);
  ok(`/chanso đúng ${dsChan.length} lô chặn → ĐÚNG`, cs.mucDo === "dung" && cs.soDung === dsChan.length);
  const csSai = k(`Mt: ${dsChan.slice(1).join(" ")} ${a.lo_number}`);
  ok("/chanso thiếu 1 lô chặn + thừa 1 lô đang nhận → SAI 2 chỗ: 1 'không chặn', sót 1", csSai.mucDo === "sai" && csSai.soSai === 2 && csSai.loi.length === 1 && csSai.loi[0].loai === "khong-chan" && csSai.thieu.length === 1 && csSai.thieu[0].lo === dsChan[0]);
  const dlC = { ...dl, chanLoLuat: ["05", "17", "40"] };
  const c1 = kiemLo(doc(`${DAU.xsmt}: 05b0n 17b0n 40b0n`).khoi[0], "xsmt", luatLoMien(dlC), dlC, DAU);
  ok("chuỗi /chanlo khớp luật 2 bước → ĐÚNG dù bảng hạn mức đang nhận các lô đó", c1.chanLo?.khop === true && c1.loi.length === 0 && c1.mucDo === "dung");
  ok("mỗi lô có đủ 10 ô kỳ gần nhất và danh sách ngày về", luatLoMien(dl).kyGan.length === 10 && Object.values(luatLoMien(dl).lo).every((l) => l.veGan.length === 10 && l.cacNgayVe.length === l.veGan.filter((v) => v > 0).length));
}

console.log("\n===== 5. CHẶN ĐÁ: cặp tính lại độc lập = bảng tiền đá; chuỗi thiếu/thừa bị bắt =====");
let dlDa: DuLieuMien | null = null, capDaThat: [string, string][] = [];
{
  let lechCap = 0;
  for (let lan = 0; lan < 25; lan++) {
    const draws = lichSu(40 + Math.floor(rnd() * 40), 0.05);
    const bang = bangMacDinh();
    for (const k of Object.keys(bang)) if (rnd() < 0.25) bang[k] = 0;
    const chanLuat = Object.keys(bang).filter(() => rnd() < 0.1);
    const tuDong = lan % 2 === 0;
    const cong = congCo(false);
    const { may, lich } = mayThat(draws, lichNgauNhien(), cong);
    const dl: DuLieuMien = { region: "xsmn", draws, lich, may, cong, da: { bang, tuDong, chanLuat, rutGon: true, nguongGon: 90 } };
    const that = capBiChan(khoKyToi(draws)!.bac, tuDong ? apChanLuat(bang, chanLuat) : bang);
    const E = capDaBiChan(dl, luatLoMien(dl));
    const thatSet = new Set(that.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
    if (E.size !== thatSet.size || [...E].some((p) => !thatSet.has(p))) lechCap++;
  }
  ok("25 bảng tiền đá ngẫu nhiên (luật bật/tắt): tập cặp bị chặn tính lại = tập cặp của bộ máy đá", lechCap === 0, String(lechCap));

  // Bậc liên tiếp 2 / 3 / 4+ kỳ (khách: "thiếu ra liên tiếp 2 kì, 3 kì, 4 kì+").
  let lechBac = 0, coLT = { 16: 0, 17: 0, 18: 0 } as Record<number, number>, ltSaiNgay = 0;
  for (let lan = 0; lan < 60; lan++) {
    const draws = lichSu(30 + Math.floor(rnd() * 30), 0.15);
    const cong = congCo(false);
    const { may, lich } = mayThat(draws, lichNgauNhien(), cong);
    const dl: DuLieuMien = { region: "xsmn", draws, lich, may, cong };
    const luat = luatLoMien(dl);
    const a = bacDaMien(dl, luat), b = khoKyToi(draws)!.bac;
    for (const lo of Object.keys(b)) {
      if (a[lo] !== b[lo]) lechBac++;
      if (b[lo] > 15) coLT[b[lo]]++;
      // Con ở bậc liên tiếp phải về đúng kỳ cuối và cả ngày lịch liền trước đó.
      if (b[lo] > 15 && (luat.lo[lo].ngay !== 0 || luat.lo[lo].lienTuc < 2)) ltSaiNgay++;
    }
  }
  ok("60 lịch sử: bậc đá (gồm liên tiếp 2/3/4+) tính lại độc lập = bộ máy đá, từng con", lechBac === 0, String(lechBac));
  ok("có đủ cả 3 bậc liên tiếp xuất hiện trong dữ liệu thử", coLT[16] > 0 && coLT[17] > 0 && coLT[18] > 0, JSON.stringify(coLT));
  ok("con ở bậc liên tiếp đều vừa về và về liền ≥ 2 ngày lịch", ltSaiNgay === 0, String(ltSaiNgay));
  {
    // Kỳ bị hổng (thiếu ngày quay) thì không tính là liền: 01 về 05/01 và 07/01, không có kỳ 06/01.
    const d3: KyVe[] = [{ date: ngay(0), hits: { "01": 1 } }, { date: ngay(1), hits: { "01": 1 } }, { date: ngay(3), hits: { "01": 1, "02": 1 } }, { date: ngay(4), hits: { "01": 1, "02": 1 } }, { date: ngay(5), hits: { "01": 1, "02": 1, "03": 1 } }];
    const kk = khoKyToi(d3)!;
    ok("01 về 3 kỳ liền sau kỳ hổng → LT3 (không cộng 2 kỳ trước chỗ hổng); 02 → LT3; 03 → vừa ra", kk.bac["01"] === 17 && kk.bac["02"] === 17 && kk.bac["03"] === 0, `${kk.bac["01"]} ${kk.bac["02"]} ${kk.bac["03"]}`);
    const d5 = [0, 1, 2, 3, 4, 5].map((i) => ({ date: ngay(i), hits: { "04": 1 } as Record<string, number> }));
    ok("về 6 kỳ liền → LT4+ (không đếm lại như bên lô)", khoKyToi(d5)!.bac["04"] === 18);
  }
  // Bảng cũ (136 ô, chưa có bậc liên tiếp) đọc lên phải chặn ĐÚNG các cặp như trước — chưa đụng gì thì không đổi.
  let lechCu = 0;
  for (let lan = 0; lan < 40; lan++) {
    const draws = lichSu(30 + Math.floor(rnd() * 30), 0.15);
    const tt = khoKyToi(draws)!;
    const bacCu = Object.fromEntries(Object.entries(tt.bac).map(([lo, v]) => [lo, v > 15 ? 0 : v]));
    const cu: Record<string, number> = {};
    for (let i = 0; i <= 15; i++) for (let j = i; j <= 15; j++) cu[`${i}-${j}`] = rnd() < 0.4 ? 0 : 100;
    const luatCu = Object.keys(cu).filter(() => rnd() < 0.1);
    const truoc = capBiChan(bacCu, apChanLuat(cu, luatCu)).map(([a, b]) => `${a}-${b}`).sort();
    const moi = chuanHoaBang(cu);
    const sau = capBiChan(tt.bac, apChanLuat(moi, moRongDanhSachCu(luatCu))).map(([a, b]) => `${a}-${b}`).sort();
    if (!laBangCu(Object.keys(cu)) || Object.keys(moi).length !== SO_O_DA || truoc.join() !== sau.join()) lechCu++;
  }
  ok(`40 bảng cũ 136 ô: đọc lên thành ${SO_O_DA} ô, các cặp bị chặn y như trước`, lechCu === 0, String(lechCu));
  // Bảng chặn dày, để có cả con chặn tròn ở nhiều mức (99, 90, 80…) lẫn vòng — đúng cảnh khách đang dùng Rút gọn.
  for (let lan = 0; lan < 400 && !dlDa; lan++) {
    const draws = lichSu(60, 0.05);
    const bang = bangMacDinh();
    for (const k of Object.keys(bang)) if (rnd() < 0.6) bang[k] = 0;
    const cong = congCo(false);
    const { may, lich } = mayThat(draws, lichNgauNhien(), cong);
    const that = capBiChan(khoKyToi(draws)!.bac, bang);
    const t90 = nhomChanDa(that, false, true, 90), t80 = nhomChanDa(that, false, true, 80), t99 = nhomChanDa(that, false, false, 99);
    const demCon: Record<string, number> = {};
    for (const [x, y] of that) { demCon[x] = (demCon[x] ?? 0) + 1; demCon[y] = (demCon[y] ?? 0) + 1; }
    const coConYeu = LOS.some((c) => (demCon[c] ?? 0) < 40);
    if (coConYeu && t99.con100.length >= 1 && t90.con100.length > t99.con100.length && t80.con100.length > t90.con100.length && t80.con100.length <= 70 && t90.nhom.length >= 5) {
      dlDa = { region: "xsmn", draws, lich, may, cong, da: { bang, tuDong: false, chanLuat: [], rutGon: false, nguongGon: 90 } };
      capDaThat = that;
    }
  }
  ok("dựng được cảnh có con chặn đủ 99/99, và nhiều con hơn ở mức 90, 80", !!dlDa);
}
const r5: Region = "xsmn";
/** Chuỗi bot/web thật ở mức m (99 = rút gọn tắt). */
const daThat = (m: number, khongLap = false) => {
  const g = nhomChanDa(capDaThat, khongLap, m < 99, m);
  const loai = chiaKhoiChanDa(DAU[r5], g.nhom, 3400, r5);
  const lq = g.con100.length ? khoiChanLq([dongChanLq(DAU[r5], g.con100, r5)]) : "";
  return { loai, lq, con: g.con100, capThem: g.capThem, nhom: g.nhom };
};
const KD = (t: string, soPhan: number | null = null, dl = dlDa!) => { const p = doc(t); return kiemDa(p.khoi, r5, luatLoMien(dl), dl, soPhan ?? p.soPhan, DAU); };
{
  for (const m of [99, 90, 80]) for (const kl of [false, true]) {
    const s = daThat(m, kl);
    const ca = KD([s.lq, ...s.loai].filter(Boolean).join(NL));
    ok(`mức ${m}${kl ? " không lặp" : ""}: dán cả /chanlq (${s.con.length} con) + /chanloai → không sót, không chặn oan; làm tròn đúng ${s.capThem} cặp; ${m === 99 ? "ĐÚNG" : "chỉ lưu ý mức khác đã lưu"}`, ca.thieu.length === 0 && ca.thua.length === 0 && ca.thuaLamTron === s.capThem && ca.mucDo === (m === 99 ? "dung" : "luu-y"), `${ca.mucDo} ${tieuDe(ca)}`);
  }
  const s = daThat(99);
  const chiLoai = KD(s.loai.join(NL));
  ok("chỉ dán /chanloai (mức đã lưu) → không sai, lưu ý 'chưa dán /chanlq' kèm các con và cần làm", chiLoai.thieu.length === 0 && chiLoai.thieuOLenhKia > 0 && chiLoai.mucDo === "luu-y" && chiLoai.ghiChu.some((g) => g.tieuDe.includes("chưa dán /chanlq") && eq(g.so, s.con)), tieuDe(chiLoai));
  const chiLq = KD(s.lq);
  ok("chỉ dán /chanlq → không sai, lưu ý 'chưa dán /chanloai'", chiLq.thieu.length === 0 && chiLq.thua.length === 0 && chiLq.mucDo === "luu-y" && chiLq.ghiChu.some((g) => g.tieuDe.includes("chưa dán /chanloai")));
  // bỏ hẳn vòng đầu tiên → sót đúng các cặp chỉ vòng đó phủ
  const dong = s.loai[0].split(NL)[1];
  const than = dong.slice(DAU[r5].length + 2).split(" ");
  const het1 = than.findIndex((x) => x.endsWith("dx0n"));
  const vong1 = than.slice(0, het1 + 1).map((x) => x.replace("dx0n", ""));
  const sot = KD([s.lq, `/chanloai${NL}${DAU[r5]}: ${than.slice(het1 + 1).join(" ")}`, ...s.loai.slice(1)].filter(Boolean).join(NL));
  const phuKhac = new Set<string>();
  for (const n of s.nhom.slice(1)) for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) phuKhac.add(n[i] < n[j] ? `${n[i]}-${n[j]}` : `${n[j]}-${n[i]}`);
  const mong: string[] = [];
  for (let i = 0; i < vong1.length; i++) for (let j = i + 1; j < vong1.length; j++) { const p = vong1[i] < vong1[j] ? `${vong1[i]}-${vong1[j]}` : `${vong1[j]}-${vong1[i]}`; if (!phuKhac.has(p)) mong.push(p); }
  ok(`bỏ vòng đầu (${vong1.length} con) → SAI, sót đúng ${mong.length} cặp chỉ vòng đó phủ`, sot.mucDo === "sai" && eq(sot.thieu, mong.sort()) && sot.thieuLaSai, `${sot.thieu.length} vs ${mong.length}`);
  const E = capDaBiChan(dlDa!, luatLoMien(dlDa!));
  let oan = "";
  for (let x = 0; x < 100 && !oan; x++) for (let y = x + 1; y < 100; y++) { const p = `${LOS[x]}-${LOS[y]}`; if (!E.has(p) && !s.con.includes(LOS[x]) && !s.con.includes(LOS[y])) { oan = p; break; } }
  const them = KD([s.lq, ...s.loai].filter(Boolean).join(NL) + NL + `/chanloai${NL}${DAU[r5]}: ${oan.replace("-", " ")}dx0n`);
  ok(`thêm cặp ${oan} (bảng đang nhận) → SAI, chặn oan đúng 1 cặp`, them.mucDo === "sai" && eq(them.thua, [oan]) && them.thieu.length === 0);
  ok("hậu tố da0n trên chuỗi Miền Nam → SAI 'hậu tố'", KD(`/chanloai${NL}${DAU[r5]}: 01 02da0n`).ghiChu.some((g) => g.muc === "sai" && g.tieuDe.includes("da0n") && g.giaiThich.includes(HAU_TO_DA.xsmn)));
  ok("chuỗi đá cụt đuôi → SAI 'bị cắt cụt'", KD(`/chanloai${NL}${DAU[r5]}: 01 02dx0n 03 04`).ghiChu.some((g) => g.muc === "sai" && g.tieuDe.includes("cắt cụt")));
  ok("thiếu dòng lệnh /chanloai phía trên → lưu ý có cần làm", KD(`${DAU[r5]}: 01 02dx0n`).ghiChu.some((g) => g.tieuDe.includes("Thiếu dòng lệnh") && g.canLam.length > 0));
}

console.log("\n===== 6. CÁC LỖI ĐỢT RÀ SOÁT 02/10 ĐÃ XÁC NHẬN — mỗi lỗi một phép kiểm =====");
{
  // Cảnh có cặp đảo 12/21: 12 về 3 kỳ liền, 21 vừa về; ô ngày 0 = 100, liên tiếp 3 = 100.
  const draws: KyVe[] = [];
  for (let i = 0; i < 30; i++) {
    const hits: Record<string, number> = {};
    for (const lo of LOS) if (rnd() < 0.25 && lo !== "12" && lo !== "21") hits[lo] = 1;
    if (i >= 27) hits["12"] = 1;
    if (i === 29) hits["21"] = 1;
    draws.push({ date: ngay(i), hits });
  }
  const raw = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, 100])), min_limit: 100, consecutive: { 2: 100, 3: 100, 4: 100 } };
  const cong = congCo(true);
  const { may, lich } = mayThat(draws, raw, cong);
  const dl: DuLieuMien = { region: "xsmn", draws, lich, may, cong };
  ok("[nền] máy đúng: 12 và 21 là cặp đảo, nhận 50, không lệch", luatLoMien(dl).soLechMay === 0 && luatLoMien(dl).lo["12"].dung === 50 && luatLoMien(dl).lo["21"].dung === 50);

  // lo-recompute:0 — máy gắn cờ cặp đảo mà quên chia đôi.
  const m0 = may.map((m) => (m.lo_number === "12" || m.lo_number === "21" ? { ...m, current_limit: 100 } : m));
  const d0 = { ...dl, may: m0 }, l0 = luatLoMien(d0);
  ok("[lo-recompute:0] cờ cặp đảo mà không chia đôi → MÁY LỆCH cả 12, 21; chuỗi 100/100 bị SAI", l0.lo["12"].lechMay.length > 0 && l0.lo["21"].lechMay.length > 0 && l0.lo["12"].dung === 50 && kiemLo(doc(chuoiWeb(m0, "xsmn")).khoi[0], "xsmn", l0, d0, DAU).loi.some((e) => e.lo === "12"));
  // lo-recompute:1 (B) / ui:2 — máy đọc nhầm ô của 12 thành 0 nên không ghép cặp, 21 vẫn 100.
  const mB = may.map((m) => (m.lo_number === "12" ? { ...m, current_limit: 0, limit_before_tracking: 0, in_pair: false } : m.lo_number === "21" ? { ...m, current_limit: 100, in_pair: false } : m));
  const dB = { ...dl, may: mB }, lB = luatLoMien(dB);
  ok("[lo-recompute:1 / ui:2] máy đọc nhầm ô của 12 → trang vẫn tính 12 = 50, 21 = 50 (cặp đảo theo bảng), báo lệch cả hai", lB.lo["12"].dung === 50 && lB.lo["21"].dung === 50 && lB.lo["21"].lechMay.some((t) => t.includes("không ghép cặp đảo")));
  ok("[lo-recompute:1 / ui:2] chuỗi '12b100, 21b100' (sau khi sửa 12 theo trang) bị SAI cả hai", kiemLo(doc(`${DAU.xsmn}: 12b100n, 21b100n`).khoi[0], "xsmn", lB, dB, DAU).loi.length === 2);
  // lo-recompute:1 (A) — lỗi 01/10 kèm cặp đảo: máy lùi về ô ngày 0 rồi ghép cặp oan.
  const rawA = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, 100])), min_limit: 100, consecutive: { 2: 100 } };
  const mA = mayCu(draws, rawA as typeof RAW_0110, cong);
  const dA: DuLieuMien = { ...dl, lich: JSON.parse(JSON.stringify(chuanHoaLich(rawA).lich)), may: mA }, lA = luatLoMien(dA);
  ok("[lo-recompute:1 A] lỗi 01/10 + cặp đảo: trang tính 12 = 0 (chặn), 21 = 100 (không còn cặp), báo lệch", lA.lo["12"].dung === 0 && lA.lo["21"].dung === 100 && !lA.lo["21"].chiaDoi && lA.lo["21"].lechMay.length > 0);
  // lo-recompute:2 — máy chia đôi không lý do / tự đặt 0.
  const mD = may.map((m) => (m.lo_number === "33" ? { ...m, current_limit: 0 } : m));
  const lD = luatLoMien({ ...dl, may: mD });
  ok("[lo-recompute:2] máy đưa 0 cho lô 33 (ô 100, không danh sách nào) → trang giữ 100 và báo lệch, không bịa 'chia đôi'", lD.lo["33"].dung === 100 && !lD.lo["33"].chiaDoi && lD.lo["33"].lechMay.some((t) => t.includes("đúng luật phải là 100n")));
  // tự thêm (manual) tính từ cài đặt, không chép cờ
  const dM: DuLieuMien = { ...dl, cong: congCo(true, ["40"]) };
  const lM = luatLoMien(dM);
  ok("[tự thêm] lô anh tự thêm mà máy không chia → báo lệch, trang tính một nửa", lM.lo["40"].chiaDoi && lM.lo["40"].lechMay.some((t) => t.includes("danh sách theo dõi")));
}
{
  const draws = lichSu(60, 0.03);
  const raw = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, d % 3 === 1 ? 0 : 100])), min_limit: 0, consecutive: { 2: 100, 3: 0, 4: 0 } };
  const cong = congCo(false);
  const { may, lich } = mayThat(draws, raw, cong);
  const dl: DuLieuMien = { region: "xsmn", draws, lich, may, cong };
  const luat = luatLoMien(dl);
  const chan = may.filter((m) => m.current_limit === 0).map((m) => m.lo_number);
  const nhan = may.filter((m) => m.current_limit > 0);
  // lo-recompute:3 — khối số chép từ /chanso (mất "Mn:"), cũ: thiếu 2 lô chặn, có 1 lô đang nhận.
  const tron = K(`${[...chan.slice(2), nhan[0].lo_number].join(" ")}`, "xsmn", dl);
  ok("[lo-recompute:3] khối số /chanso chép trơn, cũ → SAI 3 chỗ (hiểu là danh sách chặn, có ghi chú giải thích)", tron.laChanso && tron.mucDo === "sai" && tron.soSai === 3 && tron.ghiChu.some((g) => g.tieuDe.includes("danh sách chặn")), `${tron.mucDo} ${tron.soSai}`);
  const dungTron = K(chan.join(" "), "xsmn", dl);
  ok("[lo-recompute:3] khối số /chanso chép trơn, đúng → không sai chỗ nào, hiểu là danh sách chặn (chỉ còn lưu ý 'không có tên đài')", dungTron.soSai === 0 && dungTron.laChanso && dungTron.ghiChu.length === 1 && dungTron.ghiChu[0].tieuDe.includes("không có tên đài"), tieuDe(dungTron));
  // lo-recompute:5 / parser:8 — chuỗi đẩy (mọi số thấp hơn hạn mức)
  const day = K(`${DAU.xsmn}: ` + nhan.slice(0, 3).map((m) => `${m.lo_number}b${Math.max(1, m.current_limit - 30)}n`).join(", "), "xsmn", dl);
  ok("[lo-recompute:5 / parser:8] chuỗi đẩy → vẫn SAI, kèm lưu ý 'mọi số sai đều THẤP hơn — có phải chuỗi đẩy?'", day.mucDo === "sai" && day.ghiChu.some((g) => g.tieuDe.includes("chuỗi đẩy")));
  // ui:1 — chuỗi bỏ lô 0n (như /copy) khi MÁY chặn nhầm một lô đáng nhận
  const sai1 = may.map((m) => (m.lo_number === nhan[5].lo_number ? { ...m, current_limit: 0, limit_before_tracking: 0 } : m));
  const d1 = { ...dl, may: sai1 }, l1 = luatLoMien(d1);
  const k1 = kiemLo(doc(chuoiWeb(sai1, "xsmn", "n", true)).khoi[0], "xsmn", l1, d1, DAU);
  ok("[ui:1] máy chặn nhầm 1 lô, chuỗi /copy bỏ lô đó → SAI (không còn là 'không sai tiền')", k1.mucDo === "sai" && k1.thieuLaSai && k1.thieu.some((l) => l.lo === nhan[5].lo_number), `${k1.mucDo} ${tieuDe(k1)}`);
  // ui:0 / parser:2 — chuỗi /chanlo cũ thiếu lô luật đang chặn
  const luat2b = [chan[0], chan[1], nhan[0].lo_number];
  const dC = { ...dl, chanLoLuat: luat2b };
  const kc0 = kiemLo(doc(`${DAU.xsmn}: ${chan[0]}b0n ${chan[1]}b0n`).khoi[0], "xsmn", luatLoMien(dC), dC, DAU);
  ok(`[ui:0 / parser:2] /chanlo cũ thiếu ${nhan[0].lo_number} → SAI, đúng 1 chỗ, đúng lô đó`, kc0.mucDo === "sai" && kc0.soSai === 1 && kc0.thieu.map((l) => l.lo).join() === nhan[0].lo_number && kc0.chanLo !== null, `${kc0.mucDo} ${kc0.soSai} ${kc0.thieu.map((l) => l.lo)}`);
  // parser:7 — chuỗi "Copy theo tiêu chí" bỏ đề, toàn 0 → không bị coi là /chanlo
  const lt3 = may.filter((m) => m.consecutive_days === 3);
  if (lt3.length) {
    const k7 = kiemLo(doc(`${DAU.xsmn}: ` + lt3.map((m) => `${m.lo_number}b0n`).join(", ")).khoi[0], "xsmn", luatLoMien(dC), dC, DAU);
    ok("[parser:7] chuỗi tiêu chí 'liên tiếp 3' toàn 0 → ĐÚNG, không có dòng /chanlo", k7.mucDo === "dung" && k7.chanLo === null && (k7.nhom ?? "").includes("liên tiếp 3"));
  }
  // parser:0 — dòng sửa tay có chữ: không được rơi vào phần bỏ qua
  const p0 = docChuoi(`${chuoiWeb(may, "xsmn", "n", true)}${NL}MN sửa lại 2 số: ${chan[0]}b100n, ${chan[1]}b50n`, DAU);
  const k0 = p0.khoi.map((k) => kiemLo(k, k.mien ?? "xsmn", luat, dl, DAU));
  ok("[parser:0] dòng sửa tay 'MN sửa lại 2 số: 00b100n…' được đọc và bị SAI (không rơi vào bỏ qua)", p0.boQua.length === 0 && k0.some((x) => x.mucDo === "sai" && x.loi.some((e) => e.lo === chan[0])));
  // parser:3 — cùng miền dán hai lần
  const hai = docChuoi(`${chuoiWeb(may, "xsmn", "n", true)}${NL}${chuoiWeb(may, "xsmn", "n", true)}`, DAU).khoi.map((k) => kiemLo(k, "xsmn", luat, dl, DAU));
  trungGiuaDong(hai);
  ok("[parser:3] cùng chuỗi Miền Nam dán 2 lần → lưu ý 'nhận GẤP ĐÔI' kèm các lô", hai[1].mucDo === "luu-y" && hai[1].ghiChu.some((g) => g.giaiThich.includes("GẤP ĐÔI") && g.so.length === nhan.length));
  // parser:5 — tiền tố có dấu cách, và "mn" dính liền
  ok("[parser:5] '2d 03b100, …' (tiền tố có dấu cách) → không có mẩu lạ", (() => { const k = doc(`2d ${nhan[0].lo_number}b${nhan[0].current_limit}, ${nhan[1].lo_number}b${nhan[1].current_limit}`).khoi[0]; return k.tienTo === "2d" && k.la.length === 0 && k.muc.length === 2; })());
  ok("[parser:5] 'mn03b100, …' → hiểu là Miền Nam", doc("mn03b100, 04b104").khoi[0].mien === "xsmn" && doc("mt03b100").khoi[0].mien === "xsmt");
  // ui:7 / parser:6 — "Chỉ số" + "Mỗi số 1 dòng"
  const p6 = doc(`mb: 29${NL}35${NL}44`).khoi;
  ok("[ui:7 / parser:6] 'mb: 29⏎35⏎44' → MỘT khối Miền Bắc 3 số", p6.length === 1 && p6[0].mien === "xsmb" && eq(p6[0].so, ["29", "35", "44"]));
  const p6b = doc(`Mn: 01 02${NL}Mt: 03`).khoi;
  ok("[ui:7] các dòng /chanso vẫn tách riêng từng miền", p6b.length === 2 && p6b[1].mien === "xsmt");
  // lo-recompute:4 — chuỗi bị cắt vì có ngày không quay
  const dg: KyVe[] = [{ date: "2026-07-12", hits: { "99": 1 } }, { date: "2026-07-13", hits: { "02": 1, "99": 1 } }, { date: "2026-07-15", hits: { "02": 1, "99": 1 } }];
  const lg = luatLoMien({ region: "xsmn", draws: dg, lich: { base: { 0: 100 }, min_limit: 0, consecutive: {} }, may: [], cong: congCo(false) });
  ok("[lo-recompute:4] về 13/07 và 15/07, không có kỳ 14/07 → câu giải thích nói rõ ngày 14/07 không quay", canCu(lg.lo["02"]).includes("14/07 không có kỳ quay") && !canCu(lg.lo["02"]).includes("kỳ trước không về"), canCu(lg.lo["02"]));
}
{
  const dl = dlDa!;
  const s99 = daThat(99), s90 = daThat(90);
  // ui:5 / da:3 — /chanloai mức gon90 dán riêng khi đã lưu Rút gọn tắt
  const d3 = KD(s90.loai.join(NL));
  const g3 = d3.ghiChu.find((g) => g.tieuDe.includes("KHÁC mức đã lưu"));
  const gon3 = Number(/\/chanlq gon(\d+)/.exec(g3?.canLam ?? "")?.[1]);
  ok("[ui:5 / da:3] /chanloai gon90 dán riêng (đã lưu: tắt) → không SAI; lưu ý 'KHÁC mức đã lưu', mức gon nó bảo gõ ra ĐÚNG các con của chuỗi", d3.mucDo === "luu-y" && d3.thieu.length === 0 && !!g3 && eq(nhomChanDa(capDaThat, false, true, gon3).con100, s90.con), `${d3.mucDo} ${tieuDe(d3)} | gon${gon3}`);
  // … mà bỏ thêm một vòng thì vẫn SAI
  const dong = s90.loai[0].split(NL)[1], than = dong.slice(DAU[r5].length + 2).split(" "), het = than.findIndex((x) => x.endsWith("dx0n"));
  const d3b = KD([`/chanloai${NL}${DAU[r5]}: ${than.slice(het + 1).join(" ")}`, ...s90.loai.slice(1)].join(NL));
  ok("[ui:5 / da:3] … bỏ thêm vòng đầu → vẫn SAI", d3b.mucDo === "sai" && d3b.thieu.length > 0);
  // da:1 — /chanlq dán riêng mà thiếu con bị chặn đủ 99/99 (con đó có trong MỌI /chanlq hợp lệ)
  const c99 = s99.con[0];
  const d1 = KD(khoiChanLq([dongChanLq(DAU[r5], s90.con.filter((c) => c !== c99), r5)]));
  ok(`[da:1] /chanlq dán riêng mà thiếu con ${c99} (chặn đủ 99/99) → SAI, sót đúng các cặp của con đó`, d1.mucDo === "sai" && d1.thieu.length > 0 && d1.thieu.every((p) => p.split("-").includes(c99)), `${d1.mucDo} ${d1.thieu.length}`);
  // ui:3 — đã lưu Rút gọn 90, /chanlq dán riêng thiếu một con mà mức đã lưu bắt chặn tròn
  const dl90: DuLieuMien = { ...dl, da: { ...dl.da!, rutGon: true, nguongGon: 90 } };
  const bo = s90.con.find((c) => c !== c99)!;
  const u3 = KD(khoiChanLq([dongChanLq(DAU[r5], s90.con.filter((c) => c !== bo), r5)]), null, dl90);
  ok(`[ui:3] đã lưu Rút gọn 90, /chanlq dán riêng thiếu con ${bo} → SAI`, u3.mucDo === "sai" && u3.thieu.length > 0 && u3.thieu.every((p) => p.split("-").includes(bo)), `${u3.mucDo} ${tieuDe(u3)}`);
  ok("[ui:3] đã lưu Rút gọn 90, /chanlq gon90 đủ con dán riêng → không SAI", KD(s90.lq, null, dl90).mucDo === "luu-y");
  ok("[ui:3 / da:1] /chanlq mức đã lưu dán riêng, đủ con → không SAI", KD(s99.lq).mucDo === "luu-y");
  // da:0 — con chặn tròn dưới 50/99
  const bac: Record<string, number> = {};
  for (const [a, b] of capDaThat) { bac[a] = (bac[a] ?? 0) + 1; bac[b] = (bac[b] ?? 0) + 1; }
  const yeu = LOS.filter((c) => !s99.con.includes(c)).sort((x, y) => (bac[x] ?? 0) - (bac[y] ?? 0))[0];
  const d0 = KD([khoiChanLq([dongChanLq(DAU[r5], [...s99.con, yeu].sort(), r5)]), ...s99.loai].join(NL));
  ok(`[da:0] /chanlq có thêm con ${yeu} (bảng chỉ chặn ${bac[yeu] ?? 0}/99) → SAI, các cặp oan nằm ở 'chặn oan'`, (bac[yeu] ?? 0) < 50 && d0.mucDo === "sai" && d0.thua.length > 0 && d0.thua.every((p) => p.split("-").includes(yeu)) && d0.ghiChu.some((g) => g.tieuDe.includes("chặn quá ít")));
  // da:2 — dòng đá bị cắt mất hết hậu tố, nằm dưới dòng lệnh
  ok("[da:2] '/chanlq⏎…: 07 12 30' (mất ' dx0n .') → SAI 'cắt cụt'", KD(`/chanlq${NL}${DAU[r5]}: 07 12 30`).ghiChu.some((g) => g.muc === "sai" && g.tieuDe.includes("cắt cụt")));
  ok("[da:2] '…: 07 12 30 dx0' (hậu tố cắt dở) → SAI", KD(`/chanlq${NL}${DAU[r5]}: 07 12 30 dx0`).mucDo === "sai");
  ok("[da:2] '/chanloai⏎…: 01 10 11' (cắt trong vòng đầu) → SAI", KD(`/chanloai${NL}${DAU[r5]}: 01 10 11`).mucDo === "sai");
  // parser:1 — dòng /chanloai nằm dưới /chanlq
  const p1 = KD(`${s99.lq}${NL}${s99.loai[0].split(NL)[1]}`);
  ok("[parser:1] dòng vòng nằm ngay dưới /chanlq (thiếu dòng /chanloai) → SAI 'nằm dưới lệnh /chanlq'", p1.mucDo === "sai" && p1.ghiChu.some((g) => g.tieuDe.includes("nằm dưới lệnh /chanlq")), tieuDe(p1));
  // parser:4 — tin nhiều phần, mới dán phần 1
  if (s99.nhom.length > 4) {
    const phan = chiaKhoiChanDa(DAU[r5], s99.nhom, 1200, r5);
    const p4 = KD(`Dài quá một tin — chia ${phan.length} phần, dán lần lượt cả ${phan.length}.${NL}phần 1/${phan.length}${NL}${phan[0]}${NL}${s99.lq}`);
    ok(`[parser:4] tin bot chia ${phan.length} phần, dán phần 1 → không SAI, lưu ý 'mới dán một phần'`, phan.length > 1 && p4.mucDo === "luu-y" && p4.ghiChu.some((g) => g.tieuDe.includes("mới dán một phần")), `${p4.mucDo} ${tieuDe(p4)}`);
    const p4b = KD([...phan, s99.lq].join(NL));
    ok("[parser:4] dán đủ các phần → ĐÚNG", p4b.mucDo === "dung", tieuDe(p4b));
  }
  // ghi chú nào cũng đủ bốn phần
  const tatCa = [d3, d1, d0, p1].flatMap((x) => x.ghiChu);
  ok("mọi ghi chú đều có tiêu đề, giải thích và 'anh cần làm'", tatCa.length > 0 && tatCa.every((g) => g.tieuDe && g.giaiThich && g.canLam));
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
