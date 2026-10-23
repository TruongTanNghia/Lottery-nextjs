/**
 * Bot gửi tự động — phần máy chủ: cấu hình, dựng chuỗi lô từ hạn mức đang
 * chạy, và gửi vào nhóm có bot nhận.
 *
 * Tin này đi thẳng vào phần mềm ghi cược của khách, nên có ba chốt chặn:
 *   - mặc định TẮT từng miền, khách phải tự bật;
 *   - chỉ gửi trong khung giờ, mỗi miền mỗi ngày đúng một lần;
 *   - dữ liệu thiếu kỳ (hạn mức tính trên kết quả cũ) thì KHÔNG gửi, báo
 *     quản trị — gửi một bảng hạn mức sai còn tệ hơn không gửi.
 */
import { getConfigValue, query, setConfigValue } from "@/lib/db";
import { getLimitSummary } from "@/lib/limit-engine";
import { freshness, freshnessText } from "@/lib/freshness";
import { adminIds } from "@/lib/telegram-users";
import { NGHI_GIUA_TIN_MS, coTaiKhoanGui, guiBangTaiKhoan, guiNhieuBangTaiKhoan } from "@/lib/tele-user";
import { khoKyToi } from "@/lib/da";
import { bangHieuLuc, taiKyDaXo } from "@/lib/da-bang";
import { capNhan, chuoiNhanDeu } from "@/lib/da-nhan";
import {
  batDauTu, chuanHoaBotGui, chuoiLoGui, daGuiHomNay, gioVN, phutConLai, soTinLuotNay, trongKhung,
  type CaiDatBotGui, type NoiDungGui,
} from "@/lib/bot-gui-thuan";
import type { Region } from "@/lib/types";

const KHOA = "bot_gui";
const KHOA_GO_CUA = "bot_gui_go_cua";

/** Lần gần nhất bộ hẹn giờ gọi vào (ISO), null = chưa từng. Để nhìn là biết bộ hẹn giờ còn sống. */
export async function docGoCua(): Promise<string | null> {
  return (await getConfigValue(KHOA_GO_CUA)) || null;
}
export async function ghiGoCua(now = new Date()): Promise<void> {
  await setConfigValue(KHOA_GO_CUA, now.toISOString());
}
const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const TEN: Record<Region, string> = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" };

export async function docBotGui(): Promise<CaiDatBotGui> {
  const raw = await getConfigValue(KHOA);
  if (!raw) return chuanHoaBotGui(null);
  try {
    return chuanHoaBotGui(JSON.parse(raw));
  } catch {
    return chuanHoaBotGui(null);
  }
}

export async function luuBotGui(cfg: CaiDatBotGui): Promise<void> {
  await setConfigValue(KHOA, JSON.stringify(chuanHoaBotGui(cfg)));
}

/** Gửi một tin văn bản trơn (không định dạng) và BIẾT nó có tới không. */
async function guiTho(chatId: number | string, text: string): Promise<{ ok: boolean; loi?: string }> {
  const root = process.env.TELEGRAM_API_ROOT || "https://api.telegram.org";
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, loi: "thiếu TELEGRAM_BOT_TOKEN" };
  try {
    const res = await fetch(`${root}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Không parse_mode: chuỗi lệnh phải tới nguyên văn từng ký tự.
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, loi: `Telegram ${res.status}: ${(await res.text()).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, loi: e instanceof Error ? e.message : "lỗi mạng" };
  }
}

/**
 * Gửi LỆNH vào nhóm nhận. Có tài khoản người thì đi đường đó — đường duy nhất
 * mà bot nhận đọc được. Chưa cài thì vẫn gửi bằng bot (để còn thử, và cho cách
 * "bot nhắn riêng rồi người chuyển tiếp"). Không tự rơi từ tài khoản về bot:
 * tin bot thì bot nhận không thấy, rơi về đó là báo "đã gửi" mà chẳng ai nhận.
 */
export async function guiVaoNhom(chatId: number, text: string): Promise<{ ok: boolean; loi?: string; khongRo?: boolean; bang: "tai-khoan" | "bot" }> {
  if (coTaiKhoanGui()) {
    const r = await guiBangTaiKhoan(chatId, text);
    return { ok: r.ok, loi: r.loi, khongRo: r.khongRo, bang: "tai-khoan" };
  }
  const r = await guiTho(chatId, text);
  return { ...r, bang: "bot" };
}

async function baoQuanTri(text: string): Promise<void> {
  for (const id of adminIds()) await guiTho(id, text);
}

