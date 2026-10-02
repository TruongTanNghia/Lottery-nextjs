/**
 * Bài kiểm của tab Check (src/lib/kiem-chuoi.ts). Hàm thuần, không cần DB:
 *
 *   npm run test:chuoi
 *
 * Tab Check tính lại hạn mức bằng một đường RIÊNG để cãi lại bộ máy. Bài này
 * giữ hai điều: (1) khi bộ máy đúng thì hai đường phải ra cùng một số, trên
 * lịch sử và bảng ngẫu nhiên; (2) khi bộ máy sai — dựng lại đúng lỗi 01/10,
 * ô "liên tiếp 3 kỳ" thiếu thì lấy nhầm ô ngày 0 — thì tab Check phải bắt được,
 * và phải chỉ ra đúng những lô sai trong chuỗi.
 */
import {
  canCu, capDaBiChan, docChuoi, kiemDa, kiemLo, luatLoMien, HAU_TO_DA,
  type DongMay, type DuLieuMien, type KyVe, type LichDoc,
} from "../src/lib/kiem-chuoi.ts";
import { provincePrefix } from "../src/lib/provinces.ts";
import { chuanHoaLich, dungTrangThai, mucTheoLich } from "../src/lib/lich-han-muc.ts";
import { apChanLuat, bangMacDinh, capBiChan, chiaKhoiChanDa, dongChanLq, khoKyToi, khoiChanLq, nhomChanDa } from "../src/lib/da.ts";

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
/** Số MÁY THẬT đưa ra: đúng hai hàm bộ máy hạn mức đang dùng trên production. */
function mayThat(draws: KyVe[], raw: unknown): { may: DongMay[]; lich: LichDoc } {
  const { lich } = chuanHoaLich(raw);
  const { lo } = dungTrangThai(rows(draws));
  const may = [...lo].map(([so, st]) => {
    const days = st.last ? st.days : 30;
    const v = mucTheoLich(lich, days, st.consec);
    return { lo_number: so, days_since_last: days, consecutive_days: st.consec, current_limit: v, limit_before_tracking: v };
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

console.log("===== 1. ĐỌC CHUỖI — mọi kiểu app và bot chép ra =====");
{
  const d = (t: string) => docChuoi(t, DAU);
  let k = d(`${DAU.xsmn}: 00b15dd15, 01b200dd200, 02b0dd0`).khoi[0];
  ok("web kèm đề: miền Nam theo đầu đài, 3 lô, đề = lô", k.loai === "lo-tien" && k.mien === "xsmn" && k.dauDaiChuan && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["00", 15, 15], ["01", 200, 200], ["02", 0, 0]]) && k.la.length === 0);
  k = d(`${DAU.xsmt}: 00b15n, 01b200n`).khoi[0];
  ok("bot /copy (đuôi n): miền Trung, không có đề", k.mien === "xsmt" && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["00", 15, null], ["01", 200, null]]));
  k = d("85b200ndd200n, 86b15ndd15n").khoi[0];
  ok("không đầu đài + giữ chữ n: miền = null (dùng tab đang chọn)", k.mien === null && k.muc.length === 2 && k.muc[0].de === 200);
  k = d("2d15b50, 16b100, 17b10").khoi[0];
  ok("bot gửi '2d15b50, 16b100': tiền tố 2d, 3 lô, miền chưa rõ", k.tienTo === "2d" && k.mien === null && eq(k.muc.map((m) => [m.lo, m.diem]), [["15", 50], ["16", 100], ["17", 10]]));
  k = d("mb 15b50, 16b100").khoi[0];
  ok("bot gửi 'mb 15b50': miền Bắc theo tiền tố", k.tienTo === "mb" && k.mien === "xsmb" && k.muc.length === 2 && k.la.length === 0);
  k = d(`${DAU.xsmn}: 04 78 90`).khoi[0];
  ok("danh sách số có đầu đài", k.loai === "lo-so" && k.mien === "xsmn" && eq(k.so, ["04", "78", "90"]) && !k.laChanso);
  const cs = d(`Mn: 01 02${NL}Mt: —${NL}Mb: 03`).khoi;
  ok("/chanso 3 dòng: Mn 2 số, Mt trống, Mb 1 số — là danh sách chặn", cs.length === 3 && cs.every((x) => x.laChanso) && eq(cs.map((x) => [x.mien, x.so]), [["xsmn", ["01", "02"]], ["xsmt", []], ["xsmb", ["03"]]]));
  k = d(`${DAU.xsmb}: 05b0n 17b0n`).khoi[0];
  ok("/chanlo 'mb: 05b0n 17b0n': miền Bắc, toàn 0", k.mien === "xsmb" && eq(k.muc.map((m) => [m.lo, m.diem, m.de]), [["05", 0, null], ["17", 0, null]]));
  let da = d(`/chanloai${NL}${DAU.xsmn}: 01 10 11dx0n 20 21dx0n 05dx0n`).khoi[0];
  ok("/chanloai: 2 vòng + mẩu một con (kiểu cũ) = con tròn", da.loai === "da" && da.lenh === "/chanloai" && eq(da.vong, [["01", "10", "11"], ["20", "21"]]) && eq(da.tron, ["05"]) && da.cut.length === 0);
  const lq = d(`/chanlq${NL}${DAU.xsmn}: 07 12 30 dx0n .${NL}${DAU.xsmt}: 05 13 dx0n .${NL}mb: 09 28 da0n .`).khoi;
  ok("/chanlq 3 dòng: mỗi miền một danh sách con tròn, đúng hậu tố", lq.length === 3 && lq.every((x) => x.loai === "da" && x.lenh === "/chanlq" && x.vong.length === 0 && x.la.length === 0) && eq(lq.map((x) => [x.mien, x.tron, x.hauTo]), [["xsmn", ["07", "12", "30"], ["dx0n"]], ["xsmt", ["05", "13"], ["dx0n"]], ["xsmb", ["09", "28"], ["da0n"]]]));
  da = d(`/chanloai${NL}${DAU.xsmn}: 01 10 11dx0n 20 21 22`).khoi[0];
  ok("chuỗi đá bị cắt cụt: 3 số cuối không có hậu tố được bắt", eq(da.cut, ["20", "21", "22"]) && da.vong.length === 1);
  const tap = d(`🌴 Miền Nam · 36 lô · tổng 3.000n${NL}bỏ qua 64 lô đang khoá${NL}${NL}${DAU.xsmn}: 00b15n, xx, 01b20n${NL}phần 1/2`);
  ok("tin bot chép nguyên: 3 dòng chữ bị bỏ qua, dòng chuỗi vẫn đọc; mẩu 'xx' báo lạ", tap.khoi.length === 1 && tap.boQua.length === 3 && eq(tap.khoi[0].la, ["xx"]) && tap.khoi[0].muc.length === 2);
  k = d("st tv ag: 00b15n").khoi[0];
  ok("đầu đài thiếu (3/21 đài): vẫn nhận miền Nam nhưng đánh dấu không chuẩn", k.mien === "xsmn" && !k.dauDaiChuan);
  ok("chữ thường không phải chuỗi → không có khối nào", d("xin chào anh").khoi.length === 0 && d("").khoi.length === 0);
  ok("số 1 chữ số / 3 chữ số không được đoán thành lô", d("5b10, 123b10").khoi.length === 0);
}

