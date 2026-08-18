/**
 * One-time Telegram bot setup.
 *
 *   node scripts/telegram-setup.mjs <BOT_TOKEN> <WEBHOOK_SECRET> [APP_URL]
 *
 * Points the bot at our webhook and registers the command menu so the
 * operator gets autocomplete instead of having to remember anything.
 *
 * Safe to re-run — setWebhook and setMyCommands both overwrite.
 */
const [token, secret, appUrl = "https://gacon.vercel.app"] = process.argv.slice(2);

if (!token || !secret) {
  console.error("Cách dùng: node scripts/telegram-setup.mjs <BOT_TOKEN> <WEBHOOK_SECRET> [APP_URL]");
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const me = await api("getMe", {});
if (!me.ok) {
  console.error("❌ Token sai:", me.description);
  process.exit(1);
}
console.log(`✅ Bot: @${me.result.username}`);

const hook = await api("setWebhook", {
  url: `${appUrl}/api/telegram/webhook`,
  secret_token: secret,
  // Anything else Telegram sends would only be dropped on the floor.
  allowed_updates: ["message", "edited_message"],
  drop_pending_updates: true,
});
console.log(hook.ok ? `✅ Webhook → ${appUrl}/api/telegram/webhook` : `❌ Webhook: ${hook.description}`);

const cmds = await api("setMyCommands", {
  commands: [
    { command: "hm", description: "Hạn mức 1 lô cả 3 miền — /hm 27" },
    { command: "mn", description: "Tóm tắt Miền Nam" },
    { command: "mb", description: "Tóm tắt Miền Bắc" },
    { command: "mt", description: "Tóm tắt Miền Trung" },
    { command: "copy", description: "Chuỗi cược — /copy mn" },
    { command: "top", description: "Lô đang bị chia đôi — /top mn" },
    { command: "kq", description: "Kết quả kỳ mới nhất — /kq mn" },
    { command: "help", description: "Hướng dẫn" },
  ],
});
console.log(cmds.ok ? "✅ Menu lệnh đã cài" : `❌ Menu: ${cmds.description}`);

const info = await api("getWebhookInfo", {});
console.log("\nTrạng thái:", JSON.stringify(info.result, null, 2));
