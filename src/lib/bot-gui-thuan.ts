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

/**
 * Gửi gì: "da2" = số nhận đá phương án 2 (khách chốt), "lo" = chuỗi lô theo hạn mức,
 * "dubao" = số dự báo theo thứ của tab Dự Báo (khách 19/11, nhóm 2).
 */
export type NoiDungGui = "lo" | "da2" | "dubao";
/**
 * Số dự báo gửi đi, chọn ô nào:
 *  - "chon" (mặc định từ 20/11 — khách: "thứ nào, ô nào em chọn thì bot gửi"): đúng các ô khách
 *    chọn ở cột thứ hôm đó trên tab Dự Báo, cùng số con, điểm, lọc khách đã lưu trên tab;
 *  - "tot" = ô lời nhất của thứ hôm đó; "loi" = gộp hết ô đang lời (hai cách này dùng soCon, diem dưới).
 */
export interface CaiDatDuBaoGui {
  cach: "chon" | "tot" | "loi";
  soCon: number;
  diem: number;
  /** Phiên bản cấu hình — xem chuanHoaDuBao. */
  v: 2;
}
export const SO_CON_GUI = [5, 10, 20] as const;
export const DU_BAO_GUI_MAC_DINH: CaiDatDuBaoGui = { cach: "chon", soCon: 10, diem: 1, v: 2 };
/** Mỗi tin dài tối đa ngần này ký tự — "chia tin ngắn lại". Telegram cho 4.096; để dư cho an toàn. */
export const DO_DAI_TIN_MAC_DINH = 2000;
export const DO_DAI_TIN_MIN = 500;
export const DO_DAI_TIN_MAX = 3400;
/** Khách 22/10: "mỗi miền chia thành 50 tin, 1 phút gửi 2 tin". */
export const SO_TIN_MAC_DINH = 50;
export const SO_TIN_MAX = 200;
export const TIN_MOI_PHUT_MAC_DINH = 2;
export const TIN_MOI_PHUT_MAX = 10;

/** Hôm nay miền này đã gửi được mấy phần trên tổng mấy phần. */
export interface TienDoGui {
  /** Ngày VN "YYYY-MM-DD". */
  ngay: string;
  daGui: number;
  tong: number;
  /** Đã báo quản trị "hết giờ mà còn dở" cho ngày này chưa — báo đúng một lần. */
  daBao?: boolean;
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
  /** Mỗi miền chia thành bao nhiêu tin (nội dung "da2"). */
  soTin: number;
  /** Mỗi phút gửi mấy tin — bộ hẹn giờ gõ cửa mỗi phút, mỗi lượt gửi ngần này tin. */
  tinMoiPhut: number;
  /** Tiến độ của ngày đang gửi dở — xem `batDauTu`. */
  tienDo: Partial<Record<Region, TienDoGui>>;
  /** Ngày (VN) đã báo quản trị "hôm nay không có gì để gửi" cho miền đó — báo đúng một lần mỗi ngày. */
  daBaoRong: Partial<Record<Region, string>>;
  /** Nội dung "dubao": chọn ô, số con, điểm. */
  duBao: CaiDatDuBaoGui;
}

/** Khung giờ khách chốt 22/10/2026 (các khung cũ: xem KHUNG_CU). Tiền tố: chữ đầu HP79 nhận, thử ngày 21/10. */
export const MAC_DINH_BOT_GUI: CaiDatBotGui = {
  nhom: null,
  tenNhom: null,
  mien: {
    xsmn: { bat: false, tu: "15:40", den: "16:08", tienTo: "Mn 2d" },
    xsmt: { bat: false, tu: "16:40", den: "17:08", tienTo: "Mt 2d" },
    xsmb: { bat: false, tu: "17:40", den: "18:08", tienTo: "Mb " },
  },
  daGui: {},
  noiDung: "da2",
  doDaiTin: DO_DAI_TIN_MAC_DINH,
  soTin: SO_TIN_MAC_DINH,
  tinMoiPhut: TIN_MOI_PHUT_MAC_DINH,
  tienDo: {},
  daBaoRong: {},
  duBao: DU_BAO_GUI_MAC_DINH,
};
/**
 * Khung mặc định cũ. Bản lưu nào còn đúng y khung cũ là chưa ai đặt tay (lệnh
 * /nhomgui, /batgui lưu cả cấu hình kể cả khung), nên đọc lên thành khung mới
 * luôn — khách đổi giờ là đổi cho cả hệ, không bắt gõ lại /khunggio ba lần.
 */
