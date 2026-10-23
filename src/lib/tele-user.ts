/**
 * Gửi tin bằng TÀI KHOẢN NGƯỜI (MTProto), không phải bot.
 *
 * Vì sao phải có: Telegram không giao tin của bot cho bot khác, nên "bot nhận"
 * của phần mềm ghi cược không bao giờ thấy tin bot mình gửi — khách thử rồi:
 * "con gửi mà con kia không nhận". Tin do một tài khoản người gửi thì nó đọc
 * được. Người vận hành chốt: "dùng tk cá nhân tự động gửi, cho nó chắc".
 *
 * Ba biến môi trường, CHỈ đặt trên Vercel (repo này công khai):
 *   TELEGRAM_API_ID, TELEGRAM_API_HASH — lấy ở my.telegram.org
 *   TELEGRAM_USER_SESSION — chuỗi phiên, tạo bằng scripts/telegram-user-login.mjs
 * Chuỗi phiên là TOÀN QUYỀN với tài khoản đó: đọc hết tin, nhắn thay mặt. Nên
 * dùng số phụ, không dùng số chính, và không bao giờ ghi nó vào mã hay chat.
 *
 * Thư viện: gramjs ("telegram"), ghim đúng phiên bản. Gói đã bị chủ đánh dấu
 * ngừng bảo trì và chỉ sang "teleproto"; vẫn giữ gramjs vì nó cầm khoá tài
 * khoản — chọn gói đã được dùng rộng, mã đứng yên, hơn một bản tách mới chưa
 * kiểm. Chỉ dùng connect / getDialogs / sendMessage, phần giao thức ổn định.
 * Khi Telegram đổi tới mức gramjs gãy thì đây là chỗ duy nhất phải sửa.
 */

/** Webhook và cron đều có trần 30 giây; để dư chỗ cho việc báo lỗi về cho người vận hành. */
const HAN_GUI_MS = 20_000;
/** Gửi nhiều tin một lượt: nghỉ giữa hai tin — "gửi đều", và để bot nhận kịp đọc từng tin. */
export const NGHI_GIUA_TIN_MS = 1_200;
/** Gần hết hạn mà còn tin thì dừng, lượt sau gửi tiếp; một tin + nghỉ cần chừng này. */
const CAN_CHO_MOT_TIN_MS = 4_000;

export function coTaiKhoanGui(): boolean {
  return !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_USER_SESSION);
}

export interface KetQuaGuiTK {
  ok: boolean;
  loi?: string;
  /** Tên hiển thị của tài khoản đã gửi — để người vận hành biết đúng số chưa. */
  ten?: string;
  /**
   * Tin ĐÃ phát đi nhưng không nhận được xác nhận: có thể đã tới, có thể chưa.
   * Bên gọi KHÔNG được tự gửi lại — gửi trùng là bot nhận ghi gấp đôi tiền.
   */
  khongRo?: boolean;
}

/** Kết quả gửi NHIỀU tin trong một kết nối. */
export interface KetQuaGuiNhieu extends KetQuaGuiTK {
  /** Số tin đã gửi và CÓ xác nhận. Tin "không rõ" (nếu có) không tính vào đây. */
  daGui: number;
  /** Chưa hết tin mà sắp hết hạn một lượt: dừng, không phải lỗi — gọi lại lượt sau để gửi tiếp. */
  doDang?: boolean;
}

interface TrangThaiGui {
  /** Gán ngay khi có kết nối, để bên hẹn giờ đóng nó nếu quá hạn. */
  dong?: () => Promise<void>;
  /** Bật ngay trước khi phát một tin: từ đây mọi lỗi không rõ ràng đều là "không rõ". */
  daPhat?: boolean;
  daGui: number;
}

