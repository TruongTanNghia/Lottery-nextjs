/**
 * Kiểm số kỳ tới và kiểm chuỗi đã copy — phần THUẦN của tab Check.
 *
 * Khách: "check xem cái chuỗi sau khi mình copy nó có ra đúng không, đúng quy
 * luật của mình không, chứ như hôm qua MN nó bị sai 2 số… hiện lại những số
 * đó xem nó ra ngày nào ngày nào, giá ra sao… Việc check này là kiểm tra những
 * số chuẩn bị ôm đó có sai không, mình tính có bị sai không."
 *
 * Hôm 01/10 chuỗi và bảng 100 lô khớp nhau — cả hai cùng sai, vì cùng đi ra từ
 * một chỗ tính. Một trang "so chuỗi với số máy đang hiện" sẽ báo ĐÚNG đúng vào
 * ngày cần báo SAI. Module này vì vậy CỐ Ý tính lại TẤT CẢ từ đầu, không gọi
 * lại bộ máy hạn mức (lich-han-muc / limit-engine / da):
 *
 *   1. trạng thái từng lô — ĐI NGƯỢC từ kỳ mới nhất (máy chạy xuôi từ kỳ đầu);
 *   2. tự tra ô của bảng hạn mức, đọc thẳng con số đang cài ở ô đó;
 *   3. tự tính lại cả bốn danh sách giảm nửa: nhịp đều, top về nhiều, tự thêm,
 *      cặp đảo — từ lịch sử và công tắc đã lưu, không chép cờ của máy;
 *   4. so với con số máy đang đưa ra (/api/limits). Lệch là LỖI CỦA MÁY, báo
 *      đỏ riêng — khác hẳn với "chuỗi sai";
 *   5. rồi mới chấm chuỗi theo kết quả tính lại.
 *
 * Đây là chỗ duy nhất trong mã được phép có một bản tính thứ hai: nó tồn tại để
 * cãi lại bản thứ nhất. Đừng "dọn" nó về gọi chung một hàm.
 *
 * Mọi ghi chú trả ra là một `GhiChu` đủ bốn phần — chuyện gì, số nào, vì sao
 * đáng để ý, anh cần làm gì. Khách: "có lưu ý là sao, lưu ý chỗ nào, phải rõ
 * ràng ra cho anh dễ nhìn".
 *
 * Không import gì lúc chạy — đầu đài và mọi dữ liệu đều do bên gọi đưa vào —
 * nên chạy được thẳng bằng node (npm run test:chuoi).
 */
import type { Region } from "./types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const TEN: Record<Region, string> = { xsmn: "Miền Nam", xsmt: "Miền Trung", xsmb: "Miền Bắc" };
const NGAN: Record<Region, string> = { xsmn: "mn", xsmt: "mt", xsmb: "mb" };

/** Hậu tố lệnh chặn đá theo miền. */
export const HAU_TO_DA: Record<Region, string> = { xsmn: "dx0n", xsmt: "dx0n", xsmb: "da0n" };

/** Một điều cần nói với người đọc — đủ bốn phần, không câu nào bắt người ta đoán. */
export interface GhiChu {
  muc: "sai" | "luu-y";
  /** Một dòng: chuyện gì. */
  tieuDe: string;
  /** Những số (lô, hay cặp "a-b") dính tới — để hiện thành chip. */
  so: string[];
  /** Vì sao đáng để ý. */
  giaiThich: string;
  /** Anh cần làm gì. */
  canLam: string;
}

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