/**
 * Nhóm 2 — khách 19/11/2026: "cho bot gửi thêm vào 1 nhóm mới" (nhóm cũ vẫn nhận
 * đá PA2 như trước), "lô 2 số cho nó gửi từ 3h00 cũng được", rồi tối cùng ngày:
 * "mặc định cho bot gửi là thứ nào gửi [ô] lời nhất của thứ đó từng miền" — tức
 * SỐ DỰ BÁO theo thứ của tab Dự Báo. Nên nhóm 2 mặc định gửi "dubao" (ô lời nhất,
 * 10 con, 1 điểm), khung bắt đầu 15:00 cả ba miền, kết thúc như nhóm 1 (trước
 * giờ xổ), tiền tố như nhóm 1; mặc định TẮT, chưa chọn nhóm.
 */
export const MAC_DINH_NHOM_2: CaiDatBotGui = {
  ...MAC_DINH_BOT_GUI,
  mien: {
    // Khách 20/11: "cái 2 số đấy cho máy gửi 1 lần vào lúc Mn 16h, Mt 17h, Mb 18h" — 8 phút cuối để bù nếu lỡ lượt gõ cửa.
    xsmn: { bat: false, tu: "16:00", den: "16:08", tienTo: "Mn 2d" },
    xsmt: { bat: false, tu: "17:00", den: "17:08", tienTo: "Mt 2d" },
    xsmb: { bat: false, tu: "18:00", den: "18:08", tienTo: "Mb " },
  },
  noiDung: "dubao",
  daGui: {},
  tienDo: {},
  daBaoRong: {},
};
/** Khung mặc định cũ của nhóm 2 (19/11: "gửi từ 3h00"). Bản lưu còn y khung này là chưa ai đặt tay → đọc lên thành giờ mới. */
const KHUNG_CU_NHOM_2: Record<Region, KhungGio> = {
  xsmn: { tu: "15:00", den: "16:08" },
  xsmt: { tu: "15:00", den: "17:08" },
  xsmb: { tu: "15:00", den: "18:08" },
};
/** Tên nội dung để hiện trong /lichgui, /nhomgui… */
export function tenNoiDungGui(cfg: Pick<CaiDatBotGui, "noiDung" | "duBao">): string {
  if (cfg.noiDung === "lo") return "chuỗi lô (hạn mức)";
  if (cfg.noiDung === "da2") return "số nhận đá phương án 2";
  const d = cfg.duBao;
  if (d.cach === "chon") return "số dự báo theo ô anh chọn trên tab Dự Báo (cột thứ hôm đó; số con, điểm, lọc theo tab)";
  return `số dự báo theo thứ (${d.cach === "tot" ? "ô lời nhất của thứ hôm đó" : "gộp hết ô đang lời của thứ hôm đó"}, ${d.soCon} con × ${d.diem} điểm)`;
}

/** Các nhóm bot gửi. Nhóm 1 là nhóm có từ đầu (khoá cấu hình cũ, không đổi). */
export const CAC_NHOM = [1, 2] as const;
export type SoNhom = (typeof CAC_NHOM)[number];
export const macDinhNhom = (so: SoNhom): CaiDatBotGui => (so === 2 ? MAC_DINH_NHOM_2 : MAC_DINH_BOT_GUI);
/** Tên nhóm trong câu chữ: nhóm 1 để trống cho giống trước, nhóm 2 ghi rõ. */
export const tenNhomSo = (so: SoNhom): string => (so === 1 ? "" : ` nhóm ${so}`);
/** Chữ chèn vào lệnh gợi ý: "/guingay 2 mn". */
export const lenhNhom = (so: SoNhom): string => (so === 1 ? "" : `${so} `);