console.log("\n===== 2. HAI ĐƯỜNG TÍNH RA CÙNG SỐ khi bộ máy đúng (lịch sử + bảng ngẫu nhiên) =====");
{
  let lech = 0, lo = 0, saiChuoi = 0;
  for (let lan = 0; lan < 150; lan++) {
    const draws = lichSu(20 + Math.floor(rnd() * 60), lan % 3 === 0 ? 0.15 : 0.03);
    const { may, lich } = mayThat(draws, lichNgauNhien());
    const dl: DuLieuMien = { region: "xsmn", draws, lich, may };
    const luat = luatLoMien(dl);
    lech += luat.soLechMay; lo += 100;
    if (lan < 40) {
      const kq = kiemLo(docChuoi(chuoiWeb(may, "xsmn"), DAU).khoi[0], "xsmn", luat, dl);
      if (kq.mucDo !== "dung" || kq.soDung !== 100 || kq.nhom !== "cả 100 lô") saiChuoi++;
    }
  }
  ok(`150 lịch sử ngẫu nhiên (có ngày hổng) × bảng ngẫu nhiên: ${lo} lô, tab Check và bộ máy khớp nhau`, lech === 0, `${lech} lô lệch`);
  ok("chuỗi 'cả bảng' do chính bộ máy ra → 40/40 lần báo ĐÚNG, đủ 100 lô", saiChuoi === 0, String(saiChuoi));
}

