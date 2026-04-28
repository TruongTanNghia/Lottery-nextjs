/**
 * Lottery Scraper — port of backend/scraper.py
 *
 * - XSMN: xsmn.mobi (multi-province table.colgiai)
 * - XSMB: xskt.com.vn (table.result#MB0)
 * - XSMT: xskt.com.vn (table.tbl-xsmn#MT0)
 *
 * Uses Cheerio (jQuery-like server-side HTML parsing).
 */
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import {
  isDateScraped,
  saveLotteryResults,
  VALID_REGIONS,
  type Region,
} from "./db";

const XSMN_BASE = "https://xsmn.mobi";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

const PRIZE_PATTERNS: [RegExp, string][] = [
  [/^(?:G\.?\s*)?(?:DB|ĐB|Đặc biệt|đặc biệt)/i, "G.DB"],
  [/^G\.?\s*8/i, "G.8"],
  [/^G\.?\s*7/i, "G.7"],
  [/^G\.?\s*6/i, "G.6"],
  [/^G\.?\s*5/i, "G.5"],
  [/^G\.?\s*4/i, "G.4"],
  [/^G\.?\s*3/i, "G.3"],
  [/^G\.?\s*2/i, "G.2"],
  [/^G\.?\s*1/i, "G.1"],
];

function normPrize(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  for (const [re, out] of PRIZE_PATTERNS) {
    if (re.test(trimmed)) return out;
  }
  return null;
}

async function fetchPage(url: string, retries: number = 2): Promise<string | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(8_000),  // 8s timeout per fetch
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.log(`[Scraper] attempt ${attempt + 1}/${retries} failed for ${url}: ${err}`);
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

function extractNumbersFromCell($: cheerio.CheerioAPI, cell: cheerio.Cheerio<Element>): string[] {
  const numbers: string[] = [];
  // Method 1: child elements
  cell.find("div, span, p, em").each((_, el) => {
    const $el = $(el);
    if ($el.find("div, span, p, em").length > 0) return; // skip containers
    const text = $el.text().trim();
    if (text && /^\d+$/.test(text) && text.length >= 2) numbers.push(text);
  });
  // Method 2: split text
  if (numbers.length === 0) {
    const text = cell.text().trim();
    for (const part of text.split(/[\s,\-;]+/)) {
      if (part && /^\d+$/.test(part) && part.length >= 2) numbers.push(part);
    }
  }
  // Method 3: regex
  if (numbers.length === 0) {
    const found = cell.text().match(/\b\d{2,6}\b/g);
    if (found) numbers.push(...found);
  }
  return numbers;
}

// ─────────────────────────────────────────────
// XSMN (Mien Nam) — xsmn.mobi
// ─────────────────────────────────────────────

function parseXsmnPage(html: string): Record<string, { prize_type: string; number: string }[]> {
  const $ = cheerio.load(html);
  const results: Record<string, { prize_type: string; number: string }[]> = {};

  $("table.colgiai").each((_, table) => {
    parseMultiProvinceTable($, $(table), results);
  });

  return results;
}

function parseMultiProvinceTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<Element>,
  results: Record<string, { prize_type: string; number: string }[]>
): void {
  const provinces: string[] = [];
  const headerRow = table.find("tr.header").first();
  if (headerRow.length) {
    headerRow.find("th").each((_, th) => {
      const $th = $(th);
      const link = $th.find("a").first();
      const name = (link.length ? link.text() : $th.text()).trim();
      if (name && !/^\d+$/.test(name) && name.length > 1) provinces.push(name);
    });
  }

  for (const p of provinces) if (!results[p]) results[p] = [];

  table.find("tr").each((_, row) => {
    const $row = $(row);
    if ($row.hasClass("header")) return;
    const cells = $row.find("td");
    if (cells.length === 0) return;

    let prizeCell = $row.find("td.txt-giai").first();
    if (!prizeCell.length && cells.length >= 2) prizeCell = cells.eq(0);
    if (!prizeCell.length) return;

    const prizeType = normPrize(prizeCell.text());
    if (!prizeType) return;

    let valueCells = $row.find("td.v-giai");
    if (!valueCells.length) valueCells = cells.slice(1);

    valueCells.each((idx, cell) => {
      const prov = provinces[idx] ?? `Province_${idx + 1}`;
      if (!results[prov]) results[prov] = [];
      for (const num of extractNumbersFromCell($, $(cell))) {
        results[prov].push({ prize_type: prizeType, number: num });
      }
    });
  });
}

