/**
 * Phương án 2 của Số Đá — phần chỉ phương án này có: SỐ NHẬN và TIỀN SỐ NHẬN.
 *
 * Khách: "Phương án 1: chặn số như hiện tại. Phương án 2: bổ sung thêm nhận
 * số, copy được số nhận, tính tiền số nhận theo từng ngày, từng tháng." Phương
 * án 1 không đọc file này — mọi thứ ở đây là thêm, không thay cái cũ.
 *
 * Hai việc:
 *
 *   1. Chuỗi số nhận. Cặp nào rơi vào ô đang cài > 0 điểm là cặp nhận, và
 *      nhận đúng số điểm của ô đó. Khách chốt dạng: "Mn: 2d các cặp đá",
 *      tương tự Mt, Mb — chỉ có cặp ghép với nhau, KHÔNG có lệnh "loại"/
 *      "nhận" nào. Tiền tố đài ("2d", Bắc "mb ") là đúng tiền tố bot gửi lô.
 *      Cặp gom vòng "01 10 11dx5n" (nhận 5 điểm mỗi cặp trong vòng) cho
 *      ngắn, nhưng MỖI CẶP GHI ĐÚNG MỘT LẦN: bên nhận, cặp ghi hai lần là
 *      phần mềm nhận gấp đôi — khách đếm thấy lệch ~36 cặp vì đúng chỗ này.
 *
 *   2. Tiền số nhận theo từng ngày, từng tháng, THEO THỜI GIAN THỰC: sáng mỗi
 *      ngày, luật hai bước chỉ được nhìn các kỳ TRƯỚC ngày đó (đúng như máy
 *      chủ chạy luật lúc khách mở trang), ô luật đã chặn thì giữ nguyên như
 *      thật ("chặn rồi giữ nguyên"), rồi chấm tiền ngày đó bằng bảng ấy. Đây
 *      là con số khách có thể đã làm ra — khác con số "lấy bảng hôm nay chấm
 *      ngược cả quãng", vốn luôn đẹp hơn thật vì bảng hôm nay đã biết trước.
 */
import {
  DIP_TOI_THIEU, GIA_DA, HAU_TO_CHAN_DA, TRUNG_DA, apChanLuat, bienDa, demCapTheoNgay, khoaCap, luatHaiBuoc, nhomVong,
  type BangDa, type CongTacBuoc, type KyDa, type KyDaRow, type LuatHaiBuoc, type ThongKeCapThang, type ThongKeDa,
} from "./da";
import type { Region } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Chuỗi số nhận
// ─────────────────────────────────────────────────────────────────────────────

/** "dx5n" — nhận 5 điểm (Bắc "da5n"). Cùng khuôn "dx0n" của chuỗi chặn. */
export const hauToNhan = (region: Region, diem: number) => HAU_TO_CHAN_DA[region].replace(/0n$/, `${diem}n`);

/** Tiền tố đài mặc định — trùng tiền tố bot gửi lô (bot-gui-thuan MAC_DINH_BOT_GUI). */
export const TIEN_TO_NHAN_MAC_DINH: Record<Region, string> = { xsmn: "2d", xsmt: "2d", xsmb: "mb " };

/** Mọi cặp nhận ở kỳ tới, kèm số điểm nhận: [con lớn, con nhỏ, điểm]. */
export function capNhan(bacCon: Record<string, number>, bang: BangDa): [string, string, number][] {
  const los = Object.keys(bacCon).sort();
  const out: [string, string, number][] = [];
  for (let x = 0; x < los.length; x++) {
    for (let y = x + 1; y < los.length; y++) {
      const d = Number(bang[khoaCap(bacCon[los[x]], bacCon[los[y]])] ?? 0);
      if (d > 0) out.push([los[y], los[x], d]);
    }
  }
  return out;
}

export interface MucNhan {
  diem: number;
  /** Số cặp nhận ở mức này. */
  soCap: number;
  /** Các vòng — mỗi cặp nằm trong ĐÚNG một vòng. */
  nhom: string[][];
}

