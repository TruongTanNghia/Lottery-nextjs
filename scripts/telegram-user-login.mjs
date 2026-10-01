/**
 * Đăng nhập MỘT LẦN một tài khoản Telegram (số phụ) để lấy "chuỗi phiên" cho
 * bot gửi tự động. Chạy trên máy mình, trong cửa sổ lệnh:
 *
 *   node scripts/telegram-user-login.mjs
 *
 * Nó sẽ hỏi lần lượt: api_id, api_hash (lấy ở https://my.telegram.org →
 * API development tools, đăng nhập bằng CHÍNH số phụ đó), số điện thoại, mã
 * Telegram gửi về, và mật khẩu 2 lớp nếu có. Cuối cùng in ra ba dòng để dán
 * vào Vercel → Settings → Environment Variables.
 *
 * - Dùng SỐ PHỤ. Chuỗi phiên là toàn quyền với tài khoản: đọc hết tin, nhắn
 *   thay mặt. Đừng gửi nó qua chat, đừng ghi vào file trong repo (repo công khai).
 * - Script này không lưu gì xuống đĩa và không gửi chuỗi đi đâu ngoài Telegram.
 * - Muốn thu hồi: Telegram → Cài đặt → Thiết bị → kết thúc phiên "gacon-bot-gui".
 */
import readline from "node:readline";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const hoi = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
// Bấm Ctrl+C / đóng cửa sổ giữa chừng: thoát gọn, không treo.
let xong = false;
rl.on("close", () => {
  if (!xong) {
    console.error("\nĐã huỷ — chưa đăng nhập, không có gì được lưu.");
    process.exit(1);
  }
});

const apiId = Number(await hoi("api_id (số): "));
const apiHash = await hoi("api_hash: ");
if (!Number.isInteger(apiId) || apiId <= 0 || !/^[0-9a-f]{32}$/i.test(apiHash)) {
  console.error("\napi_id phải là số, api_hash là 32 ký tự 0-9a-f. Lấy ở https://my.telegram.org");
  xong = true;
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
  deviceModel: "gacon-bot-gui",
  systemVersion: "1.0",
  appVersion: "1.0",
});
client.setLogLevel("none");

try {
  await client.start({
    phoneNumber: () => hoi("Số điện thoại (dạng +84...): "),
    phoneCode: () => hoi("Mã Telegram vừa gửi: "),
    password: () => hoi("Mật khẩu 2 lớp (không có thì Enter): "),
    onError: (e) => console.error("Lỗi:", e.message),
  });
  const toi = await client.getMe();
  const phien = client.session.save();
  console.log(`\nĐăng nhập xong: ${toi.firstName ?? ""} ${toi.username ? "@" + toi.username : ""} (${toi.phone ?? ""})`);
  console.log("\nDán BA dòng sau vào Vercel → Settings → Environment Variables (Production), rồi Redeploy:\n");
  console.log(`TELEGRAM_API_ID=${apiId}`);
  console.log(`TELEGRAM_API_HASH=${apiHash}`);
  console.log(`TELEGRAM_USER_SESSION=${phien}`);
  console.log("\nSau đó: thêm tài khoản này vào nhóm có bot nhận, và nhắn bot /thutk 2d16b100, 15b50 để thử.");
  console.log("ĐỪNG gửi các dòng trên qua chat hay ghi vào file trong repo.");
} catch (e) {
  console.error("\nĐăng nhập không được:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  xong = true;
  rl.close();
  await client.destroy().catch(() => {});
}