async function scrapeXsmnDay(date: Date, force: boolean = false): Promise<Record<string, { prize_type: string; number: string }[]> | null> {
  const dateStr = date.toISOString().slice(0, 10);
  if (!force && await isDateScraped(dateStr, "xsmn")) return null;

  const url = `${XSMN_BASE}/xsmn-${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}.html`;
  console.log(`[XSMN] Fetching ${url}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const results = parseXsmnPage(html);
  if (Object.keys(results).length > 0) {
    for (const [prov, nums] of Object.entries(results)) {
      if (nums.length > 0) {
        await saveLotteryResults({ date: dateStr, province: prov, region: "xsmn", results: nums });
      }
    }
    const total = Object.values(results).reduce((s, v) => s + v.length, 0);
    console.log(`[XSMN] ${dateStr}: ${Object.keys(results).length} provinces, ${total} numbers`);
  }
  return results;
}

// ─────────────────────────────────────────────
// XSMB (Mien Bac) — xskt.com.vn
// ─────────────────────────────────────────────

function parseXsmbPage(html: string): Record<string, { prize_type: string; number: string }[]> {
  const $ = cheerio.load(html);
  const results: Record<string, { prize_type: string; number: string }[]> = { "Mien Bac": [] };

  const labelMap: Record<string, string> = {
    "ĐB": "G.DB", DB: "G.DB", "Đ.B": "G.DB",
    "Mã ĐB": "MA_DB",
    G1: "G.1", G2: "G.2", G3: "G.3", G4: "G.4",
    G5: "G.5", G6: "G.6", G7: "G.7",
  };

  // Try xsmn.mobi pattern first: table.colgiai (same as XSMN)
  let table = $("table.colgiai").first();
  // Fallback: legacy xskt.com.vn pattern
  if (!table.length) table = $('table.result[id^="MB"]').first();
  if (!table.length) table = $("table.result").first();
  if (!table.length) return results;

  table.find("tr").each((_, row) => {
    const $row = $(row);
    if ($row.hasClass("header")) return;
    const cells = $row.find("td");
    if (cells.length < 2) return;

    // xsmn.mobi uses td.txt-giai for label; legacy uses cells.eq(0)
    let labelCell = $row.find("td.txt-giai").first();
    if (!labelCell.length) labelCell = cells.eq(0);
    const labelText = labelCell.text().trim();
    const titleAttr = labelCell.attr("title") || "";

    let prizeType = normPrize(labelText) || normPrize(titleAttr);
    if (!prizeType) {
      const cleaned = labelText.replace(/[\s.]/g, "");
      prizeType = labelMap[cleaned] ?? labelMap[labelText] ?? null;
    }
    if (!prizeType || prizeType === "MA_DB") return;

    // xsmn.mobi: td.v-giai may have multiple value cells; legacy: cells.slice(1)
    let valueCells = $row.find("td.v-giai");
    if (!valueCells.length) valueCells = cells.slice(1);

    valueCells.each((_, cell) => {
      for (const num of extractNumbersFromCell($, $(cell))) {
        results["Mien Bac"].push({ prize_type: prizeType!, number: num });
      }
    });
  });

  return results;
}

async function scrapeXsmbDay(date: Date, force: boolean = false): Promise<Record<string, { prize_type: string; number: string }[]> | null> {
  const dateStr = date.toISOString().slice(0, 10);
  if (!force && await isDateScraped(dateStr, "xsmb")) return null;

  // xsmn.mobi pattern: xsmb-{d}-{m}-{y}.html
  const url = `${XSMN_BASE}/xsmb-${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}.html`;
  console.log(`[XSMB] Fetching ${url}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const results = parseXsmbPage(html);
  if (results["Mien Bac"]?.length > 0) {
    await saveLotteryResults({
      date: dateStr,
      province: "Mien Bac",
      region: "xsmb",
      results: results["Mien Bac"],
    });
    console.log(`[XSMB] ${dateStr}: ${results["Mien Bac"].length} numbers`);
  }
  return results;
}

// ─────────────────────────────────────────────
// XSMT (Mien Trung) — xskt.com.vn
// ─────────────────────────────────────────────

const XSMT_PROVINCES = [
  "Thừa Thiên Huế", "Huế", "Đà Nẵng", "Khánh Hòa", "Bình Định",
  "Quảng Bình", "Quảng Trị", "Quảng Nam", "Quảng Ngãi", "Ninh Thuận",
  "Phú Yên", "Gia Lai", "Đắk Lắk", "Đắk Nông", "Kon Tum",
];

function parseXsmtPage(html: string): Record<string, { prize_type: string; number: string }[]> {
  const $ = cheerio.load(html);
  const results: Record<string, { prize_type: string; number: string }[]> = {};

  // xsmn.mobi uses table.colgiai (same as XSMN), legacy xskt.com.vn uses table.tbl-xsmn
  let table = $("table.colgiai").first();
  if (!table.length) table = $('table.tbl-xsmn[id^="MT"]').first();
  if (!table.length) table = $("table.tbl-xsmn").first();
  if (!table.length) {
    $("table").each((_, t) => {
      const txt = $(t).text();
      if (XSMT_PROVINCES.slice(0, 5).some((p) => txt.includes(p))) {
        table = $(t);
        return false;
      }
    });
  }
  if (!table.length) return results;

  // If table.colgiai found → use same multi-province parser as XSMN
  if (table.hasClass("colgiai")) {
    parseMultiProvinceTable($, table, results);
    // Drop empty provinces
    for (const p of Object.keys(results)) {
      if (results[p].length === 0) delete results[p];
    }
    return results;
  }

  // Extract provinces from header
  const provinces: string[] = [];
  table.find("tr").each((_, row) => {
    const $row = $(row);
    const ths = $row.find("th");
    if (ths.length === 0) return;
    ths.each((_, th) => {
      const $th = $(th);
      const link = $th.find("a").first();
      const name = (link.length ? link.text() : $th.text()).trim();
      if (name && !/^\d+$/.test(name) && name.length > 1) {
        const skipPatterns = ["Giải", "ĐB", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "Thứ", "XSMT", "XS"];
        if (!skipPatterns.some((s) => name.includes(s))) {
          provinces.push(name);
        }
      }
    });
    if (provinces.length > 0) return false;
  });

  if (provinces.length === 0) return results;
  for (const p of provinces) results[p] = [];

  const labelMap: Record<string, string> = {
    "ĐB": "G.DB", DB: "G.DB", G8: "G.8",
    G1: "G.1", G2: "G.2", G3: "G.3", G4: "G.4",
    G5: "G.5", G6: "G.6", G7: "G.7",
  };

  table.find("tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    if (cells.length < 2) return;

    const labelText = cells.eq(0).text().trim();
    const titleAttr = cells.eq(0).attr("title") || "";
    let prizeType = normPrize(labelText) || normPrize(titleAttr);
    if (!prizeType) prizeType = labelMap[labelText.replace(/[. ]/g, "")] ?? null;
    if (!prizeType) return;

    cells.slice(1).each((idx, cell) => {
      if (idx >= provinces.length) return;
      const prov = provinces[idx];
      for (const num of extractNumbersFromCell($, $(cell))) {
        results[prov].push({ prize_type: prizeType, number: num });
      }
    });
  });

  // Drop empty provinces
  for (const p of Object.keys(results)) {
    if (results[p].length === 0) delete results[p];
  }
  return results;
}

