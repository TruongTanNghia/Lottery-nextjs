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
  sendMessage,
  type TelegramCallback,
  type TelegramMessage,
} from "@/lib/telegram";
import { answer } from "@/lib/telegram-commands";
import { adminIds, canUse, isAdmin, requestAccess, setStatus } from "@/lib/telegram-users";

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
