/**
 * Turso (libSQL) client + schema bootstrap.
 * SQLite-compatible cloud DB; works on Vercel serverless without persistence
 * issues since Turso is the persistent layer (not the function filesystem).
 */
import { createClient, type Client, type ResultSet } from "@libsql/client";

export const VALID_REGIONS = ["xsmn", "xsmb", "xsmt"] as const;
export type Region = (typeof VALID_REGIONS)[number];

let _client: Client | null = null;
let _initialized = false;

export function getDb(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL env var is required");
  _client = createClient({ url, authToken });
  return _client;
}

export async function initDb(): Promise<void> {
  if (_initialized) return;
  const db = getDb();

  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS lottery_results (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         date TEXT NOT NULL,
         province TEXT NOT NULL,
         prize_type TEXT NOT NULL,
         number TEXT NOT NULL,
         lo_number TEXT NOT NULL,
         region TEXT NOT NULL DEFAULT 'xsmn',
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS lo_daily (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         date TEXT NOT NULL,
         lo_number TEXT NOT NULL,
         count INTEGER DEFAULT 1,
         region TEXT NOT NULL DEFAULT 'xsmn',
         UNIQUE(date, lo_number, region)
       )`,
      `CREATE TABLE IF NOT EXISTS lo_status (
         lo_number TEXT NOT NULL,
         region TEXT NOT NULL DEFAULT 'xsmn',
         last_appeared_date TEXT,
         days_since_last INTEGER DEFAULT 0,
         consecutive_days INTEGER DEFAULT 0,
         current_limit INTEGER DEFAULT 200,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (lo_number, region)
       )`,
      `CREATE TABLE IF NOT EXISTS scraped_dates (
         date TEXT NOT NULL,
         region TEXT NOT NULL DEFAULT 'xsmn',
         province_count INTEGER DEFAULT 0,
         scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (date, region)
       )`,
      `CREATE TABLE IF NOT EXISTS lottery_config (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_results_date ON lottery_results(date)`,
      `CREATE INDEX IF NOT EXISTS idx_results_region ON lottery_results(region)`,
      `CREATE INDEX IF NOT EXISTS idx_lo_daily_date ON lo_daily(date)`,
      `CREATE INDEX IF NOT EXISTS idx_lo_daily_region ON lo_daily(region)`,
    ],
    "write"
  );

  // Seed 100 lô × 3 regions
  for (const region of VALID_REGIONS) {
    const seedStmts = Array.from({ length: 100 }, (_, i) => ({
      sql: `INSERT OR IGNORE INTO lo_status (lo_number, region, days_since_last, consecutive_days, current_limit) VALUES (?, ?, 0, 0, 200)`,
      args: [String(i).padStart(2, "0"), region],
    }));
    await db.batch(seedStmts, "write");
  }

  _initialized = true;
}

// ─────────────────────────────────────────────
// Generic query helpers
// ─────────────────────────────────────────────

export async function query<T = Record<string, unknown>>(
  sql: string,
  args: (string | number | null)[] = []
): Promise<T[]> {
  const db = getDb();
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function exec(
  sql: string,
  args: (string | number | null)[] = []
): Promise<ResultSet> {
  const db = getDb();
  return db.execute({ sql, args });
}

// ─────────────────────────────────────────────
// Domain-specific helpers (mirror database.py)
// ─────────────────────────────────────────────

export interface LoStatus {
  lo_number: string;
  region: string;
  last_appeared_date: string | null;
  days_since_last: number;
  consecutive_days: number;
  current_limit: number;
}

export async function getAllLoStatus(region: Region): Promise<LoStatus[]> {
  return query<LoStatus>(
    "SELECT * FROM lo_status WHERE region = ? ORDER BY lo_number",
    [region]
  );
}

export async function getLoStatus(
  loNumber: string,
  region: Region
): Promise<LoStatus | null> {
  const rows = await query<LoStatus>(
    "SELECT * FROM lo_status WHERE lo_number = ? AND region = ?",
    [loNumber, region]
  );
  return rows[0] ?? null;
}

export async function updateLoStatus(args: {
  loNumber: string;
  region: Region;
  lastAppearedDate: string | null;
  daysSinceLast: number;
  consecutiveDays: number;
  currentLimit: number;
}): Promise<void> {
  await exec(
    `UPDATE lo_status
     SET last_appeared_date = ?, days_since_last = ?, consecutive_days = ?,
         current_limit = ?, updated_at = CURRENT_TIMESTAMP
     WHERE lo_number = ? AND region = ?`,
    [
      args.lastAppearedDate,
      args.daysSinceLast,
      args.consecutiveDays,
      args.currentLimit,
      args.loNumber,
      args.region,
    ]
  );
}

export async function getLoAppearedOnDate(
  date: string,
  region: Region
): Promise<Set<string>> {
  const rows = await query<{ lo_number: string }>(
    "SELECT lo_number FROM lo_daily WHERE date = ? AND region = ?",
    [date, region]
  );
  return new Set(rows.map((r) => r.lo_number));
}

export async function getAppearanceCounts(
  region: Region,
  targetDate: string,
  windowDays: number = 30
): Promise<Record<string, number>> {
  const targetDt = new Date(targetDate + "T00:00:00");
  const startDt = new Date(targetDt);
  startDt.setDate(startDt.getDate() - (windowDays - 1));
  const start = startDt.toISOString().slice(0, 10);

  const rows = await query<{ lo_number: string; appear_days: number }>(
    `SELECT lo_number, COUNT(DISTINCT date) as appear_days
     FROM lo_daily
     WHERE region = ? AND date >= ? AND date <= ?
     GROUP BY lo_number`,
    [region, start, targetDate]
  );

  const counts: Record<string, number> = {};
  for (let i = 0; i < 100; i++) counts[String(i).padStart(2, "0")] = 0;
  for (const r of rows) counts[r.lo_number] = r.appear_days;
  return counts;
}

export async function saveLotteryResults(args: {
  date: string;
  province: string;
  region: Region;
  results: { prize_type: string; number: string }[];
}): Promise<void> {
  const db = getDb();
  const stmts = args.results.flatMap((r) => {
    const number = r.number.trim();
    const lo = number.slice(-2);
    return [
      {
        sql: `INSERT INTO lottery_results (date, province, prize_type, number, lo_number, region) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [args.date, args.province, r.prize_type, number, lo, args.region],
      },
      {
        sql: `INSERT INTO lo_daily (date, lo_number, count, region) VALUES (?, ?, 1, ?)
              ON CONFLICT(date, lo_number, region) DO UPDATE SET count = count + 1`,
        args: [args.date, lo, args.region],
      },
    ];
  });

  if (stmts.length === 0) return;
  await db.batch(stmts, "write");

  await exec(
    `INSERT INTO scraped_dates (date, region, province_count) VALUES (?, ?, 1)
     ON CONFLICT(date, region) DO UPDATE SET province_count = province_count + 1`,
    [args.date, args.region]
  );
}

