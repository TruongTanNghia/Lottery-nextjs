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
import { provincePrefix } from "@/lib/provinces";
import { freshness, freshnessText } from "@/lib/freshness";
import { esc } from "@/lib/telegram";
import { forgetUser, loadUsers, setStatus } from "@/lib/telegram-users";

// Nam → Trung → Bắc, the order the bookie writes them in. Cosmetic, but the
// list is read side by side with theirs.
const REGIONS: Region[] = ["xsmn", "xsmt", "xsmb"];

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
    "<b>Lấy chuỗi cược</b>",
    "<code>/copy</code> — cả 3 miền một lượt",
    "<code>/copy de</code> — cả 3 miền, kèm đề",
    "<code>/copy mn</code> — riêng một miền",
    "",
    "<b>Số chặn</b>",
    "<code>/chanso</code> — số không nhận cược, cả 3 miền",
    "",
    "<b>Xem thêm</b>",
    "<code>/mn</code> <code>/mb</code> <code>/mt</code> — tóm tắt miền",
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

  // Spans all three regions, so it warns on the worst of them.
  const warn = await staleWarningAll();
  if (warn) lines.unshift(warn.trimEnd());

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

interface BetLine {
  /** The whole paste-ready string, provinces included. */
  line: string;
  count: number;
  total: number;
  skipped: number;
}

async function betLine(region: Region, withDe: boolean): Promise<BetLine | null> {
  const summary = await getLimitSummary(region);
  // A lô at 0 takes no bets, so listing it would only invite a typo.
  const rows = summary
    .filter((l) => l.current_limit > 0)
    .sort((a, b) => a.lo_number.localeCompare(b.lo_number));

  if (rows.length === 0) return null;

  // Same format as the web board's copy card, so a string from the bot and a
  // string from the screen are identical.
  const body = rows
    .map((l) =>
      withDe
        ? `${l.lo_number}b${l.current_limit}dd${l.current_limit}`
        : `${l.lo_number}b${l.current_limit}n`
    )
    .join(", ");

  return {
    // The province list rides inside the copied block, not above it: the point
    // is that whoever receives the pasted message knows which provinces it
    // covers without having to ask.
    line: `${provincePrefix(region)}: ${body}`,
    count: rows.length,
    total: rows.reduce((s, l) => s + l.current_limit, 0),
    skipped: summary.length - rows.length,
  };
}