async function kyMoiNhat(region: Region): Promise<string | null> {
  const rows = await query<{ d: string | null }>("SELECT MAX(date) AS d FROM lo_daily WHERE region = ?", [region]);
  return rows[0]?.d ?? null;
}

export interface XemTruocMien {
  region: Region;
  noiDung: NoiDungGui;
  /** Các tin sẽ gửi, theo thứ tự — mỗi tin tự đứng được (có tiền tố đài), dài ≤ doDaiTin. */
  khoi: string[];
  /** Cả nội dung nối lại, để xem trước. */
  chuoi: string;
  /** "lo": số lô nhận; "da2": số cặp nhận. */
  soLo: number;
  soCap: number;
  /** "ok" mới gửi tự động; khác thì giữ lại. */
  duLieu: "ok" | "warn" | "alarm";
  duLieuChu: string;
}

/** Trần một lượt gửi (route cron có 30 giây; chừa chỗ kết nối và báo lỗi). */
const HAN_MOT_LUOT_MS = 22_000;
/** Gửi từ từ: trong một lượt (mỗi phút), hai tin cách nhau ngần này — "1 phút gửi 2 tin". */
const NGHI_GIAN_DEU_MS = 8_000;

/**
 * Nội dung sẽ gửi cho một miền ngay lúc này, đã chia tin, kèm tình trạng dữ liệu.
 *
 * "da2" (khách chốt): số nhận đá phương án 2 — cặp nào ô đang cài > 0 là nhận,
 * chia ĐỀU thành `soTin` tin, mỗi tin ghi từng cặp, mở bằng tiền tố đài.
 * Đi qua bangHieuLuc(…, 2) nên bảng dùng để gửi được ghi vào sổ bảng PA2 —
 * khối "Tiền số nhận" tính đúng theo cái đã gửi đi.
 */
export async function xemTruocGui(region: Region, cfg: CaiDatBotGui, now = new Date()): Promise<XemTruocMien> {
  const latest = await kyMoiNhat(region);
  const f = freshness(latest, now);
  const m = cfg.mien[region];
  const chung = { region, duLieu: f.level, duLieuChu: freshnessText(f) };
  if (cfg.noiDung === "lo") {
    const rows = await getLimitSummary(region);
    const chuoi = chuoiLoGui(rows, m.tienTo);
    return { ...chung, noiDung: "lo", khoi: chuoi ? [chuoi] : [], chuoi, soLo: rows.filter((r) => Number(r.current_limit) > 0).length, soCap: 0 };
  }
  const [h, draws] = await Promise.all([bangHieuLuc(region, 2), taiKyDaXo(region)]);
  const bac = khoKyToi(draws)?.bac;
  const cap = bac ? capNhan(bac, h.bang) : [];
  const khoi = chuoiNhanDeu(m.tienTo, cap, cfg.soTin, region, cfg.doDaiTin);
  return { ...chung, noiDung: "da2", khoi, chuoi: khoi.join("\n"), soLo: 0, soCap: cap.length };
}

export type KetQuaGui =
  | { region: Region; viec: "gui"; soPhan: number; kyTu: number; soLo: number; soCap: number }
  | { region: Region; viec: "do-dang"; daGui: number; tong: number }
  | { region: Region; viec: "bo-qua"; lyDo: string }
  | { region: Region; viec: "loi"; lyDo: string };

/** Kết quả gửi các phần từ `batDau` trở đi; `daGui` = số phần MỚI gửi xong trong lượt này. */
interface KetQuaGuiKhoi {
  ok: boolean;
  daGui: number;
  doDang?: boolean;
  khongRo?: boolean;
  loi?: string;
  bang: "tai-khoan" | "bot";
}

/**
 * Gửi các phần `khoi[batDau..]` vào nhóm, nối tiếp. Có tài khoản người thì đi
 * đường đó — đường duy nhất mà bot nhận đọc được. Chưa cài thì vẫn gửi bằng
 * bot (để còn thử). Không tự rơi từ tài khoản về bot: tin bot thì bot nhận
 * không thấy, rơi về đó là báo "đã gửi" mà chẳng ai nhận. Sau mỗi phần xong,
 * `ghi(n)` được gọi để ghi tiến độ ngay.
 */