export async function isDateScraped(date: string, region: Region): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM scraped_dates WHERE date = ? AND region = ?",
    [date, region]
  );
  return rows.length > 0;
}

export async function getScrapedDates(region?: Region): Promise<{ date: string; region: string }[]> {
  if (region) {
    return query<{ date: string; region: string }>(
      "SELECT date, region FROM scraped_dates WHERE region = ? ORDER BY date DESC",
      [region]
    );
  }
  return query<{ date: string; region: string }>(
    "SELECT date, region FROM scraped_dates ORDER BY date DESC"
  );
}

/**
 * Wipe all data for a specific (date, region). Used before re-scraping
 * the same date to avoid duplicate rows / inflated counts.
 */
export async function deleteDataForDate(date: string, region: Region): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      { sql: "DELETE FROM lottery_results WHERE date = ? AND region = ?", args: [date, region] },
      { sql: "DELETE FROM lo_daily WHERE date = ? AND region = ?", args: [date, region] },
      { sql: "DELETE FROM scraped_dates WHERE date = ? AND region = ?", args: [date, region] },
    ],
    "write"
  );
}

export async function cleanupOldData(days: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let total = 0;
  for (const table of ["lottery_results", "lo_daily", "scraped_dates"]) {
    const r = await exec(`DELETE FROM ${table} WHERE date < ?`, [cutoffStr]);
    total += r.rowsAffected;
  }
  return total;
}

// ─────────────────────────────────────────────
// Config (key/value)
// ─────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM lottery_config WHERE key = ?",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  await exec(
    `INSERT INTO lottery_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}