console.log("\n===== 3. DỰNG LẠI LỖI 01/10: máy lấy nhầm ô — tab Check phải bắt được =====");
{
  // Bảng như khách cài: ngày 0/4/6/7 = 100, còn lại 0; bản lưu chỉ có ô "liên tiếp 2".
  const raw = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, [0, 4, 6, 7].includes(d) ? 100 : 0])), min_limit: 0, consecutive: { 2: 100 } };
  let draws: KyVe[] = [];
  for (let t = 0; t < 50; t++) { draws = lichSu(40, 0); const st = dungTrangThai(rows(draws)).lo; if ([...st.values()].filter((s) => s.consec === 3).length >= 2) break; }
  const st = dungTrangThai(rows(draws)).lo;
  const ba = [...st].filter(([, s]) => s.consec === 3 || s.consec === 4).map(([l]) => l).sort();
  // MÁY CŨ: ô liên tiếp thiếu thì lùi về ô ngày 0 (=100). Màn hình khi đó vẫn vẽ ô ấy là 0.
  const mayCu: DongMay[] = [...st].map(([so, s]) => {
    const days = s.last ? s.days : 30;
    const rieng = (raw.consecutive as Record<number, number>)[s.consec];
    const v = s.consec >= 2 && rieng !== undefined ? rieng : ((raw.base as Record<number, number>)[days] ?? raw.min_limit);
    return { lo_number: so, days_since_last: days, consecutive_days: s.consec, current_limit: v, limit_before_tracking: v };
  });
  const lich = JSON.parse(JSON.stringify(chuanHoaLich(raw).lich)) as LichDoc; // cái màn hình hiện: liên tiếp 3, 4 = 0
  const dl: DuLieuMien = { region: "xsmn", draws, lich, may: mayCu };
  const luat = luatLoMien(dl);
  ok(`có ${ba.length} lô đang về liên tiếp 3–4 kỳ (${ba.join(" ")})`, ba.length >= 2);
  ok("tab Check báo MÁY LỆCH đúng ở các lô đó, không lô nào khác", luat.soLechMay === ba.length && eq(Object.values(luat.lo).filter((l) => l.lechMay.length).map((l) => l.lo).sort(), ba), String(luat.soLechMay));
  ok("lời báo nói rõ: máy tính 100n, ô “liên tiếp 3 kỳ” đang cài 0", luat.lo[ba[0]].lechMay.some((t) => t.includes("100n") && t.includes("đang cài 0")), luat.lo[ba[0]].lechMay.join("; "));
  const kq = kiemLo(docChuoi(chuoiWeb(mayCu, "xsmn"), DAU).khoi[0], "xsmn", luat, dl);
  ok(`chuỗi máy cũ chép ra → SAI đúng ${ba.length} số, đúng các lô đó, lý do "đang CHẶN mà chuỗi nhận 100"`, kq.mucDo === "sai" && eq(kq.loi.map((e) => e.lo).sort(), ba) && kq.loi.every((e) => e.loai === "chan-ma-nhan" && e.chuoi === 100));
  ok("căn cứ ghi ngày về và ô: 'về 3 kỳ liền (…) → ô “liên tiếp 3 kỳ” đang cài 0 = chặn'", /về [34] kỳ liền \(\d\d\/\d\d, \d\d\/\d\d, \d\d\/\d\d/.test(canCu(luat.lo[ba[0]])) && canCu(luat.lo[ba[0]]).endsWith("đang cài 0 = chặn"), canCu(luat.lo[ba[0]]));
  const { may } = mayThat(draws, raw);
  const dl2 = { ...dl, may };
  const luat2 = luatLoMien(dl2);
  ok("cùng bảng đó, MÁY MỚI: không lệch, chuỗi chép ra ĐÚNG", luat2.soLechMay === 0 && kiemLo(docChuoi(chuoiWeb(may, "xsmn"), DAU).khoi[0], "xsmn", luat2, dl2).mucDo === "dung");
}

