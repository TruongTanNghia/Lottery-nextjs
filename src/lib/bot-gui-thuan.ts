/**
 * Bot gửi tự động — phần thuần (không DB, không mạng) để kiểm thử được.
 *
 * Khách: "giờ mình làm 1 bot gửi, cài nó gửi tự động — Mn 15h30–16h05, Mt
 * 16h40–17h05, Mb 17h40–18h05; mình set lô trước; vd mn bot gửi 2d16b100,
 * 15b50, 15b10". Tức là: tới khung giờ của miền, bot nhắn vào nhóm có "bot
 * nhận" một dòng lệnh lô — tiền tố đài ("2d", khách chốt cố định) rồi từng lô
 * "số b điểm", cách nhau dấu phẩy.
 *
 * Khách chốt lại 18/10/2026: "Mn 15h50–16h05, Mt 16h50–17h05, Mb 17h50–18h05;
 * chia tin ngắn lại gửi đều cho tới hết các số nhận của miền đó; nội dung gửi:
 * số nhận đá phương án 2". Nên có thêm: nội dung gửi (`noiDung`: số nhận đá
 * PA2 hay chuỗi lô), độ dài mỗi tin (`doDaiTin`), và tiến độ gửi từng miền
 * (`tienDo`): tin dài chia nhiều phần, gửi nối tiếp; lượt gõ cửa hết giờ giữa
 * chừng thì lượt sau gửi tiếp từ phần kế, không bao giờ gửi lại phần đã đi.
 */
import type { Region } from "./types";

export interface KhungGio {
  /** "HH:MM" giờ Việt Nam. */
  tu: string;
  den: string;
}

/** Gửi gì: "da2" = số nhận đá phương án 2 (khách chốt), "lo" = chuỗi lô theo hạn mức. */
export type NoiDungGui = "lo" | "da2";
/** Mỗi tin dài tối đa ngần này ký tự — "chia tin ngắn lại". Telegram cho 4.096; để dư cho an toàn. */
export const DO_DAI_TIN_MAC_DINH = 2000;
export const DO_DAI_TIN_MIN = 500;
export const DO_DAI_TIN_MAX = 3400;

/** Hôm nay miền này đã gửi được mấy phần trên tổng mấy phần. */
export interface TienDoGui {
  /** Ngày VN "YYYY-MM-DD". */
  ngay: string;
  daGui: number;
  tong: number;
}

export interface CaiDatMien extends KhungGio {
  /** Mặc định TẮT: tin này đi thẳng vào phần mềm ghi cược, chỉ bật khi khách đã thử và đồng ý. */
  bat: boolean;
  /** Đứng dính liền trước lô đầu tiên: "2d" + "16b100". */
  tienTo: string;
}

export interface CaiDatBotGui {
  /** Chat id của nhóm có bot nhận. null = chưa chọn nhóm. */
  nhom: number | null;
  tenNhom: string | null;
  mien: Record<Region, CaiDatMien>;
  /** Lần gửi XONG gần nhất của từng miền (ISO) — để mỗi ngày chỉ gửi một lần. */
  daGui: Partial<Record<Region, string>>;
  noiDung: NoiDungGui;
  doDaiTin: number;
  /** Tiến độ của ngày đang gửi dở — xem `batDauTu`. */
  tienDo: Partial<Record<Region, TienDoGui>>;
}

/** Khung giờ khách chốt 18/10/2026 (trước đó 15:30 / 16:40 / 17:40 — xem KHUNG_CU). */
export const MAC_DINH_BOT_GUI: CaiDatBotGui = {
  nhom: null,
  tenNhom: null,
  mien: {
    xsmn: { bat: false, tu: "15:50", den: "16:05", tienTo: "2d" },
    xsmt: { bat: false, tu: "16:50", den: "17:05", tienTo: "2d" },
    xsmb: { bat: false, tu: "17:50", den: "18:05", tienTo: "mb " },
  },
  daGui: {},
  noiDung: "da2",
  doDaiTin: DO_DAI_TIN_MAC_DINH,
  tienDo: {},
};
/**
 * Khung mặc định cũ. Bản lưu nào còn đúng y khung cũ là chưa ai đặt tay (lệnh
 * /nhomgui, /batgui lưu cả cấu hình kể cả khung), nên đọc lên thành khung mới
 * luôn — khách đổi giờ là đổi cho cả hệ, không bắt gõ lại /khunggio ba lần.
 */
const KHUNG_CU: Record<Region, KhungGio> = {
  xsmn: { tu: "15:30", den: "16:05" },
  xsmt: { tu: "16:40", den: "17:05" },
  xsmb: { tu: "17:40", den: "18:05" },
};

const GIO_PHUT = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const laGioHopLe = (s: unknown): s is string => typeof s === "string" && GIO_PHUT.test(s);

/** Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) của một thời điểm. */
export function gioVN(now: Date): { ngay: string; gio: string; phut: number } {
  const t = new Date(now.getTime() + 7 * 3_600_000);
  const ngay = t.toISOString().slice(0, 10);
  const h = t.getUTCHours(), m = t.getUTCMinutes();
  return { ngay, gio: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, phut: h * 60 + m };
}

