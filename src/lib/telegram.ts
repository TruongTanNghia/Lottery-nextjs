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

/**
 * Chats allowed to talk to the bot. A Telegram bot is public — anyone who
 * knows its @name can message it — so this list is the only thing standing
 * between a stranger and the limit board.
 *
 * Empty means nobody: fail closed, never open.
 */
export function allowedChats(): Set<string> {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isAllowed(chatId: number | string): boolean {
  return allowedChats().has(String(chatId));
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

export async function sendMessage(
  chatId: number | string,
  text: string,
  opts: { replyTo?: number } = {}
): Promise<void> {
  for (const chunk of splitMessage(text)) {
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