async function scrapeXsmtDay(date: Date, force: boolean = false): Promise<Record<string, { prize_type: string; number: string }[]> | null> {
  const dateStr = date.toISOString().slice(0, 10);
  if (!force && await isDateScraped(dateStr, "xsmt")) return null;

  // xsmn.mobi pattern: xsmt-{d}-{m}-{y}.html
  const url = `${XSMN_BASE}/xsmt-${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}.html`;
  console.log(`[XSMT] Fetching ${url}`);
  const html = await fetchPage(url);
  if (!html) return null;

  const results = parseXsmtPage(html);
  if (Object.keys(results).length > 0) {
    for (const [prov, nums] of Object.entries(results)) {
      if (nums.length > 0) {
        await saveLotteryResults({ date: dateStr, province: prov, region: "xsmt", results: nums });
      }
    }
    const total = Object.values(results).reduce((s, v) => s + v.length, 0);
    console.log(`[XSMT] ${dateStr}: ${Object.keys(results).length} provinces, ${total} numbers`);
  }
  return results;
}

// ─────────────────────────────────────────────
// Unified API
// ─────────────────────────────────────────────

export async function scrapeDay(date: Date, region: Region, force: boolean = false): Promise<unknown> {
  if (region === "xsmb") return scrapeXsmbDay(date, force);
  if (region === "xsmt") return scrapeXsmtDay(date, force);
  return scrapeXsmnDay(date, force);
}

export async function scrapeTodayForce(region: Region): Promise<unknown> {
  // Always force re-scrape — bypass isDateScraped cache so refresh works
  // even if today was already scraped (e.g., before draws finished).
  return scrapeDay(new Date(), region, true);
}

export async function scrapeRange(
  start: Date,
  end: Date,
  region: Region,
  delayMs: number = 600
): Promise<number> {
  let count = 0;
  let cur = new Date(start);
  while (cur <= end) {
    const r = await scrapeDay(new Date(cur), region);
    if (r) count++;
    cur.setDate(cur.getDate() + 1);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return count;
}

export async function scrapeLastNDays(n: number, region: Region, delayMs: number = 600): Promise<number> {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return scrapeRange(start, end, region, delayMs);
}

export async function scrapeToday(region: Region): Promise<unknown> {
  return scrapeDay(new Date(), region);
}

export async function scrapeAllRegionsRange(
  n: number = 5,
  delayMs: number = 600
): Promise<Record<Region, number>> {
  // Run all 3 regions in parallel (different domains so no rate-limit conflict)
  const results = await Promise.all(
    VALID_REGIONS.map(async (region) => {
      console.log(`=== Scraping ${region.toUpperCase()} (${n} days) ===`);
      return scrapeLastNDays(n, region, delayMs);
    })
  );
  return Object.fromEntries(VALID_REGIONS.map((r, i) => [r, results[i]])) as Record<Region, number>;
}