const phutCua = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/** Trong khung [tu, den], tính cả hai đầu. */
export function trongKhung(now: Date, k: KhungGio): boolean {
  const p = gioVN(now).phut;
  return p >= phutCua(k.tu) && p <= phutCua(k.den);
}

/** Miền này hôm nay (giờ VN) đã gửi chưa. */
export function daGuiHomNay(now: Date, daGui: string | undefined): boolean {
  if (!daGui) return false;
  const d = new Date(daGui);
  return !Number.isNaN(d.getTime()) && gioVN(d).ngay === gioVN(now).ngay;
}

/**
 * "2d16b100, 15b50, 15b10" — tiền tố dính liền lô đầu, mỗi lô "số b điểm".
 * Chỉ ghi lô đang nhận (điểm > 0), y như chuỗi /copy: lô 0 thì không nhận
 * nên không có gì để ghi. Không lô nào nhận thì trả chuỗi rỗng — không gửi.
 */
export function chuoiLoGui(rows: { lo_number: string; current_limit: number }[], tienTo: string): string {
  const nhan = rows
    .filter((r) => Number(r.current_limit) > 0)
    .sort((a, b) => a.lo_number.localeCompare(b.lo_number))
    .map((r) => `${r.lo_number}b${Number(r.current_limit)}`);
  return nhan.length ? `${tienTo}${nhan.join(", ")}` : "";
}

/** Dọn một cấu hình đọc từ ngoài; thứ gì lạ thì về mặc định. */
export function chuanHoaBotGui(raw: unknown): CaiDatBotGui {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mienRaw = o.mien && typeof o.mien === "object" ? (o.mien as Record<string, unknown>) : {};
  const mien = {} as Record<Region, CaiDatMien>;
  for (const r of ["xsmn", "xsmt", "xsmb"] as Region[]) {
    const md = MAC_DINH_BOT_GUI.mien[r];
    const m = mienRaw[r] && typeof mienRaw[r] === "object" ? (mienRaw[r] as Record<string, unknown>) : {};
    let tu = laGioHopLe(m.tu) ? m.tu : md.tu;
    let den = laGioHopLe(m.den) ? m.den : md.den;
    if (tu === KHUNG_CU[r].tu && den === KHUNG_CU[r].den) { tu = md.tu; den = md.den; }
    mien[r] = {
      bat: m.bat === true,
      // Khung ngược (đến trước từ) là vô nghĩa — về mặc định cả cặp.
      tu: phutCua(tu) <= phutCua(den) ? tu : md.tu,
      den: phutCua(tu) <= phutCua(den) ? den : md.den,
      tienTo: typeof m.tienTo === "string" && m.tienTo.length <= 20 ? m.tienTo : md.tienTo,
    };
  }
  const dg = o.daGui && typeof o.daGui === "object" ? (o.daGui as Record<string, unknown>) : {};
  const daGui: Partial<Record<Region, string>> = {};
  for (const r of ["xsmn", "xsmt", "xsmb"] as Region[]) if (typeof dg[r] === "string") daGui[r] = dg[r] as string;
  const tdRaw = o.tienDo && typeof o.tienDo === "object" ? (o.tienDo as Record<string, unknown>) : {};
  const tienDo: Partial<Record<Region, TienDoGui>> = {};
  for (const r of ["xsmn", "xsmt", "xsmb"] as Region[]) {
    const t = tdRaw[r] && typeof tdRaw[r] === "object" ? (tdRaw[r] as Record<string, unknown>) : null;
    if (!t || typeof t.ngay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.ngay)) continue;
    const daGuiN = Number(t.daGui), tong = Number(t.tong);
    if (!Number.isInteger(daGuiN) || !Number.isInteger(tong) || daGuiN < 0 || tong < 1 || daGuiN > tong) continue;
    tienDo[r] = { ngay: t.ngay, daGui: daGuiN, tong };
  }
  const dd = Number(o.doDaiTin);
  return {
    nhom: typeof o.nhom === "number" && Number.isFinite(o.nhom) ? o.nhom : null,
    tenNhom: typeof o.tenNhom === "string" ? o.tenNhom : null,
    mien,
    daGui,
    noiDung: o.noiDung === "lo" ? "lo" : "da2",
    doDaiTin: Number.isFinite(dd) ? Math.min(DO_DAI_TIN_MAX, Math.max(DO_DAI_TIN_MIN, Math.round(dd))) : DO_DAI_TIN_MAC_DINH,
    tienDo,
  };
}

/**
 * Lượt này gửi từ phần thứ mấy: hôm nay (giờ VN) đã gửi dở thì từ phần kế
 * tiếp; ngày khác, hoặc hôm nay đã gửi đủ, thì từ đầu (0).
 */
export function batDauTu(now: Date, td: TienDoGui | undefined): number {
  if (!td || td.ngay !== gioVN(now).ngay) return 0;
  return td.daGui < td.tong ? td.daGui : 0;
}