/**
 * Tách số nhóm ở đầu tham số lệnh: "/batgui 2 all" → nhóm 2, ["all"]. Chấp nhận
 * "2", "n2", "nhom2". Lệnh mà giá trị cũng là số ("/sotin 2" = 2 tin) thì chỉ
 * coi là số nhóm khi còn tham số theo sau ("/sotin 2 50").
 */
export function tachNhom(args: string[], giaTriLaSo = false): { so: SoNhom; con: string[] } {
  const m = (args[0] ?? "").toLowerCase().match(/^(?:n|nhom)?([12])$/);
  if (m && (!giaTriLaSo || args.length >= 2)) return { so: Number(m[1]) as SoNhom, con: args.slice(1) };
  return { so: 1, con: args };
}

/**
 * Chuỗi lô chia thành các tin ≤ `doDaiTin`, mỗi tin tự đứng được (mở bằng tiền tố):
 * "Mn 2d00b10, 01b5, …". Một miền thường chỉ một tin; chia ra cho chắc khi nhận nhiều lô.
 */
export function khoiLoGui(rows: { lo_number: string; current_limit: number }[], tienTo: string, doDaiTin: number): string[] {
  const muc = rows
    .filter((r) => Number(r.current_limit) > 0)
    .sort((a, b) => a.lo_number.localeCompare(b.lo_number))
    .map((r) => `${r.lo_number}b${Number(r.current_limit)}`);
  return chiaTin(muc, tienTo, doDaiTin);
}

/** Các mục "23b1" GIỮ NGUYÊN THỨ TỰ, chia thành tin ≤ doDaiTin, mỗi tin mở bằng tiền tố. */
export function chiaTin(muc: string[], tienTo: string, doDaiTin: number): string[] {
  const out: string[] = [];
  let hien: string[] = [];
  for (const x of muc) {
    if (hien.length && (tienTo + [...hien, x].join(", ")).length > doDaiTin) { out.push(tienTo + hien.join(", ")); hien = []; }
    hien.push(x);
  }
  if (hien.length) out.push(tienTo + hien.join(", "));
  return out;
}

