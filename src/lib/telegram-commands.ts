/**
 * What the bot answers.
 *
 * Every number here comes from getLimitSummary() — the exact call the web
 * board uses. Nothing is recomputed locally, because a limit that disagrees
 * with the screen is worse than no bot at all.
 */
import {
  getLimitSummary,
  loadManualConfig,
  loadPairConfig,
  loadTopConfig,
  loadWatchConfig,
  type LimitSummaryItem,
} from "@/lib/limit-engine";
import { query } from "@/lib/db";
import { REGION_ICONS, REGION_LABELS, type Region } from "@/lib/types";
import { esc } from "@/lib/telegram";
import { forgetUser, loadUsers, setStatus } from "@/lib/telegram-users";

const REGIONS: Region[] = ["xsmn", "xsmb", "xsmt"];

/** Everything the operator might type for a region. */
const REGION_WORDS: Record<string, Region> = {
  mn: "xsmn", xsmn: "xsmn", nam: "xsmn", miennam: "xsmn",
  mb: "xsmb", xsmb: "xsmb", bac: "xsmb", mienbac: "xsmb",
  mt: "xsmt", xsmt: "xsmt", trung: "xsmt", mientrung: "xsmt",
};

/** Strips Vietnamese accents so "miền bắc" matches "mienbac". */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/**
 * Reads a region out of whatever came after the command.
 *
 * Takes the whole argument list because the operator types "miền nam" as two
 * words as readily as "mn": the joined form is tried first so "miennam"
 * matches, then each word on its own so a trailing "de" cannot spoil it.
 */
export function parseRegion(words: (string | undefined)[]): Region | null {
  const clean = words.filter((w): w is string => !!w).map((w) => fold(w).replace(/[^a-z]/g, ""));
  return REGION_WORDS[clean.join("")] ?? clean.map((w) => REGION_WORDS[w]).find(Boolean) ?? null;
}

function label(r: Region): string {
  return `${REGION_ICONS[r]} ${REGION_LABELS[r]}`;
}

/** 4350 → "4.350" — the grouping the operator reads on the board. */
function num(n: number): string {
  return n.toLocaleString("vi-VN");
}

function ddmm(date: string | null): string {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : "--";
}

/** Which of the four discount sources put this lô on the list. */
function reasons(l: LimitSummaryItem): string[] {
  const out: string[] = [];
  if (l.in_watch) out.push("nhịp");
  if (l.in_top) out.push("Top");
  if (l.in_manual) out.push("thủ công");
  if (l.in_pair) out.push(`cặp đảo ${l.pair_with}`);
  return out;
}

async function latestDrawDate(region: Region): Promise<string | null> {
  const rows = await query<{ d: string | null }>(
    "SELECT MAX(date) AS d FROM lo_daily WHERE region = ?",
    [region]
  );
  return rows[0]?.d ?? null;
}

// ---- /help --------------------------------------------------------------

export function helpText(isAdmin = false): string {
  const admin = isAdmin
    ? [
        "",
        "<b>Quản trị</b>",
        "<code>/ai</code> — ai đang dùng bot",
        "<code>/duyet 123456</code> — cho phép",
        "<code>/cam 123456</code> — chặn",
        "<code>/xoa 123456</code> — xoá hẳn khỏi danh sách",
      ]
    : [];
  return [
    "<b>🐔 Gà Con — tra hạn mức</b>",
    "",
    "<b>Tra một lô</b>",
    "<code>27</code> — gõ luôn 2 số, không cần lệnh",
    "<code>/hm 27</code> — hạn mức lô 27 cả 3 miền",
    "",
    "<b>Theo miền</b>",
    "<code>/mn</code> <code>/mb</code> <code>/mt</code> — tóm tắt miền",
    "<code>/copy mn</code> — chuỗi cược dán thẳng",
    "<code>/copy mn de</code> — kèm đề",
    "<code>/top mn</code> — các lô đang bị chia đôi",
    "<code>/kq mn</code> — kết quả kỳ mới nhất",
    "",
    "<i>Bot chỉ đọc số, không sửa gì. Muốn đổi cài đặt thì vào web.</i>",
    ...admin,
  ].join("\n");
}

// ---- lệnh quản trị ------------------------------------------------------

const STATUS_LABEL = {
  allowed: "✅ được dùng",
  pending: "⏳ chờ duyệt",
  blocked: "🚫 bị chặn",
} as const;

export async function userList(): Promise<string> {
  const users = await loadUsers();
  if (users.length === 0) return "Chưa có ai ngoài quản trị viên.";

  // Waiting first: that is the row the admin opened the list to act on.
  const order = { pending: 0, allowed: 1, blocked: 2 } as const;
  const rows = users
    .slice()
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
    .map(
      (u) =>
        `${STATUS_LABEL[u.status]}  <b>${esc(u.name)}</b>` +
        (u.username ? ` @${esc(u.username)}` : "") +
        `\n     <code>${u.id}</code> · từ ${u.since}`
    );

  const waiting = users.filter((u) => u.status === "pending").length;
  return [
    `<b>👥 ${users.length} người</b>` + (waiting ? ` · ${waiting} đang chờ duyệt` : ""),
    "",
    ...rows,
  ].join("\n");
}

