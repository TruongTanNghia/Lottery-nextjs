/**
 * Kiểm một chuỗi đã copy — phần THUẦN của tab Check.
 *
 * Khách: "làm 1 page check — check xem cái chuỗi sau khi mình copy nó có ra
 * đúng không, đúng quy luật của mình không, chứ như hôm qua MN nó bị sai 2 số".
 *
 * Hôm đó chuỗi và bảng 100 lô khớp nhau — cả hai cùng sai, vì cùng đi ra từ
 * một chỗ tính. Nên một trang "so chuỗi với số máy đang hiện" sẽ báo ĐÚNG đúng
 * vào ngày cần báo SAI. Module này vì vậy CỐ Ý tính lại từ đầu, không gọi lại
 * bộ máy hạn mức (lich-han-muc / limit-engine / da):
 *
 *   1. dựng trạng thái từng lô bằng cách ĐI NGƯỢC từ kỳ mới nhất (máy thì chạy
 *      xuôi từ kỳ đầu) — về lần cuối hôm nào, đang liền mấy kỳ;
 *   2. tự tra ô của bảng hạn mức và đọc thẳng con số đang cài ở ô đó;
 *   3. so với con số máy đang đưa ra (/api/limits). Lệch là LỖI CỦA MÁY, báo
 *      đỏ riêng — khác hẳn với "chuỗi sai";
 *   4. rồi mới so chuỗi với kết quả tính lại.
 *
 * Đây là chỗ duy nhất trong mã được phép có một bản tính thứ hai: nó tồn tại để
 * cãi lại bản thứ nhất. Đừng "dọn" nó về gọi chung một hàm.
 *
 * Không import gì lúc chạy — đầu đài và mọi dữ liệu đều do bên gọi đưa vào —
 * nên chạy được thẳng bằng node (npm run test:chuoi).
 */
import type { Region } from "./types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

/** Hậu tố lệnh chặn đá theo miền. */
export const HAU_TO_DA: Record<Region, string> = { xsmn: "dx0n", xsmt: "dx0n", xsmb: "da0n" };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Đọc chuỗi
// ─────────────────────────────────────────────────────────────────────────────

export type LoaiKhoi = "lo-tien" | "lo-so" | "da";

export interface MucLo {
  lo: string;
  diem: number;
  /** Tiền đề nếu có "dd". */
  de: number | null;
  raw: string;
}

/** Một dòng dữ liệu đọc được trong đoạn dán vào. */
export interface Khoi {
  loai: LoaiKhoi;
  /** Dòng thứ mấy trong đoạn dán (từ 1). */
  dong: number;
  raw: string;
  /** Miền đọc ra từ chính chuỗi; null = chuỗi không nói, bên gọi dùng miền đang chọn. */
  mien: Region | null;
  nguonMien: "dau-dai" | "nhan" | "tien-to" | "khong";
  /** Đầu đài như đã viết trong chuỗi, và nó có đúng danh sách chuẩn không. */
  dauDai: string | null;
  dauDaiChuan: boolean;
  /** Tiền tố kiểu bot gửi ("2d", "mb"). */
  tienTo: string | null;
  /** Dòng lệnh đứng ngay trước ("/chanloai", "/chanlq"). */
  lenh: "/chanloai" | "/chanlq" | null;
  muc: MucLo[];
  so: string[];
  /** Dòng kiểu "/chanso": "Mn: 01 02" — danh sách lô bị chặn. */
  laChanso: boolean;
  /** Đá: các vòng (≥ 2 con) và các con chặn tròn. */
  vong: string[][];
  tron: string[];
  hauTo: string[];
  /** Số đứng cuối dòng đá mà không có hậu tố — dấu hiệu chuỗi bị cắt cụt. */
  cut: string[];
  /** Mẩu không hiểu, nguyên văn. */
  la: string[];
}

const RE_TIEN = /^(\d{2})b(\d+)n?(?:dd(\d+)n?)?$/i;
const RE_TIEN_CO_TIEN_TO = /^(.+?)(\d{2}b\d+n?(?:dd\d+n?)?)$/i;
const RE_DA_DINH = /^(\d{2})(dx0n|da0n)$/i;
const RE_HAU = /^(dx0n|da0n)$/i;
const RE_SO = /^\d{2}$/;

function khoiTrong(dong: number, raw: string): Khoi {
  return {
    loai: "lo-so", dong, raw, mien: null, nguonMien: "khong", dauDai: null, dauDaiChuan: false, tienTo: null, lenh: null,
    muc: [], so: [], laChanso: false, vong: [], tron: [], hauTo: [], cut: [], la: [],
  };
}