console.log("\n===== 4. CHUỖI LÔ: sửa 2 số thì bắt đúng 2 số =====");
{
  const draws = lichSu(60, 0.03);
  const raw = { base: Object.fromEntries(Array.from({ length: 20 }, (_, d) => [d, d === 1 || d === 3 ? 0 : 100 + d])), min_limit: 7, consecutive: { 2: 52, 3: 0, 4: 54 } };
  const { may, lich } = mayThat(draws, raw);
  const dl: DuLieuMien = { region: "xsmt", draws, lich, may };
  const luat = luatLoMien(dl);
  const K = (t: string, r: Region = "xsmt") => kiemLo(docChuoi(t, DAU).khoi[0], r, luat, dl);
  ok("máy khớp", luat.soLechMay === 0);
  for (const [ten, kieu] of [["kèm đề", "dd"], ["đuôi n", "n"], ["trần (bot gửi)", "tran"]] as [string, "dd" | "n" | "tran"][]) {
    ok(`chuỗi cả bảng ${ten} → ĐÚNG 100/100`, K(chuoiWeb(may, "xsmt", kieu)).mucDo === "dung" && K(chuoiWeb(may, "xsmt", kieu)).soDung === 100);
  }
  const boChan = K(chuoiWeb(may, "xsmt", "n", true));
  ok("chuỗi đã bỏ lô chặn (như /copy) → ĐÚNG, khớp nhóm 'mọi lô đang nhận', không báo thiếu", boChan.mucDo === "dung" && boChan.thieu.length === 0 && (boChan.nhom ?? "").includes("đang nhận"), String(boChan.nhom));
  const nhan = may.filter((m) => m.current_limit > 0), chan = may.filter((m) => m.current_limit === 0);
  const a = nhan[3], b = chan[1];
  const sua = chuoiWeb(may, "xsmt").replace(`${a.lo_number}b${a.current_limit}dd${a.current_limit}`, `${a.lo_number}b${a.current_limit + 5}dd${a.current_limit + 5}`).replace(`${b.lo_number}b0dd0`, `${b.lo_number}b100dd100`);
  const kq = K(sua);
  ok(`sửa 2 số (${a.lo_number}: +5, ${b.lo_number}: 0→100) → SAI đúng 2 số`, kq.mucDo === "sai" && kq.loi.length === 2 && kq.soDung === 98 && eq(kq.loi.map((e) => [e.lo, e.loai]).sort(), [[a.lo_number, "sai-tien"], [b.lo_number, "chan-ma-nhan"]].sort()), JSON.stringify(kq.loi.map((e) => e.chu)));
  const de = K(chuoiWeb(may, "xsmt").replace(`${a.lo_number}b${a.current_limit}dd${a.current_limit}`, `${a.lo_number}b${a.current_limit}dd${a.current_limit + 1}`));
  ok("tiền đề khác tiền lô → báo đúng 1 lỗi 'đề khác'", de.loi.length === 1 && de.loi[0].loai === "de-khac" && de.loi[0].lo === a.lo_number);
  const lap = K(chuoiWeb(may, "xsmt") + `, ${a.lo_number}b${a.current_limit}dd${a.current_limit}`);
  ok("một lô ghi hai lần → báo 'trùng'", lap.loi.length === 1 && lap.loi[0].loai === "trung");
  const cut = K(`${DAU.xsmt}: ` + nhan.slice(0, nhan.length - 4).map((m) => `${m.lo_number}b${m.current_limit}n`).join(", "));
  ok("chuỗi cụt mất 4 lô đang nhận → không số nào sai tiền nhưng báo THIẾU đúng 4 lô", cut.loi.length === 0 && cut.mucDo === "luu-y" && eq(cut.thieu.map((l) => l.lo), nhan.slice(-4).map((m) => m.lo_number)));
  const lt = may.filter((m) => m.consecutive_days === 3);
  if (lt.length) {
    const g = K(`${DAU.xsmt}: ` + lt.map((m) => `${m.lo_number}b0dd0`).join(", "));
    ok(`lọc 'liên tiếp 3 ngày' (${lt.length} lô, ô cài 0) → ĐÚNG, nhận ra nhóm, không báo thiếu`, g.mucDo === "dung" && (g.nhom ?? "").includes("liên tiếp 3 ngày") && g.thieu.length === 0, String(g.nhom));
  }
  const khongDau = K(nhan.map((m) => `${m.lo_number}b${m.current_limit}n`).join(", "));
  ok("chuỗi không đầu đài (như khối Ngày Mai) → tiền đúng, kèm lưu ý 'tính theo tab đang chọn'", khongDau.loi.length === 0 && khongDau.luuY.some((t) => t.includes("tab đang chọn")));
  // chia đôi
  const m2 = may.map((m) => ({ ...m }));
  const h = m2.find((m) => m.current_limit >= 100)!;
  h.current_limit = Math.round(h.current_limit / 2); h.in_top = true;
  const dl2 = { ...dl, may: m2 }, luat2 = luatLoMien(dl2);
  ok(`lô ${h.lo_number} bị chia đôi (top): luật đúng = một nửa, máy không lệch`, luat2.soLechMay === 0 && luat2.lo[h.lo_number].dung === h.current_limit && luat2.lo[h.lo_number].chiaDoi && canCu(luat2.lo[h.lo_number]).includes("chia đôi (top)"));
  ok("chuỗi ghi mức CHƯA chia đôi cho lô đó → SAI 1 số", kiemLo(docChuoi(chuoiWeb(may, "xsmt"), DAU).khoi[0], "xsmt", luat2, dl2).loi.length === 1);
  const m3 = may.map((m) => ({ ...m })); m3.find((m) => m.current_limit >= 100)!.current_limit -= 3;
  ok("máy đưa một số không phải mức bảng cũng không phải một nửa → báo MÁY LỆCH", luatLoMien({ ...dl, may: m3 }).soLechMay === 1);
  // danh sách số + chanso
  const dsChan = chan.map((m) => m.lo_number);
  const cs = K(`Mt: ${dsChan.join(" ")}`);
  ok(`/chanso đúng ${dsChan.length} lô chặn → ĐÚNG`, cs.mucDo === "dung" && cs.soDung === dsChan.length);
  const csSai = K(`Mt: ${dsChan.slice(1).join(" ")} ${a.lo_number}`);
  ok("/chanso thiếu 1 lô chặn + thừa 1 lô đang nhận → SAI: 1 'không chặn', sót 1", csSai.mucDo === "sai" && csSai.loi.length === 1 && csSai.loi[0].loai === "khong-chan" && csSai.thieu.length === 1 && csSai.thieu[0].lo === dsChan[0]);
  const soTran = K(`${DAU.xsmt}: ${dsChan.join(" ")}`);
  ok("danh sách số (không tiền) trùng đúng tập lô chặn → nhận ra 'mọi lô đang chặn'", soTran.loi.length === 0 && soTran.nhom === "mọi lô đang chặn");
  // /chanlo
  const dlC = { ...dl, chanLoLuat: ["05", "17", "40"] };
  const c1 = kiemLo(docChuoi(`${DAU.xsmt}: 05b0n 17b0n 40b0n`, DAU).khoi[0], "xsmt", luat, dlC);
  ok("chuỗi /chanlo khớp luật 2 bước → ĐÚNG dù bảng hạn mức đang nhận các lô đó", c1.chanLo?.khop === true && c1.loi.length === 0 && c1.mucDo === "dung");
  const c2 = kiemLo(docChuoi(`${DAU.xsmt}: 05b0n 17b0n 41b0n`, DAU).khoi[0], "xsmt", luat, dlC);
  ok("chuỗi /chanlo lệch 1 lô → chỉ ra thừa 41, thiếu 40", c2.chanLo?.khop === false && eq(c2.chanLo?.thua, ["41"]) && eq(c2.chanLo?.thieu, ["40"]));
  ok("mỗi lô có đủ 10 ô kỳ gần nhất và danh sách ngày về", luat.kyGan.length === 10 && Object.values(luat.lo).every((l) => l.veGan.length === 10 && l.cacNgayVe.length === l.veGan.filter((v) => v > 0).length));
}

