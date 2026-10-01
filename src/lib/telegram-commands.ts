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
import { baoCaoTheoThang } from "@/lib/profit-calculator";
import { forgetUser, loadUsers, setStatus } from "@/lib/telegram-users";
import { bangHieuLuc, taiKyDaXo } from "@/lib/da-bang";
import { chuoiChanLo, luatChanLo } from "@/lib/chan-lo";
import { docBuoc, trangThaiChanNgay } from "@/lib/chan-ngay-server";
import { docBotGui, docGoCua, guiNgay, luuBotGui, thuTaiKhoan, xemTruocGui } from "@/lib/bot-gui";
import { coTaiKhoanGui } from "@/lib/tele-user";
import { daGuiHomNay, gioVN, laGioHopLe } from "@/lib/bot-gui-thuan";
import { SO_O_DA, chiaKhoiChanDa, dongChanLq, khoiChanLq, nhomChanDa } from "@/lib/da";

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
        "",
        "<b>Bot gửi tự động (lô)</b>",
        "<code>/nhomgui</code> — gõ TRONG nhóm có bot nhận để chọn nhóm đó",
        "<code>/lichgui</code> — lịch, khung giờ, hôm nay đã gửi chưa",
        "<code>/xemgui mn</code> — xem chuỗi sẽ gửi (không gửi)",
        "<code>/batgui mn</code> · <code>/tatgui mn</code> — bật/tắt tự gửi một miền (hoặc <code>all</code>)",
        "<code>/guingay mn</code> — gửi ngay vào nhóm, không đợi giờ",
        "<code>/thutk 2d16b100, 15b50</code> — thử gửi một chuỗi bằng tài khoản người",
        "<code>/khunggio mn 15:30 16:05</code> · <code>/tiento mn 2d</code>",
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
    "<b>Báo cáo</b>",
    "<code>/baocao</code> — tháng này, cả 3 miền",
    "<code>/baocao 3</code> — ba tháng gần nhất",
    "",
    "<b>Số chặn</b>",
    "<code>/chanso</code> — số không nhận cược, cả 3 miền",
    "",
    "<b>Chặn lô 2 bước</b>",
    "<code>/chanlo</code> — cả 3 miền · <code>/chanlo mn</code> — riêng một miền",
    "<code>/channgay</code> — chặn theo ngày (bậc), ô nào trong lịch sẽ về 0",
    "",
    "<b>Chặn đá</b>",
    "<code>/chandamn</code> <code>/chandamt</code> <code>/chandamb</code> — cặp đá không nhận, dán vào phần mềm",
    "<code>/chanda</code> — cả 3 miền một lượt · <code>/chanda mn kl</code> — bản không lặp cặp",
    "<code>/chanda mn gon</code> — rút gọn theo mức đã cài · <code>gon80</code> = mức 80/99",
    "<code>/chanlq</code> — các con đá bị chặn tròn, cả 3 miền một tin",
    "",
    "<b>Thử bot gửi</b>",
    "<code>/guithu 2d16b100, 15b50</code> — bot nói lại nguyên văn chuỗi đó (thử xem bot nhận có hiểu không)",
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
  // Giữ dấu trừ: chat ID của nhóm là số ÂM. Cắt mất dấu thì không bao giờ khớp
  // nhóm nào — mà bot gửi tự động chính là dùng trong nhóm.
  const id = raw?.match(/-?\d+/)?.[0];
  if (!id) return "Thiếu chat ID. Ví dụ: <code>/duyet 123456789</code>";
  const user = await setStatus(id, status);
  if (!user) return `Không tìm thấy ai có ID <code>${esc(id)}</code>. Gõ /ai để xem danh sách.`;
  return `${STATUS_LABEL[status]} — <b>${esc(user.name)}</b> (<code>${user.id}</code>)`;
}

