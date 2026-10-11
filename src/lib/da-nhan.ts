/**
 * Phương án 2 của Số Đá — phần chỉ phương án này có: SỐ NHẬN và TIỀN SỐ NHẬN.
 *
 * Khách: "Phương án 1: chặn số như hiện tại. Phương án 2: bổ sung thêm nhận
 * số, copy được số nhận, tính tiền số nhận theo từng ngày, từng tháng." Phương
 * án 1 không đọc file này — mọi thứ ở đây là thêm, không thay cái cũ.
 *
 * Hai việc:
 *
 *   1. Chuỗi số nhận. Ngược với chuỗi chặn: cặp nào rơi vào ô đang cài > 0
 *      điểm là cặp nhận, và nhận đúng số điểm của ô đó. Viết theo đúng khuôn
 *      chuỗi chặn khách đang dán ("01 10 11dx0n"), chỉ khác số tiền: "dx0n"
 *      là nhận 0 (chặn), nên nhận N điểm là "dxNn" (Bắc "daNn"). Cặp gom vòng
 *      như bên chặn; con nhận đủ 99 con ở cùng một mức thì ghi một mình.
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

/** Lệnh của phần mềm ghi cược cho chuỗi nhận. Khách dùng chữ khác thì đổi ở đây. */
export const LENH_NHAN_LOAI = "/nhanloai";
export const LENH_NHAN_LQ = "/nhanlq";

/** "dx5n" — nhận 5 điểm (Bắc "da5n"). Cùng khuôn "dx0n" của chuỗi chặn. */
export const hauToNhan = (region: Region, diem: number) => HAU_TO_CHAN_DA[region].replace(/0n$/, `${diem}n`);

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
  /** Con nhận đủ 99 con ở đúng mức này — ghi một mình. */
  conTron: string[];
  /** Các cặp còn lại gom vòng. */
  nhom: string[][];
}

/**
 * Gom cặp nhận theo từng mức điểm. Trong mỗi mức: con nào nhận đủ 99 con
 * (cùng mức) thì là "nhận tròn", phần còn lại gom vòng bằng đúng hàm gom của
 * bên chặn — một vòng chỉ gồm những con mà từng cặp trong đó đều được nhận ở
 * mức đó, nên dán vào không nhận nhầm cặp nào.
 */
export function nhomNhanDa(cap: [string, string, number][], khongLap = false): MucNhan[] {
  const theoMuc = new Map<number, [string, string][]>();
  for (const [a, b, d] of cap) {
    let ds = theoMuc.get(d);
    if (!ds) theoMuc.set(d, (ds = []));
    ds.push([a, b]);
  }
  return [...theoMuc.keys()].sort((x, y) => x - y).map((diem) => {
    const ds = theoMuc.get(diem)!;
    const dem = new Map<string, number>();
    for (const [a, b] of ds) {
      dem.set(a, (dem.get(a) ?? 0) + 1);
      dem.set(b, (dem.get(b) ?? 0) + 1);
    }
    const conTron = [...dem].filter(([, n]) => n >= 99).map(([c]) => c).sort();
    const tron = new Set(conTron);
    const conLai = ds.filter(([a, b]) => !tron.has(a) && !tron.has(b));
    return { diem, soCap: ds.length, conTron, nhom: nhomVong(conLai, khongLap) };
  });
}

/** Một dòng /nhanlq của một miền: các con nhận tròn, gom theo mức. */
export function dongNhanLq(dau: string, muc: MucNhan[], region: Region): string {
  const phan = muc.filter((m) => m.conTron.length).map((m) => `${m.conTron.join(" ")} ${hauToNhan(region, m.diem)}`);
  return phan.length ? `${dau}: ${phan.join(" ")} .` : "";
}
export const khoiNhanLq = (dong: string[]) => {
  const co = dong.filter(Boolean);
  return co.length ? `${LENH_NHAN_LQ}\n${co.join("\n")}` : "";
};