console.log("\n===== 5. CHẶN ĐÁ: cặp tính lại độc lập = bảng tiền đá; chuỗi thiếu/thừa bị bắt =====");
{
  let lechCap = 0;
  let dlDa: DuLieuMien | null = null, capThat: [string, string][] = [];
  for (let lan = 0; lan < 25; lan++) {
    const draws = lichSu(40 + Math.floor(rnd() * 40), 0.05);
    const bang = bangMacDinh();
    for (const k of Object.keys(bang)) if (rnd() < 0.25) bang[k] = 0;
    const chanLuat = Object.keys(bang).filter(() => rnd() < 0.1);
    const tuDong = lan % 2 === 0;
    const { may, lich } = mayThat(draws, lichNgauNhien());
    const dl: DuLieuMien = { region: "xsmn", draws, lich, may, da: { bang, tuDong, chanLuat, rutGon: true, nguongGon: 90 } };
    const that = capBiChan(khoKyToi(draws)!.kho, tuDong ? apChanLuat(bang, chanLuat) : bang);
    const E = capDaBiChan(dl, luatLoMien(dl));
    const thatSet = new Set(that.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
    if (E.size !== thatSet.size || [...E].some((p) => !thatSet.has(p))) lechCap++;
  }
  // Một bảng chặn dày, để có cả con chặn tròn (≥ 90/99) lẫn vòng — đúng cảnh khách đang dùng Rút gọn.
  for (let lan = 0; lan < 200 && !dlDa; lan++) {
    const draws = lichSu(60, 0.05);
    const bang = bangMacDinh();
    for (const k of Object.keys(bang)) if (rnd() < 0.6) bang[k] = 0;
    const { may, lich } = mayThat(draws, lichNgauNhien());
    const that = capBiChan(khoKyToi(draws)!.kho, bang);
    const thu = nhomChanDa(that, false, true, 90);
    if (thu.con100.length >= 3 && thu.con100.length <= 60 && thu.nhom.length >= 5) {
      dlDa = { region: "xsmn", draws, lich, may, da: { bang, tuDong: false, chanLuat: [], rutGon: true, nguongGon: 90 } };
      capThat = that;
    }
  }
  ok("25 bảng tiền đá ngẫu nhiên (luật bật/tắt): tập cặp bị chặn tính lại = tập cặp của bộ máy đá", lechCap === 0, String(lechCap));

  const dl = dlDa!, luat = luatLoMien(dl), r: Region = "xsmn";
  const { nhom, con100, capThem } = nhomChanDa(capThat, false, true, 90);
  const loai = chiaKhoiChanDa(DAU[r], nhom, 3400, r);
  const lq = con100.length ? khoiChanLq([dongChanLq(DAU[r], con100, r)]) : "";
  const K = (t: string) => kiemDa(docChuoi(t, DAU).khoi, r, luat, dl);
  const ca = K([lq, ...loai].filter(Boolean).join(NL));
  ok(`dán cả /chanlq (${con100.length} con) + ${loai.length} khối /chanloai → không sót, không chặn oan; làm tròn đúng ${capThem} cặp`, ca.thieu.length === 0 && ca.thua.length === 0 && ca.thuaLamTron === capThem && ca.loiDang.length === 0 && ca.mucDo === "dung", `${ca.mucDo} thieu ${ca.thieu.length} thua ${ca.thua.length} tron ${ca.thuaLamTron} | ${ca.luuY.join(" | ")}`);
  ok("con chặn tròn trong chuỗi = con chặn tròn theo cài đặt đã lưu, mỗi con ≥ 90/99", eq(ca.tron.map((t) => t.con), ca.tronLuat) && ca.tron.every((t) => t.bac >= 90));
  const chiLoai = K(loai.join(NL));
  ok(`cảnh thử có ${con100.length} con chặn tròn và ${nhom.length} vòng/cặp`, con100.length >= 3 && nhom.length >= 5);
  ok("chỉ dán /chanloai → không báo sai, lưu ý 'còn N cặp nằm ở lệnh /chanlq'", (chiLoai.thieu.length === 0 && chiLoai.thieuOLenhKia > 0 && chiLoai.mucDo === "luu-y" && chiLoai.luuY.some((t) => t.includes("/chanlq"))), chiLoai.luuY.join(" | "));
  if (lq) {
    const chiLq = K(lq);
    ok("chỉ dán /chanlq → không báo sai, lưu ý 'còn N cặp nằm ở /chanloai'", chiLq.thieu.length === 0 && chiLq.thua.length === 0 && chiLq.mucDo === "luu-y" && chiLq.luuY.some((t) => t.includes("/chanloai")));
  }
  // bỏ hẳn vòng đầu tiên → sót đúng các cặp chỉ vòng đó phủ
  const dong = loai[0].split(NL)[1];
  const than = dong.slice(DAU[r].length + 2).split(" ");
  const het1 = than.findIndex((x) => x.endsWith("dx0n"));
  const vong1 = than.slice(0, het1 + 1).map((x) => x.replace("dx0n", ""));
  const boVong = [lq, `/chanloai${NL}${DAU[r]}: ${than.slice(het1 + 1).join(" ")}`, ...loai.slice(1)].filter(Boolean).join(NL);
  const sot = K(boVong);
  const phuKhac = new Set<string>();
  for (const n of nhom.slice(1)) for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) phuKhac.add(n[i] < n[j] ? `${n[i]}-${n[j]}` : `${n[j]}-${n[i]}`);
  const mong: string[] = [];
  for (let i = 0; i < vong1.length; i++) for (let j = i + 1; j < vong1.length; j++) { const p = vong1[i] < vong1[j] ? `${vong1[i]}-${vong1[j]}` : `${vong1[j]}-${vong1[i]}`; if (!phuKhac.has(p)) mong.push(p); }
  ok(`bỏ vòng đầu (${vong1.length} con) → SAI, sót đúng ${mong.length} cặp chỉ vòng đó phủ`, sot.mucDo === "sai" && eq(sot.thieu, mong.sort()), `${sot.thieu.length} vs ${mong.length}`);
  // thêm một cặp bảng đang nhận
  const E = capDaBiChan(dl, luat);
  let oan = "";
  for (let x = 0; x < 100 && !oan; x++) for (let y = x + 1; y < 100; y++) { const p = `${LOS[x]}-${LOS[y]}`; if (!E.has(p) && !con100.includes(LOS[x]) && !con100.includes(LOS[y])) { oan = p; break; } }
  const them = K([lq, ...loai].filter(Boolean).join(NL) + NL + `/chanloai${NL}${DAU[r]}: ${oan.replace("-", " ")}dx0n`);
  ok(`thêm cặp ${oan} (bảng đang nhận) → SAI, chặn oan đúng 1 cặp`, them.mucDo === "sai" && eq(them.thua, [oan]) && them.thieu.length === 0);
  const saiHau = K(`/chanloai${NL}${DAU[r]}: 01 02da0n`);
  ok("hậu tố da0n trên chuỗi Miền Nam → báo sai hậu tố", saiHau.loiDang.some((t) => t.includes("da0n") && t.includes(HAU_TO_DA.xsmn)));
  const cut = K(`/chanloai${NL}${DAU[r]}: 01 02dx0n 03 04`);
  ok("chuỗi đá cụt đuôi → báo 'bị cắt cụt'", cut.mucDo === "sai" && cut.loiDang.some((t) => t.includes("cắt cụt")));
  const thieuLenh = K(`${DAU[r]}: 01 02dx0n`);
  ok("thiếu dòng lệnh /chanloai phía trên → có lưu ý", thieuLenh.luuY.some((t) => t.includes("thiếu dòng lệnh")));
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