/**
 * Bóc đoạn dán vào thành từng dòng dữ liệu. `dauDai` là đầu đài chuẩn của ba
 * miền ("st tv ag … hg"), dùng để nhận ra miền và để bắt đầu đài bị thiếu.
 *
 * Dòng nào không có mẩu nào đọc được (tiêu đề, lời dặn của bot…) thì vào
 * `boQua`, không tính là lỗi. Dòng ĐÃ là dữ liệu mà lẫn mẩu lạ thì mẩu lạ là
 * lỗi: trong một chuỗi tiền, thứ không đọc được không được phép lặng lẽ rơi.
 */
export function docChuoi(text: string, dauDai: Record<Region, string>): { khoi: Khoi[]; boQua: { dong: number; chu: string }[] } {
  const ma: Record<Region, Set<string>> = { xsmn: new Set(), xsmt: new Set(), xsmb: new Set() };
  for (const r of MIEN) for (const c of dauDai[r].toLowerCase().split(/\s+/).filter(Boolean)) ma[r].add(c);

  const mienCuaDau = (truoc: string): { mien: Region; nguon: Khoi["nguonMien"]; chanso: boolean; chuan: boolean } | null => {
    if (/^(Mn|Mt|Mb)$/.test(truoc)) return { mien: truoc === "Mn" ? "xsmn" : truoc === "Mt" ? "xsmt" : "xsmb", nguon: "nhan", chanso: true, chuan: true };
    const lower = truoc.toLowerCase().replace(/\s+/g, " ").trim();
    if (!lower) return null;
    if (lower === "mn" || lower === "mt") return { mien: lower === "mn" ? "xsmn" : "xsmt", nguon: "nhan", chanso: false, chuan: true };
    const tu = lower.split(" ");
    for (const r of MIEN) if (tu.every((t) => ma[r].has(t))) return { mien: r, nguon: "dau-dai", chanso: false, chuan: lower === dauDai[r].toLowerCase() };
    return null;
  };

  const khoi: Khoi[] = [];
  const boQua: { dong: number; chu: string }[] = [];
  let lenh: Khoi["lenh"] = null;

  text.replace(/\r/g, "").split("\n").forEach((line, idx) => {
    const t = line.trim();
    if (!t) return;
    if (/^\/chanloai(@\w+)?$/i.test(t)) { lenh = "/chanloai"; return; }
    if (/^\/chanlq(@\w+)?$/i.test(t)) { lenh = "/chanlq"; return; }

    const k = khoiTrong(idx + 1, t);
    let than = t;
    const c = t.indexOf(":");
    if (c >= 0) {
      const m = mienCuaDau(t.slice(0, c).trim());
      if (m) {
        k.mien = m.mien; k.nguonMien = m.nguon; k.laChanso = m.chanso; k.dauDai = t.slice(0, c).trim(); k.dauDaiChuan = m.chuan;
        than = t.slice(c + 1).trim();
      }
    }
    const tok = than.split(/[\s,;]+/).filter(Boolean);

    // Tiền tố kiểu bot gửi, chỉ ở mẩu đầu và chỉ khi chuỗi không có đầu đài: "2d15b50", "mb 15b50".
    if (k.mien === null && tok.length > 0) {
      if (/^(mb|mn|mt)$/i.test(tok[0]) && tok.length > 1) {
        const w = tok.shift()!.toLowerCase();
        k.tienTo = w; k.mien = w === "mb" ? "xsmb" : w === "mn" ? "xsmn" : "xsmt"; k.nguonMien = "tien-to";
      } else if (!RE_TIEN.test(tok[0])) {
        const m = RE_TIEN_CO_TIEN_TO.exec(tok[0]);
        if (m && /[a-z]/i.test(m[1])) {
          k.tienTo = m[1]; tok[0] = m[2];
          if (/^mb/i.test(m[1])) { k.mien = "xsmb"; k.nguonMien = "tien-to"; }
        }
      }
    }

    const laDa = tok.some((x) => RE_DA_DINH.test(x) || RE_HAU.test(x));
    const soTien = tok.filter((x) => RE_TIEN.test(x)).length;
    const soSo = tok.filter((x) => RE_SO.test(x)).length;
    const khac = tok.length - soTien - soSo;

    if (laDa) {
      k.loai = "da"; k.lenh = lenh;
      let cur: string[] = [];
      for (const x of tok) {
        if (x === ".") continue;
        const d = RE_DA_DINH.exec(x);
        if (d) {
          cur.push(d[1]);
          if (cur.length === 1) k.tron.push(cur[0]); else k.vong.push(cur);
          k.hauTo.push(d[2].toLowerCase()); cur = [];
        } else if (RE_HAU.test(x)) {
          // "07 12 30 dx0n ." — hậu tố đứng riêng: mọi số trước nó là con chặn tròn.
          if (cur.length === 0) k.la.push(x); else k.tron.push(...cur);
          k.hauTo.push(x.toLowerCase()); cur = [];
        } else if (RE_SO.test(x)) cur.push(x);
        else k.la.push(x);
      }
      k.cut = cur;
      khoi.push(k);
      return;
    }
    lenh = null;
    if (soTien > 0 && soTien >= khac) {
      k.loai = "lo-tien";
      for (const x of tok) {
        const m = RE_TIEN.exec(x);
        if (m) k.muc.push({ lo: m[1], diem: Number(m[2]), de: m[3] !== undefined ? Number(m[3]) : null, raw: x });
        else k.la.push(x);
      }
      khoi.push(k);
      return;
    }
    if (k.laChanso && tok.every((x) => RE_SO.test(x) || x === "—" || x === "-")) {
      k.so = tok.filter((x) => RE_SO.test(x));
      khoi.push(k);
      return;
    }
    if (soSo > 0 && khac === 0) {
      k.so = tok;
      khoi.push(k);
      return;
    }
    boQua.push({ dong: idx + 1, chu: t });
  });
  return { khoi, boQua };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Luật, tính lại độc lập
// ─────────────────────────────────────────────────────────────────────────────

export interface KyVe {
  date: string;
  hits: Record<string, number>;
}

/** Bảng hạn mức như /api/config/schedule trả (khoá là chuỗi). */
export interface LichDoc {
  base: Record<string, number>;
  min_limit: number;
  consecutive: Record<string, number>;
}

/** Một dòng của /api/limits — con số MÁY đang đưa ra. */
export interface DongMay {
  lo_number: string;
  days_since_last: number;
  consecutive_days: number;
  current_limit: number;
  limit_before_tracking?: number;
  in_watch?: boolean;
  in_top?: boolean;
  in_manual?: boolean;
  in_pair?: boolean;
  pair_with?: string | null;
}

export interface BangDaDoc {
  bang: Record<string, number>;
  tuDong: boolean;
  chanLuat: string[];
  rutGon: boolean;
  nguongGon: number;
}

export interface DuLieuMien {
  region: Region;
  draws: KyVe[];
  lich: LichDoc;
  may: DongMay[];
  /** Chỉ cần khi có chuỗi đá. */
  da?: BangDaDoc | null;
  /** Danh sách lô của lệnh /chanlo (luật 2 bước), nếu bên gọi đã tính. */
  chanLoLuat?: string[] | null;
}

export interface LuatLo {
  lo: string;
  last: string | null;
  /** Số ngày lịch từ lần về cuối tới kỳ mới nhất. */
  ngay: number;
  /** Số kỳ về liền nhau tính tới kỳ mới nhất (không giới hạn). */
  lienTuc: number;
  /** Kỳ thứ mấy trong chuỗi theo luật "quá 4 đếm lại": 0…4. */
  chuoi: number;
  /** Các ngày của chuỗi đang chạy, mới nhất trước (tối đa 5) — để người đọc tự đối chiếu. */
  ngayVe: string[];
  /** Số nháy về ở từng kỳ của `LuatMien.kyGan` (cùng thứ tự, cũ → mới). */
  veGan: number[];
  /** Những ngày lô này về trong `kyGan`, cũ → mới. */
  cacNgayVe: string[];
  oKhoa: string;
  oTen: string;
  /** Số đang cài ở ô đó. */
  mucO: number;
  chiaDoi: boolean;
  lyDoChia: string[];
  /** Hạn mức đúng theo luật (sau chia đôi nếu có). */
  dung: number;
  /** Chỗ máy đang đưa ra khác với kết quả tính lại. Rỗng là máy đúng. */
  lechMay: string[];
}

const ngayTruoc = (d: string): string => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};
const cachNgay = (sau: string, truoc: string): number => {
  const [y1, m1, d1] = sau.split("-").map(Number);
  const [y2, m2, d2] = truoc.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000));
};
const soNguyen = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Số kỳ gần nhất đem ra cho người đọc đối chiếu. */
export const SO_KY_GAN = 10;