/** Chia các vòng nhận thành các khối dán được, mỗi khối ≤ toiDa ký tự (cùng cách bên chặn). */
export function chiaKhoiNhanDa(dau: string, muc: MucNhan[], toiDa: number, region: Region): string[] {
  const mau = muc.flatMap((m) => m.nhom.map((n) => `${n.join(" ")}${hauToNhan(region, m.diem)}`));
  if (mau.length === 0) return [];
  const mo = `${LENH_NHAN_LOAI}\n${dau}: `;
  const khoi: string[] = [];
  let hien: string[] = [];
  let dai = mo.length;
  for (const c of mau) {
    const them = c.length + (hien.length ? 1 : 0);
    if (hien.length && dai + them > toiDa) {
      khoi.push(mo + hien.join(" "));
      hien = [];
      dai = mo.length;
    }
    hien.push(c);
    dai += c.length + (hien.length > 1 ? 1 : 0);
  }
  if (hien.length) khoi.push(mo + hien.join(" "));
  return khoi;
}

/**
 * Đọc ngược một chuỗi nhận (các khối /nhanloai và /nhanlq đã dán) ra tập cặp
 * kèm điểm — để bài kiểm chứng minh chuỗi ra ĐÚNG tập cặp nhận, không thừa
 * không thiếu, không sai điểm.
 */
export function docChuoiNhan(chuoi: string): Map<string, number> {
  const out = new Map<string, number>();
  const kc = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const ghi = (a: string, b: string, d: number) => {
    const k = kc(a, b);
    if (out.has(k) && out.get(k) !== d) out.set(k, -1); // một cặp hai mức — báo lỗi bằng -1
    else out.set(k, d);
  };
  let lenh = "";
  for (const dong of chuoi.split("\n")) {
    const t = dong.trim();
    if (t.startsWith("/")) { lenh = t; continue; }
    const m = t.match(/^[^:]*:\s*(.*)$/);
    if (!m) continue;
    const than = m[1].replace(/\s*\.\s*$/, "");
    const conDang: string[] = [];
    for (const tu of than.split(/\s+/).filter(Boolean)) {
      if (/^\d{2}$/.test(tu)) { conDang.push(tu); continue; }
      const dinh = tu.match(/^(\d{2})?d[ax](\d+)n$/);
      if (!dinh) { conDang.length = 0; continue; }
      if (dinh[1]) conDang.push(dinh[1]);
      const d = Number(dinh[2]);
      if (lenh === LENH_NHAN_LOAI) {
        for (let i = 0; i < conDang.length; i++) for (let j = i + 1; j < conDang.length; j++) ghi(conDang[i], conDang[j], d);
      } else if (lenh === LENH_NHAN_LQ) {
        for (const c of conDang) for (let q = 0; q < 100; q++) {
          const y = String(q).padStart(2, "0");
          if (y !== c) ghi(c, y, d);
        }
      }
      conDang.length = 0;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tiền số nhận theo từng ngày — thời gian thực
// ─────────────────────────────────────────────────────────────────────────────

/** Bỏ ngần này kỳ đầu: luật chưa có gì để nhìn. Cùng mức với bên chặn lô. */
export const KY_BO_QUA_NHAN = 20;

export interface NgayNhan extends KyDaRow {
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
  opt: { tuDong: boolean; buoc1: boolean; buoc2: boolean; moTay: string[] },
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
    const hieuLuc = chan.size ? apChanLuat(bang, [...chan]) : bang;
    const k = ky[d];
    let h = 0;
    for (const lo of Object.keys(k.kho)) if ((k.ve[lo] ?? 0) > 0) h++;
    let soCap = 0, capTrung = 0, thu = 0, tra = 0;
    for (const [key, v] of demCapTheoNgay([k])) {
      const diem = Number(hieuLuc[key] ?? 0);
      if (!(diem > 0)) continue;
      soCap += v.dip;
      capTrung += v.caHai;
      thu += v.dip * diem * gia;
      tra += v.caHai * diem * trung;
    }
    don += thu - tra;
    ngay.push({ date: k.date, soLoVe: h, soCap, capTrung, thu, tra, lai: thu - tra, don, oLuat: chan.size, oMoi: oMoi.sort(), soKyTruoc: d });
  }
  return { region, ngay, boQuaDau: Math.min(boQua, ky.length) };
}
