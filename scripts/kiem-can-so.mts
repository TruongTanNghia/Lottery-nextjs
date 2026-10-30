/**
 * Bài kiểm tab Cân Sổ (src/lib/can-so.ts) — khách 30/10/2026.
 *
 *   npm run test:canso
 *
 * 1. Ví dụ khách nêu (nhận 23 24 25, con 26 trống) ra đúng bảng đã gửi khách.
 * 2. Ba cách = tính tay độc lập trên sổ ngẫu nhiên, lô và đá.
 * 3. Đánh lên đúng số nhận: mọi kỳ cùng một số = (thu − đánh) × nhận; bù số
 *    thiếu không bao giờ cố định khi có bù và có kỳ khách về.
 * 4. Đọc chuỗi lô / đá, chuỗi đánh lên đọc ngược ra đúng sổ.
 */
import {
  CAC_CACH, chamKy, chayCanSo, chuoiDanhLenDa, chuoiDanhLenLo, diemBu, docDaNhan, docLoNhan, giaMacDinh, lanTrung, thieuCua, tomTatCach,
  type DongSo, type GiaBen, type KetQuaKyCanSo,
} from "../src/lib/can-so";
import { GIA_DA, TRUNG_DA } from "../src/lib/da";
import { STAKE_PRICE, WIN_PER_POINT } from "../src/lib/exposure";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };
let seed = 30102026;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const ngay = (i: number) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
const gan = (a: number, b: number) => Math.abs(a - b) < 1e-6;
function lichSu(soKy: number) {
  const out: { date: string; hits: Record<string, number> }[] = [];
  for (let i = 0; i < soKy; i++) {
    const hits: Record<string, number> = {};
    for (let g = 0; g < 36; g++) { const lo = LOS[Math.floor(rnd() * 100)]; hits[lo] = (hits[lo] ?? 0) + 1; }
    out.push({ date: ngay(i), hits });
  }
  return out;
}

console.log("\n===== 1. Ví dụ khách: nhận 23 24 25 mỗi con 1n, con 26 trống; thu 36n, đánh 27n, trả 75n =====");
{
  const ds: DongSo[] = [23, 24, 25, 26].map((n) => ({ khoa: String(n), hanMuc: 1, daNhan: n === 26 ? 0 : 1 }));
  const gia: GiaBen = { thu: 36_000, danh: 27_000, tra: 75_000 };
  const bu = { kieu: "thieu" as const };
  const cham = (hits: Record<string, number>) => chamKy(ds, gia, bu, "lo", { date: "2026-10-30", hits });
  const a = cham({});
  ok("không con nào về: không bù +108n, đánh lên +27n, bù 26 +81n", a.khongBu === 108_000 && a.danhLen === 27_000 && a.buThieu === 81_000);
  const b = cham({ "23": 1 });
  ok("23 về: +33n / +27n / +6n", b.khongBu === 33_000 && b.danhLen === 27_000 && b.buThieu === 6_000);
  const c = cham({ "23": 1, "24": 1 });
  ok("23 và 24 về: −42n / +27n / −69n", c.khongBu === -42_000 && c.danhLen === 27_000 && c.buThieu === -69_000);
  const d = cham({ "23": 1, "24": 1, "25": 1 });
  ok("23 24 25 cùng về: −117n / +27n / −144n", d.khongBu === -117_000 && d.danhLen === 27_000 && d.buThieu === -144_000);
  const e = cham({ "26": 1 });
  ok("chỉ 26 về: +108n / +27n / +156n", e.khongBu === 108_000 && e.danhLen === 27_000 && e.buThieu === 156_000);
  ok("đánh lên đúng số nhận = (36n − 27n) × 3n = 27n ở mọi kịch bản", [a, b, c, d, e].every((x) => x.danhLen === 27_000));
  const kq = chayCanSo(ds, gia, bu, "lo", [{ date: "2026-10-02", hits: { "23": 1, "24": 1 } }, { date: "2026-10-01", hits: {} }, { date: "2026-10-03", hits: { "26": 1 } }]);
  ok("chayCanSo: tổng nhận 3, thiếu 1, bù 1, chênh chắc 27n, kỳ sắp theo ngày", kq.tongNhan === 3 && kq.tongThieu === 1 && kq.tongBu === 1 && kq.chenhChac === 27_000 && kq.ky.map((k) => k.date).join() === "2026-10-01,2026-10-02,2026-10-03");
  ok("tóm tắt: đánh lên luôn lời & cố định; bù số thiếu có kỳ lỗ (−69n), không luôn lời", kq.tomTat.danhLen.luonLoi && kq.tomTat.danhLen.coDinh && !kq.tomTat.buThieu.luonLoi && kq.tomTat.buThieu.teNhat === -69_000 && kq.tomTat.buThieu.ngayTeNhat === "2026-10-02");
  ok("tóm tắt không bù: lời 2 kỳ, lỗ 1, tổng 108+108−42", kq.tomTat.khongBu.kyLoi === 2 && kq.tomTat.khongBu.kyLo === 1 && kq.tomTat.khongBu.tong === 174_000);
  const giaBang: GiaBen = { thu: 27_000, danh: 27_000, tra: 75_000 };
  const kq0 = chayCanSo(ds, giaBang, bu, "lo", lichSu(50));
  ok("giá thu = giá đánh: đánh lên ra đúng 0 mọi kỳ, không 'luôn lời'", kq0.chenhChac === 0 && kq0.tomTat.danhLen.coDinh && kq0.tomTat.danhLen.totNhat === 0 && !kq0.tomTat.danhLen.luonLoi);
}