export interface LuatMien {
  region: Region;
  ngayCuoi: string | null;
  soKy: number;
  /** Các kỳ gần nhất, cũ → mới — khách muốn thấy "số đó ra ngày nào ngày nào". */
  kyGan: string[];
  lo: Record<string, LuatLo>;
  /** Số lô mà máy đang lệch luật. Khác 0 là phải báo người làm phần mềm. */
  soLechMay: number;
}

/** Tính lại hạn mức đúng của 100 lô từ lịch sử + bảng đang cài, rồi đối chiếu với máy. */
export function luatLoMien(dl: DuLieuMien): LuatMien {
  const sap = [...dl.draws].sort((a, b) => a.date.localeCompare(b.date));
  const coKy = new Map(sap.map((d) => [d.date, d.hits]));
  const ngayCuoi = sap.length ? sap[sap.length - 1].date : null;
  const may = new Map(dl.may.map((m) => [m.lo_number, m]));
  const lo: Record<string, LuatLo> = {};
  const ganDay = sap.slice(-SO_KY_GAN);

  for (const so of LOS) {
    let last: string | null = null;
    for (let i = sap.length - 1; i >= 0; i--) if ((Number(sap[i].hits[so]) || 0) > 0) { last = sap[i].date; break; }
    const ngayVe: string[] = [];
    let lienTuc = 0;
    if (ngayCuoi) {
      for (let d = ngayCuoi; coKy.has(d) && (Number(coKy.get(d)![so]) || 0) > 0; d = ngayTruoc(d)) {
        lienTuc++;
        if (ngayVe.length < 5) ngayVe.push(d);
      }
    }
    const chuoi = lienTuc === 0 ? 0 : ((lienTuc - 1) % 4) + 1;
    // Chưa từng về trong kho: khô hơn cả bảng (máy ghi 30) → ô 20+.
    const ngay = last && ngayCuoi ? cachNgay(ngayCuoi, last) : 30;

    let oKhoa: string, oTen: string, mucO: number;
    if (ngay === 0 && chuoi >= 2) { oKhoa = `chuoi:${chuoi}`; oTen = `liên tiếp ${chuoi} kỳ`; mucO = soNguyen(dl.lich.consecutive?.[String(chuoi)]); }
    else if (ngay >= 20) { oKhoa = "tren"; oTen = "20+ ngày"; mucO = soNguyen(dl.lich.min_limit); }
    else { oKhoa = `ngay:${ngay}`; oTen = ngay === 0 ? "ngày 0 (vừa về)" : `ngày ${ngay}`; mucO = soNguyen(dl.lich.base?.[String(ngay)]); }

    const veGan = ganDay.map((d) => Number(d.hits[so]) || 0);
    const cacNgayVe = ganDay.filter((d) => (Number(d.hits[so]) || 0) > 0).map((d) => d.date);
    lo[so] = { lo: so, last, ngay, lienTuc, chuoi, ngayVe, veGan, cacNgayVe, oKhoa, oTen, mucO, chiaDoi: false, lyDoChia: [], dung: mucO, lechMay: [] };
  }

  let soLechMay = 0;
  for (const so of LOS) {
    const l = lo[so], m = may.get(so);
    if (!m) { l.lechMay.push("máy không trả lô này"); soLechMay++; continue; }
    if (m.days_since_last !== l.ngay) l.lechMay.push(`máy ghi ${m.days_since_last} ngày chưa về, tính lại ra ${l.ngay}`);
    if (m.consecutive_days !== l.chuoi) l.lechMay.push(`máy ghi liên tiếp ${m.consecutive_days} kỳ, tính lại ra ${l.chuoi}`);
    const truoc = m.limit_before_tracking ?? m.current_limit;
    if (truoc !== l.mucO) l.lechMay.push(`máy tính ${truoc}n theo bảng, ô “${l.oTen}” đang cài ${l.mucO}`);
    const nua = Math.round(truoc * 0.5);
    if (m.current_limit !== truoc && m.current_limit !== nua) l.lechMay.push(`máy đưa ${m.current_limit}n — không phải ${truoc}n cũng không phải một nửa`);
    l.chiaDoi = m.current_limit !== truoc;
    if (m.in_watch) l.lyDoChia.push("nhịp");
    if (m.in_top) l.lyDoChia.push("top");
    if (m.in_manual) l.lyDoChia.push("thủ công");
    if (m.in_pair) {
      const dao = so[1] + so[0];
      l.lyDoChia.push(`cặp đảo ${dao}`);
      // Cặp đảo chỉ được tính khi hai con cùng mức theo bảng — tự kiểm lại điều đó.
      if (dao === so || lo[dao].mucO !== l.mucO) l.lechMay.push(`máy coi là cặp đảo với ${dao} nhưng hai con không cùng mức theo bảng (${l.mucO} và ${lo[dao]?.mucO})`);
    }
    if (l.chiaDoi && l.lyDoChia.length === 0) l.lechMay.push("máy chia đôi mà lô không thuộc danh sách theo dõi nào");
    l.dung = l.chiaDoi ? Math.round(l.mucO * 0.5) : l.mucO;
    if (l.lechMay.length) soLechMay++;
  }
  return { region: dl.region, ngayCuoi, soKy: sap.length, kyGan: ganDay.map((d) => d.date), lo, soLechMay };
}