/**
 * Gom cặp nhận theo từng mức điểm, rồi gom vòng KHÔNG LẶP: một vòng chỉ gồm
 * những con mà từng cặp trong đó đều nhận ở mức đó và chưa ghi ở vòng nào
 * khác. Cộng C(k,2) của mọi vòng ra đúng bằng số cặp nhận — bài kiểm giữ chặt.
 */
export function nhomNhanDa(cap: [string, string, number][]): MucNhan[] {
  const theoMuc = new Map<number, [string, string][]>();
  for (const [a, b, d] of cap) {
    let ds = theoMuc.get(d);
    if (!ds) theoMuc.set(d, (ds = []));
    ds.push([a, b]);
  }
  return [...theoMuc.keys()].sort((x, y) => x - y).map((diem) => {
    const ds = theoMuc.get(diem)!;
    return { diem, soCap: ds.length, nhom: nhomVong(ds, true) };
  });
}

/**
 * Chuỗi nhận của một miền, chia khối ≤ toiDa ký tự; khối nào cũng mở bằng
 * tiền tố đài và dán trọn được: "2d01 10 11dx1n 05 12dx5n …".
 */
export function chuoiNhanMien(tienTo: string, muc: MucNhan[], region: Region, toiDa: number): string[] {
  const mau = muc.flatMap((m) => m.nhom.map((n) => `${n.join(" ")}${hauToNhan(region, m.diem)}`));
  const khoi: string[] = [];
  let hien: string[] = [];
  let dai = tienTo.length;
  for (const c of mau) {
    const them = c.length + (hien.length ? 1 : 0);
    if (hien.length && dai + them > toiDa) {
      khoi.push(tienTo + hien.join(" "));
      hien = [];
      dai = tienTo.length;
    }
    hien.push(c);
    dai += c.length + (hien.length > 1 ? 1 : 0);
  }
  if (hien.length) khoi.push(tienTo + hien.join(" "));
  return khoi;
}

/**
 * Chia ĐỀU các cặp nhận thành `soTin` tin, mỗi tin ghi từng cặp một
 * ("24 95dx10n 02 97dx10n …"), mở bằng tiền tố đài. Khách (22/10): "chia ra
 * tầm 10 cặp 1 tin là ok nhất — cứ mỗi miền chia thành 50 tin, 1 phút gửi 2
 * tin". Ít cặp hơn số tin thì mỗi tin một cặp. Tin nào dài quá `doDaiTin` thì
 * tách đôi tiếp — chỉ là lưới an toàn, 10 cặp chưa tới 120 ký tự.
 */
