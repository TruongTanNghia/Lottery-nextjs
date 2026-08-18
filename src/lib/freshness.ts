/**
 * How out of date the board is.
 *
 * The limits are only as good as the last draw they were computed from, and
 * nothing on screen used to say so — the header printed "KQ mới nhất: 13/08"
 * as a plain number, so a five-day-old board looked exactly like a fresh one.
 * Taking bets off a stale board is how real money gets lost.
 */

/** All three regions have drawn and published by this hour, Vietnam time. */
const DRAW_DONE_HOUR = 19;

export type FreshnessLevel = "ok" | "warn" | "alarm";

export interface Freshness {
  level: FreshnessLevel;
  /** Draws behind: 0 = current, 1 = missed one, and so on. */
  behind: number;
  /** The draw date we should already have. */
  expected: string;
  /** What we actually have, or null when nothing is scraped at all. */
  latest: string | null;
}

/** Today in Vietnam, as YYYY-MM-DD. */
export function vnToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function vnHour(now: Date = new Date()): number {
  return Number(
    now.toLocaleString("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hour12: false,
    })
  );
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
}

/**
 * The most recent draw that should already exist.
 *
 * Before the evening cutoff that is yesterday, so opening the board in the
 * morning does not scream about a draw that has not happened yet.
 */
export function expectedLatestDraw(now: Date = new Date()): string {
  const today = vnToday(now);
  return vnHour(now) >= DRAW_DONE_HOUR ? today : shiftDate(today, -1);
}

export function freshness(latest: string | null, now: Date = new Date()): Freshness {
  const expected = expectedLatestDraw(now);
  if (!latest) return { level: "alarm", behind: Infinity, expected, latest };

  // Negative would mean we somehow hold a future draw; treat that as current.
  const behind = Math.max(0, daysBetween(latest, expected));
  const level: FreshnessLevel = behind === 0 ? "ok" : behind === 1 ? "warn" : "alarm";
  return { level, behind, expected, latest };
}

/** One line for the header, the banner, or a bot reply. */
export function freshnessText(f: Freshness): string {
  if (f.level === "ok") return "Dữ liệu mới nhất";
  if (!f.latest) return "CHƯA CÓ DỮ LIỆU — đừng dùng để nhận cược";
  if (f.level === "warn") return `Thiếu kỳ ${fmt(f.expected)} — nên bấm Cập nhật KQ`;
  return `DỮ LIỆU CŨ ${f.behind} KỲ — ĐỪNG DÙNG SỐ NÀY ĐỂ NHẬN CƯỢC`;
}

function fmt(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export { fmt as formatDayMonth };
