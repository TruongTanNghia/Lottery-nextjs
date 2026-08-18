/**
 * POST /api/telegram/webhook — where Telegram delivers messages.
 *
 * This route sits OUTSIDE the cookie login (a bot has no browser session), so
 * it carries its own two locks:
 *
 *   1. the secret header Telegram echoes back, proving the caller is Telegram
 *   2. a whitelist of chat ids, proving the sender is someone we invited
 *
 * It also always answers 200. A non-200 makes Telegram retry the same update
 * for hours, which would replay every command.
 */
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/api-utils";
import {
  isAllowed,
  sendMessage,
  type TelegramMessage,
} from "@/lib/telegram";
import { answer } from "@/lib/telegram-commands";

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
    const msg: TelegramMessage | undefined = update?.message ?? update?.edited_message;
    const text = msg?.text?.trim();
    if (!msg || !text) return ok();

    const chatId = msg.chat.id;

    if (!isAllowed(chatId)) {
      // Telling them their own id is not a leak — Telegram shows it to any bot
      // they message — and it is the only practical way to get onboarded.
      await sendMessage(
        chatId,
        `🔒 Bạn chưa có quyền dùng bot này.\n\nChat ID của bạn: <code>${chatId}</code>\nGửi ID này cho quản trị viên để được thêm vào.`
      );
      return ok();
    }

    await ensureDb();
    await sendMessage(chatId, await answer(text), { replyTo: msg.message_id });
    return ok();
  } catch (err) {
    // Swallow and 200: a crash loop of Telegram retries is worse than a
    // dropped message, and the stack still reaches the Vercel log.
    console.error("[telegram] webhook error:", err);
    return ok();
  }
}
