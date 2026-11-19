/**
 * POST /api/telegram/webhook — where Telegram delivers messages.
 *
 * This route sits OUTSIDE the cookie login (a bot has no browser session), so
 * it carries its own two locks:
 *
 *   1. the secret header Telegram echoes back, proving the caller is Telegram
 *   2. a per-person allow list, proving the sender is someone we invited
 *
 * It also always answers 200. A non-200 makes Telegram retry the same update
 * for hours, which would replay every command.
 */
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/api-utils";
import {
  answerCallback,
  editMessageText,
  esc,
  leaveChat,
  sendMessage,
  type TelegramCallback,
  type TelegramMessage,
} from "@/lib/telegram";
import { coTaiKhoanGui, roiNhomBangTaiKhoan } from "@/lib/tele-user";
import { answer } from "@/lib/telegram-commands";
import { adminIds, canUse, isAdmin, requestAccess, setStatus } from "@/lib/telegram-users";
import { docBotGui, luuBotGui } from "@/lib/bot-gui";
import { tenNoiDungGui, type SoNhom } from "@/lib/bot-gui-thuan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Telegram gives up on a webhook well before Vercel's limit. */
export const maxDuration = 30;

/**
 * A fresh 200 each time. A shared Response object cannot be reused: its body
 * is a stream, and the second request would get an already-consumed one.
 */
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      // Not Telegram. Say nothing useful.
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await req.json().catch(() => null);
    await ensureDb();

    if (update?.callback_query) {
      await handleTap(update.callback_query as TelegramCallback);
      return ok();
    }

    const msg: TelegramMessage | undefined = update?.message ?? update?.edited_message;
    const text = msg?.text?.trim();
    if (!msg || !text) return ok();

    await handleMessage(msg, text);
    return ok();
  } catch (err) {
    // Swallow and 200: a crash loop of Telegram retries is worse than a
    // dropped message, and the stack still reaches the Vercel log.
    console.error("[telegram] webhook error:", err);
    return ok();
  }
}