export async function changeStatus(
  raw: string | undefined,
  status: "allowed" | "blocked"
): Promise<string> {
  const id = raw?.replace(/\D/g, "");
  if (!id) return "Thiếu chat ID. Ví dụ: <code>/duyet 123456789</code>";
  const user = await setStatus(id, status);
  if (!user) return `Không tìm thấy ai có ID <code>${esc(id)}</code>. Gõ /ai để xem danh sách.`;
  return `${STATUS_LABEL[status]} — <b>${esc(user.name)}</b> (<code>${user.id}</code>)`;
}

export async function removeUser(raw: string | undefined): Promise<string> {
  const id = raw?.replace(/\D/g, "");
  if (!id) return "Thiếu chat ID. Ví dụ: <code>/xoa 123456789</code>";
  return (await forgetUser(id))
    ? `Đã xoá <code>${esc(id)}</code>. Lần sau người này nhắn sẽ xin duyệt lại từ đầu.`
    : `Không tìm thấy ai có ID <code>${esc(id)}</code>.`;
}

// ---- /hm <lô> -----------------------------------------------------------

export async function loReport(lo: string): Promise<string> {
  const lines = [`<b>🎯 Lô ${esc(lo)}</b>`];

  for (const r of REGIONS) {
    const summary = await getLimitSummary(r);
    const item = summary.find((s) => s.lo_number === lo);
    if (!item) {
      lines.push("", `${label(r)} — chưa có dữ liệu`);
      continue;
    }

    const head =
      item.current_limit === 0
        ? "<b>0n</b> — khoá, không nhận"
        : `<b>${num(item.current_limit)}n</b>`;

    lines.push("", `${label(r)} · ${head}`);

    if (item.limit_before_tracking !== item.current_limit) {
      const why = reasons(item).join(", ") || "theo dõi";
      lines.push(`   ↓ từ ${num(item.limit_before_tracking)}n · ${esc(why)}`);
    }

    lines.push(
      `   chưa về ${item.rhythm.draws_since_last} kỳ · về ${item.recent_hits}/7 kỳ · KQ cuối ${ddmm(
        item.last_appeared_date
      )}`
    );
  }

  return lines.join("\n");
}

// ---- /mn /mb /mt --------------------------------------------------------

export async function regionReport(region: Region): Promise<string> {
  const [summary, watch, top, manual, pair, date] = await Promise.all([
    getLimitSummary(region),
    loadWatchConfig(region),
    loadTopConfig(region),
    loadManualConfig(region),
    loadPairConfig(region),
    latestDrawDate(region),
  ]);

  const open = summary.filter((l) => l.current_limit > 0);
  const locked = summary.length - open.length;
  const cut = summary.filter((l) => l.limit_before_tracking !== l.current_limit);
  const totalPoints = open.reduce((s, l) => s + l.current_limit, 0);

  const onOff = (on: boolean) => (on ? "BẬT" : "TẮT");

  return [
    `<b>${label(region)}</b> — KQ ${ddmm(date)}`,
    "",
    `Nhận cược: <b>${open.length}</b> lô · tổng <b>${num(totalPoints)}n</b>`,
    locked > 0 ? `Khoá (vừa về): ${locked} lô` : "Không có lô nào bị khoá",
    "",
    `<b>Đang giảm 50%: ${cut.length} lô</b>`,
    `   • Nhịp ${watch.min_gap}–${watch.max_gap} kỳ: ${onOff(watch.enabled)}` +
      (watch.enabled ? ` · chia đôi ${onOff(watch.halve)}` : ""),
    `   • Top ${top.size} ${top.dir === "cold" ? "ít ra" : "nhiều ra"}: ${onOff(top.enabled)}` +
      (top.enabled ? ` · chia đôi ${onOff(top.halve)}` : ""),
    `   • Thủ công: ${manual.los.length} lô` +
      (manual.los.length ? ` · chia đôi ${onOff(manual.halve)}` : ""),
    `   • Cặp đảo: ${onOff(pair.enabled)}`,
    "",
    `<i>/copy ${region.slice(2)} để lấy chuỗi cược</i>`,
  ].join("\n");
}

// ---- /copy <miền> [de] --------------------------------------------------

