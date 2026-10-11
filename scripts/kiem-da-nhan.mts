/**
 * Bài kiểm phương án 2 của Số Đá (src/lib/da-nhan.ts) và việc phương án 1 không bị đụng.
 *
 *   npm run test:danhan
 *
 * 1. Luật từng ngày (tính dồn) = luật gốc tính lại từ đầu trên đúng quãng trước ngày đó.
 * 2. Tiền số nhận khi tắt luật = chốt sổ theo bảng (soTungKyTheoBang) từng kỳ.
 * 3. Luật bật: ô chặn cộng dồn, không bao giờ tự mở; ô mở tay không bị chặn.
 * 4. Chuỗi nhận đọc ngược ra ĐÚNG tập cặp nhận và đúng điểm; chặn + nhận = đủ 4.950 cặp, không chồng.
 */
import { dungKy } from "../src/lib/slot-stats";
import {
  apChanLuat, bangMacDinh, capBiChan, khoKyToi, luatHaiBuoc, soTungKyTheoBang, thongKeCapTheoThang, thongKeDa,
  type BangDa, type KyDa,
} from "../src/lib/da";
import {
  capNhan, chiaKhoiNhanDa, docChuoiNhan, dongNhanLq, hauToNhan, khoiNhanLq, luatTungNgay, nhomNhanDa, tienNhanTheoNgay,
} from "../src/lib/da-nhan";

let pass = 0, fail = 0;
const ok = (t: string, c: boolean, note = "") => { c ? pass++ : fail++; console.log(`${c ? "  v" : "  X HONG"} ${t}${note ? " -- " + note : ""}`); };

let seed = 20261012;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const ngay = (i: number) => new Date(Date.UTC(2026, 2, 1 + i)).toISOString().slice(0, 10);
/** Lịch sử giả: ~27% con về mỗi kỳ (như 27–36 giải), thỉnh thoảng hổng một ngày. */
function lichSu(soKy: number, pVe = 0.27) {
  const out: { date: string; hits: Record<string, number> }[] = [];
  for (let i = 0, d = 0; i < soKy; i++, d++) {
    if (rnd() < 0.05) d++;
    const hits: Record<string, number> = {};
    for (const lo of LOS) if (rnd() < pVe) hits[lo] = 1 + (rnd() < 0.15 ? 1 : 0);
    out.push({ date: ngay(d), hits });
  }
  return out;
}
const bangNgauNhien = (pChan: number, muc = [1, 1, 1, 2, 5, 10]): BangDa => {
  const b = bangMacDinh();
  for (const k of Object.keys(b)) b[k] = rnd() < pChan ? 0 : muc[Math.floor(rnd() * muc.length)];
  return b;
};
const soMap = (m: Map<string, string>) => [...m].sort().map(([k, v]) => `${k}:${v}`).join(",");

console.log("\n===== 1. LUẬT TỪNG NGÀY = LUẬT GỐC tính lại trên đúng quãng trước ngày đó =====");
for (const region of ["xsmn", "xsmb"] as const) {
  for (const buoc of [{ buoc1: true, buoc2: true }, { buoc1: true, buoc2: false }, { buoc1: false, buoc2: true }]) {
    const ky = dungKy(lichSu(150));
    const tung = luatTungNgay(ky, region, buoc);
    let lech = 0, coChan = 0, ktra = 0;
    for (let d = 1; d <= ky.length; d += 3) {
      const quang = ky.slice(0, d);
      const goc = luatHaiBuoc(thongKeDa(quang, region), thongKeCapTheoThang(quang, region), buoc);
      const a = tung[d];
      ktra++;
      if (!goc || !a) { if (!!goc !== !!a) lech++; continue; }
      if (soMap(goc.chan) !== soMap(a.chan) || goc.thang !== a.thang || goc.nguong !== a.nguong) lech++;
      if (a.chan.size) coChan++;
    }
    ok(`${region} bước1=${buoc.buoc1 ? "bật" : "tắt"} bước2=${buoc.buoc2 ? "bật" : "tắt"}: ${ktra} ngày, luật dồn = luật gốc (có ${coChan} ngày luật chặn gì đó)`, lech === 0 && coChan > 0, `lệch ${lech}`);
  }
}

console.log("\n===== 2. TẮT LUẬT: tiền số nhận = chốt sổ theo bảng, từng kỳ =====");
{
  let lech = 0;
  for (let lan = 0; lan < 6; lan++) {
    const region = (["xsmn", "xsmt", "xsmb"] as const)[lan % 3];
    const ky = dungKy(lichSu(80));
    const bang = bangNgauNhien(0.3);
    const t = tienNhanTheoNgay(ky, region, bang, { tuDong: false, buoc1: true, buoc2: true, moTay: [] });
    const g = soTungKyTheoBang(ky.slice(t.boQuaDau), region, bang);
    if (t.ngay.length !== g.length || t.ngay.some((r, i) => r.date !== g[i].date || r.thu !== g[i].thu || r.tra !== g[i].tra || r.soCap !== g[i].soCap || r.capTrung !== g[i].capTrung || r.don !== g[i].don)) lech++;
  }
  ok("6 lịch sử × bảng ngẫu nhiên (có ô 1/2/5/10 điểm, ô 0): từng ngày khớp thu, trả, số cặp, cộng dồn", lech === 0, String(lech));
}