async function guiKhoiVaoNhom(chatId: number, khoi: string[], batDau: number, toiDa: number, nghiMs: number, ghi: (daGui: number) => Promise<void>): Promise<KetQuaGuiKhoi> {
  const con = khoi.slice(batDau, batDau + Math.max(1, toiDa));
  if (coTaiKhoanGui()) {
    const r = await guiNhieuBangTaiKhoan(chatId, con, HAN_MOT_LUOT_MS, ghi, nghiMs);
    return { ok: r.ok, daGui: r.daGui, doDang: r.doDang, khongRo: r.khongRo, loi: r.loi, bang: "tai-khoan" };
  }
  const batDauLuot = Date.now();
  let daGui = 0;
  for (let i = 0; i < con.length; i++) {
    if (i > 0) {
      if (Date.now() - batDauLuot + nghiMs + 4_000 > HAN_MOT_LUOT_MS) return { ok: true, daGui, doDang: true, bang: "bot" };
      await new Promise((r) => setTimeout(r, nghiMs));
    }
    const r = await guiTho(chatId, con[i]);
    if (!r.ok) return { ok: false, daGui, loi: r.loi, bang: "bot" };
    daGui = i + 1;
    await ghi(daGui);
  }
  return { ok: true, daGui, bang: "bot" };
}

/** Giữ chỗ cho câu chữ: gửi gì. */
const tenNoiDung = (nd: NoiDungGui) => (nd === "lo" ? "lệnh lô" : "số nhận đá PA2");

/**
 * Chạy một lượt (cron gọi vài phút một lần trong các khung giờ). Mỗi miền:
 * tắt / chưa chọn nhóm / ngoài khung / đã gửi đủ hôm nay → bỏ qua; dữ liệu
 * không mới → không gửi, báo quản trị một lần; còn lại thì gửi nối tiếp các
 * phần chưa gửi, ghi tiến độ sau từng phần. Hết giờ một lượt giữa chừng thì
 * lượt sau gửi tiếp từ phần kế. `thu` = chỉ nói sẽ làm gì, không gửi, không ghi.
 */