const KHUNG_CU: Record<Region, KhungGio[]> = {
  xsmn: [{ tu: "15:30", den: "16:05" }, { tu: "15:50", den: "16:05" }],
  xsmt: [{ tu: "16:40", den: "17:05" }, { tu: "16:50", den: "17:05" }],
  xsmb: [{ tu: "17:40", den: "18:05" }, { tu: "17:50", den: "18:05" }],
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

/** Dọn một cấu hình đọc từ ngoài; thứ gì lạ thì về mặc định CỦA NHÓM ĐÓ. */
export function chuanHoaBotGui(raw: unknown, so: SoNhom = 1): CaiDatBotGui {
  const goc = macDinhNhom(so);
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mienRaw = o.mien && typeof o.mien === "object" ? (o.mien as Record<string, unknown>) : {};
  const mien = {} as Record<Region, CaiDatMien>;
  for (const r of ["xsmn", "xsmt", "xsmb"] as Region[]) {
    const md = goc.mien[r];
    const m = mienRaw[r] && typeof mienRaw[r] === "object" ? (mienRaw[r] as Record<string, unknown>) : {};
    let tu = laGioHopLe(m.tu) ? m.tu : md.tu;
    let den = laGioHopLe(m.den) ? m.den : md.den;
    if (so === 1 && KHUNG_CU[r].some((k) => k.tu === tu && k.den === den)) { tu = md.tu; den = md.den; }
    if (so === 2 && KHUNG_CU_NHOM_2[r].tu === tu && KHUNG_CU_NHOM_2[r].den === den) { tu = md.tu; den = md.den; }
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
    tienDo[r] = { ngay: t.ngay, daGui: daGuiN, tong, ...(t.daBao === true ? { daBao: true } : {}) };
  }
  const dd = Number(o.doDaiTin);
  const st = Number(o.soTin), tp = Number(o.tinMoiPhut);
  return {
    nhom: typeof o.nhom === "number" && Number.isFinite(o.nhom) ? o.nhom : null,
    tenNhom: typeof o.tenNhom === "string" ? o.tenNhom : null,
    mien,
    daGui,
    noiDung: o.noiDung === "lo" || o.noiDung === "da2" || o.noiDung === "dubao" ? o.noiDung : goc.noiDung,
    doDaiTin: Number.isFinite(dd) ? Math.min(DO_DAI_TIN_MAX, Math.max(DO_DAI_TIN_MIN, Math.round(dd))) : DO_DAI_TIN_MAC_DINH,
    soTin: Number.isInteger(st) && st >= 1 && st <= SO_TIN_MAX ? st : SO_TIN_MAC_DINH,
    tinMoiPhut: Number.isInteger(tp) && tp >= 1 && tp <= TIN_MOI_PHUT_MAX ? tp : TIN_MOI_PHUT_MAC_DINH,
    tienDo,
    duBao: chuanHoaDuBao(o.duBao),
    daBaoRong: (() => {
      const raw = o.daBaoRong && typeof o.daBaoRong === "object" ? (o.daBaoRong as Record<string, unknown>) : {};
      const out: Partial<Record<Region, string>> = {};
      for (const r of ["xsmn", "xsmt", "xsmb"] as Region[]) if (typeof raw[r] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw[r] as string)) out[r] = raw[r] as string;
      return out;
    })(),
  };
}

function chuanHoaDuBao(raw: unknown): CaiDatDuBaoGui {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const soCon = Number(o.soCon), diem = Number(o.diem);
  // Bản lưu trước 20/11 (chưa có v = 2): "tot" khi đó chỉ là mặc định, chưa ai chọn — khách giờ muốn
  // bot gửi theo ô mình chọn, nên đọc lên thành "chon". Sau 20/11 ai gõ /dubaogui 2 tot thì giữ "tot".
  const moi = o.v === 2;
  return {
    cach: o.cach === "loi" ? "loi" : o.cach === "tot" && moi ? "tot" : "chon",
    soCon: (SO_CON_GUI as readonly number[]).includes(soCon) ? soCon : DU_BAO_GUI_MAC_DINH.soCon,
    diem: Number.isInteger(diem) && diem >= 1 && diem <= 9999 ? diem : DU_BAO_GUI_MAC_DINH.diem,
    v: 2,
  };
}

/** Còn mấy phút (kể cả phút này) tới hết khung — tức còn mấy lượt gõ cửa nếu gõ mỗi phút. */
export function phutConLai(now: Date, k: KhungGio): number {
  return Math.max(0, phutCua(k.den) - gioVN(now).phut + 1);
}

/**
 * Lượt này gửi mấy tin: thường là `tinMoiPhut`; nếu số tin còn lại chia cho số
 * lượt còn lại lớn hơn (lượt trước bị lỡ, hay bắt đầu trễ) thì gửi bù cho kịp
 * hết trong khung. Không bao giờ quá số tin còn lại.
 */
export function soTinLuotNay(conLai: number, phutCon: number, tinMoiPhut: number): number {
  if (conLai <= 0) return 0;
  const can = Math.ceil(conLai / Math.max(1, phutCon));
  return Math.min(conLai, Math.max(tinMoiPhut, can));
}

/**
 * Lượt này gửi từ phần thứ mấy: hôm nay (giờ VN) đã gửi dở thì từ phần kế
 * tiếp; ngày khác, hoặc hôm nay đã gửi đủ, thì từ đầu (0).
 */
export function batDauTu(now: Date, td: TienDoGui | undefined): number {
  if (!td || td.ngay !== gioVN(now).ngay) return 0;
  return td.daGui < td.tong ? td.daGui : 0;
}
