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
import { coTaiKhoanGui, guiBangTaiKhoan } from "@/lib/tele-user";
import {
  chuanHoaBotGui, chuoiLoGui, daGuiHomNay, gioVN, trongKhung,
  type CaiDatBotGui,
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
  chuoi: string;
  soLo: number;
  /** "ok" mới gửi tự động; khác thì giữ lại. */
  duLieu: "ok" | "warn" | "alarm";
  duLieuChu: string;
}

/** Chuỗi sẽ gửi cho một miền ngay lúc này, kèm tình trạng dữ liệu. */
export async function xemTruocGui(region: Region, cfg: CaiDatBotGui, now = new Date()): Promise<XemTruocMien> {
  const [rows, latest] = await Promise.all([getLimitSummary(region), kyMoiNhat(region)]);
  const f = freshness(latest, now);
  const chuoi = chuoiLoGui(rows, cfg.mien[region].tienTo);
  return { region, chuoi, soLo: rows.filter((r) => Number(r.current_limit) > 0).length, duLieu: f.level, duLieuChu: freshnessText(f) };
}

export type KetQuaGui =
  | { region: Region; viec: "gui"; soLo: number; kyTu: number }
  | { region: Region; viec: "bo-qua"; lyDo: string }
  | { region: Region; viec: "loi"; lyDo: string };

/**
 * Chạy một lượt (cron gọi vài phút một lần trong các khung giờ). Mỗi miền:
 * tắt / chưa chọn nhóm / ngoài khung / đã gửi hôm nay → bỏ qua; dữ liệu
 * không mới → không gửi, báo quản trị một lần; còn lại thì gửi và ghi nhận.
 * `thu` = chỉ nói sẽ làm gì, không gửi và không ghi.
 */
export async function chayBotGui(now = new Date(), thu = false): Promise<{ luc: string; ketQua: KetQuaGui[] }> {
  const cfg = await docBotGui();
  const ketQua: KetQuaGui[] = [];
  let doi = false;

  for (const region of MIEN) {
    const m = cfg.mien[region];
    if (!m.bat) { ketQua.push({ region, viec: "bo-qua", lyDo: "đang tắt" }); continue; }
    if (cfg.nhom == null) { ketQua.push({ region, viec: "bo-qua", lyDo: "chưa chọn nhóm nhận (/nhomgui trong nhóm)" }); continue; }
    if (!trongKhung(now, m)) { ketQua.push({ region, viec: "bo-qua", lyDo: `ngoài khung ${m.tu}–${m.den} (đang ${gioVN(now).gio})` }); continue; }
    if (daGuiHomNay(now, cfg.daGui[region])) { ketQua.push({ region, viec: "bo-qua", lyDo: "hôm nay đã gửi" }); continue; }

    const xt = await xemTruocGui(region, cfg, now);
    if (xt.duLieu !== "ok") {
      ketQua.push({ region, viec: "loi", lyDo: `dữ liệu chưa mới — ${xt.duLieuChu}` });
      if (!thu) await baoQuanTri(`⚠️ Bot gửi ${TEN[region]}: KHÔNG gửi lệnh lô vì ${xt.duLieuChu}. Bấm Cập nhật KQ rồi gõ /guingay ${TEN[region].toLowerCase()}.`);
      continue;
    }
    if (!xt.chuoi) { ketQua.push({ region, viec: "bo-qua", lyDo: "không lô nào đang nhận" }); continue; }
    if (thu) { ketQua.push({ region, viec: "gui", soLo: xt.soLo, kyTu: xt.chuoi.length }); continue; }

    const r = await guiVaoNhom(cfg.nhom, xt.chuoi);
    if (r.ok) {
      cfg.daGui[region] = now.toISOString();
      doi = true;
      ketQua.push({ region, viec: "gui", soLo: xt.soLo, kyTu: xt.chuoi.length });
    } else if (r.khongRo) {
      // Không biết tin tới chưa. Ghi là "đã gửi" để các lượt gõ cửa sau KHÔNG tự
      // gửi lại: thà sót một lần (người vận hành gửi tay) còn hơn bot nhận ghi gấp đôi.
      cfg.daGui[region] = now.toISOString();
      doi = true;
      ketQua.push({ region, viec: "loi", lyDo: `không rõ đã tới chưa — ${r.loi}` });
      await baoQuanTri(`⚠️ Bot gửi ${TEN[region]}: ${r.loi}. KHÔNG RÕ tin đã vào nhóm chưa, nên bot sẽ không tự gửi lại hôm nay. Anh mở nhóm xem: chưa có thì gõ /guingay ${TEN[region].toLowerCase()}.`);
    } else {
      ketQua.push({ region, viec: "loi", lyDo: r.loi ?? "gửi không được" });
      await baoQuanTri(`❌ Bot gửi ${TEN[region]}: gửi lệnh lô vào nhóm KHÔNG được — ${r.loi}`);
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

/** Gửi ngay một miền theo lệnh tay của quản trị (bỏ qua khung giờ và "đã gửi", vẫn giữ chốt dữ liệu). */
export async function guiNgay(region: Region, now = new Date()): Promise<{ ok: boolean; chu: string }> {
  const cfg = await docBotGui();
  if (cfg.nhom == null) return { ok: false, chu: "Chưa chọn nhóm nhận. Vào nhóm có bot nhận rồi gõ /nhomgui." };
  const xt = await xemTruocGui(region, cfg, now);
  if (xt.duLieu !== "ok") return { ok: false, chu: `Không gửi: ${xt.duLieuChu}.` };
  if (!xt.chuoi) return { ok: false, chu: "Không lô nào đang nhận — không có gì để gửi." };
  const r = await guiVaoNhom(cfg.nhom, xt.chuoi);
  if (r.khongRo) return { ok: false, chu: `KHÔNG RÕ tin đã vào nhóm chưa: ${r.loi}. Mở nhóm xem trước, chưa có mới gõ lại — gửi trùng là bot nhận ghi gấp đôi.` };
  if (!r.ok) return { ok: false, chu: `Gửi không được: ${r.loi}` };
  cfg.daGui[region] = now.toISOString();
  await luuBotGui(cfg);
  return { ok: true, chu: `Đã gửi ${xt.soLo} lô (${xt.chuoi.length} ký tự) vào nhóm${cfg.tenNhom ? ` "${cfg.tenNhom}"` : ""} bằng ${r.bang === "tai-khoan" ? "tài khoản người" : "bot (bot nhận sẽ KHÔNG thấy)"}.` };
}