async function handleMessage(msg: TelegramMessage, text: string) {
  const chatId = msg.chat.id;

  if (await canUse(chatId)) {
    // /guithu <chuỗi>: bot nói lại NGUYÊN VĂN chuỗi đó thành một tin riêng (không
    // phải tin trả lời, không thêm chữ nào). Khách muốn làm bot gửi lệnh tự động
    // vào nhóm có "bot nhận" của phần mềm ghi cược, và dặn thử trước: "xem con
    // bot nó gửi tin con kia có hiểu không đã — 2 con không khớp thì vô dụng".
    // Đây là phép thử đó: gõ trong nhóm, xem bot nhận có phản ứng không.
    // /nhomgui: chọn CHÍNH nhóm này làm nơi bot gửi lệnh tự động. Phải xét người
    // gõ chứ không xét chat: trong nhóm, chat id là id nhóm nên không bao giờ là
    // quản trị — mà chọn nhóm nhận lệnh thì chỉ quản trị mới được làm.
    // "/nhomgui" = nhóm 1 (nhóm có từ đầu); "/nhomgui 2" = nhóm 2 (khách 19/11: "gửi thêm vào 1 nhóm mới").
    const nhomGui = text.match(/^\/nhomgui(?:@\w+)?(?:\s+(?:n|nhom)?([12]))?\s*$/i);
    if (nhomGui) {
      if (!msg.from || !isAdmin(msg.from.id)) {
        await sendMessage(chatId, "Chỉ quản trị mới chọn được nhóm nhận lệnh.", { replyTo: msg.message_id });
        return;
      }
      const so = (nhomGui[1] === "2" ? 2 : 1) as SoNhom;
      const cfg = await docBotGui(so);
      cfg.nhom = chatId;
      cfg.tenNhom = msg.chat.title ?? (msg.chat.type === "private" ? "chat riêng" : null);
      await luuBotGui(cfg, so);
      const khac = await docBotGui(so === 1 ? 2 : 1);
      const trung = khac.nhom === chatId ? `\n⚠️ Nhóm này cũng đang là nhóm ${so === 1 ? 2 : 1} — hai nhóm cùng bật thì tin vào đây hai lần.` : "";
      const noi = tenNoiDungGui(cfg);
      await sendMessage(
        chatId,
        `✅ Đã chọn ${msg.chat.type === "private" ? "chat này" : "nhóm này"} làm nhóm gửi ${so} (gửi ${noi}). Các miền vẫn TẮT cho tới khi bật: /batgui ${so === 1 ? "" : "2 "}all. Xem lịch: /lichgui${trung}`,
        { replyTo: msg.message_id }
      );
      return;
    }
    // /roinhom: khách 19/11 "nãy em cho vào lộn nhóm… anh huỷ bot ở nhóm hồi nãy dùm em".
    // Gõ TRONG nhóm nhầm: bot Gà Con và tài khoản gửi cùng rời nhóm; nếu nhóm đó đang
    // là nhóm gửi 2 thì bỏ chọn và tắt. Không bao giờ rời nhóm gửi 1 (đá PA2 đang chạy).
    if (/^\/roinhom(?:@\w+)?\s*$/i.test(text)) {
      if (!msg.from || !isAdmin(msg.from.id)) {
        await sendMessage(chatId, "Chỉ quản trị mới cho bot rời nhóm được.", { replyTo: msg.message_id });
        return;
      }
      if (msg.chat.type === "private") {
        await sendMessage(chatId, "Gõ <code>/roinhom</code> TRONG nhóm muốn bot rời.", { replyTo: msg.message_id });
        return;
      }
      const [c1, c2] = await Promise.all([docBotGui(1), docBotGui(2)]);
      if (c1.nhom === chatId) {
        await sendMessage(chatId, "Đây là nhóm gửi 1 (đá PA2 đang chạy) nên bot KHÔNG rời. Muốn đổi nhóm 1 thì gõ <code>/nhomgui</code> trong nhóm mới trước.", { replyTo: msg.message_id });
        return;
      }
      let boChon = false;
      if (c2.nhom === chatId) {
        c2.nhom = null;
        c2.tenNhom = null;
        for (const r of ["xsmn", "xsmt", "xsmb"] as const) c2.mien[r].bat = false;
        await luuBotGui(c2, 2);
        boChon = true;
      }
      const ten = msg.chat.title ?? String(chatId);
      await sendMessage(chatId, `👋 Theo lệnh quản trị, bot Gà Con${coTaiKhoanGui() ? " và tài khoản gửi" : ""} rời nhóm này.`);
      const tk = coTaiKhoanGui() ? await roiNhomBangTaiKhoan(chatId) : null;
      const bot = await leaveChat(chatId);
      await sendMessage(
        msg.from.id,
        [
          `<b>Rời nhóm "${esc(ten)}"</b>`,
          `Bot Gà Con: ${bot.ok ? "đã rời" : `KHÔNG rời được — ${esc(bot.loi ?? "")}`}`,
          tk ? `Tài khoản gửi: ${tk.ok ? (tk.loi ? esc(tk.loi) : "đã rời") : `KHÔNG rời được — ${esc(tk.loi ?? "")} (nhờ chủ nhóm xoá tay)`}` : "Tài khoản gửi: chưa cài nên không có gì để rời",
          boChon ? "Nhóm này đang là nhóm gửi 2 → đã bỏ chọn và tắt. Vào nhóm đúng gõ <code>/nhomgui 2</code>." : "Nhóm này không phải nhóm gửi nào.",
        ].join("\n")
      );
      return;
    }
    const thu = text.match(/^\/guithu(?:@\w+)?\s+([\s\S]+)$/i);
    if (thu) {
      await sendMessage(chatId, esc(thu[1].trim()));
      return;
    }
    await sendMessage(chatId, await answer(text, isAdmin(chatId)), { replyTo: msg.message_id });
    return;
  }

  const name = msg.from?.first_name || "Không rõ tên";
  const username = msg.from?.username ?? null;
  const { user, isNew } = await requestAccess(chatId, name, username);

  if (user.status === "blocked") {
    await sendMessage(chatId, "🚫 Bạn không có quyền dùng bot này.");
    return;
  }

  await sendMessage(
    chatId,
    isNew
      ? "👋 Chào bạn! Yêu cầu đã gửi tới quản trị viên, chờ duyệt một chút nhé."
      : "⏳ Yêu cầu của bạn đang chờ quản trị viên duyệt."
  );

  // Only page the admins the first time. Later messages get the reminder
  // above, so someone tapping the bot repeatedly cannot spam anyone.
  if (!isNew) return;

  const admins = adminIds();
  if (admins.size === 0) {
    console.warn("[telegram] chưa cấu hình TELEGRAM_ADMIN_CHAT_IDS — không ai duyệt được");
    return;
  }

  const card = [
    "🔔 <b>Có người xin dùng bot</b>",
    "",
    `Tên: <b>${esc(name)}</b>`,
    username ? `Username: @${esc(username)}` : "Username: (không có)",
    `Chat ID: <code>${chatId}</code>`,
  ].join("\n");

  for (const admin of admins) {
    await sendMessage(admin, card, {
      buttons: [
        { text: "✅ Duyệt", data: `ok:${chatId}` },
        { text: "🚫 Từ chối", data: `no:${chatId}` },
      ],
    });
  }
}

async function handleTap(cb: TelegramCallback) {
  // A button is only as safe as the check behind it: the callback carries
  // whatever data the tapper's client sends, so re-verify who tapped.
  if (!isAdmin(cb.from.id)) {
    await answerCallback(cb.id, "Bạn không có quyền duyệt.");
    return;
  }

  const [action, target] = (cb.data ?? "").split(":");
  if (!target || (action !== "ok" && action !== "no")) {
    await answerCallback(cb.id);
    return;
  }

  const user = await setStatus(target, action === "ok" ? "allowed" : "blocked");
  if (!user) {
    await answerCallback(cb.id, "Không tìm thấy người này.");
    return;
  }

  const verdict = action === "ok" ? "✅ ĐÃ DUYỆT" : "🚫 ĐÃ TỪ CHỐI";
  await answerCallback(cb.id, verdict);

  // Turn the prompt into a record, so nobody taps it again later.
  if (cb.message) {
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      [
        verdict,
        "",
        `Tên: <b>${esc(user.name)}</b>`,
        user.username ? `Username: @${esc(user.username)}` : "Username: (không có)",
        `Chat ID: <code>${user.id}</code>`,
        "",
        `<i>Đổi ý: /duyet ${user.id} hoặc /cam ${user.id}</i>`,
      ].join("\n")
    );
  }

  await sendMessage(
    user.id,
    action === "ok"
      ? "✅ Bạn đã được duyệt! Gõ /help để xem bot làm được gì."
      : "🚫 Yêu cầu của bạn không được chấp nhận."
  );
}