export async function removeUser(raw: string | undefined): Promise<string> {
  const id = raw?.match(/-?\d+/)?.[0];
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

/**
 * /chanda <miền> — lệnh chặn đá cho người ghi cược.
 *
 * Mỗi khối <code> là hai dòng: "/chanloai" rồi dòng đài — đúng mẫu tin khách
 * vẽ, dán nguyên cả hai. Bộ cắt tin coi cả khối là một dòng nên không đứt.
 * Có con chặn tròn thì khối ĐẦU là "/chanlq" (xem chanLqBot): các cặp dính
 * con tròn không nằm trong /chanloai nữa, nên phải dán cả hai.
 *
 * Khách dặn "3 lệnh riêng biệt nha a, e sợ Tele hạn chế ký tự", rồi chốt dạng
 * gọn: "số nào xếp vòng vào được với nhau thì cho theo vòng — các số không
 * theo vòng thì làm kiểu 01 10 dx0n 10 11 dx0n". Nên mỗi miền một lệnh, cặp
 * bị chặn gom thành vòng (nhomVong), và một miền mà dài quá thì cắt thành
 * nhiều khối — khối nào cũng là một chuỗi dán được trọn vẹn, không đứt giữa
 * vòng.
 *
 * Cặp nào bị chặn là do Bảng Tiền Đá trên web quyết (ô cài 0, hoặc luật tự
 * động "dưới phần ăn theo giá thì chặn"). Bot chỉ đọc ra, không sửa gì.
 */
export async function chanDa(region: Region, khongLap = false, epGon = false, epNguong: number | null = null): Promise<string> {
  const h = await bangHieuLuc(region);
  // Rút gọn theo cài đặt đã lưu trên web, hoặc ép bằng chữ "gon" (gon80 = mức 80) trong lệnh.
  const rutGon = epGon || h.luu.rutGon;
  const nguongGon = epNguong ?? h.luu.nguongGon;
  const { nhom, con100, capThem } = nhomChanDa(h.capChan, khongLap, rutGon, nguongGon);
  const lq = con100.length > 0 ? khoiChanLq([dongChanLq(provincePrefix(region), con100, region)]) : "";
  const khoi = [...(lq ? [lq] : []), ...chiaKhoiChanDa(provincePrefix(region), nhom, SAFE_BLOCK, region)];
  const soOChan = Object.values(h.bang).filter((v) => v <= 0).length;
  const soVong = nhom.filter((n) => n.length > 2).length;
  const soLe = nhom.filter((n) => n.length === 2).length;
  const head = [
    `<b>${label(region)} · chặn đá</b> · ${num(h.capChan.length)} cặp · ${soOChan}/${SO_O_DA} ô · ${con100.length} con chặn ${
      rutGon ? "tròn" : "100%"
    } + ${soVong} vòng + ${num(soLe)} cặp lẻ${khongLap ? " · không lặp" : ""}`,
    rutGon
      ? `<i>RÚT GỌN đang bật: con bị chặn từ ${nguongGon}/99 con trở lên thì chặn tròn cả con — chặn thêm ${num(capThem)} cặp lẽ ra nhận</i>`
      : "",
    con100.length > 0
      ? `<i>${con100.length} con chặn ${rutGon ? "tròn" : "100%"} đi lệnh <b>/chanlq</b> (khối đầu), cặp còn lại đi <b>/chanloai</b> — hai lệnh không chồng nhau, dán CẢ HAI mới chặn đủ</i>`
      : "",
    h.luu.tuDong
      ? `<i>luật đang bật (bước 1 ${h.luu.buoc1 ? "BẬT" : "tắt"} · bước 2 ${h.luu.buoc2 ? "BẬT" : "tắt"}): chặn ${h.luu.chanLuat.length} ô (giữ nguyên tới khi đổi), ${h.luu.moTay.length} ô mở tay${
          h.ngayCuoi ? ` · theo kỳ ${ddmm(h.ngayCuoi)}` : ""
        }</i>`
      : `<i>luật tự động đang tắt — theo bảng cài tay${h.ngayCuoi ? ` · theo kỳ ${ddmm(h.ngayCuoi)}` : ""}</i>`,
  ].filter(Boolean).join("\n");

  if (khoi.length === 0) return `${head}\n\nKhông có cặp nào bị chặn — bảng tiền đá đang nhận mọi ô.`;
  if (khoi.length === 1) return `${head}\n\n<code>${esc(khoi[0])}</code>`;

  // Mỗi khối một dòng nhãn + một <code>. Bộ chia tin nhắn cắt theo dòng, và
  // một khối luôn dưới mức cắt, nên không bao giờ đứt giữa thẻ <code>.
  return [
    head,
    `<i>${khoi.length} phần — dán lần lượt cả ${khoi.length}.</i>`,
    ...khoi.map((k, i) => `\n<i>phần ${i + 1}/${khoi.length}</i>\n<code>${esc(k)}</code>`),
  ].join("\n");
}

/**
 * /chanda không có miền: cả ba miền một lượt, Nam → Trung → Bắc. Đứng đầu là
 * MỘT khối /chanlq gom con chặn tròn của cả ba miền, rồi tới /chanloai từng miền.
 *
 * Khách đổi ý so với "3 lệnh riêng": "giờ a chia ra kiểu /chanlq, mn… mt…
 * mb…, chia thành nhiều tin, mỗi tin tối đa 4000 ký tự". Mỗi miền một dòng
 * nhãn ngắn rồi tới các khối <code>; bộ gửi cắt theo dòng ở 4000 nên một
 * khối (≤ 3400) không bao giờ bị đứt, và mỗi miền tự đứng riêng được.
 */
export async function chanDaTatCa(khongLap = false, epGon = false, epNguong: number | null = null): Promise<string> {
  const parts = await Promise.all(REGIONS.map(async (r) => ({ r, h: await bangHieuLuc(r) })));
  const out: string[] = [`<b>🎲 Chặn đá cả 3 miền</b>${khongLap ? " · không lặp cặp" : ""}${epGon ? " · rút gọn" : ""}`];
  const tinh = parts.map(({ r, h }) => {
    const rutGon = epGon || h.luu.rutGon;
    return { r, h, rutGon, ...nhomChanDa(h.capChan, khongLap, rutGon, epNguong ?? h.luu.nguongGon) };
  });
  const lq = khoiChanLq(tinh.filter((t) => t.con100.length > 0).map((t) => dongChanLq(provincePrefix(t.r), t.con100, t.r)));
  if (lq) {
    out.push("", "<b>Con chặn tròn</b> — lệnh /chanlq. Cặp dính các con này KHÔNG nằm trong /chanloai bên dưới, dán cả hai:", `<code>${esc(lq)}</code>`);
  }
  for (const { r, h, rutGon, nhom, con100, capThem } of tinh) {
    const khoi = chiaKhoiChanDa(provincePrefix(r), nhom, SAFE_BLOCK, r);
    const soVong = nhom.filter((n) => n.length > 2).length;
    const soLe = nhom.filter((n) => n.length === 2).length;
    out.push(
      "",
      `<b>${TEN_NGAN[r]}</b> · ${num(h.capChan.length)} cặp · ${con100.length} con ${rutGon ? `tròn (+${num(capThem)} cặp)` : "100%"} + ${soVong} vòng + ${num(soLe)} cặp lẻ${
        h.luu.tuDong ? "" : " · cài tay"
      }${khoi.length > 1 ? ` · ${khoi.length} phần` : ""}`
    );
    if (khoi.length === 0) out.push(con100.length > 0 ? "<i>không còn cặp lẻ nào — đã nằm hết trong /chanlq ở trên</i>" : "<i>không chặn cặp nào</i>");
    else out.push(...khoi.map((k) => `<code>${esc(k)}</code>`));
  }
  return out.join("\n");
}

/**
 * /chanlq [miền] — CHỈ các con đá bị chặn tròn, mọi miền trong MỘT khối, đúng
 * mẫu khách vẽ ("Khi e gõ /chanlq bot trả lại là: /chanlq ⏎ st tv …: 07 12 …
 * dx0n . ⏎ dnang …: … dx0n . ⏎ mb: … da0n ." — "dành cho các số đá bị chặn 100%").
 *
 * "Chặn tròn" theo đúng cài đặt đã lưu của từng miền: Rút gọn TẮT thì phải đủ
 * 99/99 con; BẬT thì từ mức đã chọn (vd 90/99) trở lên. "gon"/"gon80" ép mức.
 * Miền không có con nào thì không có dòng; cả ba trống thì nói rõ vì sao.
 */
export async function chanLqBot(regions: Region[], epGon = false, epNguong: number | null = null): Promise<string> {
  const tinh = await Promise.all(
    regions.map(async (r) => {
      const h = await bangHieuLuc(r);
      const rutGon = epGon || h.luu.rutGon;
      const nguong = rutGon ? (epNguong ?? h.luu.nguongGon) : 99;
      const { con100, capThem } = nhomChanDa(h.capChan, false, rutGon, nguong);
      return { r, con100, capThem, rutGon, nguong };
    })
  );
  const moTa = tinh
    .map((t) => `${TEN_NGAN[t.r]} ${t.con100.length} con (${t.rutGon ? `từ ${t.nguong}/99${t.capThem > 0 ? `, chặn thêm ${num(t.capThem)} cặp` : ""}` : "đủ 99/99"})`)
    .join(" · ");
  const lq = khoiChanLq(tinh.filter((t) => t.con100.length > 0).map((t) => dongChanLq(provincePrefix(t.r), t.con100, t.r)));
  if (!lq) {
    return [
      "<b>🎯 Con đá chặn tròn</b>",
      `<i>${moTa}</i>`,
      "",
      "Chưa có con nào bị chặn tròn. Rút gọn đang tắt thì một con phải bị chặn với đủ 99/99 con mới tính.",
      "Muốn tính cả con bị chặn gần hết: gõ <code>/chanlq gon90</code> (từ 90/99 con), hoặc bật ✂ Rút gọn ở Bảng Tiền Đá trên web.",
    ].join("\n");
  }
  return ["<b>🎯 Con đá chặn tròn</b>", `<i>${moTa}</i>`, "", `<code>${esc(lq)}</code>`].join("\n");
}

/**
 * /chanlo [miền] — chặn lô hai bước (xem chan-lo.ts): tổng thể về trên mức
 * chung, hoặc hai tháng gần nhất lỗ. Mỗi miền một khối <code> "đài: 05b0n
 * 17b0n …" — cùng cú pháp lô của phần mềm ghi cược. Không đổi hạn mức.
 */
export async function chanLoBot(regions: Region[]): Promise<string> {
  const parts = await Promise.all(regions.map(async (r) => ({ r, kq: luatChanLo(await taiKyDaXo(r), r, await docBuoc(r)) })));
  const out: string[] = [regions.length > 1 ? "<b>🚫 Chặn lô 2 bước — cả 3 miền</b>" : `<b>🚫 Chặn lô 2 bước — ${label(regions[0])}</b>`];
  for (const { r, kq } of parts) {
    const thang = kq.thang2.map((t) => `T${Number(t.slice(5))}`).join("+");
    out.push(
      "",
      `<b>${TEN_NGAN[r]}</b> · ${kq.chan.length}/100 lô · bước 1 (trên ${Math.round(kq.mucChung * 100)}/100 kỳ): ${kq.dem.tong + kq.dem.cahai} · bước 2 (${thang} lỗ): ${kq.dem.thang + kq.dem.cahai} · ${kq.soKy} kỳ${
        kq.denNgay ? ` tới ${ddmm(kq.denNgay)}` : ""
      }`
    );
    const chuoi = chuoiChanLo(provincePrefix(r), kq.chan);
    out.push(chuoi ? `<code>${esc(chuoi)}</code>` : "<i>không lô nào dính luật</i>");
  }
  return out.join("\n");
}

/**
 * /channgay [miền] — chặn theo ngày (bậc) hai bước: bậc nào dính luật, ô nào
 * trong lịch hạn mức sẽ về 0, và công tắc tự áp đang bật hay tắt. Chỉ đọc;
 * áp thật thì bấm trên web (hoặc bật tự áp).
 */
export async function chanNgayBot(regions: Region[]): Promise<string> {
  const parts = await Promise.all(regions.map(async (r) => ({ r, tt: await trangThaiChanNgay(r) })));
  const out: string[] = ["<b>🗓 Chặn theo ngày 2 bước</b>"];
  for (const { r, tt } of parts) {
    const thang = tt.kq.thang2.map((t) => `T${Number(t.slice(5))}`).join("+");
    out.push(
      "",
      `<b>${TEN_NGAN[r]}</b> · ${tt.kq.chan.length}/${tt.kq.bang.length} bậc dính luật (bước 1 ${tt.buoc.buoc1 ? "BẬT" : "tắt"}: ${tt.kq.dem.tong + tt.kq.dem.cahai} · bước 2 ${thang} ${tt.buoc.buoc2 ? "BẬT" : "tắt"}: ${tt.kq.dem.thang + tt.kq.dem.cahai}) · tự áp ${tt.auto ? "BẬT" : "tắt"}`,
      tt.kq.chan.length ? `chặn: ${esc(tt.kq.bang.filter((x) => x.lyDo).map((x) => x.ten).join(", "))}` : "<i>không bậc nào dính luật</i>",
      tt.doi.length ? `<i>lịch còn ${tt.doi.length} ô chưa về 0: ${esc(tt.doi.map((d) => `${d.o} (${d.tu})`).join(", "))} — áp trên web</i>` : "<i>lịch đã khớp luật</i>"
    );
  }
  return out.join("\n");
}

// ---- bot gửi tự động (lô) -------------------------------------------------

/** /lichgui — lịch và tình trạng của bot gửi. */
export async function lichGui(): Promise<string> {
  const [cfg, goCua] = await Promise.all([docBotGui(), docGoCua()]);
  const now = new Date();
  const phutTruoc = goCua ? Math.round((now.getTime() - new Date(goCua).getTime()) / 60_000) : null;
  const dongGoCua =
    goCua == null
      ? "Bộ hẹn giờ: <b>CHƯA từng gõ cửa</b> — chưa cài khoá CRON_SECRET trên GitHub nên bật lên cũng chưa tự gửi"
      : `Bộ hẹn giờ: gõ cửa lần cuối ${gioVN(new Date(goCua)).gio} ngày ${ddmm(gioVN(new Date(goCua)).ngay)} (${phutTruoc! < 120 ? `${phutTruoc} phút` : `${Math.round(phutTruoc! / 60)} giờ`} trước)`;
  const dong = REGIONS.map((r) => {
    const m = cfg.mien[r];
    const da = daGuiHomNay(now, cfg.daGui[r]);
    return `<b>${TEN_NGAN[r]}</b> · ${m.bat ? "✅ BẬT" : "⭕ tắt"} · ${m.tu}–${m.den} · tiền tố <code>${esc(m.tienTo)}</code> · hôm nay ${da ? `đã gửi lúc ${gioVN(new Date(cfg.daGui[r]!)).gio}` : "chưa gửi"}`;
  });
  return [
    "<b>🤖 Bot gửi tự động — lô</b>",
    cfg.nhom == null ? "Nhóm nhận: <b>CHƯA CHỌN</b> — vào nhóm có bot nhận rồi gõ <code>/nhomgui</code>" : `Nhóm nhận: <b>${esc(cfg.tenNhom ?? String(cfg.nhom))}</b>`,
    `Bây giờ: ${gioVN(now).gio} (giờ VN)`,
    coTaiKhoanGui()
      ? "Gửi bằng: <b>tài khoản người</b> (bot nhận đọc được)"
      : "Gửi bằng: <b>bot</b> — bot nhận sẽ KHÔNG thấy. Cài tài khoản gửi: xem <code>scripts/telegram-user-login.mjs</code>",
    dongGoCua,
    "",
    ...dong,
    "",
    "<i>Mỗi miền mỗi ngày gửi một lần, trong khung giờ. Dữ liệu thiếu kỳ thì không gửi mà báo quản trị.</i>",
  ].join("\n");
}

/** /xemgui <miền> — chuỗi sẽ gửi, hiện ngay tại đây, không gửi vào nhóm. */
export async function xemGui(region: Region): Promise<string> {
  const cfg = await docBotGui();
  const xt = await xemTruocGui(region, cfg);
  return [
    `<b>${label(region)} · chuỗi lô sẽ gửi</b> · ${xt.soLo} lô · ${xt.chuoi.length} ký tự`,
    xt.duLieu === "ok" ? "" : `<b>⚠️ ${esc(xt.duLieuChu)}</b> — lúc này bot sẽ KHÔNG tự gửi`,
    "",
    xt.chuoi ? `<code>${esc(xt.chuoi)}</code>` : "<i>không lô nào đang nhận</i>",
  ].filter((x) => x !== "").join("\n");
}

async function batTatGui(arg: string | undefined, bat: boolean): Promise<string> {
  const cfg = await docBotGui();
  const tatCa = arg === "all" || arg === "tatca";
  const region = parseRegion([arg]);
  if (!tatCa && !region) return `Thiếu miền. Ví dụ: <code>/${bat ? "batgui" : "tatgui"} mn</code> hoặc <code>all</code>`;
  if (bat && cfg.nhom == null) return "Chưa chọn nhóm nhận. Vào nhóm có bot nhận rồi gõ <code>/nhomgui</code> trước đã.";
  for (const r of tatCa ? REGIONS : [region!]) cfg.mien[r].bat = bat;
  await luuBotGui(cfg);
  return `${bat ? "✅ Đã BẬT" : "⭕ Đã tắt"} tự gửi ${tatCa ? "cả 3 miền" : label(region!)}.\n\n${await lichGui()}`;
}

async function datKhungGio(args: string[]): Promise<string> {
  const region = parseRegion([args[0]]);
  if (!region || !laGioHopLe(args[1]) || !laGioHopLe(args[2]) || args[1] > args[2]) {
    return "Cú pháp: <code>/khunggio mn 15:30 16:05</code> (giờ VN, dạng HH:MM, giờ đầu trước giờ cuối)";
  }
  const cfg = await docBotGui();
  cfg.mien[region].tu = args[1];
  cfg.mien[region].den = args[2];
  await luuBotGui(cfg);
  return `Đã đặt khung ${label(region)}: ${args[1]}–${args[2]}.\n<i>Lưu ý: máy gõ cửa theo lịch cố định quanh khung cũ; đổi khung lệch nhiều thì báo để chỉnh lịch gõ.</i>`;
}

async function datTienTo(region: Region | null, chuoi: string): Promise<string> {
  if (!region) return "Cú pháp: <code>/tiento mn 2d</code>";
  if (chuoi.length > 20) return "Tiền tố dài quá 20 ký tự.";
  const cfg = await docBotGui();
  cfg.mien[region].tienTo = chuoi;
  await luuBotGui(cfg);
  return `Đã đặt tiền tố ${label(region)}: <code>${esc(chuoi)}</code>\n\n${await xemGui(region)}`;
}

/**
 * Báo cáo theo tháng dương lịch, ba miền, mỗi tháng đứng riêng.
 *
 * Khách yêu cầu đúng khuôn: nhận − bù − lời lỗ (%) và một câu nhận định. Câu
 * nhận định là chỗ dễ nói dối nhất, nên nó không dựa vào dấu của con số mà dựa
 * vào việc con số đó có vượt ra ngoài biên độ tự nhiên của một tháng hay không.
 * Đo trên sổ thật, một tháng Miền Nam dao động ±4,03% quanh mức 0 — nên +3%
 * không phải "tốt lên", nó là một tháng bình thường.
 */
export async function baoCaoAll(soThang = 1): Promise<string> {
  const bc = await Promise.all(REGIONS.map((r) => baoCaoTheoThang(r)));
  const co = bc.filter((b) => b.cacThang.length > 0);
  if (co.length === 0) return "Chưa đủ dữ liệu để làm báo cáo tháng.";

  // Lấy các tháng mới nhất mà mọi miền đều có, để ba dòng nói về cùng một tháng.
  const chung = co
    .map((b) => b.cacThang.map((t) => t.thang))
    .reduce((a, b) => a.filter((x) => b.includes(x)));
  const lay = chung.slice(-Math.max(1, soThang));
  if (lay.length === 0) return "Ba miền chưa có tháng nào trùng nhau đủ dữ liệu.";

  const khoi = lay.map((thang) => {
    const [nam, thg] = thang.split("-");
    const dong = bc.map((b) => {
      const t = b.cacThang.find((x) => x.thang === thang);
      if (!t) return `<b>${TEN_NGAN[b.region]}:</b> chưa có dữ liệu`;
      const nhanDinh =
        Math.abs(t.phanTram) <= b.bienDo
          ? "trong khoảng bình thường"
          : t.phanTram > 0
          ? "<b>vượt lên trên</b> khoảng bình thường"
          : "<b>tụt xuống dưới</b> khoảng bình thường";
      return (
        `<b>${TEN_NGAN[b.region]}:</b> nhận ${trTien(t.thu)} − bù ${trTien(t.bu)} = ` +
        `<b>${t.lai >= 0 ? "+" : "−"}${trTien(Math.abs(t.lai))}</b> ` +
        `(${t.phanTram >= 0 ? "+" : "−"}${Math.abs(t.phanTram).toFixed(2)}%) · ${t.soKy} kỳ\n` +
        `   ${nhanDinh} — biên độ tự nhiên một tháng là ±${b.bienDo.toFixed(2)}%`
      );
    });
    // Dòng gộp là dòng đáng tin nhất: ba miền xổ độc lập nên nhiễu bù nhau,
    // dao động của sổ gộp chỉ còn quanh nửa so với nhìn riêng Miền Nam. Nhìn
    // riêng thì tháng nào cũng có một miền đỏ, dễ hoảng vì chuyện không có thật.
    const co = bc
      .map((b) => ({ b, t: b.cacThang.find((x) => x.thang === thang) }))
      .filter((x) => x.t);
    const gThu = co.reduce((s2, x) => s2 + x.t!.thu, 0);
    const gBu = co.reduce((s2, x) => s2 + x.t!.bu, 0);
    const gLai = gThu - gBu;
    const gPct = gThu > 0 ? (gLai / gThu) * 100 : 0;
    const gBien =
      gThu > 0
        ? (Math.sqrt(co.reduce((s2, x) => s2 + ((x.b.bienDo / 100) * x.t!.thu) ** 2, 0)) / gThu) * 100
        : 0;
    const gNhan =
      Math.abs(gPct) <= gBien
        ? "trong khoảng bình thường"
        : gPct > 0
        ? "<b>vượt lên trên</b> khoảng bình thường"
        : "<b>tụt xuống dưới</b> khoảng bình thường";
    const gopDong =
      `<b>GỘP 3 MIỀN:</b> nhận ${trTien(gThu)} − bù ${trTien(gBu)} = ` +
      `<b>${gLai >= 0 ? "+" : "−"}${trTien(Math.abs(gLai))}</b> ` +
      `(${gPct >= 0 ? "+" : "−"}${Math.abs(gPct).toFixed(2)}%)\n` +
      `   ${gNhan} — biên độ gộp ±${gBien.toFixed(2)}%`;

    return `<b>📅 Tháng ${Number(thg)}/${nam}</b>\n${dong.join("\n")}\n${gopDong}`;
  });

  return [
    ...khoi,
    "",
    "<i>Mỗi tháng đứng riêng, không cộng dồn. Một tháng nằm trong biên độ tự nhiên thì " +
      "chưa nói được là tốt lên hay đi xuống — cần vài tháng cùng chiều mới tính.</i>",
  ].join("\n\n");
}

/** 7.634.500.000 → "7.634,5tr" — cách người ta đọc sổ. */
function trTien(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  return Math.round(n).toLocaleString("vi-VN") + "đ";
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

    case "/baocao":
    case "/bc": {
      const n = Number(args[0]);
      return (await staleWarningAll()) + (await baoCaoAll(Number.isFinite(n) && n > 0 ? n : 1));
    }

    case "/chanso":
    case "/chan":
      return (await staleWarningAll()) + (await chanSoAll());

    // Ba lệnh không tham số cho menu Telegram (menu không mang được tham số).
    case "/chandamn":
      return withWarning("xsmn", (r) => chanDa(r, false));
    case "/chandamt":
      return withWarning("xsmt", (r) => chanDa(r, false));
    case "/chandamb":
      return withWarning("xsmb", (r) => chanDa(r, false));

    case "/channgay": {
      const region = parseRegion(args);
      if (!region) return (await staleWarningAll()) + (await chanNgayBot(REGIONS));
      return withWarning(region, (r) => chanNgayBot([r]));
    }

    case "/chanlo": {
      const region = parseRegion(args);
      if (!region) return (await staleWarningAll()) + (await chanLoBot(REGIONS));
      return withWarning(region, (r) => chanLoBot([r]));
    }

    case "/chanlq": {
      const region = parseRegion(args);
      const gonArg = args.map((a) => fold(a).match(/^(?:gon|rutgon|g)(\d{2})?$/)).find(Boolean);
      const epNguong = gonArg?.[1] ? Number(gonArg[1]) : null;
      if (!region) return (await staleWarningAll()) + (await chanLqBot(REGIONS, !!gonArg, epNguong));
      return withWarning(region, (r) => chanLqBot([r], !!gonArg, epNguong));
    }

    case "/chanda": {
      const region = parseRegion(args);
      // "/chanda mb khonglap" (hay kl, 1): không cặp nào ghi hai lần, đổi lại dài hơn.
      const khongLap = args.some((a) => /^(khonglap|khongtrung|kl|kt|1)$/.test(fold(a)));
      // "/chanda mn gon": ép rút gọn dù trên web đang tắt.
      const gonArg = args.map((a) => fold(a).match(/^(?:gon|rutgon|g)(\d{2})?$/)).find(Boolean);
      const epGon = !!gonArg;
      const epNguong = gonArg?.[1] ? Number(gonArg[1]) : null;
      if (!region) return (await staleWarningAll()) + (await chanDaTatCa(khongLap, epGon, epNguong));
      return withWarning(region, (r) => chanDa(r, khongLap, epGon, epNguong));
    }

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

    case "/lichgui":
      if (isAdmin) return lichGui();
      break;

    case "/xemgui": {
      if (!isAdmin) break;
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/xemgui mn</code>";
      return xemGui(region);
    }

    case "/batgui":
      if (isAdmin) return batTatGui(args[0], true);
      break;

    case "/tatgui":
      if (isAdmin) return batTatGui(args[0], false);
      break;

    case "/guingay": {
      if (!isAdmin) break;
      const region = parseRegion(args);
      if (!region) return "Thiếu miền. Ví dụ: <code>/guingay mn</code>";
      const r = await guiNgay(region);
      return `${r.ok ? "✅" : "⚠️"} ${label(region)}: ${esc(r.chu)}`;
    }

    case "/thutk": {
      if (!isAdmin) break;
      // Lấy chuỗi từ chữ gốc (giữ hoa thường, dấu phẩy, xuống dòng).
      const m = text.trim().match(/^\S+\s+([\s\S]+)$/);
      const r = await thuTaiKhoan(m ? m[1] : "");
      return `${r.ok ? "✅" : "⚠️"} ${esc(r.chu)}`;
    }

    case "/khunggio":
      if (isAdmin) return datKhungGio(args);
      break;

    case "/tiento": {
      if (!isAdmin) break;
      // Lấy tiền tố từ CHỮ GỐC (giữ hoa thường và dấu cách cuối do người gõ để trong ngoặc kép).
      const m = text.trim().match(/^\S+\s+\S+\s+([\s\S]+)$/);
      const tho = m ? m[1] : "";
      const chuoi = /^".*"$/.test(tho) ? tho.slice(1, -1) : tho;
      return datTienTo(parseRegion([args[0]]), chuoi);
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