export async function copyString(region: Region, withDe: boolean): Promise<string> {
  const bet = await betLine(region, withDe);
  if (!bet) return `${label(region)} — không có lô nào nhận cược.`;

  return [
    `<b>${label(region)}</b> · ${bet.count} lô · tổng ${num(bet.total)}n${
      withDe ? " · kèm đề" : ""
    }`,
    bet.skipped > 0 ? `<i>bỏ qua ${bet.skipped} lô đang khoá</i>` : "",
    "",
    `<code>${esc(bet.line)}</code>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * All three regions in one reply — what the operator actually sends out each
 * day, so making them ask three times was busywork.
 *
 * Each region keeps its own <code> block: Telegram copies a block on tap, and
 * if the message is long enough to be split it breaks between regions rather
 * than through the middle of a bet string.
 */
export async function copyAll(withDe: boolean): Promise<string> {
  const parts = await Promise.all(
    REGIONS.map(async (r) => ({ region: r, bet: await betLine(r, withDe) }))
  );

  const head = [
    `<b>📋 Chuỗi cược cả 3 miền</b>${withDe ? " · kèm đề" : ""}`,
    parts
      .map((p) =>
        p.bet ? `${REGION_ICONS[p.region]} ${p.bet.count} lô · ${num(p.bet.total)}n` : ""
      )
      .filter(Boolean)
      .join("   "),
  ].join("\n");

  const lines = parts.filter((p) => p.bet).map((p) => esc(p.bet!.line));
  if (lines.length === 0) return `${head}\n\nKhông miền nào có lô nhận cược.`;

  // One block, one tap, all three regions — that is the whole point of the
  // command. Only split it apart when the combined block would run past the
  // message limit, because a hard cut through a <code> tag makes Telegram
  // reject the message outright.
  const combined = lines.join("\n");
  const body =
    combined.length <= SAFE_BLOCK
      ? `<code>${combined}</code>`
      : lines.map((l) => `<code>${l}</code>`).join("\n\n");

  return `${head}\n\n${body}`;
}

/**
 * Số không nhận cược — hạn mức đang là 0.
 *
 * Ba dòng, không có gì khác. Khách chuyển tiếp thẳng tin này cho người ghi
 * cược, nên tiêu đề, số đếm và câu dặn dò đều là thứ họ phải ngồi xoá tay —
 * đúng nghĩa là mình bắt người dùng dọn rác của mình.
 *
 * Mỗi miền một khối <code> riêng: Telegram chạm một cái là chép được đúng
 * miền đó, không dính hai miền kia.
 */
export async function chanSoAll(): Promise<string> {
  const parts = await Promise.all(
    REGIONS.map(async (r) => {
      const summary = await getLimitSummary(r);
      const chan = summary
        .filter((l) => (l.current_limit ?? 0) <= 0)
        .map((l) => l.lo_number)
        .sort();
      return { region: r, chan };
    })
  );

  // Cả ba miền trống thì tin nhắn sẽ rỗng không. Đó là lúc duy nhất cần chữ:
  // im lặng ở đây thì người đọc tưởng bot hỏng.
  if (parts.every((p) => p.chan.length === 0)) {
    return "Chưa miền nào có số bị chặn — bảng hạn mức đang không để ngày nào về 0n.";
  }

  return parts
    .map((p) => {
      const ten = TEN_NGAN[p.region];
      if (p.chan.length === 0) return `<b>${ten}:</b> —`;
      return `<b>${ten}:</b> <code>${esc(p.chan.join(" "))}</code>`;
    })
    .join("\n");
}

/** Cách khách viết tắt miền khi đọc cho nhau. */
const TEN_NGAN: Record<Region, string> = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" };

/** Headroom under Telegram's 4096, leaving room for the header and warning. */
const SAFE_BLOCK = 3400;

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
/**
 * A red line above any answer built on an old draw.
 *
 * Pasting a bet string from a stale board costs real money, and on a phone
 * the date alone is far too easy to skim past — so the warning goes first,
 * before the numbers, every single time.
 */
async function withWarning(
  region: Region,
  build: (r: Region) => Promise<string>
): Promise<string> {
  return (await staleWarning(region)) + (await build(region));
}

async function staleWarning(region: Region): Promise<string> {
  return warningFor(freshness(await latestDrawDate(region)));
}

/**
 * Worst of the three, for answers that span every region: one stale region is
 * enough to make the whole reply misleading.
 */
async function staleWarningAll(): Promise<string> {
  const all = await Promise.all(
    REGIONS.map(async (r) => freshness(await latestDrawDate(r)))
  );
  return warningFor(all.sort((a, b) => b.behind - a.behind)[0]);
}

function warningFor(f: ReturnType<typeof freshness>): string {
  if (f.level === "ok") return "";
  return `${f.level === "alarm" ? "🔴" : "⚠️"} <b>${freshnessText(f)}</b>

`;
}

export async function answer(text: string, isAdmin = false): Promise<string> {
  // "/copy@GaConBot mn" — group chats append the bot name to every command.
  const [head, ...rest] = text.trim().split(/\s+/);
  const cmd = head.toLowerCase().replace(/@.*$/, "");
  const args = rest.map((a) => a.toLowerCase());

  // Undocumented on purpose: the bookie said the single-lô lookup is not
  // useful to them, so it is off the menu and out of /help — but typing it
  // still works rather than answering "unknown command" to an old habit.
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
      return withWarning("xsmn", regionReport);
    case "/mb":
      return withWarning("xsmb", regionReport);
    case "/mt":
      return withWarning("xsmt", regionReport);

    case "/copy": {
      const withDe = args.some((a) => a === "de" || a === "dd");
      const region = parseRegion(args);
      // No region named means all three — the common case, so it is the one
      // that needs no argument at all.
      if (!region) return (await staleWarningAll()) + (await copyAll(withDe));
      return withWarning(region, (r) => copyString(r, withDe));
    }

    case "/chanso":
    case "/chan":
      return (await staleWarningAll()) + (await chanSoAll());

    case "/top": {
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/top mn</code>";
      return withWarning(region, topReport);
    }

    case "/kq": {
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/kq mn</code>";
      return withWarning(region, resultsReport);
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