/** Một câu cho người đọc tự đối chiếu: lô này vì sao ra con số đó. */
export function canCu(l: LuatLo): string {
  const ngayChu = l.ngayVe.slice(0, 4).map(ddmm).reverse().join(", ");
  let dau: string;
  if (!l.last) dau = "chưa từng về trong kho";
  else if (l.ngay > 0) dau = `về lần cuối ${ddmm(l.last)}, ${l.ngay} ngày chưa về`;
  else if (l.lienTuc > 4) dau = `về ${l.lienTuc} kỳ liền — quá 4 thì đếm lại, đang là kỳ thứ ${l.chuoi}`;
  else if (l.lienTuc >= 2) dau = `về ${l.lienTuc} kỳ liền (${ngayChu})`;
  else dau = `vừa về kỳ ${ddmm(l.last)}, kỳ trước đó không về`;
  const o = `ô “${l.oTen}” đang cài ${l.mucO}`;
  const chia = l.chiaDoi ? ` → chia đôi (${l.lyDoChia.join(", ")}) còn ${l.dung}` : "";
  return `${dau} → ${o}${chia}${l.dung === 0 ? " = chặn" : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. So chuỗi lô
// ─────────────────────────────────────────────────────────────────────────────

export type MucDo = "dung" | "luu-y" | "sai";

export interface LoiLo {
  lo: string;
  loai: "sai-tien" | "chan-ma-nhan" | "nhan-ma-0" | "trung" | "de-khac" | "khong-chan" | "so-la";
  /** Điểm chuỗi ghi (null với chuỗi chỉ có số). */
  chuoi: number | null;
  dung: number;
  chu: string;
}

/** Nhóm lọc mà tập lô trong chuỗi khớp đúng — biết thì không báo "thiếu" oan. */
function timNhom(tap: Set<string>, luat: LuatMien): string | null {
  const bang = (ds: string[]) => ds.length > 0 && ds.length === tap.size && ds.every((x) => tap.has(x));
  const moi = Object.values(luat.lo);
  const thu: [string, (l: LuatLo) => boolean][] = [
    ["cả 100 lô", () => true],
    ["mọi lô đang nhận", (l) => l.dung > 0],
    ["mọi lô đang chặn", (l) => l.dung <= 0],
  ];
  for (const n of [1, 2, 3, 4]) thu.push([`lô về liên tiếp ${n} ngày`, (l) => l.chuoi === n]);
  for (const n of [0, 1, 2, 3, 4, 5]) thu.push([n === 0 ? "lô 0 ngày (mới về)" : `lô ${n} ngày chưa về`, (l) => l.ngay === n]);
  thu.push(["lô 6+ ngày chưa về", (l) => l.ngay >= 6]);
  for (const [ten, loc] of thu) {
    const ds = moi.filter(loc);
    if (bang(ds.map((l) => l.lo))) return ten;
    // Cùng nhóm đó nhưng đã bỏ lô 0n (tuỳ chọn "Bỏ lô hạn mức 0n"). "Cả 100 lô bỏ
    // lô chặn" chính là "mọi lô đang nhận" — để nhóm sau gọi đúng tên.
    if (ds.length === moi.length) continue;
    const nhan = ds.filter((l) => l.dung > 0);
    if (nhan.length < ds.length && bang(nhan.map((l) => l.lo))) return `${ten}, đã bỏ lô bị chặn`;
  }
  return null;
}

export interface KetQuaLo {
  khoi: Khoi;
  region: Region;
  mucDo: MucDo;
  /** Số lô trong chuỗi đúng tiền. */
  soDung: number;
  loi: LoiLo[];
  /** Lô đang nhận mà chuỗi không có (rỗng nếu chuỗi khớp một nhóm lọc). */
  thieu: LuatLo[];
  nhom: string | null;
  /** Chuỗi toàn "b0n": so thêm với lệnh /chanlo. */
  chanLo: { khop: boolean; thua: string[]; thieu: string[] } | null;
  /** Lưu ý không phải lỗi (đầu đài, định dạng…). */
  luuY: string[];
  tongChuoi: number;
  tongDung: number;
}

export function kiemLo(khoi: Khoi, region: Region, luat: LuatMien, dl: DuLieuMien): KetQuaLo {
  const loi: LoiLo[] = [];
  const luuY: string[] = [];
  const L = luat.lo;
  if (khoi.dauDai && khoi.nguonMien === "dau-dai" && !khoi.dauDaiChuan) luuY.push(`đầu đài “${khoi.dauDai}” không đủ như danh sách chuẩn của miền`);
  if (khoi.mien === null) luuY.push("chuỗi không có đầu đài — đang tính theo miền của tab đang chọn");
  for (const x of khoi.la) loi.push({ lo: "??", loai: "so-la", chuoi: null, dung: 0, chu: `mẩu không đọc được: “${x}”` });

  let soDung = 0, tongChuoi = 0, tongDung = 0;
  let chanLo: KetQuaLo["chanLo"] = null;
  let thieu: LuatLo[] = [];
  let nhom: string | null = null;

  if (khoi.loai === "lo-tien") {
    const tap = new Set<string>();
    const toan0 = khoi.muc.length > 0 && khoi.muc.every((m) => m.diem === 0 && m.de === null);
    if (toan0 && dl.chanLoLuat) {
      const s = new Set(khoi.muc.map((m) => m.lo)), luatSet = new Set(dl.chanLoLuat);
      chanLo = { khop: s.size === luatSet.size && [...s].every((x) => luatSet.has(x)), thua: [...s].filter((x) => !luatSet.has(x)).sort(), thieu: dl.chanLoLuat.filter((x) => !s.has(x)) };
    }
    for (const m of khoi.muc) {
      const l = L[m.lo];
      if (tap.has(m.lo)) { loi.push({ lo: m.lo, loai: "trung", chuoi: m.diem, dung: l.dung, chu: `lô ${m.lo} có mặt hai lần trong chuỗi` }); continue; }
      tap.add(m.lo);
      tongChuoi += m.diem; tongDung += l.dung;
      if (m.de !== null && m.de !== m.diem) loi.push({ lo: m.lo, loai: "de-khac", chuoi: m.diem, dung: l.dung, chu: `tiền đề ${m.de} khác tiền lô ${m.diem} (“${m.raw}”)` });
      if (m.diem === l.dung) { soDung++; continue; }
      // Chuỗi /chanlo khớp luật 2 bước thì "ghi 0 mà bảng đang nhận" không phải lỗi — đó là một luật khác.
      if (chanLo?.khop) { soDung++; continue; }
      if (l.dung === 0) loi.push({ lo: m.lo, loai: "chan-ma-nhan", chuoi: m.diem, dung: 0, chu: `đang CHẶN mà chuỗi nhận ${m.diem}` });
      else if (m.diem === 0) loi.push({ lo: m.lo, loai: "nhan-ma-0", chuoi: 0, dung: l.dung, chu: `chuỗi ghi 0, đúng phải nhận ${l.dung}` });
      else loi.push({ lo: m.lo, loai: "sai-tien", chuoi: m.diem, dung: l.dung, chu: `chuỗi ghi ${m.diem}, đúng phải là ${l.dung}` });
    }
    if (!chanLo?.khop) {
      nhom = timNhom(tap, luat);
      if (!nhom) thieu = Object.values(L).filter((l) => l.dung > 0 && !tap.has(l.lo));
    }
  } else {
    const tap = new Set<string>();
    for (const s of khoi.so) {
      if (tap.has(s)) { loi.push({ lo: s, loai: "trung", chuoi: null, dung: L[s].dung, chu: `lô ${s} có mặt hai lần trong chuỗi` }); continue; }
      tap.add(s);
    }
    nhom = timNhom(tap, luat);
    if (khoi.laChanso) {
      // Danh sách chặn: số nào trong đó cũng phải đang chặn, và không được sót số nào.
      for (const s of tap) {
        if (L[s].dung > 0) loi.push({ lo: s, loai: "khong-chan", chuoi: null, dung: L[s].dung, chu: `có trong danh sách chặn nhưng đang được nhận ${L[s].dung}` });
        else soDung++;
      }
      thieu = Object.values(L).filter((l) => l.dung <= 0 && !tap.has(l.lo));
    } else {
      soDung = tap.size;
      if (!nhom) luuY.push("chuỗi chỉ có số, không có tiền, và không khớp trọn nhóm lọc nào — xem từng số bên dưới");
    }
  }

  const coSai = loi.length > 0 || (khoi.laChanso && thieu.length > 0);
  const mucDo: MucDo = coSai ? "sai" : thieu.length > 0 || luuY.length > 0 ? "luu-y" : "dung";
  return { khoi, region, mucDo, soDung, loi, thieu, nhom, chanLo, luuY, tongChuoi, tongDung };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. So chuỗi chặn đá
// ─────────────────────────────────────────────────────────────────────────────

const kc = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const TRAN_BAC_DA = 15;

export interface KetQuaDa {
  region: Region;
  khoi: Khoi[];
  mucDo: MucDo;
  coLoai: boolean;
  coLq: boolean;
  /** Số cặp bảng tiền đá đang chặn, và số cặp chuỗi chặn. */
  soCapLuat: number;
  soCapChuoi: number;
  /** Cặp bảng đang CHẶN mà chuỗi không chặn — sẽ bị nhận nhầm. */
  thieu: string[];
  /** Cặp còn thiếu nhưng thuộc về lệnh kia (chưa dán vào đây). */
  thieuOLenhKia: number;
  /** Cặp chuỗi chặn mà bảng đang NHẬN, không do con tròn nào gây ra. */
  thua: string[];
  /** Cặp chặn thêm do các con chặn tròn (làm tròn / rút gọn). */
  thuaLamTron: number;
  /** Con chặn tròn trong chuỗi, kèm số con nó thật sự bị chặn cùng theo bảng. */
  tron: { con: string; bac: number }[];
  /** Con chặn tròn theo cài đặt đã lưu (mức `nguong`/99). */
  tronLuat: string[];
  nguong: number;
  rutGon: boolean;
  capLap: number;
  loiDang: string[];
  luuY: string[];
}

/** Bậc ngày (0…15) của 100 con ở kỳ tới — tính thẳng từ lịch sử. */
export function bacDaMien(dl: DuLieuMien, luat: LuatMien): Record<string, number> {
  const sap = [...dl.draws].sort((a, b) => a.date.localeCompare(b.date));
  const out: Record<string, number> = {};
  for (const lo of LOS) {
    const l = luat.lo[lo];
    // Chưa từng về: khô suốt từ kỳ đầu trong kho.
    const ngay = l.last ? l.ngay : sap.length && luat.ngayCuoi ? cachNgay(luat.ngayCuoi, sap[0].date) + 1 : TRAN_BAC_DA;
    out[lo] = Math.min(TRAN_BAC_DA, ngay);
  }
  return out;
}

/** Điểm đang có hiệu lực ở một ô của bảng tiền đá ("3-7"): ô luật đã đóng đinh thì là 0. */
export function diemODa(da: BangDaDoc, o: string): number {
  if (da.tuDong && da.chanLuat.includes(o)) return 0;
  const n = Number(da.bang[o] ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const oDaCua = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** Mọi cặp bảng tiền đá đang chặn ở kỳ tới — tính thẳng từ lịch sử và bảng, không qua da.ts. */
export function capDaBiChan(dl: DuLieuMien, luat: LuatMien): Set<string> {
  const out = new Set<string>();
  if (!dl.da) return out;
  const bac = bacDaMien(dl, luat);
  for (let x = 0; x < 100; x++) for (let y = x + 1; y < 100; y++) {
    if (diemODa(dl.da, oDaCua(bac[LOS[x]], bac[LOS[y]])) <= 0) out.add(kc(LOS[x], LOS[y]));
  }
  return out;
}

export function kiemDa(khoi: Khoi[], region: Region, luat: LuatMien, dl: DuLieuMien): KetQuaDa {
  const E = capDaBiChan(dl, luat);
  const bacE: Record<string, number> = {};
  for (const k of E) for (const c of k.split("-")) bacE[c] = (bacE[c] ?? 0) + 1;
  const rutGon = !!dl.da?.rutGon;
  const nguong = rutGon ? Number(dl.da?.nguongGon) || 90 : 99;
  const tronLuat = LOS.filter((c) => (bacE[c] ?? 0) >= nguong);
  const T = new Set(tronLuat);

  const loiDang: string[] = [];
  const luuY: string[] = [];
  const S = new Set<string>();
  const Lq = new Set<string>();
  let capLap = 0, coLoai = false, coLq = false;
  for (const k of khoi) {
    if (k.dauDai && k.nguonMien === "dau-dai" && !k.dauDaiChuan) luuY.push(`dòng ${k.dong}: đầu đài không đủ như danh sách chuẩn của miền`);
    if (k.mien === null) luuY.push(`dòng ${k.dong}: không có đầu đài — đang tính theo miền của tab đang chọn`);
    if (!k.lenh) luuY.push(`dòng ${k.dong}: thiếu dòng lệnh /chanloai hoặc /chanlq ở trên — dán vào phần mềm nhớ kèm dòng lệnh`);
    for (const x of k.la) loiDang.push(`dòng ${k.dong}: mẩu không đọc được “${x}”`);
    if (k.cut.length) loiDang.push(`dòng ${k.dong}: ${k.cut.length} số cuối (${k.cut.slice(0, 6).join(" ")}${k.cut.length > 6 ? " …" : ""}) không có hậu tố — chuỗi bị cắt cụt`);
    const saiHau = [...new Set(k.hauTo.filter((h) => h !== HAU_TO_DA[region]))];
    if (saiHau.length) loiDang.push(`dòng ${k.dong}: hậu tố “${saiHau.join(", ")}” không phải của miền này (đúng là ${HAU_TO_DA[region]})`);
    if (k.vong.length) coLoai = true;
    if (k.tron.length) coLq = true;
    for (const v of k.vong) {
      if (new Set(v).size !== v.length) loiDang.push(`dòng ${k.dong}: một vòng có số lặp (${v.join(" ")})`);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
        if (v[i] === v[j]) continue;
        const p = kc(v[i], v[j]);
        if (S.has(p)) capLap++;
        S.add(p);
      }
    }
    for (const c of k.tron) Lq.add(c);
  }
  for (const c of Lq) for (const y of LOS) if (y !== c) S.add(kc(c, y));

  const dinhTron = (p: string, tap: Set<string>) => p.split("-").some((c) => tap.has(c));
  const thieuTatCa = [...E].filter((p) => !S.has(p));
  let thieu: string[], thieuOLenhKia = 0;
  if (coLoai && coLq) thieu = thieuTatCa;
  else if (coLoai) {
    // Chỉ có /chanloai: cặp dính con chặn tròn (theo cài đặt đã lưu) nằm ở lệnh /chanlq.
    thieu = thieuTatCa.filter((p) => !dinhTron(p, T));
    thieuOLenhKia = thieuTatCa.length - thieu.length;
  } else {
    // Chỉ có /chanlq: mọi cặp còn lại nằm ở /chanloai.
    thieu = [];
    thieuOLenhKia = thieuTatCa.length;
  }
  const thuaTatCa = [...S].filter((p) => !E.has(p));
  const thua = thuaTatCa.filter((p) => !dinhTron(p, Lq));
  const thuaLamTron = thuaTatCa.length - thua.length;

  const tron = [...Lq].sort().map((con) => ({ con, bac: bacE[con] ?? 0 }));
  if (coLq) {
    const them = tron.filter((t) => !T.has(t.con)).map((t) => `${t.con} (${t.bac}/99)`);
    const sot = tronLuat.filter((c) => !Lq.has(c));
    const moTa = rutGon ? `Rút gọn đang lưu mức ${nguong}/99` : "Rút gọn đang TẮT (phải đủ 99/99)";
    if (them.length) luuY.push(`chặn tròn ${them.length} con chưa tới mức đã lưu — ${moTa}: ${them.join(", ")}`);
    if (sot.length && !coLoai) luuY.push(`theo cài đặt đã lưu còn ${sot.length} con chặn tròn nữa không có trong chuỗi: ${sot.join(" ")}`);
  }
  if (thieuOLenhKia > 0) luuY.push(coLoai ? `còn ${thieuOLenhKia} cặp dính ${tronLuat.length} con chặn tròn — nằm ở lệnh /chanlq, chưa dán vào đây` : `còn ${thieuOLenhKia} cặp nằm ở lệnh /chanloai, chưa dán vào đây`);

  const mucDo: MucDo = thieu.length || thua.length || loiDang.length ? "sai" : luuY.length ? "luu-y" : "dung";
  return {
    region, khoi, mucDo, coLoai, coLq, soCapLuat: E.size, soCapChuoi: S.size, thieu: thieu.sort(), thieuOLenhKia, thua: thua.sort(), thuaLamTron,
    tron, tronLuat, nguong, rutGon, capLap, loiDang, luuY,
  };
}

/** Miền nào cần tải dữ liệu, và cần thêm gì. */
export function canTai(khoi: Khoi[], mienMacDinh: Region): Record<Region, { can: boolean; da: boolean; chanLo: boolean }> {
  const out: Record<Region, { can: boolean; da: boolean; chanLo: boolean }> = {
    xsmn: { can: false, da: false, chanLo: false }, xsmt: { can: false, da: false, chanLo: false }, xsmb: { can: false, da: false, chanLo: false },
  };
  for (const k of khoi) {
    const o = out[k.mien ?? mienMacDinh];
    o.can = true;
    if (k.loai === "da") o.da = true;
    if (k.loai === "lo-tien" && k.muc.length > 0 && k.muc.every((m) => m.diem === 0 && m.de === null)) o.chanLo = true;
  }
  return out;
}