/** Một dòng dữ liệu đọc được trong đoạn dán vào (hoặc vài dòng số liền nhau, gộp lại). */
export interface Khoi {
  loai: LoaiKhoi;
  /** Dòng thứ mấy trong đoạn dán (từ 1). */
  dong: number;
  raw: string;
  /** Miền đọc ra từ chính chuỗi; null = chuỗi không nói, bên gọi dùng miền đang chọn. */
  mien: Region | null;
  nguonMien: "dau-dai" | "nhan" | "tien-to" | "khong";
  /** Đầu đài như đã viết trong chuỗi, có đủ như danh sách chuẩn không, và có dấu ":" không. */
  dauDai: string | null;
  dauDaiChuan: boolean;
  thieuHaiCham: boolean;
  /** Tiền tố kiểu bot gửi ("2d", "mb"). */
  tienTo: string | null;
  /** Dòng lệnh đứng ngay trên ("/chanloai", "/chanlq"). */
  lenh: "/chanloai" | "/chanlq" | null;
  /** Dòng đá có kiểu khác lệnh nó nằm dưới (vòng dưới /chanlq, hay con tròn dưới /chanloai). */
  lenhLech: boolean;
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

export interface KetQuaDoc {
  khoi: Khoi[];
  boQua: { dong: number; chu: string }[];
  /** Bot báo "chia N phần" ở đâu đó trong đoạn dán — để biết anh có dán thiếu phần không. */
  soPhan: number | null;
}

const RE_TIEN = /^(\d{2})b(\d+)n?(?:dd(\d+)n?)?$/i;
const RE_TIEN_CO_TIEN_TO = /^(.+?)(\d{2}b\d+n?(?:dd\d+n?)?)$/i;
const RE_DA_DINH = /^(\d{2})(dx0n|da0n)$/i;
const RE_HAU = /^(dx0n|da0n)$/i;
const RE_SO = /^\d{2}$/;
/** Hậu tố bị cắt dở: "dx0", "da", "21dx". */
const RE_HAU_CUT = /^(?:\d{2})?(?:d|dx|dx0|da|da0)$/i;

function khoiTrong(dong: number, raw: string): Khoi {
  return {
    loai: "lo-so", dong, raw, mien: null, nguonMien: "khong", dauDai: null, dauDaiChuan: false, thieuHaiCham: false, tienTo: null,
    lenh: null, lenhLech: false, muc: [], so: [], laChanso: false, vong: [], tron: [], hauTo: [], cut: [], la: [],
  };
}

/**
 * Bóc đoạn dán vào thành từng khối dữ liệu. `dauDai` là đầu đài chuẩn của ba
 * miền ("st tv ag … hg"), dùng để nhận ra miền và bắt đầu đài thiếu.
 *
 * Dòng KHÔNG có mẩu nào là dữ liệu (tiêu đề, lời dặn của bot…) vào `boQua`.
 * Dòng có dù chỉ một mẩu cược ("12b50") là dòng dữ liệu: mọi chữ khác trên đó
 * thành "mẩu không đọc được" — trong chuỗi tiền, thứ không đọc được không được
 * phép lặng lẽ rơi mất.
 */
export function docChuoi(text: string, dauDai: Record<Region, string>): KetQuaDoc {
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
  let noiSo: Khoi | null = null;
  let soPhan: number | null = null;

  text.replace(/\r/g, "").split("\n").forEach((line, idx) => {
    const t = line.trim();
    // Chuỗi "Mỗi số 1 dòng" chỉ nối được khi các dòng số đứng liền nhau.
    const tiep = noiSo;
    noiSo = null;
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

    // Mất dấu ":" sau tên đài ("st tv ag … hg 00b15n"): bóc dãy mã đài ở đầu ra.
    if (k.mien === null && tok.length > 1) {
      for (const r of MIEN) {
        if (r === "xsmb") continue; // "mb" để nhánh tiền tố lo
        let n = 0;
        while (n < tok.length && ma[r].has(tok[n].toLowerCase())) n++;
        if (n > 0 && n < tok.length && (RE_TIEN.test(tok[n]) || RE_SO.test(tok[n]) || RE_DA_DINH.test(tok[n]))) {
          k.mien = r; k.nguonMien = "dau-dai"; k.dauDai = tok.slice(0, n).join(" "); k.dauDaiChuan = k.dauDai.toLowerCase() === dauDai[r].toLowerCase(); k.thieuHaiCham = true;
          tok.splice(0, n);
          break;
        }
      }
    }

    // Tiền tố kiểu bot gửi, chỉ ở mẩu đầu và chỉ khi chuỗi không có đầu đài.
    if (k.mien === null && tok.length > 0) {
      if (/^(mb|mn|mt)$/i.test(tok[0]) && tok.length > 1) {
        const w = tok.shift()!.toLowerCase();
        k.tienTo = w; k.mien = w === "mb" ? "xsmb" : w === "mn" ? "xsmn" : "xsmt"; k.nguonMien = "tien-to";
      } else if (tok.length > 1 && /[a-z]/i.test(tok[0]) && !RE_TIEN.test(tok[0]) && !RE_TIEN_CO_TIEN_TO.test(tok[0]) && RE_TIEN.test(tok[1])) {
        // tiền tố có dấu cách cuối (/tiento mn "2d "): "2d 15b50, 16b100"
        k.tienTo = tok.shift()!;
      } else if (!RE_TIEN.test(tok[0])) {
        const m = RE_TIEN_CO_TIEN_TO.exec(tok[0]);
        if (m && /[a-z]/i.test(m[1])) {
          k.tienTo = m[1]; tok[0] = m[2];
          const w = m[1].toLowerCase();
          if (/^(mb|mn|mt)/.test(w)) { k.mien = w.startsWith("mb") ? "xsmb" : w.startsWith("mn") ? "xsmn" : "xsmt"; k.nguonMien = "tien-to"; }
        }
      }
    }

    const coHauTo = tok.some((x) => RE_DA_DINH.test(x) || RE_HAU.test(x));
    // Nằm ngay dưới dòng lệnh đá mà hậu tố bị cắt mất hết: vẫn là dòng đá (bị cụt), không phải danh sách số.
    const duoiLenhCut = lenh !== null && !k.laChanso && tok.length > 0 && tok.every((x) => RE_SO.test(x) || x === "." || RE_HAU_CUT.test(x));
    const soTien = tok.filter((x) => RE_TIEN.test(x)).length;
    const soSo = tok.filter((x) => RE_SO.test(x)).length;
    const khac = tok.length - soTien - soSo;

    if (coHauTo || duoiLenhCut) {
      k.loai = "da"; k.lenh = lenh;
      if ((lenh === "/chanloai" && tok.some((x) => RE_HAU.test(x))) || (lenh === "/chanlq" && tok.some((x) => RE_DA_DINH.test(x)))) k.lenhLech = true;
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
    if (soTien > 0) {
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
      // "Mỗi số 1 dòng": dòng số trơn ngay dưới một danh sách số thì nối vào danh sách đó.
      if (tiep && k.mien === null && k.tienTo === null) {
        tiep.so.push(...tok);
        tiep.raw += " " + t;
        noiSo = tiep;
        return;
      }
      k.so = tok;
      khoi.push(k);
      noiSo = k;
      return;
    }
    const p = /chia (\d+) phần/i.exec(t) ?? /phần \d+\/(\d+)/i.exec(t) ?? /·\s*(\d+) phần\s*$/i.exec(t);
    if (p) soPhan = Math.max(soPhan ?? 0, Number(p[1]));
    boQua.push({ dong: idx + 1, chu: t });
  });
  return { khoi, boQua, soPhan };
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

/** Công tắc của bốn danh sách giảm nửa, như các API /api/config/{pair,top,watch,manual} trả. */
export interface CongTacGiam {
  pair: { enabled: boolean };
  top: { size: number; dir: "hot" | "cold"; enabled: boolean; halve: boolean };
  watch: { enabled: boolean; halve: boolean; min_gap: number; max_gap: number };
  manual: { los: string[]; halve: boolean };
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
  /** Công tắc giảm nửa. Thiếu thì đoán từ cờ của máy (chỉ dùng trong bài thử cũ). */
  cong?: CongTacGiam | null;
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
  /** Các ngày của chuỗi đang chạy, mới nhất trước (tối đa 5). */
  ngayVe: string[];
  /** Số nháy về ở từng kỳ của `LuatMien.kyGan` (cùng thứ tự, cũ → mới). */
  veGan: number[];
  /** Những ngày lô này về trong `kyGan`, cũ → mới. */
  cacNgayVe: string[];
  /** Về ở kỳ cuối và kỳ quay ngay trước cũng về, nhưng giữa hai kỳ có ngày không quay → ngày kỳ trước đó. */
  kyTruocVeMaHong: string | null;
  oKhoa: string;
  oTen: string;
  /** Số đang cài ở ô đó. */
  mucO: number;
  inWatch: boolean;
  inTop: boolean;
  inManual: boolean;
  inPair: boolean;
  chiaDoi: boolean;
  /** Vì sao giảm nửa, câu đầy đủ ("cặp đảo với 51 — hai con cùng mức 100"). */
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
const congNgay = (d: string, n: number): string => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() + n);
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
const ve = (d: KyVe, lo: string) => (Number(d.hits[lo]) || 0) > 0;

/** Số kỳ gần nhất đem ra cho người đọc đối chiếu. */
export const SO_KY_GAN = 10;

// Hằng số của bộ máy (limit-engine.ts) — chép số, không chép mã.
const NHIP_SO_KY = 15;
const NHIP_IT_NHAT_KHOANG = 3;
const NHIP_CV_TOI_DA = 0.35;
const NHIP_IM_TOI_DA = 2;
const TOP_SO_KY = 7;

interface Nhip {
  /** Về đều, đúng khoảng nhịp anh chọn, và đang tới nhịp. */
  due: boolean;
  /** Số kỳ im lặng tính trong cửa sổ 15 kỳ — dùng để xếp hạng top khi bằng nhau. */
  im: number;
  /** Khoảng cách trung bình giữa các lần về (kỳ). */
  tb: number;
}

/**
 * Nhịp đều và top về nhiều — tính lại từ lịch sử theo đúng luật đã ghi trong
 * limit-engine.ts (computeRhythms + phần xếp hạng top của getLimitSummary).
 */
function nhipVaTop(sap: KyVe[], cong: CongTacGiam): { nhip: Record<string, Nhip>; top: Set<string>; hitsGan: Record<string, number> } {
  const cuoi = sap.length ? sap[sap.length - 1].date : null;
  // Máy lấy các kỳ có ngày > (ngày cuối − 20 ngày), rồi 15 kỳ cuối trong đó.
  const trong = cuoi ? sap.filter((d) => d.date > congNgay(cuoi, -(NHIP_SO_KY + 5))) : [];
  const kys = trong.slice(-NHIP_SO_KY);
  const hitsGan: Record<string, number> = {};
  for (const lo of LOS) hitsGan[lo] = trong.slice(-TOP_SO_KY).filter((d) => ve(d, lo)).length;

  const minG = Number(cong.watch.min_gap), maxG = Number(cong.watch.max_gap);
  const nhip: Record<string, Nhip> = {};
  for (const lo of LOS) {
    const at: number[] = [];
    kys.forEach((d, i) => { if (ve(d, lo)) at.push(i); });
    if (at.length === 0) { nhip[lo] = { due: false, im: kys.length, tb: 0 }; continue; }
    const im = kys.length - 1 - at[at.length - 1];
    const kc: number[] = [];
    for (let i = 1; i < at.length; i++) kc.push(at[i] - at[i - 1]);
    if (kc.length < NHIP_IT_NHAT_KHOANG) { nhip[lo] = { due: false, im, tb: 0 }; continue; }
    const tb = kc.reduce((a, b) => a + b, 0) / kc.length;
    const sd = Math.sqrt(kc.reduce((s, g) => s + (g - tb) ** 2, 0) / kc.length);
    const cv = tb > 0 ? sd / tb : Infinity;
    const deu = cv <= NHIP_CV_TOI_DA && tb >= minG && tb <= maxG;
    nhip[lo] = { due: deu && im <= NHIP_IM_TOI_DA, im, tb };
  }

  const top = new Set<string>();
  const size = Math.max(0, Math.min(100, Number(cong.top.size) || 0));
  if (cong.top.enabled && size > 0) {
    const lanh = cong.top.dir === "cold";
    const xep = LOS.map((lo) => ({ lo, h: hitsGan[lo], q: nhip[lo].im })).sort((a, b) => {
      const p = lanh ? a.h - b.h : b.h - a.h;
      if (p !== 0) return p;
      const s = lanh ? b.q - a.q : a.q - b.q;
      return s || a.lo.localeCompare(b.lo);
    });
    for (const x of xep.slice(0, size)) top.add(x.lo);
  }
  return { nhip, top, hitsGan };
}

/** Khi không có công tắc (bài thử cũ): đoán từ cờ máy. */
function congTuMay(dl: DuLieuMien): CongTacGiam {
  return {
    pair: { enabled: dl.may.some((m) => m.in_pair) },
    top: { size: dl.may.filter((m) => m.in_top).length, dir: "hot", enabled: false, halve: true },
    watch: { enabled: false, halve: true, min_gap: 1, max_gap: 3 },
    manual: { los: dl.may.filter((m) => m.in_manual).map((m) => m.lo_number), halve: true },
  };
}

export interface LuatMien {
  region: Region;
  ngayCuoi: string | null;
  soKy: number;
  /** Các kỳ gần nhất, cũ → mới — khách muốn thấy "số đó ra ngày nào ngày nào". */
  kyGan: string[];
  lo: Record<string, LuatLo>;
  /** Số lô mà máy đang lệch luật. Khác 0 là phải báo người làm phần mềm. */
  soLechMay: number;
  /** Danh sách top / nhịp có được tính lại thật không (false = bài thử cũ, chép cờ máy). */
  tinhLaiDanhSach: boolean;
}

/** Tính lại hạn mức đúng của 100 lô từ lịch sử + bảng + công tắc đang cài, rồi đối chiếu với máy. */
export function luatLoMien(dl: DuLieuMien): LuatMien {
  const sap = [...dl.draws].sort((a, b) => a.date.localeCompare(b.date));
  const coKy = new Map(sap.map((d) => [d.date, d.hits]));
  const ngayCuoi = sap.length ? sap[sap.length - 1].date : null;
  const may = new Map(dl.may.map((m) => [m.lo_number, m]));
  const ganDay = sap.slice(-SO_KY_GAN);
  const tinhLaiDanhSach = !!dl.cong;
  const cong = dl.cong ?? congTuMay(dl);
  const lo: Record<string, LuatLo> = {};

  for (const so of LOS) {
    let last: string | null = null;
    for (let i = sap.length - 1; i >= 0; i--) if (ve(sap[i], so)) { last = sap[i].date; break; }
    const ngayVe: string[] = [];
    let lienTuc = 0;
    if (ngayCuoi) {
      for (let d = ngayCuoi; coKy.has(d) && (Number(coKy.get(d)![so]) || 0) > 0; d = ngayTruoc(d)) {
        lienTuc++;
        if (ngayVe.length < 5) ngayVe.push(d);
      }
    }
    let kyTruocVeMaHong: string | null = null;
    if (lienTuc === 1 && sap.length >= 2 && ve(sap[sap.length - 2], so) && ngayTruoc(ngayCuoi!) !== sap[sap.length - 2].date) kyTruocVeMaHong = sap[sap.length - 2].date;
    const chuoi = lienTuc === 0 ? 0 : ((lienTuc - 1) % 4) + 1;
    // Chưa từng về trong kho: khô hơn cả bảng (máy ghi 30) → ô 20+.
    const ngay = last && ngayCuoi ? cachNgay(ngayCuoi, last) : 30;

    let oKhoa: string, oTen: string, mucO: number;
    if (ngay === 0 && chuoi >= 2) { oKhoa = `chuoi:${chuoi}`; oTen = `liên tiếp ${chuoi} kỳ`; mucO = soNguyen(dl.lich.consecutive?.[String(chuoi)]); }
    else if (ngay >= 20) { oKhoa = "tren"; oTen = "20+ ngày"; mucO = soNguyen(dl.lich.min_limit); }
    else { oKhoa = `ngay:${ngay}`; oTen = ngay === 0 ? "0 ngày (vừa về)" : `${ngay} ngày`; mucO = soNguyen(dl.lich.base?.[String(ngay)]); }

    lo[so] = {
      lo: so, last, ngay, lienTuc, chuoi, ngayVe,
      veGan: ganDay.map((d) => Number(d.hits[so]) || 0),
      cacNgayVe: ganDay.filter((d) => ve(d, so)).map((d) => d.date),
      kyTruocVeMaHong, oKhoa, oTen, mucO,
      inWatch: false, inTop: false, inManual: false, inPair: false, chiaDoi: false, lyDoChia: [], dung: mucO, lechMay: [],
    };
  }

  const { nhip, top, hitsGan } = nhipVaTop(sap, cong);
  const tuThem = new Set(cong.manual.los ?? []);
  for (const so of LOS) {
    const l = lo[so];
    const dao = so[1] + so[0];
    if (tinhLaiDanhSach) {
      l.inWatch = cong.watch.enabled && nhip[so].due;
      l.inTop = top.has(so);
    } else {
      // Bài thử cũ không có công tắc: chép cờ máy cho nhịp/top (không kiểm được).
      const m = may.get(so);
      l.inWatch = !!m?.in_watch;
      l.inTop = !!m?.in_top;
    }
    l.inManual = tuThem.has(so);
    // Cặp đảo: máy so mức THEO BẢNG của hai con (trước mọi giảm nửa). Ở đây so bằng mức tự tra.
    l.inPair = cong.pair.enabled && dao !== so && lo[dao].mucO === l.mucO;
    if (l.inWatch && cong.watch.halve) l.lyDoChia.push(`về đều theo nhịp (~${nhip[so].tb.toFixed(1).replace(".", ",")} kỳ một lần, đang tới nhịp)`);
    if (l.inTop && cong.top.halve) l.lyDoChia.push(`nằm trong top ${cong.top.size} ${cong.top.dir === "cold" ? "ít về" : "về nhiều"} của 7 kỳ gần (về ${hitsGan[so]}/7 kỳ)`);
    if (l.inManual && cong.manual.halve) l.lyDoChia.push("anh tự thêm vào danh sách theo dõi");
    if (l.inPair) l.lyDoChia.push(`cặp đảo với ${dao} — hai con cùng mức ${l.mucO}`);
    l.chiaDoi = l.lyDoChia.length > 0;
    l.dung = l.chiaDoi ? Math.round(l.mucO * 0.5) : l.mucO;
  }

  let soLechMay = 0;
  for (const so of LOS) {
    const l = lo[so], m = may.get(so);
    const dao = so[1] + so[0];
    if (!m) { l.lechMay.push("máy không trả lô này"); soLechMay++; continue; }
    if (m.days_since_last !== l.ngay) l.lechMay.push(`máy ghi ${m.days_since_last} ngày chưa về, tính lại ra ${l.ngay}`);
    if (m.consecutive_days !== l.chuoi) l.lechMay.push(`máy ghi về liên tiếp ${m.consecutive_days} kỳ, tính lại ra ${l.chuoi}`);
    const truoc = m.limit_before_tracking ?? m.current_limit;
    if (truoc !== l.mucO) l.lechMay.push(`máy lấy ${truoc}n theo bảng, nhưng ô “${l.oTen}” đang cài ${l.mucO}`);
    if (tinhLaiDanhSach) {
      if (!!m.in_watch !== l.inWatch) l.lechMay.push(l.inWatch ? "máy không đưa vào danh sách nhịp đều, tính lại thì có" : "máy đưa vào danh sách nhịp đều, tính lại thì không");
      if (!!m.in_top !== l.inTop) l.lechMay.push(l.inTop ? `máy không đưa vào top ${cong.top.size}, tính lại thì có` : `máy đưa vào top ${cong.top.size}, tính lại thì không`);
    }
    if (!!m.in_manual !== l.inManual) l.lechMay.push(l.inManual ? "anh có thêm lô này vào danh sách theo dõi mà máy không tính" : "máy coi là lô tự thêm mà danh sách theo dõi không có");
    if (!!m.in_pair !== l.inPair) l.lechMay.push(l.inPair ? `máy không ghép cặp đảo với ${dao} dù hai con cùng mức ${l.mucO} theo bảng` : `máy ghép cặp đảo với ${dao} nhưng theo bảng hai con không cùng mức (${l.mucO} và ${lo[dao]?.mucO})`);
    if (m.current_limit !== l.dung) l.lechMay.push(`máy đưa ${m.current_limit}n, đúng luật phải là ${l.dung}n`);
    if (l.lechMay.length) soLechMay++;
  }
  return { region: dl.region, ngayCuoi, soKy: sap.length, kyGan: ganDay.map((d) => d.date), lo, soLechMay, tinhLaiDanhSach };
}

/** Lô này đang ở đâu: về ngày nào, mấy ngày chưa về, liền mấy kỳ. */
export function trangThaiChu(l: LuatLo): string {
  if (!l.last) return "chưa từng về trong dữ liệu";
  if (l.ngay > 0) return `${l.ngay} ngày chưa về (về lần cuối ${ddmm(l.last)})`;
  if (l.lienTuc > 4) return `về ${l.lienTuc} kỳ liền — quá 4 kỳ thì đếm lại, đang tính là kỳ thứ ${l.chuoi}`;
  if (l.lienTuc >= 2) return `về ${l.lienTuc} kỳ liền (${l.ngayVe.slice(0, 4).map(ddmm).reverse().join(", ")})`;
  if (l.kyTruocVeMaHong) return `vừa về kỳ ${ddmm(l.last)}; kỳ trước (${ddmm(l.kyTruocVeMaHong)}) cũng về nhưng ngày ${ddmm(ngayTruoc(l.last))} không có kỳ quay nên không tính là liền`;
  return `vừa về kỳ ${ddmm(l.last)}, kỳ trước không về`;
}

/** Một câu trả lời "vì sao lô này ra con số đó", để người đọc tự đối chiếu với bảng. */
export function canCu(l: LuatLo): string {
  const o = `ô “${l.oTen}” trên bảng hạn mức đang cài ${l.mucO}`;
  if (l.dung === 0) return `Lô này ${trangThaiChu(l)}, mà ${o} → CHẶN.`;
  if (l.chiaDoi) return `Lô này ${trangThaiChu(l)} → ${o}; giảm một nửa vì ${l.lyDoChia.join("; ")} → nhận ${l.dung}.`;
  return `Lô này ${trangThaiChu(l)} → ${o} → nhận ${l.dung}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Chấm chuỗi lô
// ─────────────────────────────────────────────────────────────────────────────

export type MucDo = "dung" | "luu-y" | "sai";

export interface LoiLo {
  lo: string;
  loai: "sai-tien" | "chan-ma-nhan" | "nhan-ma-0" | "trung" | "de-khac" | "khong-chan" | "chanlo-thua";
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
  /** Số chỗ sai (đếm đúng như danh sách hiện ra). */
  soSai: number;
  /** Số lô trong chuỗi đúng tiền / đúng trạng thái. */
  soDung: number;
  loi: LoiLo[];
  /** Lô đúng ra phải có trong chuỗi mà không có. */
  thieu: LuatLo[];
  /** Thiếu là SAI (danh sách chặn sót lô, chuỗi cả bảng bỏ lô phải nhận, /chanlo sót) hay chỉ là lưu ý. */
  thieuLaSai: boolean;
  /** Vì sao một lô thiếu là chuyện đáng nói — hiện trên dòng của lô đó. */
  thieuChu: string;
  nhom: string | null;
  /** Chuỗi toàn "b0n" được chấm theo lệnh /chanlo (luật 2 bước). */
  chanLo: { khop: boolean; thua: string[]; thieu: string[] } | null;
  laChanso: boolean;
  ghiChu: GhiChu[];
  tongChuoi: number;
  tongDung: number;
}

/** Ghi chú chung cho một dòng chuỗi: miền, tên đài, dấu hai chấm, chữ lạ. */
function ghiChuDauDong(khoi: Khoi, region: Region, dauDai: Record<Region, string> | null): GhiChu[] {
  const out: GhiChu[] = [];
  if (khoi.mien === null) {
    out.push({
      muc: "luu-y", tieuDe: `Chuỗi không có tên đài — đang hiểu là ${TEN[region]}`, so: [],
      giaiThich: "Đầu chuỗi không có “st tv ag…” / “dnang pyen…” / “mb” nên máy không tự biết là miền nào. Đang so theo tab miền anh đang chọn ở trên cùng.",
      canLam: `Nếu chuỗi này không phải ${TEN[region]}, bấm tab miền đúng rồi bấm Kiểm tra lại.`,
    });
  }
  if (khoi.dauDai && khoi.nguonMien === "dau-dai" && !khoi.dauDaiChuan) {
    out.push({
      muc: "luu-y", tieuDe: "Tên đài ở đầu chuỗi không đủ như danh sách chuẩn", so: [],
      giaiThich: `Đầu chuỗi ghi “${khoi.dauDai}”${dauDai ? `, danh sách chuẩn của ${TEN[region]} là “${dauDai[region]}”` : ""}. Phần mềm ghi cược chỉ nhận cược cho các đài được ghi.`,
      canLam: "Copy lại chuỗi từ web hoặc bot để có đủ tên đài.",
    });
  }
  if (khoi.thieuHaiCham) {
    out.push({
      muc: "luu-y", tieuDe: "Thiếu dấu “:” sau tên đài", so: [],
      giaiThich: "Chuỗi chuẩn là “tên đài: số…”. Thiếu dấu hai chấm thì phần mềm ghi cược có thể đọc sai.",
      canLam: "Copy lại chuỗi, hoặc thêm dấu “:” ngay sau tên đài cuối cùng.",
    });
  }
  if (khoi.la.length) {
    out.push({
      muc: "sai", tieuDe: `Dòng ${khoi.dong} có ${khoi.la.length} mẩu chữ không đọc được`, so: khoi.la.slice(0, 12),
      giaiThich: "Trong chuỗi tiền, mẩu nào không đọc được thì phần mềm ghi cược cũng có thể đọc sai hoặc bỏ qua — không thể coi là đúng.",
      canLam: "Xoá các mẩu đó hoặc copy lại chuỗi nguyên vẹn từ web/bot.",
    });
  }
  return out;
}

export function kiemLo(khoi: Khoi, region: Region, luat: LuatMien, dl: DuLieuMien, dauDai: Record<Region, string> | null = null): KetQuaLo {
  const loi: LoiLo[] = [];
  const ghiChu = ghiChuDauDong(khoi, region, dauDai);
  const L = luat.lo;

  let soDung = 0, tongChuoi = 0, tongDung = 0;
  let chanLo: KetQuaLo["chanLo"] = null;
  let thieu: LuatLo[] = [];
  let thieuLaSai = false;
  let thieuChu = "";
  let nhom: string | null = null;
  let laChanso = false;

  if (khoi.loai === "lo-tien") {
    const tap = new Set<string>();
    const toan0 = khoi.muc.length > 0 && khoi.muc.every((m) => m.diem === 0 && m.de === null);
    let theoChanLo = false;
    if (toan0 && dl.chanLoLuat) {
      const s = new Set(khoi.muc.map((m) => m.lo)), luatSet0 = new Set(dl.chanLoLuat);
      const khop = s.size === luatSet0.size && [...s].every((x) => luatSet0.has(x));
      // Toàn 0 mà là đúng một nhóm lọc đang chặn của bảng → chuỗi "Copy theo tiêu chí" bỏ đề, không phải /chanlo.
      const laNhomBang = khoi.muc.every((m) => L[m.lo].dung === 0) && timNhom(s, luat) !== null;
      if (khop || !laNhomBang) {
        theoChanLo = true;
        chanLo = { khop, thua: [...s].filter((x) => !luatSet0.has(x)).sort(), thieu: dl.chanLoLuat.filter((x) => !s.has(x)) };
      }
    }
    const luatSet = new Set(dl.chanLoLuat ?? []);
    for (const m of khoi.muc) {
      const l = L[m.lo];
      if (tap.has(m.lo)) { loi.push({ lo: m.lo, loai: "trung", chuoi: m.diem, dung: l.dung, chu: `lô ${m.lo} có mặt hai lần trong chuỗi — phần mềm sẽ nhận 2 lần` }); continue; }
      tap.add(m.lo);
      tongChuoi += m.diem; tongDung += theoChanLo ? 0 : l.dung;
      if (m.de !== null && m.de !== m.diem) loi.push({ lo: m.lo, loai: "de-khac", chuoi: m.diem, dung: l.dung, chu: `tiền đề ${m.de} khác tiền lô ${m.diem} (“${m.raw}”)` });
      if (theoChanLo) {
        // /chanlo chặn lô theo luật 2 bước; lô luật không chặn thì phải đang chặn theo bảng mới đúng.
        if (luatSet.has(m.lo) || l.dung === 0) soDung++;
        else loi.push({ lo: m.lo, loai: "chanlo-thua", chuoi: 0, dung: l.dung, chu: `chuỗi chặn lô này nhưng luật 2 bước không chặn và bảng hạn mức đang nhận ${l.dung} — bỏ lỡ lô đáng nhận` });
        continue;
      }
      if (m.diem === l.dung) { soDung++; continue; }
      if (l.dung === 0) loi.push({ lo: m.lo, loai: "chan-ma-nhan", chuoi: m.diem, dung: 0, chu: `đang CHẶN mà chuỗi nhận ${m.diem}` });
      else if (m.diem === 0) loi.push({ lo: m.lo, loai: "nhan-ma-0", chuoi: 0, dung: l.dung, chu: `chuỗi ghi 0 (chặn), đúng phải nhận ${l.dung}` });
      else loi.push({ lo: m.lo, loai: "sai-tien", chuoi: m.diem, dung: l.dung, chu: m.diem > l.dung ? `chuỗi nhận ${m.diem}, NHIỀU hơn mức đúng ${l.dung}` : `chuỗi nhận ${m.diem}, ít hơn mức đúng ${l.dung}` });
    }

    if (theoChanLo) {
      thieu = chanLo!.thieu.map((x) => L[x]);
      thieuLaSai = true;
      thieuChu = "luật chặn lô 2 bước đang chặn lô này mà chuỗi /chanlo không có — phần mềm sẽ NHẬN";
      if (!chanLo!.khop) {
        ghiChu.push({
          muc: "luu-y", tieuDe: "Chuỗi /chanlo không khớp luật chặn lô 2 bước hiện tại", so: [...chanLo!.thieu, ...chanLo!.thua],
          giaiThich: `Luật đang chặn ${luatSet.size} lô; chuỗi thiếu ${chanLo!.thieu.length} lô${chanLo!.thua.length ? `, thừa ${chanLo!.thua.length} lô` : ""}. Thường là chuỗi copy từ trước khi có kết quả mới.`,
          canLam: "Gõ lại /chanlo trên bot (hoặc copy lại ở tab Chặn Lô) rồi kiểm lần nữa.",
        });
      }
    } else {
      nhom = timNhom(tap, luat);
      if (!nhom) {
        const vang = Object.values(L).filter((l) => l.dung > 0 && !tap.has(l.lo));
        const mayNhan = dl.may.filter((m) => m.current_limit > 0);
        if (vang.length && mayNhan.length > 0 && mayNhan.every((m) => tap.has(m.lo_number))) {
          // Chuỗi có đủ mọi lô máy đang nhận = chuỗi cả bảng đã bỏ lô 0n (/copy, bot gửi, Ngày Mai): lô vắng là lô bị chặn.
          thieu = vang; thieuLaSai = true;
          thieuChu = "chuỗi bỏ lô này (tức là không nhận) nhưng đúng luật phải nhận";
        } else if (vang.length) {
          thieu = vang;
          thieuChu = "đang nhận theo bảng mà chuỗi không có";
          ghiChu.push({
            muc: "luu-y", tieuDe: `Chuỗi không có ${vang.length} lô đang nhận`, so: vang.map((l) => l.lo),
            giaiThich: "Các lô này bảng hạn mức đang nhận nhưng không có trong chuỗi. Nếu đây là chuỗi cả bảng thì phần mềm sẽ KHÔNG nhận các lô này (mất phần thu, không mất tiền).",
            canLam: "Nếu anh cố ý copy theo một tiêu chí lọc (liên tiếp / chưa về) thì bỏ qua. Nếu không, copy lại cả bảng.",
          });
        }
      }
      const tienSai = loi.filter((e) => e.loai !== "trung" && e.loai !== "de-khac");
      if (tienSai.length > 0 && tienSai.every((e) => e.loai === "sai-tien" && e.chuoi !== null && e.chuoi < e.dung)) {
        ghiChu.push({
          muc: "luu-y", tieuDe: "Mọi số sai đều THẤP hơn hạn mức — có phải chuỗi đẩy hay sổ cược không?", so: [],
          giaiThich: "Không số nào nhận lố hay nhận lô đang chặn. Chuỗi đẩy ở tab Rủi Ro Tiền và sổ cược khách gửi có cùng dạng nhưng không đi theo bảng hạn mức.",
          canLam: "Nếu đây là chuỗi đẩy / sổ cược thì trang này không kiểm loại đó — bỏ qua các dòng “đúng phải là”. Nếu là chuỗi hạn mức thì copy lại.",
        });
      }
    }
  } else {
    const tap = new Set<string>();
    for (const s of khoi.so) {
      if (tap.has(s)) { loi.push({ lo: s, loai: "trung", chuoi: null, dung: L[s].dung, chu: `lô ${s} có mặt hai lần trong danh sách` }); continue; }
      tap.add(s);
    }
    nhom = timNhom(tap, luat);
    // Bấm vào khối số của /chanso trên Telegram chỉ chép phần số, mất "Mn:" — vẫn phải chấm như danh sách chặn.
    laChanso = khoi.laChanso || nhom === "mọi lô đang chặn" || (!nhom && !khoi.dauDai && [...tap].filter((s) => L[s].dung <= 0).length * 2 > tap.size);
    if (laChanso) {
      for (const s of tap) {
        if (L[s].dung > 0) loi.push({ lo: s, loai: "khong-chan", chuoi: null, dung: L[s].dung, chu: `có trong danh sách chặn nhưng đúng luật đang NHẬN ${L[s].dung}` });
        else soDung++;
      }
      thieu = Object.values(L).filter((l) => l.dung <= 0 && !tap.has(l.lo));
      thieuLaSai = true;
      thieuChu = "đang CHẶN mà danh sách chặn sót — phần mềm sẽ NHẬN lô này";
      if (!khoi.laChanso && nhom !== "mọi lô đang chặn") {
        ghiChu.push({
          muc: "luu-y", tieuDe: "Đang hiểu đây là danh sách chặn (/chanso)", so: [],
          giaiThich: "Danh sách chỉ có số, không có tên miền, và phần lớn số trong đó đang bị chặn — giống khối số chép từ tin /chanso.",
          canLam: "Nếu đây không phải danh sách chặn thì xem từng số bên dưới: mỗi số ghi rõ đang CHẶN hay nhận bao nhiêu.",
        });
      }
    } else {
      soDung = tap.size;
      if (!nhom) {
        ghiChu.push({
          muc: "luu-y", tieuDe: "Danh sách số không có tiền và không khớp trọn nhóm nào", so: [],
          giaiThich: "Máy không biết danh sách này dùng để nhận hay để chặn, nên không chấm đúng/sai được.",
          canLam: "Xem từng số bên dưới: mỗi số ghi rõ đang CHẶN hay nhận bao nhiêu, và vì sao.",
        });
      }
    }
  }

  const ketQua: KetQuaLo = { khoi, region, mucDo: "dung", soSai: 0, soDung, loi, thieu, thieuLaSai, thieuChu, nhom, chanLo, laChanso, ghiChu, tongChuoi, tongDung };
  chamLai(ketQua);
  return ketQua;
}

/** Tính lại mức độ và số chỗ sai sau khi thêm ghi chú. */
function chamLai(x: KetQuaLo): void {
  const ghiSai = x.ghiChu.filter((g) => g.muc === "sai").length;
  x.soSai = x.loi.length + (x.thieuLaSai ? x.thieu.length : 0) + ghiSai;
  x.mucDo = x.soSai > 0 ? "sai" : x.ghiChu.length > 0 ? "luu-y" : "dung";
}

/** Cùng miền dán hai lần (hai dòng) — dán cả hai vào phần mềm là nhận gấp đôi. */
export function trungGiuaDong(kq: KetQuaLo[]): void {
  const gap = new Map<string, number>();
  for (const x of kq) {
    if (x.khoi.loai !== "lo-tien") continue;
    const trung: string[] = [];
    let dongTruoc = 0;
    for (const m of new Map(x.khoi.muc.map((m) => [m.lo, m])).values()) {
      if (m.diem <= 0) continue;
      const k = `${x.region}|${m.lo}`;
      if (gap.has(k)) { trung.push(m.lo); dongTruoc = gap.get(k)!; } else gap.set(k, x.khoi.dong);
    }
    if (trung.length) {
      x.ghiChu.push({
        muc: "luu-y", tieuDe: `${TEN[x.region]} có 2 chuỗi trong đoạn dán (dòng ${dongTruoc} và dòng ${x.khoi.dong})`, so: trung,
        giaiThich: `${trung.length} lô có tiền nằm ở cả hai chuỗi. Dán cả hai vào phần mềm thì các lô này bị nhận GẤP ĐÔI.`,
        canLam: "Chỉ dán một trong hai chuỗi vào phần mềm.",
      });
      chamLai(x);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Chặn đá
// ─────────────────────────────────────────────────────────────────────────────

const kc = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const TRAN_BAC_DA = 15;
/** Bậc riêng cho con về liền 2 / 3 / 4+ kỳ (4+ không đếm lại như bên lô). */
const BAC_LT_DA = { 2: 16, 3: 17, 4: 18 } as const;

/** Tên bậc đá để in ra trang Check — tự viết, không mượn da.ts. */
export function tenBacDaCheck(b: number): string {
  if (b === BAC_LT_DA[2]) return "liên tiếp 2 kỳ";
  if (b === BAC_LT_DA[3]) return "liên tiếp 3 kỳ";
  if (b === BAC_LT_DA[4]) return "liên tiếp 4+ kỳ";
  return b === 0 ? "vừa ra" : b >= TRAN_BAC_DA ? `${TRAN_BAC_DA}+ ngày` : `${b} ngày`;
}
/** Mức rút gọn thấp nhất mà web/bot cho chọn (da.ts chuanHoaNguongGon). */
const MUC_GON_THAP_NHAT = 50;

/** Bậc của 100 con ở kỳ tới — tính thẳng từ lịch sử: 0 vừa ra, 1…15+ ngày khô, 16/17/18 về liền 2/3/4+ kỳ. */
export function bacDaMien(dl: DuLieuMien, luat: LuatMien): Record<string, number> {
  const sap = [...dl.draws].sort((a, b) => a.date.localeCompare(b.date));
  const out: Record<string, number> = {};
  for (const lo of LOS) {
    const l = luat.lo[lo];
    // Chưa từng về: khô suốt từ kỳ đầu trong kho.
    const ngay = l.last ? l.ngay : sap.length && luat.ngayCuoi ? cachNgay(luat.ngayCuoi, sap[0].date) + 1 : TRAN_BAC_DA;
    out[lo] = ngay === 0 && l.lienTuc >= 2 ? BAC_LT_DA[Math.min(4, l.lienTuc) as 2 | 3 | 4] : Math.min(TRAN_BAC_DA, ngay);
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

export interface KetQuaDa {
  region: Region;
  khoi: Khoi[];
  mucDo: MucDo;
  soSai: number;
  coLoai: boolean;
  coLq: boolean;
  /** Số cặp bảng tiền đá đang chặn, và số cặp chuỗi chặn. */
  soCapLuat: number;
  soCapChuoi: number;
  /** Cặp bảng đang CHẶN mà chuỗi không chặn — sẽ bị nhận nhầm. */
  thieu: string[];
  /** Thiếu là sai thật, hay chỉ vì anh mới dán một phần tin nhiều phần. */
  thieuLaSai: boolean;
  /** Cặp còn thiếu nhưng thuộc về lệnh kia (chưa dán vào đây). */
  thieuOLenhKia: number;
  /** Cặp chuỗi chặn mà bảng đang NHẬN, không do con tròn hợp lệ nào gây ra. */
  thua: string[];
  /** Cặp chặn thêm do các con chặn tròn hợp lệ (làm tròn / rút gọn). */
  thuaLamTron: number;
  /** Con chặn tròn trong chuỗi, kèm số con nó thật sự bị chặn cùng theo bảng. */
  tron: { con: string; bac: number }[];
  /** Con chặn tròn theo cài đặt đã lưu. */
  tronLuat: string[];
  /** Mức chặn tròn đã lưu (99 khi Rút gọn tắt) và mức chuỗi thật sự dùng (đoán từ chuỗi). */
  nguong: number;
  nguongChuoi: number | null;
  rutGon: boolean;
  capLap: number;
  ghiChu: GhiChu[];
}

export function kiemDa(khoi: Khoi[], region: Region, luat: LuatMien, dl: DuLieuMien, soPhan: number | null = null, dauDai: Record<Region, string> | null = null): KetQuaDa {
  const E = capDaBiChan(dl, luat);
  const bacE: Record<string, number> = {};
  for (const k of E) for (const c of k.split("-")) bacE[c] = (bacE[c] ?? 0) + 1;
  const bac = (c: string) => bacE[c] ?? 0;
  const rutGon = !!dl.da?.rutGon;
  const nguong = rutGon ? Number(dl.da?.nguongGon) || 90 : 99;
  const tronLuat = LOS.filter((c) => bac(c) >= nguong);
  const moTaLuu = rutGon ? `Rút gọn đã lưu: từ ${nguong}/99` : "Rút gọn đã lưu: TẮT (phải bị chặn đủ 99/99)";

  const ghiChu: GhiChu[] = [];
  let loiDang = 0;
  const S = new Set<string>();
  const Lq = new Set<string>();
  let capLap = 0, coLoai = false, coLq = false;
  const daGhi = new Set<string>();
  const ghiMotLan = (g: GhiChu, khoa: string) => { if (!daGhi.has(khoa)) { daGhi.add(khoa); ghiChu.push(g); } };

  for (const k of khoi) {
    for (const g of ghiChuDauDong(k, region, dauDai)) { ghiMotLan(g, g.tieuDe); if (g.muc === "sai") loiDang++; }
    if (!k.lenh) {
      ghiMotLan({
        muc: "luu-y", tieuDe: "Thiếu dòng lệnh /chanloai hoặc /chanlq ở trên", so: [],
        giaiThich: `Dòng ${k.dong} là chuỗi chặn đá nhưng không có dòng lệnh ngay trên nó. Phần mềm ghi cược cần dòng lệnh đó mới hiểu là lệnh chặn.`,
        canLam: "Khi dán vào phần mềm, dán nguyên cả dòng lệnh lẫn dòng số (copy nguyên khối từ bot/web).",
      }, "thieu-lenh");
    }
    if (k.lenhLech) {
      loiDang++;
      ghiChu.push({
        muc: "sai", tieuDe: `Dòng ${k.dong} nằm dưới lệnh ${k.lenh} nhưng là kiểu ${k.vong.length ? "cặp/vòng (/chanloai)" : "con chặn tròn (/chanlq)"}`, so: [],
        giaiThich: "Phần mềm đọc dòng số theo lệnh nằm trên nó, nên sẽ hiểu sai cả dòng này.",
        canLam: `Thêm dòng ${k.vong.length ? "/chanloai" : "/chanlq"} ngay trên dòng ${k.dong}, hoặc copy lại nguyên khối từ bot/web.`,
      });
    }
    if (k.cut.length) {
      loiDang++;
      ghiChu.push({
        muc: "sai", tieuDe: `Dòng ${k.dong} bị cắt cụt — ${k.cut.length} số cuối không có hậu tố ${HAU_TO_DA[region]}`, so: k.cut.slice(0, 12),
        giaiThich: "Số không có hậu tố thì phần mềm không chặn — các con/cặp đó vẫn bị nhận.",
        canLam: "Copy lại nguyên khối từ bot/web (bấm vào khối chữ trên Telegram để chép đủ).",
      });
    }
    const saiHau = [...new Set(k.hauTo.filter((h) => h !== HAU_TO_DA[region]))];
    if (saiHau.length) {
      loiDang++;
      ghiChu.push({
        muc: "sai", tieuDe: `Dòng ${k.dong} dùng hậu tố “${saiHau.join(", ")}” — không phải của ${TEN[region]}`, so: [],
        giaiThich: `${TEN[region]} dùng ${HAU_TO_DA[region]}. Sai hậu tố thì phần mềm có thể không hiểu là chặn.`,
        canLam: "Kiểm lại xem có dán nhầm chuỗi miền khác không, rồi copy lại.",
      });
    }
    if (k.vong.length) coLoai = true;
    if (k.tron.length) coLq = true;
    for (const v of k.vong) {
      if (new Set(v).size !== v.length) {
        loiDang++;
        ghiChu.push({ muc: "sai", tieuDe: `Dòng ${k.dong} có một vòng lặp số (${v.join(" ")})`, so: v, giaiThich: "Vòng có số lặp là chuỗi bị sửa tay hoặc lỗi.", canLam: "Copy lại chuỗi từ bot/web." });
      }
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
        if (v[i] === v[j]) continue;
        const p = kc(v[i], v[j]);
        if (S.has(p)) capLap++;
        S.add(p);
      }
    }
    for (const c of k.tron) Lq.add(c);
  }
  const SChiLoai = new Set(S);
  for (const c of Lq) for (const y of LOS) if (y !== c) S.add(kc(c, y));

  const dinh = (p: string, tap: Set<string>) => p.split("-").some((c) => tap.has(c));
  const thieuTatCa = [...E].filter((p) => !S.has(p));
  const tronLuatSet = new Set(tronLuat);
  const cungTap = (a: Set<string>) => a.size === tronLuatSet.size && [...a].every((c) => tronLuatSet.has(c));
  /**
   * Một tập con chặn tròn {con bị chặn ≥ t} ứng với cả một KHOẢNG mức t (gõ gon80 hay gon82 có
   * thể ra cùng một chuỗi). Trả khoảng đó: từ (con mạnh nhất ngoài tập + 1) tới con yếu nhất trong tập.
   */
  const khoangMuc = (tap: Set<string>): { lo: number; hi: number; chu: string } => {
    const hi = tap.size ? Math.min(...[...tap].map(bac)) : 99;
    const ngoai = LOS.filter((c) => !tap.has(c) && bac(c) < hi).map(bac);
    const lo = Math.max(MUC_GON_THAP_NHAT, (ngoai.length ? Math.max(...ngoai) : MUC_GON_THAP_NHAT - 1) + 1);
    return { lo, hi, chu: lo < hi ? `${lo}–${hi}/99` : `${hi}/99` };
  };

  // Con chặn tròn mà bảng chặn quá ít (< 50/99): không mức rút gọn nào ra con này — chặn oan.
  const tronYeu = [...Lq].filter((c) => bac(c) < MUC_GON_THAP_NHAT).sort();
  const LqHopLe = new Set([...Lq].filter((c) => bac(c) >= MUC_GON_THAP_NHAT));
  if (tronYeu.length) {
    loiDang++;
    ghiChu.push({
      muc: "sai", tieuDe: `Chặn tròn ${tronYeu.length} con mà bảng tiền đá chặn quá ít`, so: tronYeu.map((c) => `${c} (${bac(c)}/99)`),
      giaiThich: `Chặn tròn = không nhận mọi đá dính con đó. Các con này bảng chỉ chặn với dưới ${MUC_GON_THAP_NHAT}/99 con (mức rút gọn thấp nhất), nên chặn tròn là chặn oan các cặp đang nhận — danh sách ở mục “chặn oan” bên dưới.`,
      canLam: "Copy lại /chanlq từ bot/web.",
    });
  }
  // Mức chặn tròn chuỗi /chanlq đang dùng = con yếu nhất (hợp lệ) trong đó.
  const tLq = LqHopLe.size ? Math.min(...[...LqHopLe].map(bac)) : null;

  let thieu: string[] = [];
  let thieuOLenhKia = 0;
  let nguongChuoi: number | null = LqHopLe.size ? khoangMuc(LqHopLe).hi : null;
  if (coLoai && coLq) {
    thieu = thieuTatCa;
  } else if (coLq) {
    // Chỉ có /chanlq. Chuỗi /chanlq ở mức t gồm ĐÚNG mọi con bị chặn từ t/99 trở lên — sót con nào là sai.
    // Con mà mức ĐÃ LƯU bắt chặn tròn cũng phải có: /chanloai theo mức đã lưu không bao giờ chứa cặp của nó.
    const batBuoc = new Set(LOS.filter((c) => !Lq.has(c) && bac(c) >= Math.max(Math.min(tLq ?? 99, nguong), MUC_GON_THAP_NHAT)));
    thieu = thieuTatCa.filter((p) => dinh(p, batBuoc));
    thieuOLenhKia = thieuTatCa.length - thieu.length;
    if (thieuOLenhKia > 0) {
      ghiChu.push({
        muc: "luu-y", tieuDe: "Mới dán /chanlq, chưa dán /chanloai", so: [],
        giaiThich: `Còn ${thieuOLenhKia.toLocaleString("vi-VN")} cặp bị chặn nằm ở lệnh /chanloai (cặp và vòng). Chưa dán thì chưa kiểm được phần đó.`,
        canLam: `Dán thêm /chanloai (bot: /chanda${NGAN[region]}${!cungTap(LqHopLe) && LqHopLe.size ? ` gon${khoangMuc(LqHopLe).hi}` : ""}) vào cùng ô rồi bấm Kiểm tra.`,
      });
    }
  } else if (coLoai) {
    // Chỉ có /chanloai. Chuỗi /chanloai ở mức t bỏ ĐÚNG mọi cặp dính con bị chặn từ t/99 trở lên.
    // Đoán t = mức thấp nhất (≥ 50) mà mọi con từ mức đó trở lên đều vắng hẳn khỏi chuỗi.
    const coMat = new Set([...SChiLoai].flatMap((p) => p.split("-")));
    let t = MUC_GON_THAP_NHAT;
    while (t <= 99 && LOS.some((c) => bac(c) >= t && coMat.has(c))) t++;
    const tap = new Set(LOS.filter((c) => bac(c) >= t));
    thieu = thieuTatCa.filter((p) => !dinh(p, tap));
    thieuOLenhKia = thieuTatCa.length - thieu.length;
    nguongChuoi = tap.size ? khoangMuc(tap).hi : null;
    if (thieuOLenhKia > 0) {
      const khacLuu = !cungTap(tap);
      const km = khoangMuc(tap);
      ghiChu.push({
        muc: "luu-y",
        tieuDe: khacLuu ? `Chuỗi /chanloai này làm theo mức rút gọn ${km.chu} — KHÁC mức đã lưu` : "Mới dán /chanloai, chưa dán /chanlq",
        so: [...tap].sort(),
        giaiThich: `Còn ${thieuOLenhKia.toLocaleString("vi-VN")} cặp dính ${tap.size} con chặn tròn (các số ở trên) — các cặp này nằm ở lệnh /chanlq, không nằm trong /chanloai. ${moTaLuu}.`,
        canLam: khacLuu
          ? `Phải dán kèm /chanlq gon${km.hi} (gõ đúng mức này trên bot). Dán /chanlq thường thì các cặp đó sẽ KHÔNG bị chặn.`
          : "Dán thêm /chanlq (bot: /chanlq) vào cùng ô rồi bấm Kiểm tra.",
      });
    }
  }
  const thuaTatCa = [...S].filter((p) => !E.has(p));
  const thua = thuaTatCa.filter((p) => !dinh(p, LqHopLe));
  const thuaLamTron = thuaTatCa.length - thua.length;

  const tron = [...Lq].sort().map((con) => ({ con, bac: bac(con) }));
  if (coLq && LqHopLe.size && !cungTap(LqHopLe)) {
    const km = khoangMuc(LqHopLe);
    ghiChu.push({
      muc: "luu-y", tieuDe: `Chuỗi /chanlq làm theo mức rút gọn ${km.chu} — khác mức đã lưu`, so: [],
      giaiThich: `${moTaLuu}. Chuỗi này chặn tròn ${LqHopLe.size} con (mức đã lưu là ${tronLuat.length} con)${thuaLamTron ? `, nên chặn thêm ${thuaLamTron.toLocaleString("vi-VN")} cặp lẽ ra nhận` : ""}.`,
      canLam: "Nếu anh cố ý dùng mức này thì bỏ qua — nhưng /chanloai dán kèm phải cùng mức. Không cố ý thì copy lại theo mức đã lưu.",
    });
  }

  // Bot chia nhiều tin mà anh mới dán một phần: chỗ sót là do chưa dán, không kết luận là sai.
  const motPhan = soPhan !== null && soPhan > 1 && thieu.length > 0 && thua.length === 0 && loiDang === 0 && khoi.filter((k) => k.vong.length).length < soPhan;
  if (motPhan) {
    ghiChu.push({
      muc: "luu-y", tieuDe: `Bot chia làm ${soPhan} phần — anh mới dán một phần`, so: [],
      giaiThich: `Còn ${thieu.length.toLocaleString("vi-VN")} cặp chưa thấy, có thể nằm ở phần chưa dán.`,
      canLam: `Dán đủ cả ${soPhan} phần (mỗi phần là một tin Telegram) vào cùng ô rồi bấm Kiểm tra.`,
    });
  } else if (thieu.length) {
    ghiChu.push({
      muc: "sai", tieuDe: `Sót ${thieu.length.toLocaleString("vi-VN")} cặp: bảng tiền đá đang chặn mà chuỗi không chặn`, so: [],
      giaiThich: "Phần mềm sẽ NHẬN các cặp này. Danh sách từng cặp (con nào mấy ngày, ô nào đang cài 0) ở ngay dưới.",
      canLam: "Copy lại chuỗi mới nhất. Nếu bot chia nhiều phần (nhiều tin), dán đủ các phần.",
    });
  }
  if (thua.length) {
    ghiChu.push({
      muc: "sai", tieuDe: `Chặn oan ${thua.length.toLocaleString("vi-VN")} cặp: bảng tiền đá đang nhận mà chuỗi lại chặn`, so: [],
      giaiThich: "Các cặp này sẽ bị từ chối dù bảng đang nhận. Thường là chuỗi cũ copy trước khi có kết quả mới hoặc trước khi sửa bảng.",
      canLam: "Copy lại chuỗi mới nhất rồi kiểm lần nữa.",
    });
  }

  const soSai = ghiChu.filter((g) => g.muc === "sai").length;
  const mucDo: MucDo = soSai > 0 ? "sai" : ghiChu.length > 0 ? "luu-y" : "dung";
  return {
    region, khoi, mucDo, soSai, coLoai, coLq, soCapLuat: E.size, soCapChuoi: S.size, thieu: thieu.sort(), thieuLaSai: !motPhan && thieu.length > 0,
    thieuOLenhKia, thua: thua.sort(), thuaLamTron, tron, tronLuat, nguong, nguongChuoi, rutGon, capLap, ghiChu,
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