export function chuoiNhanDeu(tienTo: string, cap: [string, string, number][], soTin: number, region: Region, doDaiTin: number): string[] {
  const sap = [...cap].sort((x, y) => {
    const a = x[0] < x[1] ? x[0] + x[1] : x[1] + x[0], b = y[0] < y[1] ? y[0] + y[1] : y[1] + y[0];
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (sap.length === 0) return [];
  const n = Math.max(1, Math.min(Math.floor(soTin), sap.length));
  const out: string[] = [];
  const viet = (ds: [string, string, number][]): string => tienTo + ds.map(([a, b, d]) => `${a < b ? a : b} ${a < b ? b : a}${hauToNhan(region, d)}`).join(" ");
  const them = (ds: [string, string, number][]) => {
    const t = viet(ds);
    if (t.length <= doDaiTin || ds.length <= 1) { out.push(t); return; }
    const giua = Math.ceil(ds.length / 2);
    them(ds.slice(0, giua));
    them(ds.slice(giua));
  };
  for (let i = 0; i < n; i++) {
    // Chia đều: tin đầu nhận phần dư, lệch nhau tối đa 1 cặp.
    const tu = Math.floor((i * sap.length) / n), den = Math.floor(((i + 1) * sap.length) / n);
    if (den > tu) them(sap.slice(tu, den));
  }
  return out;
}

/**
 * Đọc ngược các khối nhận của một miền ra cặp → điểm, và đếm số cặp ĐÃ VIẾT
 * (tính cả trùng) — để bài kiểm chứng minh: đúng tập cặp, đúng điểm, và số
 * cặp viết ra = số cặp khác nhau (không cặp nào ghi hai lần).
 */
export function docChuoiNhan(khoi: string[], tienTo: string): { cap: Map<string, number>; soViet: number } {
  const cap = new Map<string, number>();
  let soViet = 0;
  for (const k of khoi) {
    const than = k.startsWith(tienTo) ? k.slice(tienTo.length) : k;
    let con: string[] = [];
    for (const tu of than.trim().split(/\s+/).filter(Boolean)) {
      if (/^\d{2}$/.test(tu)) { con.push(tu); continue; }
      const g = tu.match(/^(\d{2})?d[ax](\d+)n$/);
      if (!g) { con = []; continue; }
      if (g[1]) con.push(g[1]);
      const d = Number(g[2]);
      for (let i = 0; i < con.length; i++) for (let j = i + 1; j < con.length; j++) {
        const key = con[i] < con[j] ? `${con[i]}-${con[j]}` : `${con[j]}-${con[i]}`;
        soViet++;
        cap.set(key, cap.has(key) && cap.get(key) !== d ? -1 : d);
      }
      con = [];
    }
  }
  return { cap, soViet };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tiền số nhận theo từng ngày — thời gian thực
// ─────────────────────────────────────────────────────────────────────────────

/** Bỏ ngần này kỳ đầu: luật chưa có gì để nhìn. Cùng mức với bên chặn lô. */
export const KY_BO_QUA_NHAN = 20;

/** Một mức điểm trong một ngày: ô n điểm thì thu n × giá, trúng trả n × tiền trúng mỗi cặp. */
export interface MucNgay {
  diem: number;
  soCap: number;
  capTrung: number;
  thu: number;
  tra: number;
}

export interface NgayNhan extends KyDaRow {
  /** true = tính theo bảng THẬT đã chạy hôm đó (sổ bảng PA2); false = dựng lại bằng luật + bảng điểm hôm nay. */
  that: boolean;
  /** Tách theo mức điểm — để thấy rõ ô 3 điểm trúng là trả 3 × tiền trúng. */
  theoMuc: MucNgay[];
  /** Số ô luật đang chặn sáng hôm đó (đã cộng dồn — chặn rồi giữ nguyên). */
  oLuat: number;
  /** Ô luật bắt thêm đúng sáng hôm đó. */
  oMoi: string[];
  /** Luật hôm đó lập từ bao nhiêu kỳ trước. */
  soKyTruoc: number;
}

export interface TienNhan {
  region: Region;
  ngay: NgayNhan[];
  boQuaDau: number;
}

/**
 * Luật hai bước như máy chủ chạy ở MỖI sáng: `luat[d]` chỉ nhìn ky[0..d-1].
 * Tính dồn (cộng dần từng kỳ) chứ không tính lại từ đầu mỗi ngày; bài kiểm
 * so từng ngày với luatHaiBuoc(thongKeDa(…), thongKeCapTheoThang(…)) trên
 * đúng quãng đó để chắc hai đường không lệch.
 */
export function luatTungNgay(ky: KyDa[], region: Region, buoc: CongTacBuoc): (LuatHaiBuoc | null)[] {
  const gia = GIA_DA[region], trung = TRUNG_DA[region];
  const chuan = bienDa(region);
  const tong = new Map<string, { dip: number; caHai: number }>();
  let thang = "";
  let theoThang = new Map<string, { dip: number; caHai: number }>();
  const out: (LuatHaiBuoc | null)[] = [];
  for (let d = 0; d <= ky.length; d++) {
    if (d === 0) out.push(null);
    else {
      const tk = {
        chuan,
        bang: [...tong].map(([k, v]) => {
          const [i, j] = k.split("-").map(Number);
          return { i, j, dip: v.dip, caHai: v.caHai, tyLe: v.dip ? v.caHai / v.dip : 0 };
        }),
      } as unknown as ThongKeDa;
      const tkt = {
        thangDangChay: thang,
        bang: [...tong.keys()].map((k) => {
          const [i, j] = k.split("-").map(Number);
          const v = theoThang.get(k) ?? { dip: 0, caHai: 0 };
          const thu = v.dip * gia;
          return { i, j, theoThang: [{ thang, dip: v.dip, caHai: v.caHai, bien: v.dip >= DIP_TOI_THIEU ? ((thu - v.caHai * trung) / thu) * 100 : null }] };
        }),
      } as unknown as ThongKeCapThang;
      out.push(luatHaiBuoc(tk, tkt, buoc));
    }
    if (d === ky.length) break;
    const k = ky[d];
    const t = k.date.slice(0, 7);
    if (t !== thang) { thang = t; theoThang = new Map(); }
    for (const [key, v] of demCapTheoNgay([k])) {
      const a = tong.get(key);
      if (a) { a.dip += v.dip; a.caHai += v.caHai; } else tong.set(key, { dip: v.dip, caHai: v.caHai });
      const b = theoThang.get(key);
      if (b) { b.dip += v.dip; b.caHai += v.caHai; } else theoThang.set(key, { dip: v.dip, caHai: v.caHai });
    }
  }
  return out;
}

/**
 * Chấm tiền từng ngày cho các cặp NHẬN của bảng phương án 2.
 *
 * Bảng tiền (số điểm từng ô) là bảng khách đang cài — cái đó không có lịch sử
 * nên dùng chung cho mọi ngày. Phần luật thì đúng thời gian thực: ô luật chặn
 * cộng dồn từ ngày đầu được chấm, ô khách mở tay thì luật không đụng.
 */
export function tienNhanTheoNgay(
  ky: KyDa[],
  region: Region,
  bang: BangDa,
  opt: { tuDong: boolean; buoc1: boolean; buoc2: boolean; moTay: string[]; lichBang?: Record<string, BangDa> },
  boQua = KY_BO_QUA_NHAN
): TienNhan {
  const gia = GIA_DA[region], trung = TRUNG_DA[region];
  const luat = opt.tuDong ? luatTungNgay(ky, region, { buoc1: opt.buoc1, buoc2: opt.buoc2 }) : [];
  const mo = new Set(opt.moTay);
  const chan = new Set<string>();
  const ngay: NgayNhan[] = [];
  let don = 0;
  for (let d = boQua; d < ky.length; d++) {
    const oMoi: string[] = [];
    const l = luat[d];
    if (l) for (const k of l.chan.keys()) if (!mo.has(k) && !chan.has(k) && k in bang) { chan.add(k); oMoi.push(k); }
    // Có sổ bảng thật cho kỳ này (khoá = kỳ ngay trước) thì dùng đúng bảng đó.
    const so = d > 0 ? opt.lichBang?.[ky[d - 1].date] : undefined;
    const hieuLuc = so ?? (chan.size ? apChanLuat(bang, [...chan]) : bang);
    const k = ky[d];
    let h = 0;
    for (const lo of Object.keys(k.kho)) if ((k.ve[lo] ?? 0) > 0) h++;
    let soCap = 0, capTrung = 0, thu = 0, tra = 0;
    const muc = new Map<number, MucNgay>();
    for (const [key, v] of demCapTheoNgay([k])) {
      const diem = Number(hieuLuc[key] ?? 0);
      if (!(diem > 0)) continue;
      soCap += v.dip;
      capTrung += v.caHai;
      thu += v.dip * diem * gia;
      tra += v.caHai * diem * trung;
      let m = muc.get(diem);
      if (!m) muc.set(diem, (m = { diem, soCap: 0, capTrung: 0, thu: 0, tra: 0 }));
      m.soCap += v.dip;
      m.capTrung += v.caHai;
      m.thu += v.dip * diem * gia;
      m.tra += v.caHai * diem * trung;
    }
    don += thu - tra;
    ngay.push({
      date: k.date, soLoVe: h, soCap, capTrung, thu, tra, lai: thu - tra, don,
      oLuat: so ? Object.values(so).filter((x) => !(x > 0)).length : chan.size, oMoi: oMoi.sort(), soKyTruoc: d,
      that: !!so, theoMuc: [...muc.values()].sort((a, b) => a.diem - b.diem),
    });
  }
  return { region, ngay, boQuaDau: Math.min(boQua, ky.length) };
}