export async function chayBotGui(now = new Date(), thu = false): Promise<{ luc: string; ketQua: KetQuaGui[] }> {
  const cfg = await docBotGui();
  const ketQua: KetQuaGui[] = [];
  let doi = false;
  const ngay = gioVN(now).ngay;

  for (const region of MIEN) {
    const m = cfg.mien[region];
    if (!m.bat) { ketQua.push({ region, viec: "bo-qua", lyDo: "đang tắt" }); continue; }
    if (cfg.nhom == null) { ketQua.push({ region, viec: "bo-qua", lyDo: "chưa chọn nhóm nhận (/nhomgui trong nhóm)" }); continue; }
    if (!trongKhung(now, m)) {
      // Hết giờ mà hôm nay còn gửi dở: báo quản trị đúng một lần, để gửi tay phần còn lại nếu còn kịp.
      const td = cfg.tienDo[region];
      if (!thu && td && td.ngay === ngay && td.daGui < td.tong && !td.daBao && gioVN(now).gio > m.den) {
        td.daBao = true;
        doi = true;
        await baoQuanTri(`⚠️ Bot gửi ${TEN[region]}: hết khung ${m.tu}–${m.den} mà mới đi ${td.daGui}/${td.tong} tin. Còn kịp thì gõ /guingay ${TEN[region].toLowerCase()} để gửi nốt (bot chỉ gửi tiếp phần chưa đi).`);
      }
      ketQua.push({ region, viec: "bo-qua", lyDo: `ngoài khung ${m.tu}–${m.den} (đang ${gioVN(now).gio})` });
      continue;
    }
    if (daGuiHomNay(now, cfg.daGui[region])) { ketQua.push({ region, viec: "bo-qua", lyDo: "hôm nay đã gửi đủ" }); continue; }

    const batDau = batDauTu(now, cfg.tienDo[region]);
    const xt = await xemTruocGui(region, cfg, now);
    if (xt.duLieu !== "ok") {
      ketQua.push({ region, viec: "loi", lyDo: `dữ liệu chưa mới — ${xt.duLieuChu}` });
      if (!thu) await baoQuanTri(`⚠️ Bot gửi ${TEN[region]}: KHÔNG gửi ${tenNoiDung(cfg.noiDung)} vì ${xt.duLieuChu}. Bấm Cập nhật KQ rồi gõ /guingay ${TEN[region].toLowerCase()}.`);
      continue;
    }
    if (xt.khoi.length === 0) { ketQua.push({ region, viec: "bo-qua", lyDo: cfg.noiDung === "lo" ? "không lô nào đang nhận" : "không cặp đá nào đang nhận" }); continue; }
    // Tiến độ hôm nay ghi theo số phần lúc đó; nội dung đổi (tổng khác) thì gửi lại từ đầu cho trọn.
    const tiepTu = batDau > 0 && cfg.tienDo[region]?.tong === xt.khoi.length ? batDau : 0;
    if (thu) { ketQua.push({ region, viec: "gui", soPhan: xt.khoi.length - tiepTu, kyTu: xt.chuoi.length, soLo: xt.soLo, soCap: xt.soCap }); continue; }

    const ghi = async (n: number) => {
      cfg.tienDo[region] = { ngay, daGui: tiepTu + n, tong: xt.khoi.length };
      await luuBotGui(cfg);
    };
    // Gửi từ từ: mỗi lượt `tinMoiPhut` tin; lượt trước bị lỡ thì gửi bù để kịp hết khung.
    const toiDa = soTinLuotNay(xt.khoi.length - tiepTu, phutConLai(now, m), cfg.tinMoiPhut);
    const nghi = toiDa <= cfg.tinMoiPhut ? NGHI_GIAN_DEU_MS : NGHI_GIUA_TIN_MS;
    const r = await guiKhoiVaoNhom(cfg.nhom, xt.khoi, tiepTu, toiDa, nghi, ghi);
    let daGui = tiepTu + r.daGui;
    if (r.khongRo) {
      // Không biết phần đó tới chưa. Tính là đã gửi để lượt sau KHÔNG gửi lại phần
      // ấy: thà sót một phần (người vận hành gửi tay) còn hơn bot nhận ghi gấp đôi.
      daGui += 1;
      cfg.tienDo[region] = { ngay, daGui, tong: xt.khoi.length };
      doi = true;
      ketQua.push({ region, viec: "loi", lyDo: `không rõ phần ${daGui}/${xt.khoi.length} đã tới chưa — ${r.loi}` });
      await baoQuanTri(`⚠️ Bot gửi ${TEN[region]}: ${r.loi}. KHÔNG RÕ phần ${daGui}/${xt.khoi.length} đã vào nhóm chưa; bot sẽ bỏ qua phần đó và gửi tiếp các phần sau ở lượt kế. Anh mở nhóm xem, thiếu thì gõ /xemgui ${TEN[region].toLowerCase()} rồi chép phần đó vào tay.`);
      if (daGui >= xt.khoi.length) cfg.daGui[region] = now.toISOString();
      continue;
    }
    if (daGui >= xt.khoi.length) {
      cfg.daGui[region] = now.toISOString();
      doi = true;
      ketQua.push({ region, viec: "gui", soPhan: xt.khoi.length, kyTu: xt.chuoi.length, soLo: xt.soLo, soCap: xt.soCap });
    } else if (r.ok) {
      // Đúng nhịp: lượt này xong phần của nó, phần còn lại để các lượt sau.
      doi = true;
      ketQua.push({ region, viec: "do-dang", daGui, tong: xt.khoi.length });
    } else {
      doi = doi || r.daGui > 0;
      ketQua.push({ region, viec: "loi", lyDo: `${r.loi ?? "gửi không được"} (đã đi ${daGui}/${xt.khoi.length} phần)` });
      await baoQuanTri(`❌ Bot gửi ${TEN[region]}: gửi ${tenNoiDung(cfg.noiDung)} vào nhóm KHÔNG được — ${r.loi} (đã đi ${daGui}/${xt.khoi.length} phần; lượt sau bot thử gửi tiếp).`);
    }
  }

  if (doi) await luuBotGui(cfg);
  return { luc: gioVN(now).gio, ketQua };
}

/** /thutk <chuỗi> — gửi nguyên văn một chuỗi vào nhóm nhận BẰNG TÀI KHOẢN NGƯỜI, để thử trước khi bật. */
export async function thuTaiKhoan(chuoi: string): Promise<{ ok: boolean; chu: string }> {
  if (!coTaiKhoanGui()) return { ok: false, chu: "Chưa cài tài khoản gửi. Chạy scripts/telegram-user-login.mjs rồi đặt 3 biến TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_USER_SESSION trên Vercel." };
  const cfg = await docBotGui();
  if (cfg.nhom == null) return { ok: false, chu: "Chưa chọn nhóm nhận. Vào nhóm có bot nhận rồi gõ /nhomgui." };
  if (!chuoi.trim()) return { ok: false, chu: "Thiếu chuỗi. Ví dụ: /thutk 2d16b100, 15b50" };
  const r = await guiBangTaiKhoan(cfg.nhom, chuoi.trim());
  if (r.khongRo) return { ok: false, chu: `KHÔNG RÕ tin đã vào nhóm chưa: ${r.loi}. Mở nhóm xem trước khi thử lại.` };
  return r.ok
    ? { ok: true, chu: `Tài khoản "${r.ten}" đã gửi vào nhóm${cfg.tenNhom ? ` "${cfg.tenNhom}"` : ""}. Xem bot nhận có ghi không.` }
    : { ok: false, chu: `Gửi không được: ${r.loi}` };
}

