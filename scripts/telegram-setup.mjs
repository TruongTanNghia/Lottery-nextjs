/**
 * One-time Telegram bot setup.
 *
 *   node --env-file=.env.local scripts/telegram-setup.mjs
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment,
 * so the token can live in .env.local (gitignored) instead of shell history.
 * Passing them as arguments still works when there is no env file around.
 *
 * Points the bot at our webhook and registers the command menu so the
 * operator gets autocomplete instead of having to remember anything.
 *
 * Safe to re-run — setWebhook and setMyCommands both overwrite.
 *
 *   node --env-file=.env.local scripts/telegram-setup.mjs --chi-menu
 *
 * only re-registers the command menu and leaves the webhook alone — for when
 * a menu entry changes and nothing else should be touched.
 */
const chiMenu = process.argv.includes("--chi-menu");
const [argToken, argSecret, argUrl] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const token = argToken || process.env.TELEGRAM_BOT_TOKEN;
const secret = argSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
// NEXT_PUBLIC_APP_URL is whatever the local .env points at, which in dev is
// http://localhost — Telegram only accepts https, so it is used only when it
// actually qualifies rather than silently producing a confusing rejection.
const envUrl = process.env.NEXT_PUBLIC_APP_URL;
const appUrl =
  argUrl || (envUrl?.startsWith("https://") ? envUrl : "https://gacon.vercel.app");

if (!token || !secret) {
  console.error("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_WEBHOOK_SECRET.");
  console.error("Cách 1: điền vào .env.local rồi chạy");
  console.error("  node --env-file=.env.local scripts/telegram-setup.mjs");
  console.error("Cách 2: node scripts/telegram-setup.mjs <TOKEN> <SECRET> [APP_URL]");
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

if (!chiMenu) {
  const hook = await api("setWebhook", {
    url: `${appUrl}/api/telegram/webhook`,
    secret_token: secret,
    // callback_query carries the Duyệt / Từ chối button taps; anything else
    // Telegram sends would only be dropped on the floor.
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: true,
  });
  if (hook.ok) {
    console.log(`✅ Webhook → ${appUrl}/api/telegram/webhook`);
  } else {
    console.error(`❌ Webhook: ${hook.description}`);
    process.exitCode = 1;
  }
}

const cmds = await api("setMyCommands", {
  commands: [
    { command: "copy", description: "Chuỗi cược CẢ 3 MIỀN — /copy hoặc /copy de" },
    { command: "baocao", description: "Báo cáo tháng — 3 miền, nhận/bù/lời lỗ" },
    { command: "chanso", description: "Số chặn — không nhận cược, cả 3 miền" },
    // The bookie asked for the three region summaries and /top to go, and
    // three đá-block commands in their place. Menu entries cannot carry an
    // argument, so each region gets its own command; /mn /mb /mt /top still
    // answer when typed, they are just off the menu.
    { command: "chandamn", description: "Chặn đá Miền Nam — dán vào phần mềm" },
    { command: "chandamt", description: "Chặn đá Miền Trung — dán vào phần mềm" },
    { command: "chandamb", description: "Chặn đá Miền Bắc — dán vào phần mềm" },
    { command: "kq", description: "Kết quả kỳ mới nhất — /kq mn" },
    { command: "help", description: "Hướng dẫn" },
    { command: "ai", description: "Ai đang dùng bot (quản trị)" },
  ],
});
console.log(cmds.ok ? "✅ Menu lệnh đã cài" : `❌ Menu: ${cmds.description}`);

const info = await api("getWebhookInfo", {});
console.log("\nTrạng thái:", JSON.stringify(info.result, null, 2));