export async function copyString(region: Region, withDe: boolean): Promise<string> {
  const summary = await getLimitSummary(region);
  // A lô at 0 takes no bets, so listing it would only invite a typo.
  const rows = summary
    .filter((l) => l.current_limit > 0)
    .sort((a, b) => a.lo_number.localeCompare(b.lo_number));

  if (rows.length === 0) return `${label(region)} — không có lô nào nhận cược.`;

  // Same format as the web board's copy card, so a string from the bot and a
  // string from the screen are identical.
  const body = rows
    .map((l) =>
      withDe
        ? `${l.lo_number}b${l.current_limit}dd${l.current_limit}`
        : `${l.lo_number}b${l.current_limit}n`
    )
    .join(", ");

  const skipped = summary.length - rows.length;
  const total = rows.reduce((s, l) => s + l.current_limit, 0);

  return [
    `<b>${label(region)}</b> · ${rows.length} lô · tổng ${num(total)}n${withDe ? " · kèm đề" : ""}`,
    skipped > 0 ? `<i>bỏ qua ${skipped} lô đang khoá</i>` : "",
    "",
    `<code>${esc(body)}</code>`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- /top <miền> --------------------------------------------------------

export async function topReport(region: Region): Promise<string> {
  const [summary, cfg] = await Promise.all([getLimitSummary(region), loadTopConfig(region)]);
  const rows = summary
    .filter((l) => l.in_top)
    .sort((a, b) =>
      cfg.dir === "cold" ? a.recent_hits - b.recent_hits : b.recent_hits - a.recent_hits
    );

  const head = `<b>🏆 Top ${cfg.size} lô ${
    cfg.dir === "cold" ? "ÍT" : "NHIỀU"
  } ra nhất</b> — ${label(region)}`;

  if (!cfg.enabled) return `${head}\n\nĐang <b>TẮT</b> — hạn mức giữ nguyên.`;
  if (rows.length === 0) return `${head}\n\nChưa có dữ liệu.`;

  const body = rows.map((l) => {
    const cut =
      l.limit_before_tracking !== l.current_limit
        ? ` (từ ${num(l.limit_before_tracking)}n)`
        : "";
    return `<code>${l.lo_number}</code>  về ${l.recent_hits}/7 · <b>${num(
      l.current_limit
    )}n</b>${cut}`;
  });

  const saved = rows.reduce((s, l) => s + (l.limit_before_tracking - l.current_limit), 0);

  return [
    head,
    cfg.halve ? "7 kỳ gần nhất · đã chia đôi" : "7 kỳ gần nhất · chỉ theo dõi, không giảm",
    "",
    ...body,
    "",
    cfg.halve ? `Giảm tổng <b>${num(saved)}n</b> tiền nhận vào` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- /kq <miền> ---------------------------------------------------------

export async function resultsReport(region: Region): Promise<string> {
  const date = await latestDrawDate(region);
  if (!date) return `${label(region)} — chưa có kết quả nào.`;

  const rows = await query<{ lo_number: string }>(
    "SELECT lo_number FROM lo_daily WHERE region = ? AND date = ? ORDER BY lo_number",
    [region, date]
  );

  const los = rows.map((r) => r.lo_number);
  return [
    `<b>📋 KQ ${ddmm(date)}</b> — ${label(region)}`,
    `${los.length} lô về:`,
    "",
    `<code>${los.join(" ")}</code>`,
  ].join("\n");
}

// ---- router -------------------------------------------------------------

/**
 * Maps one incoming message to one answer.
 *
 * Lives here rather than in the route so it can be exercised directly, with
 * no HTTP and no Telegram account in the loop.
 */
export async function answer(text: string, isAdmin = false): Promise<string> {
  // "/copy@GaConBot mn" — group chats append the bot name to every command.
  const [head, ...rest] = text.trim().split(/\s+/);
  const cmd = head.toLowerCase().replace(/@.*$/, "");
  const args = rest.map((a) => a.toLowerCase());

  // Bare two digits is the most common question there is, so it needs no verb.
  if (/^\d{1,2}$/.test(cmd)) return loReport(cmd.padStart(2, "0"));

  switch (cmd) {
    case "/start":
    case "/help":
      return helpText(isAdmin);

    case "/hm":
    case "/lo": {
      if (!args[0]) return "Thiếu số lô. Ví dụ: <code>/hm 27</code>";
      const lo = args[0].replace(/\D/g, "");
      if (!lo || lo.length > 2) return "Lô phải là 2 chữ số. Ví dụ: <code>/hm 27</code>";
      return loReport(lo.padStart(2, "0"));
    }

    case "/mn":
      return regionReport("xsmn");
    case "/mb":
      return regionReport("xsmb");
    case "/mt":
      return regionReport("xsmt");

    case "/copy": {
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/copy mn</code> hoặc <code>/copy mn de</code>";
      const withDe = args.slice(1).some((a) => a === "de" || a === "dd");
      return copyString(region, withDe);
    }

    case "/top": {
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/top mn</code>";
      return topReport(region);
    }

    case "/kq": {
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/kq mn</code>";
      return resultsReport(region);
    }

    case "/ai":
      if (isAdmin) return userList();
      break;

    case "/duyet":
      if (isAdmin) return changeStatus(args[0], "allowed");
      break;

    case "/cam":
      if (isAdmin) return changeStatus(args[0], "blocked");
      break;

    case "/xoa":
      if (isAdmin) return removeUser(args[0]);
      break;
  }

  // Admin commands fall through to here for everyone else, so a normal user
  // gets the same answer as for a typo and learns nothing extra.
  return `Không hiểu lệnh <code>${esc(cmd)}</code>.\n\n${helpText(isAdmin)}`;
}