async function guiThat(
  chatId: number,
  texts: string[],
  giu: TrangThaiGui,
  hanMs: number,
  onDaGui?: (daGui: number) => Promise<void>,
  nghiMs = NGHI_GIUA_TIN_MS
): Promise<KetQuaGuiNhieu> {
  const batDau = Date.now();
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH);
  if (!Number.isInteger(apiId) || apiId <= 0) return { ok: false, loi: "TELEGRAM_API_ID không phải số", daGui: 0 };

  // Nạp thư viện lúc cần: không cài tài khoản thì không tốn gì, và lỗi nạp
  // (nếu có) chỉ ảnh hưởng đường gửi này chứ không đánh sập cả bot.
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions/index.js");

  let phien;
  try {
    phien = new StringSession(String(process.env.TELEGRAM_USER_SESSION));
  } catch {
    return { ok: false, loi: "TELEGRAM_USER_SESSION hỏng — chạy lại scripts/telegram-user-login.mjs", daGui: 0 };
  }

  // Cùng tên thiết bị với lúc đăng nhập, để trong Telegram → Thiết bị vẫn nhận ra phiên này.
  const client = new TelegramClient(phien, apiId, apiHash, { connectionRetries: 2, deviceModel: "gacon-bot-gui", systemVersion: "1.0", appVersion: "1.0" });
  client.setLogLevel("error" as never);
  giu.dong = async () => {
    await client.destroy();
  };
  try {
    await client.connect();
    if (!(await client.checkAuthorization())) {
      return { ok: false, loi: "phiên đăng nhập hết hạn hoặc đã bị thu hồi — đăng nhập lại bằng scripts/telegram-user-login.mjs", daGui: 0 };
    }
    const toi = (await client.getMe()) as { firstName?: string; username?: string };
    // Phiên chuỗi không nhớ danh bạ nhóm giữa các lần chạy; nạp danh sách hội
    // thoại để thư viện biết "địa chỉ" (access hash) của nhóm cần gửi.
    await client.getDialogs({ limit: 200 });
    // Tìm "địa chỉ" nhóm trước, tách khỏi bước phát: lỗi ở đây chắc chắn là chưa gửi.
    const nhom = await client.getInputEntity(chatId);
    const ten = toi.firstName || toi.username || "tài khoản";
    for (let i = 0; i < texts.length; i++) {
      if (i > 0) {
        // Không đủ chỗ cho tin kế trong lượt này thì dừng gọn: phần đã gửi đã được ghi nhận qua onDaGui.
        if (Date.now() - batDau + nghiMs + CAN_CHO_MOT_TIN_MS > hanMs) return { ok: true, ten, daGui: giu.daGui, doDang: true };
        await new Promise((r) => setTimeout(r, nghiMs));
      }
      giu.daPhat = true;
      await client.sendMessage(nhom, { message: texts[i], linkPreview: false });
      giu.daPhat = false;
      giu.daGui = i + 1;
      if (onDaGui) await onDaGui(giu.daGui);
    }
    return { ok: true, ten, daGui: giu.daGui };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    const daGui = giu.daGui;
    if (/Could not find the input entity|PEER_ID_INVALID|CHANNEL_PRIVATE/i.test(m)) {
      return { ok: false, loi: "tài khoản gửi CHƯA ở trong nhóm nhận (hoặc không thấy nhóm) — thêm tài khoản đó vào nhóm rồi thử lại", daGui };
    }
    if (/FLOOD_WAIT|SLOWMODE/i.test(m)) return { ok: false, loi: `Telegram bắt chờ (${m}) — không gửi lại ngay`, daGui };
    if (/AUTH_KEY|SESSION_REVOKED|USER_DEACTIVATED/i.test(m)) return { ok: false, loi: `phiên không còn hợp lệ (${m}) — đăng nhập lại`, daGui };
    // Telegram từ chối bằng mã lỗi (có errorMessage) là chắc chắn chưa gửi. Còn lỗi
    // kiểu rớt mạng SAU khi đã phát thì không biết tin tới chưa.
    const tuChoi = typeof (e as { errorMessage?: unknown }).errorMessage === "string";
    if (giu.daPhat && !tuChoi) return { ok: false, khongRo: true, loi: `đã phát tin nhưng mất kết nối trước khi có xác nhận (${m.slice(0, 120)})`, daGui };
    return { ok: false, loi: m.slice(0, 200), daGui };
  } finally {
    try {
      await client.destroy();
    } catch {
      /* đóng kết nối không được thì thôi, hàm sắp kết thúc */
    }
  }
}

/** Gửi một tin văn bản trơn vào chat bằng tài khoản người. Không bao giờ ném lỗi ra ngoài. */
export async function guiBangTaiKhoan(chatId: number, text: string): Promise<KetQuaGuiTK> {
  const r = await guiNhieuBangTaiKhoan(chatId, [text], HAN_GUI_MS);
  return { ok: r.ok, loi: r.loi, ten: r.ten, khongRo: r.khongRo };
}

/**
 * Gửi NHIỀU tin nối tiếp trong MỘT kết nối, nghỉ NGHI_GIUA_TIN_MS giữa hai tin.
 * Sau mỗi tin có xác nhận thì gọi `onDaGui(n)` — bên gọi ghi tiến độ ngay, để
 * lượt sau (hay sau khi quá hạn) gửi tiếp từ phần kế chứ không gửi lại.
 * `hanMs` là trần cho cả lượt; gần hết thì trả `doDang` thay vì cố gửi nốt.
 * Không bao giờ ném lỗi ra ngoài.
 */
export async function guiNhieuBangTaiKhoan(
  chatId: number,
  texts: string[],
  hanMs = HAN_GUI_MS,
  onDaGui?: (daGui: number) => Promise<void>,
  nghiMs = NGHI_GIUA_TIN_MS
): Promise<KetQuaGuiNhieu> {
  if (!coTaiKhoanGui()) return { ok: false, loi: "chưa cài tài khoản gửi (TELEGRAM_API_ID / API_HASH / USER_SESSION)", daGui: 0 };
  if (texts.length === 0) return { ok: true, daGui: 0 };
  const giu: TrangThaiGui = { daGui: 0 };
  let hen: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      guiThat(chatId, texts, giu, hanMs, onDaGui, nghiMs),
      // Đã thử: phiên bị thu hồi thì Telegram không trả lỗi mà im lặng, thư viện
      // đứng chờ mãi. Nên quá hạn là dấu hiệu thường gặp nhất của phiên chết.
      new Promise<KetQuaGuiNhieu>((r) => {
        hen = setTimeout(
          () =>
            r(
              giu.daPhat
                ? { ok: false, khongRo: true, loi: `đã phát tin nhưng quá ${Math.round(hanMs / 1000)} giây chưa có xác nhận của Telegram`, daGui: giu.daGui }
                : { ok: false, loi: `quá ${Math.round(hanMs / 1000)} giây Telegram không trả lời, tin CHƯA phát đi. Thường là phiên đăng nhập đã bị thu hồi (đăng nhập lại bằng scripts/telegram-user-login.mjs), hoặc mạng nghẽn`, daGui: giu.daGui },
            ),
          hanMs + 2_000,
        );
      }),
    ]);
  } catch (e) {
    return { ok: false, loi: e instanceof Error ? e.message.slice(0, 200) : "lỗi không rõ", daGui: giu.daGui };
  } finally {
    clearTimeout(hen);
    // Gửi xong thì guiThat đã tự đóng; quá hạn thì đóng ở đây để không treo kết nối.
    giu.dong?.().catch(() => {});
  }
}
