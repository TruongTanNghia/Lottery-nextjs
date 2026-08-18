/**
 * Thin Telegram Bot API client.
 *
 * Deliberately tiny: the bot only sends text back, so pulling in a framework
 * would add a dependency and a webhook abstraction we do not need. Everything
 * here is fetch + two formatting helpers.
 */

// Overridable so the webhook can be pointed at a stub during testing and the
// replies inspected without a real bot account. Unset in production.
const API_ROOT = process.env.TELEGRAM_API_ROOT || "https://api.telegram.org";

/** Telegram rejects anything longer; leave headroom for the split marker. */
const MAX_MESSAGE = 4000;

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Thiếu TELEGRAM_BOT_TOKEN");
  return t;
}

/** Telegram's HTML mode only special-cases these three. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Split on line boundaries so a limit table never breaks mid-row. A single
 * line longer than the cap (the 100-lô bet string has none) is hard-cut.
 */
export function splitMessage(text: string, max: number = MAX_MESSAGE): string[] {
  if (text.length <= max) return [text];

  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (line.length > max) {
      if (buf) (out.push(buf), (buf = ""));
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
      continue;
    }
    if (buf.length + line.length + 1 > max) {
      out.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** One row of tappable buttons under a message. */
export interface Button {
  text: string;
  /** Comes back verbatim as callback_query.data when tapped. */
  data: string;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { replyTo?: number; buttons?: Button[] } = {}
): Promise<void> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`${API_ROOT}/bot${token()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        // Bet strings are full of digits; Telegram happily turns some into
        // phone-number links otherwise.
        link_preview_options: { is_disabled: true },
        ...(opts.replyTo ? { reply_to_message_id: opts.replyTo } : {}),
        // Buttons ride on the last chunk only, so a split message does not
        // repeat the same approve/deny pair three times.
        ...(opts.buttons && chunk === chunks[chunks.length - 1]
          ? { reply_markup: { inline_keyboard: [opts.buttons.map((b) => ({ text: b.text, callback_data: b.data }))] } }
          : {}),
      }),
    });
    if (!res.ok) {
      // Logged, not thrown: one failed chunk must not stop the rest, and the
      // webhook still has to answer 200 or Telegram retries the whole update.
      console.error("[telegram] sendMessage failed:", res.status, await res.text());
    }
  }
}

/** The shape of the one update field we care about. */
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
}

/** Stops the little spinner on a tapped button. */
export async function answerCallback(id: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

/**
 * Rewrites an already-sent message, dropping its buttons.
 *
 * Used so an approval prompt turns into a record of what was decided instead
 * of staying tappable forever.
 */
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  });
}

async function call(method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_ROOT}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[telegram] ${method} failed:`, res.status, await res.text());
}

/** The callback_query field of an update, for button taps. */
export interface TelegramCallback {
  id: string;
  data?: string;
  from: { id: number; first_name?: string; username?: string };
  message?: { message_id: number; chat: { id: number } };
}