console.log("\n===== 3. BẬT LUẬT: chặn rồi giữ nguyên, ô mở tay không bị đụng =====");
{
  const region = "xsmn" as const;
  const ky = dungKy(lichSu(160));
  const bang = bangMacDinh();
  const t = tienNhanTheoNgay(ky, region, bang, { tuDong: true, buoc1: true, buoc2: true, moTay: [] });
  const tung = luatTungNgay(ky, region, { buoc1: true, buoc2: true });
  let giam = 0, sai = 0;
  const dong = new Set<string>();
  for (let i = 0; i < t.ngay.length; i++) {
    const d = t.ngay[i].soKyTruoc;
    for (const k of tung[d]?.chan.keys() ?? []) dong.add(k);
    if (t.ngay[i].oLuat !== dong.size) sai++;
    if (i > 0 && t.ngay[i].oLuat < t.ngay[i - 1].oLuat) giam++;
    // Tiền ngày đó = chốt sổ đúng một kỳ với bảng đã ép các ô đã đóng đinh.
    const g = soTungKyTheoBang([ky[d]], region, apChanLuat(bang, [...dong]))[0];
    if (g.thu !== t.ngay[i].thu || g.tra !== t.ngay[i].tra) sai++;
  }
  ok(`${t.ngay.length} ngày: số ô luật = hợp mọi ô luật bắt từ đầu tới sáng hôm đó, tiền khớp bảng đã ép`, sai === 0, String(sai));
  ok("số ô luật chặn không bao giờ giảm (chặn rồi giữ nguyên)", giam === 0 && t.ngay[t.ngay.length - 1].oLuat > 0, `cuối ${t.ngay[t.ngay.length - 1].oLuat} ô`);
  const moTay = [...dong].slice(0, 5);
  const t2 = tienNhanTheoNgay(ky, region, bang, { tuDong: true, buoc1: true, buoc2: true, moTay });
  ok("5 ô mở tay: không ngày nào luật chặn lại các ô đó", t2.ngay.every((r) => r.oMoi.every((k) => !moTay.includes(k))) && t2.ngay[t2.ngay.length - 1].oLuat === dong.size - 5);
  const t3 = tienNhanTheoNgay(ky, region, bang, { tuDong: false, buoc1: true, buoc2: true, moTay: [] });
  ok("luật bật nhận ít cặp hơn tắt (đã chặn bớt)", t.ngay.reduce((s, r) => s + r.soCap, 0) < t3.ngay.reduce((s, r) => s + r.soCap, 0));
}

console.log("\n===== 4. CHUỖI NHẬN đọc ngược ra đúng tập cặp nhận + đúng điểm =====");
{
  let lech = 0, quaDai = 0, chong = 0, coTron = 0, coVong = 0;
  for (let lan = 0; lan < 30; lan++) {
    const region = (["xsmn", "xsmt", "xsmb"] as const)[lan % 3];
    const tt = khoKyToi(lichSu(40))!;
    // Cứ 3 lần có 1 bảng một mức điểm, chặn ít ô — để có con nhận tròn.
    const bang = lan % 3 === 2 ? bangNgauNhien(0.03, [3]) : bangNgauNhien([0.1, 0.4, 0.7][lan % 3]);
    const nhan = capNhan(tt.bac, bang);
    const chan = capBiChan(tt.bac, bang);
    const kc = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const sN = new Set(nhan.map(([a, b]) => kc(a, b)));
    if (nhan.length + chan.length !== 4950 || chan.some(([a, b]) => sN.has(kc(a, b)))) chong++;
    const muc = nhomNhanDa(nhan, lan % 2 === 1);
    const dau = region === "xsmb" ? "mb" : "st tv ag";
    const khoi = chiaKhoiNhanDa(dau, muc, 3400, region);
    if (khoi.some((k) => k.length > 3400)) quaDai++;
    const lq = khoiNhanLq([dongNhanLq(dau, muc, region)]);
    if (lq) coTron++;
    if (khoi.length) coVong++;
    const doc = docChuoiNhan([...khoi, lq].join("\n"));
    const mong = new Map(nhan.map(([a, b, d]) => [kc(a, b), d]));
    if (doc.size !== mong.size || [...mong].some(([k, d]) => doc.get(k) !== d)) lech++;
  }
  ok("30 bảng × 3 miền: chặn + nhận = đủ 4.950 cặp, không cặp nào vừa chặn vừa nhận", chong === 0, String(chong));
  ok("30 bảng: đọc ngược /nhanloai + /nhanlq ra ĐÚNG tập cặp nhận, đúng số điểm từng cặp", lech === 0, String(lech));
  ok("mỗi khối dán ≤ 3.400 ký tự", quaDai === 0);
  ok("dữ liệu thử có cả con nhận tròn lẫn vòng", coTron > 0 && coVong > 0, `${coTron} / ${coVong}`);
  ok("hậu tố: Nam/Trung dx5n, Bắc da5n, 0 điểm ra đúng dx0n như chuỗi chặn", hauToNhan("xsmn", 5) === "dx5n" && hauToNhan("xsmb", 5) === "da5n" && hauToNhan("xsmt", 0) === "dx0n");
}

console.log(`\n### ${pass} DAT - ${fail} HONG ###`);
process.exit(fail ? 1 : 0);