console.log("\n===== 2. Ba cách = tính tay độc lập, sổ ngẫu nhiên (lô & đá, 3 miền, 2 kiểu bù) =====");
for (const region of ["xsmn", "xsmt", "xsmb"] as const) {
  const draws = lichSu(60);
  // LÔ
  for (const bu of [{ kieu: "thieu" as const }, { kieu: "codinh" as const, n: 3 }]) {
    let lech = 0, coBu = 0;
    for (let lan = 0; lan < 20; lan++) {
      const ds: DongSo[] = LOS.map((lo) => ({ khoa: lo, hanMuc: rnd() < 0.3 ? 0 : Math.floor(rnd() * 8), daNhan: rnd() < 0.5 ? 0 : Math.floor(rnd() * 9) }));
      const gia: GiaBen = { thu: 20_000 + Math.floor(rnd() * 20) * 1000, danh: STAKE_PRICE[region], tra: WIN_PER_POINT };
      const kq = chayCanSo(ds, gia, bu, "lo", draws);
      for (let i = 0; i < draws.length; i++) {
        // Tay: duyệt từng lô, cộng từng khoản.
        let khong = 0, len = 0, buT = 0;
        for (const d of ds) {
          const r = d.daNhan, thieu = Math.max(0, d.hanMuc - r), x = thieu > 0 ? (bu.kieu === "thieu" ? thieu : bu.n) : 0;
          const nhay = draws[i].hits[d.khoa] ?? 0;
          khong += r * gia.thu - r * gia.tra * nhay;
          len += r * (gia.thu - gia.danh);
          buT += r * gia.thu - r * gia.tra * nhay - x * gia.danh + x * gia.tra * nhay;
          if (x > 0) coBu++;
        }
        const k = kq.ky[i];
        if (!gan(k.khongBu, khong) || !gan(k.danhLen, len) || !gan(k.buThieu, buT)) lech++;
      }
      const tay = CAC_CACH.every((c) => gan(kq.tomTat[c].tong, kq.ky.reduce((s, k) => s + k[c], 0)));
      if (!tay) lech++;
    }
    ok(`${region} lô, bù ${bu.kieu}: 20 sổ × 60 kỳ, ba cách và tổng = tay`, lech === 0 && coBu > 0, `lệch ${lech}`);
  }
  // ĐÁ: cặp về = cả hai con có mặt, đếm một lần
  {
    let lech = 0, coVe = 0;
    for (let lan = 0; lan < 10; lan++) {
      const ds: DongSo[] = [];
      for (let t = 0; t < 300; t++) {
        const a = LOS[Math.floor(rnd() * 100)], b = LOS[Math.floor(rnd() * 100)];
        if (a === b) continue;
        const k = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (ds.some((d) => d.khoa === k)) continue;
        ds.push({ khoa: k, hanMuc: Math.floor(rnd() * 6), daNhan: rnd() < 0.5 ? 0 : Math.floor(rnd() * 6) });
      }
      const gia: GiaBen = { thu: 72_000, danh: GIA_DA[region], tra: TRUNG_DA[region] };
      const kq = chayCanSo(ds, gia, { kieu: "thieu" }, "da", draws);
      for (let i = 0; i < draws.length; i++) {
        let khong = 0, len = 0, buT = 0;
        for (const d of ds) {
          const [a, b] = d.khoa.split("-");
          const ve = (draws[i].hits[a] ?? 0) > 0 && (draws[i].hits[b] ?? 0) > 0 ? 1 : 0;
          if (ve) coVe++;
          const r = d.daNhan, x = Math.max(0, d.hanMuc - r);
          khong += r * gia.thu - r * gia.tra * ve;
          len += r * (gia.thu - gia.danh);
          buT += r * gia.thu - r * gia.tra * ve - x * gia.danh + x * gia.tra * ve;
        }
        const k = kq.ky[i];
        if (!gan(k.khongBu, khong) || !gan(k.danhLen, len) || !gan(k.buThieu, buT)) lech++;
      }
    }
    ok(`${region} đá: 10 sổ × 60 kỳ, ba cách = tay; có cặp về (${coVe})`, lech === 0 && coVe > 0, `lệch ${lech}`);
  }
  ok(`${region}: giá mặc định = giá máy đang dùng (lô ${STAKE_PRICE[region]}, đá ${GIA_DA[region]}/${TRUNG_DA[region]})`, (() => { const l = giaMacDinh("lo", region), d = giaMacDinh("da", region); return l.thu === STAKE_PRICE[region] && l.danh === STAKE_PRICE[region] && l.tra === WIN_PER_POINT && d.thu === GIA_DA[region] && d.danh === GIA_DA[region] && d.tra === TRUNG_DA[region]; })());
}
ok("đá: 24 về 2 nháy, 95 về 1 nháy → cặp về 1 (đếm một lần); 24 về, 95 không → 0", lanTrung("da", "24-95", { "24": 2, "95": 1 }) === 1 && lanTrung("da", "24-95", { "24": 2 }) === 0);
ok("lô: 24 về 2 nháy → 2", lanTrung("lo", "24", { "24": 2 }) === 2);