/**
 * Gửi ngay một miền theo lệnh tay của quản trị (bỏ qua khung giờ, vẫn giữ chốt
 * dữ liệu). Hôm nay đang gửi dở thì gửi tiếp các phần còn lại; đã gửi đủ rồi
 * thì không gửi lại trừ khi `ep` ("/guingay mn lai") — gửi trùng là bot nhận
 * ghi gấp đôi tiền.
 */
export async function guiNgay(region: Region, now = new Date(), ep = false): Promise<{ ok: boolean; chu: string }> {
  const cfg = await docBotGui();
  if (cfg.nhom == null) return { ok: false, chu: "Chưa chọn nhóm nhận. Vào nhóm có bot nhận rồi gõ /nhomgui." };
  if (!ep && daGuiHomNay(now, cfg.daGui[region])) {
    return { ok: false, chu: `Hôm nay đã gửi đủ lúc ${gioVN(new Date(cfg.daGui[region]!)).gio}. Chắc chắn muốn gửi lại cả bộ thì gõ /guingay ${TEN[region].toLowerCase()} lai (bot nhận sẽ ghi thêm lần nữa).` };
  }
  const xt = await xemTruocGui(region, cfg, now);
  if (xt.duLieu !== "ok") return { ok: false, chu: `Không gửi: ${xt.duLieuChu}.` };
  if (xt.khoi.length === 0) return { ok: false, chu: cfg.noiDung === "lo" ? "Không lô nào đang nhận — không có gì để gửi." : "Không cặp đá nào đang nhận — không có gì để gửi." };
  const ngay = gioVN(now).ngay;
  const batDau = ep ? 0 : batDauTu(now, cfg.tienDo[region]);
  const tiepTu = batDau > 0 && cfg.tienDo[region]?.tong === xt.khoi.length ? batDau : 0;
  const ghi = async (n: number) => {
    cfg.tienDo[region] = { ngay, daGui: tiepTu + n, tong: xt.khoi.length };
    await luuBotGui(cfg);
  };
  // Gửi tay: đi hết phần còn lại, nghỉ ngắn giữa các tin.
  const r = await guiKhoiVaoNhom(cfg.nhom, xt.khoi, tiepTu, xt.khoi.length, NGHI_GIUA_TIN_MS, ghi);
  const daGui = tiepTu + r.daGui + (r.khongRo ? 1 : 0);
  if (r.khongRo) {
    cfg.tienDo[region] = { ngay, daGui, tong: xt.khoi.length };
    if (daGui >= xt.khoi.length) cfg.daGui[region] = now.toISOString();
    await luuBotGui(cfg);
    return { ok: false, chu: `KHÔNG RÕ phần ${daGui}/${xt.khoi.length} đã vào nhóm chưa: ${r.loi}. Mở nhóm xem; thiếu thì gõ /guingay ${TEN[region].toLowerCase()} để gửi tiếp các phần sau — bot sẽ không gửi lại phần đó.` };
  }
  const noi = `${xt.noiDung === "lo" ? `${xt.soLo} lô` : `${xt.soCap.toLocaleString("vi-VN")} cặp đá PA2`}, ${xt.khoi.length} phần, ${xt.chuoi.length.toLocaleString("vi-VN")} ký tự`;
  const bang = r.bang === "tai-khoan" ? "tài khoản người" : "bot (bot nhận sẽ KHÔNG thấy)";
  if (daGui >= xt.khoi.length) {
    cfg.daGui[region] = now.toISOString();
    await luuBotGui(cfg);
    return { ok: true, chu: `Đã gửi ${noi} vào nhóm${cfg.tenNhom ? ` "${cfg.tenNhom}"` : ""} bằng ${bang}${tiepTu ? ` (gửi tiếp từ phần ${tiepTu + 1})` : ""}.` };
  }
  if (r.ok && r.doDang) return { ok: false, chu: `Mới đi được ${daGui}/${xt.khoi.length} phần (hết thời gian một lượt). Gõ lại /guingay ${TEN[region].toLowerCase()} để gửi tiếp từ phần ${daGui + 1}.` };
  return { ok: false, chu: `Gửi không được: ${r.loi} (đã đi ${daGui}/${xt.khoi.length} phần; gõ lại để gửi tiếp).` };
}