console.log("\n===== 3. Luôn lời chỉ có ở 'đánh lên đúng số nhận'; bù số thiếu luôn có kỳ xấu hơn =====");
{
  const draws = lichSu(120);
  const ds: DongSo[] = LOS.map((lo) => ({ khoa: lo, hanMuc: 5, daNhan: Number(lo) % 3 === 0 ? 2 : 0 }));
  const gia: GiaBen = { thu: 36_000, danh: 27_000, tra: 75_000 };
  const kq = chayCanSo(ds, gia, { kieu: "thieu" }, "lo", draws);
  const nhan = ds.reduce((s, d) => s + d.daNhan, 0);
  ok(`đánh lên: 120 kỳ cùng một số = (36n − 27n) × ${nhan}n = ${(9_000 * nhan).toLocaleString("vi-VN")}`, kq.tomTat.danhLen.coDinh && kq.tomTat.danhLen.luonLoi && gan(kq.tomTat.danhLen.teNhat, 9_000 * nhan) && gan(kq.chenhChac, 9_000 * nhan));
  ok("không bù & bù số thiếu: có kỳ lỗ, không luôn lời", kq.tomTat.khongBu.kyLo > 0 && kq.tomTat.buThieu.kyLo > 0 && !kq.tomTat.khongBu.luonLoi && !kq.tomTat.buThieu.luonLoi);
  // Bù cùng chiều với sổ: kỳ nào khách về nhiều (trungNhan cao) thì bù càng tệ hơn không bù, kỳ khách trượt thì bù đẹp hơn.
  const xau = kq.ky.filter((k) => k.buThieu < k.khongBu), dep = kq.ky.filter((k) => k.buThieu > k.khongBu);
  ok("bù số thiếu thua không bù ở một số kỳ và hơn ở số kỳ khác — cùng chiều, không bù trừ", xau.length > 0 && dep.length > 0);
  ok("kỳ nào cũng: bù − không bù = Σ bù × (trả × lần trúng − giá đánh)", kq.ky.every((k) => { let s = 0; for (const d of ds) { const x = diemBu(d, { kieu: "thieu" }); s += x * (gia.tra * (draws.find((w) => w.date === k.date)!.hits[d.khoa] ?? 0) - gia.danh); } return gan(k.buThieu - k.khongBu, s); }));
  ok("thieuCua / diemBu: nhận đủ hoặc quá → thiếu 0, bù 0; cố định 2 chỉ áp cho dòng thiếu", thieuCua({ khoa: "01", hanMuc: 3, daNhan: 5 }) === 0 && diemBu({ khoa: "01", hanMuc: 3, daNhan: 3 }, { kieu: "codinh", n: 2 }) === 0 && diemBu({ khoa: "01", hanMuc: 3, daNhan: 1 }, { kieu: "codinh", n: 2 }) === 2 && diemBu({ khoa: "01", hanMuc: 3, daNhan: 1 }, { kieu: "thieu" }) === 2);
  const t = tomTatCach([] as KetQuaKyCanSo[], "khongBu");
  ok("không kỳ nào: tóm tắt rỗng, không luôn lời", t.soKy === 0 && !t.luonLoi);
}

console.log("\n===== 4. Đọc chuỗi đã nhận; chuỗi đánh lên đọc ngược ra đúng sổ =====");
{
  const l = docLoNhan("st tv ag hg: 23b1, 24b1dd5, 25b10n 7b2 xyz 23b4");
  ok("lô: tiền tố đài bỏ, dd không tính, '7b2' → 07, lặp cộng dồn, mẩu lạ báo", l.diem["23"] === 5 && l.diem["24"] === 1 && l.diem["25"] === 10 && l.diem["07"] === 2 && l.soMuc === 5 && l.la.join() === "xyz");
  const l2 = docLoNhan("2d16b100, 15b50, 15b10");
  ok("lô: khuôn bot gửi '2d16b100, 15b50, 15b10' → 16:100, 15:60", l2.diem["16"] === 100 && l2.diem["15"] === 60 && l2.la.length === 0);
  const d = docDaNhan("Mn 2d24 95dx10n 37 82dx6n\n01 10 11dx5n rac 95 24dx1n");
  ok("đá: cặp lẻ, vòng 3 con → 3 cặp, cặp lặp (95 24) cộng dồn, mẩu lạ báo", d.diem["24-95"] === 11 && d.diem["37-82"] === 6 && d.diem["01-10"] === 5 && d.diem["01-11"] === 5 && d.diem["10-11"] === 5 && d.soCap === 6 && d.la.join() === "rac");
  const d2 = docDaNhan("Mb 24 95da10n");
  ok("đá Bắc 'da10n' đọc được", d2.diem["24-95"] === 10 && d2.soCap === 1);
  ok("chuỗi lô đánh lên: '2d23b1, 24b1, 25b10' theo thứ tự con, chỉ con đã nhận", chuoiDanhLenLo([{ khoa: "25", hanMuc: 1, daNhan: 10 }, { khoa: "23", hanMuc: 1, daNhan: 1 }, { khoa: "26", hanMuc: 1, daNhan: 0 }, { khoa: "24", hanMuc: 0, daNhan: 1 }], "2d") === "2d23b1, 24b1, 25b10" && chuoiDanhLenLo([{ khoa: "26", hanMuc: 1, daNhan: 0 }], "2d") === "");
  const ds: DongSo[] = Object.entries(d.diem).map(([khoa, daNhan]) => ({ khoa, hanMuc: 0, daNhan }));
  for (const region of ["xsmn", "xsmb"] as const) {
    const chuoi = chuoiDanhLenDa(ds, region, region === "xsmb" ? "mb " : "2d");
    const lai = docDaNhan(chuoi);
    const khop = Object.keys(d.diem).length === Object.keys(lai.diem).length && Object.entries(d.diem).every(([k, v]) => lai.diem[k] === v);
    ok(`${region}: chuỗi đá đánh lên đọc ngược ra đúng 5 cặp đúng điểm, mỗi cặp một lần (${chuoi})`, khop && lai.soCap === 5 && lai.la.length === 0 && chuoi.includes(region === "xsmb" ? "da5n" : "dx5n"));
  }
  ok("không nhận cặp nào → chuỗi rỗng", chuoiDanhLenDa([{ khoa: "24-95", hanMuc: 3, daNhan: 0 }], "xsmn", "2d") === "");
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
