"use client";

/**
 * Shared filter / Martingale / Sit-Out / Bet-multiplier panel.
 *
 * Built originally for 4-càng (10K space, 70k/6tr) and now reused for
 * 3-chân (1K space, 23k/600k) and lô VIP (100 space, 23k/1.84M). Each
 * caller passes:
 *   - predictions[] (top-K ranking with rank, number, probability, breakdown)
 *   - topK + backtest summary (for Sit-Out + Martingale math)
 *   - market constants (cost per pick, payout per hit)
 *   - storagePrefix so each tab has independent localStorage keys
 *
 * If anything is buggy here it's buggy in all 3 tabs — test thoroughly.
 */

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface PredictionItemLite {
  rank: number;
  number: string;
  probability: number;
  composite_score?: number;
  breakdown?: Record<string, number>;
}

export interface BacktestLite {
  days: Array<{ hits: number; profit_vnd: number; cost_vnd: number }>;
  top_k: number;
  baseline_pct: number;
}

export interface PatternFilterPanelProps {
  predictions: PredictionItemLite[];
  topK: number;
  backtest?: BacktestLite | null;
  numberDigits: 2 | 3 | 4;        // max chars in a pattern token (lô=2, 3-chân=3, 4-càng=4)
  numberSpaceSize: number;        // 100 / 1000 / 10000 — for stats display
  costPerPick: number;            // đồng — bookie market price for 1 điểm
  payoutPerHit: number;           // đồng — winnings on 1 hit for 1 điểm bet
  storagePrefix: string;          // e.g. "four", "three", "vip" — separates localStorage
  label: string;                  // e.g. "4 Càng" / "3 Chân" / "Lô VIP"
  unitOfPick?: string;            // optional display label ("số" default)
}

// ─────────────────────────────────────────────
// Digit-count pattern parsing
// ─────────────────────────────────────────────

interface DigitPattern {
  raw: string;
  counts: Map<string, number>;
  total: number;
}

function parsePatternList(raw: string, maxLen: 2 | 3 | 4): DigitPattern[] {
  if (!raw.trim()) return [];
  const tokens = raw.split(/[,\s\t\n;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: DigitPattern[] = [];
  // RegExp built per call so the upper bound matches the target number-digit space
  const re = new RegExp(`^\\d{1,${maxLen}}$`);
  for (const t of tokens) {
    if (!re.test(t)) continue;
    const canon = t.split("").sort().join("");
    if (seen.has(canon)) continue;
    seen.add(canon);
    const counts = new Map<string, number>();
    for (const ch of t) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    out.push({ raw: t, counts, total: t.length });
  }
  return out;
}

function numberMatchesPattern(num: string, pattern: DigitPattern, maxDigits: number): boolean {
  if (pattern.total > maxDigits) return false;
  const fc = new Map<string, number>();
  for (const ch of num) fc.set(ch, (fc.get(ch) ?? 0) + 1);
  for (const [d, c] of pattern.counts) {
    if ((fc.get(d) ?? 0) < c) return false;
  }
  return true;
}

// ─────────────────────────────────────────────
// LocalStorage helpers (prefix-scoped)
// ─────────────────────────────────────────────

function makeStorage(prefix: string) {
  const keys = {
    filter: `${prefix}_pattern_filter_v1`,
    betBase: `${prefix}_bet_base_v1`,
    mgBankroll: `${prefix}_mg_bankroll_v1`,
    mgTarget: `${prefix}_mg_target_pct_v1`,
    mgYesterdayPnl: `${prefix}_mg_yesterday_pct_v1`,
    mgCapPct: `${prefix}_mg_cap_pct_v1`,
    mgConsecLoss: `${prefix}_mg_consec_loss_v1`,
    mgMaxLossDays: `${prefix}_mg_max_loss_v1`,
    soWindow: `${prefix}_so_window_v1`,
    soMinHit: `${prefix}_so_min_hit_v1`,
    soMinLift: `${prefix}_so_min_lift_v1`,
  };
  function load(k: keyof typeof keys, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    try {
      return window.localStorage.getItem(keys[k]) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function save(k: keyof typeof keys, val: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(keys[k], val);
    } catch {
      /* ignore */
    }
  }
  return { load, save };
}

// ─────────────────────────────────────────────
// Number formatting
// ─────────────────────────────────────────────

function fmtBet(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function fmtVndShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "tỷ";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "tr";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return Math.round(n).toString();
}

const N_TO_VND = 1_000;
const DEFAULT_BET_BASE = "10";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function PatternFilterPanel({
  predictions,
  topK,
  backtest,
  numberDigits,
  numberSpaceSize,
  costPerPick,
  payoutPerHit,
  storagePrefix,
  label,
  unitOfPick = "số",
}: PatternFilterPanelProps) {
  const toast = useToast();
  const storage = useMemo(() => makeStorage(storagePrefix), [storagePrefix]);

  // ─── Filter state ───
  const [filterRaw, setFilterRaw] = useState<string>("");
  const [expandedNumber, setExpandedNumber] = useState<string | null>(null);
  const [betBaseStr, setBetBaseStr] = useState<string>(DEFAULT_BET_BASE);
  const betBase = useMemo(() => {
    const n = parseFloat(betBaseStr);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [betBaseStr]);

  // ─── Martingale state ───
  const [mgBankrollStr, setMgBankrollStr] = useState<string>("10000");
  const [mgTargetStr, setMgTargetStr] = useState<string>("10");
  const [mgYesterdayStr, setMgYesterdayStr] = useState<string>("0");
  const [mgCapPctStr, setMgCapPctStr] = useState<string>("5");
  const [mgConsecLossStr, setMgConsecLossStr] = useState<string>("0");
  const [mgMaxLossStr, setMgMaxLossStr] = useState<string>("3");

  // ─── Sit-Out state ───
  const [soWindowStr, setSoWindowStr] = useState<string>("7");
  const [soMinHitStr, setSoMinHitStr] = useState<string>("1.5");
  const [soMinLiftStr, setSoMinLiftStr] = useState<string>("1.2");

  // Hydrate from localStorage on mount (or when prefix changes)
  useEffect(() => {
    setFilterRaw(storage.load("filter", ""));
    setBetBaseStr(storage.load("betBase", DEFAULT_BET_BASE));
    setMgBankrollStr(storage.load("mgBankroll", "10000"));
    setMgTargetStr(storage.load("mgTarget", "10"));
    setMgYesterdayStr(storage.load("mgYesterdayPnl", "0"));
    setMgCapPctStr(storage.load("mgCapPct", "5"));
    setMgConsecLossStr(storage.load("mgConsecLoss", "0"));
    setMgMaxLossStr(storage.load("mgMaxLossDays", "3"));
    setSoWindowStr(storage.load("soWindow", "7"));
    setSoMinHitStr(storage.load("soMinHit", "1.5"));
    setSoMinLiftStr(storage.load("soMinLift", "1.2"));
  }, [storage]);

  // ─── Setters that also persist ───
  function handleFilterChange(v: string) {
    setFilterRaw(v);
    storage.save("filter", v);
  }
  function clearFilter() {
    setFilterRaw("");
    storage.save("filter", "");
    setExpandedNumber(null);
  }
  function handleBetBaseChange(v: string) {
    let cleaned = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    setBetBaseStr(cleaned);
    storage.save("betBase", cleaned);
  }

  type MgKey = "mgBankroll" | "mgTarget" | "mgYesterdayPnl" | "mgCapPct" | "mgConsecLoss" | "mgMaxLossDays";
  function setMg(key: MgKey, setter: (s: string) => void, raw: string) {
    let cleaned = raw.replace(/,/g, ".").replace(/[^\d.\-]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    setter(cleaned);
    storage.save(key, cleaned);
  }

  type SoKey = "soWindow" | "soMinHit" | "soMinLift";
  function setSo(key: SoKey, setter: (s: string) => void, raw: string) {
    let cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    setter(cleaned);
    storage.save(key, cleaned);
  }

  // ─── Filter computation ───
  const filterParsed = useMemo(
    () => parsePatternList(filterRaw, numberDigits),
    [filterRaw, numberDigits]
  );

  const breakdownByNumber = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const p of predictions) {
      if (p.breakdown) map.set(p.number, p.breakdown);
    }
    return map;
  }, [predictions]);

  const { matchedItems, patternHitCounts, unmatchedPatterns } = useMemo(() => {
    const topKPicks = predictions.slice(0, topK);
    const matches: { number: string; rank: number; matchedPatterns: string[] }[] = [];
    const hits = new Map<string, number>();
    for (const p of filterParsed) hits.set(p.raw, 0);

    for (const p of topKPicks) {
      const matched = filterParsed.filter((pat) => numberMatchesPattern(p.number, pat, numberDigits));
      if (matched.length > 0) {
        matches.push({
          number: p.number,
          rank: p.rank,
          matchedPatterns: matched.map((m) => m.raw),
        });
        for (const m of matched) hits.set(m.raw, (hits.get(m.raw) ?? 0) + 1);
      }
    }
    const unmatched = filterParsed.filter((pat) => (hits.get(pat.raw) ?? 0) === 0).map((p) => p.raw);
    return { matchedItems: matches, patternHitCounts: hits, unmatchedPatterns: unmatched };
  }, [filterParsed, predictions, topK, numberDigits]);

  const totalBet = useMemo(
    () => matchedItems.reduce((s, x) => s + betBase * x.matchedPatterns.length, 0),
    [matchedItems, betBase]
  );

  async function copyMatched() {
    if (matchedItems.length === 0) return;
    const txt = matchedItems.map((x) => x.number).join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy ${matchedItems.length} ${unitOfPick} khớp mẫu`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  async function copyBetString() {
    if (matchedItems.length === 0 || betBase <= 0) return;
    const txt = matchedItems
      .map((x) => `${x.number}b${fmtBet(betBase * x.matchedPatterns.length)}n`)
      .join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy ${matchedItems.length} ${unitOfPick} × mức cược`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  // ─── Sit-Out calculation ───
  const sitOutCalc = useMemo(() => {
    if (!backtest || backtest.days.length < 2) return null;
    const w = Math.max(1, parseInt(soWindowStr) || 7);
    const minHit = parseFloat(soMinHitStr) || 0;
    const minLift = parseFloat(soMinLiftStr) || 0;

    const recent = backtest.days.slice(-w);
    const recentHits = recent.reduce((s, d) => s + d.hits, 0);
    const recentPicks = recent.length * backtest.top_k;
    const recentHitPct = recentPicks > 0 ? (recentHits / recentPicks) * 100 : 0;
    const recentLift = backtest.baseline_pct > 0 ? recentHitPct / backtest.baseline_pct : 0;
    const shouldBetToday = recentHitPct >= minHit && recentLift >= minLift;

    let simBetDays = 0, simSkipDays = 0;
    let simBetProfitVnd = 0, alwaysBetProfitVnd = 0;
    let simBetCostVnd = 0, alwaysBetCostVnd = 0;
    for (let i = w; i < backtest.days.length; i++) {
      const prev = backtest.days.slice(i - w, i);
      const ph = prev.reduce((s, d) => s + d.hits, 0);
      const pp = prev.length * backtest.top_k;
      const phPct = pp > 0 ? (ph / pp) * 100 : 0;
      const pLift = backtest.baseline_pct > 0 ? phPct / backtest.baseline_pct : 0;
      const wouldBet = phPct >= minHit && pLift >= minLift;
      const d = backtest.days[i];
      alwaysBetProfitVnd += d.profit_vnd;
      alwaysBetCostVnd += d.cost_vnd;
      if (wouldBet) {
        simBetDays++;
        simBetProfitVnd += d.profit_vnd;
        simBetCostVnd += d.cost_vnd;
      } else {
        simSkipDays++;
      }
    }
    const filterRoi = simBetCostVnd > 0 ? (simBetProfitVnd / simBetCostVnd) * 100 : 0;
    const alwaysRoi = alwaysBetCostVnd > 0 ? (alwaysBetProfitVnd / alwaysBetCostVnd) * 100 : 0;
    const savedVsAlways = simBetProfitVnd - alwaysBetProfitVnd;
    return {
      window: w, minHit, minLift,
      recentHitPct, recentLift, shouldBetToday,
      simBetDays, simSkipDays, simBetProfitVnd, alwaysBetProfitVnd,
      filterRoi, alwaysRoi, savedVsAlways,
      hasEnoughData: backtest.days.length > w,
    };
  }, [backtest, soWindowStr, soMinHitStr, soMinLiftStr]);

  // ─── Martingale calculation ───
  const mgCalc = useMemo(() => {
    const bankrollN = parseFloat(mgBankrollStr) || 0;
    const target = parseFloat(mgTargetStr) || 0;
    const yesterday = parseFloat(mgYesterdayStr) || 0;
    const capPct = parseFloat(mgCapPctStr) || 0;
    const consec = parseInt(mgConsecLossStr) || 0;
    const maxLoss = parseInt(mgMaxLossStr) || 99;

    const stopped = consec >= maxLoss;
    const totalUnitsPerBase = matchedItems.reduce((s, x) => s + x.matchedPatterns.length, 0);

    // hit rate / pick from random_baseline (conservative — works without skill).
    // The PatternFilterPanel doesn't get random_baseline directly, so derive from
    // backtest.baseline_pct (which equals topK / pool_size * 100, ≈ random hit rate).
    const hitRatePerPick = backtest ? backtest.baseline_pct / 100 : 0;
    // 1n bet = 1,000đ stake. 1 điểm = costPerPick đồng. So 1n = (1000 / costPerPick) điểm.
    const nPerPick = N_TO_VND / costPerPick;
    const hitsPerN = hitRatePerPick * nPerPick;
    const evPerN = hitsPerN * payoutPerHit - N_TO_VND;
    const evPositive = evPerN > 0;

    const bankrollVnd = bankrollN * N_TO_VND;
    const requiredGainVnd = ((-yesterday + target) / 100) * bankrollVnd;

    let suggestedBet = 0;
    if (evPositive && totalUnitsPerBase > 0 && requiredGainVnd > 0) {
      suggestedBet = requiredGainVnd / (totalUnitsPerBase * evPerN);
    }
    const capBetVnd = (capPct / 100) * bankrollVnd;
    const capBetBase = totalUnitsPerBase > 0 ? capBetVnd / (totalUnitsPerBase * N_TO_VND) : 0;
    const cappedSuggested = stopped ? 0 : Math.min(suggestedBet, capBetBase);
    const wasCapped = !stopped && suggestedBet > capBetBase && capBetBase > 0;

    return {
      bankrollN, bankrollVnd, target, yesterday, capPct, consec, maxLoss,
      stopped, totalUnitsPerBase, hitRatePerPick, evPerN, evPositive,
      requiredGainVnd, suggestedBet, capBetBase, cappedSuggested, wasCapped,
    };
  }, [mgBankrollStr, mgTargetStr, mgYesterdayStr, mgCapPctStr, mgConsecLossStr,
      mgMaxLossStr, matchedItems, backtest, costPerPick, payoutPerHit]);

  function applyMartingale() {
    const s = String(Math.round(mgCalc.cappedSuggested * 1000) / 1000);
    setBetBaseStr(s);
    storage.save("betBase", s);
    toast.show("success", `Đã áp bet base = ${s}n`);
  }

  const breakEvenHitPct = (N_TO_VND / payoutPerHit) * (costPerPick / N_TO_VND) * 100;

  return (
    <section className="mt-4 md:mt-6 rounded-2xl bg-gradient-to-br from-emerald-900/20 via-teal-900/15 to-cyan-900/15 border border-emerald-500/40 overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
        <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
          🎯 Lọc {label} Theo Mẫu Chữ Số
        </h3>
        <p className="text-[0.7rem] text-slate-400 mt-0.5">
          Nhập mẫu chữ số (vd <span className="text-emerald-300 font-mono">{numberDigits >= 2 ? "11" : "1"}</span>) → hệ thống quét <b className="text-emerald-300">Top {topK}</b> {label.toLowerCase()},
          tìm {unitOfPick} có <b>đủ chữ số đó</b> (bất kỳ vị trí). <b className="text-amber-300">Auto-sync Top K.</b>
        </p>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[0.65rem]">
          {numberDigits >= 2 && (
            <span className="text-slate-300">
              <span className="font-mono text-emerald-300">11</span> = có ≥2 chữ <b>1</b>
            </span>
          )}
          {numberDigits >= 3 && (
            <span className="text-slate-300">
              <span className="font-mono text-emerald-300">12</span> = có ≥1 chữ <b>1</b> & ≥1 chữ <b>2</b>
            </span>
          )}
          {numberDigits >= 3 && (
            <span className="text-slate-300">
              <span className="font-mono text-emerald-300">111</span> = có ≥3 chữ <b>1</b>
            </span>
          )}
          <span className="text-slate-300">
            <span className="font-mono text-emerald-300">7</span> = có ≥1 chữ <b>7</b>
          </span>
        </div>
      </div>

      {/* Input area */}
      <div className="p-3 md:p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="text-[0.7rem] text-slate-300 font-semibold">
            ▸ List mẫu chữ số (1-{numberDigits} chữ mỗi mẫu):
          </label>
          <div className="flex gap-1.5">
            {filterParsed.length > 0 && (
              <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-emerald-500/20 text-emerald-200 font-mono">
                ✓ {filterParsed.length} mẫu
              </span>
            )}
            <button
              onClick={clearFilter}
              disabled={!filterRaw}
              className="px-2.5 py-1 text-[0.65rem] rounded bg-slate-600 hover:bg-slate-500 text-white font-bold disabled:opacity-40"
            >
              🗑 Xoá hết
            </button>
          </div>
        </div>
        <textarea
          value={filterRaw}
          onChange={(e) => handleFilterChange(e.target.value)}
          placeholder={`VD: ${numberDigits >= 3 ? "11, 23, 67" : "1, 2, 3"}`}
          rows={3}
          className="w-full px-3 py-2 rounded bg-[#1a2332] border-2 border-slate-700 focus:border-emerald-400 text-slate-100 font-mono text-sm outline-none resize-y"
        />
      </div>

      {filterParsed.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-xs">
          ↑ Nhập mẫu chữ số để xem {label.toLowerCase()} top K nào khớp
        </div>
      ) : (
        <>
          {/* Per-pattern summary */}
          <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="text-[0.7rem] text-slate-400 uppercase font-semibold mb-2">
              Mẫu anh chọn → {unitOfPick} khớp trong Top {topK}:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filterParsed.map((pat) => {
                const count = patternHitCounts.get(pat.raw) ?? 0;
                const isHot = count > 0;
                const tooFat = pat.total > numberDigits;
                return (
                  <span
                    key={pat.raw}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs ${
                      tooFat
                        ? "bg-rose-500/15 border-rose-500/50 text-rose-200"
                        : isHot
                        ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-100"
                        : "bg-rose-500/8 border-rose-500/30 text-rose-300/70"
                    }`}
                    title={
                      tooFat
                        ? `${pat.raw} có ${pat.total} chữ → không nhét vào ${numberDigits} ô`
                        : Array.from(pat.counts).map(([d, c]) => `≥${c} chữ ${d}`).join(", ")
                    }
                  >
                    <span className="font-bold">{pat.raw}</span>
                    <span className={`text-[0.65rem] ${tooFat ? "text-rose-300" : isHot ? "text-emerald-300" : "text-rose-400/70"}`}>
                      {tooFat ? "→ quá dài!" : isHot ? `→ ${count} ${unitOfPick}` : "→ 0"}
                    </span>
                  </span>
                );
              })}
            </div>
            {unmatchedPatterns.length > 0 && (
              <p className="mt-2 text-[0.65rem] text-rose-300/80 italic">
                ⚠️ {unmatchedPatterns.length} mẫu không khớp trong Top {topK}.
              </p>
            )}
          </div>

          {/* Sit-Out Filter */}
          {sitOutCalc && sitOutCalc.hasEnoughData && (
            <div className={`p-3 md:p-4 border-b border-white/[0.06] ${
              sitOutCalc.shouldBetToday ? "bg-emerald-500/10" : "bg-rose-500/10"
            }`}>
              <h4 className={`text-sm font-bold mb-2 ${sitOutCalc.shouldBetToday ? "text-emerald-300" : "text-rose-300"}`}>
                🎯 Sit-Out — Có nên đánh hôm nay?
              </h4>
              <div className={`rounded-lg border-2 p-3 mb-3 text-center ${
                sitOutCalc.shouldBetToday ? "border-emerald-400 bg-emerald-500/20" : "border-rose-400 bg-rose-500/20"
              }`}>
                <div className={`font-extrabold text-2xl ${sitOutCalc.shouldBetToday ? "text-emerald-200" : "text-rose-200"}`}>
                  {sitOutCalc.shouldBetToday ? "✅ ĐÁNH HÔM NAY" : "🚫 SIT-OUT HÔM NAY"}
                </div>
                <div className="text-[0.7rem] text-slate-300 mt-1">
                  {sitOutCalc.window} ngày qua: hit {sitOutCalc.recentHitPct.toFixed(2)}% (cần ≥{sitOutCalc.minHit}%), lift {sitOutCalc.recentLift.toFixed(2)}× (cần ≥{sitOutCalc.minLift}×)
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MgField label="Cửa sổ" suffix="ngày" value={soWindowStr} onChange={(v) => setSo("soWindow", setSoWindowStr, v)} />
                <MgField label="Min hit rate" suffix="%" value={soMinHitStr} onChange={(v) => setSo("soMinHit", setSoMinHitStr, v)} />
                <MgField label="Min lift" suffix="×" value={soMinLiftStr} onChange={(v) => setSo("soMinLift", setSoMinLiftStr, v)} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <Kpi label="Ngày đánh/Tổng" value={`${sitOutCalc.simBetDays}/${sitOutCalc.simBetDays + sitOutCalc.simSkipDays}`} hint={`Nghỉ ${sitOutCalc.simSkipDays}`} />
                <Kpi label="ROI filter" value={`${sitOutCalc.filterRoi.toFixed(1)}%`} accent={sitOutCalc.filterRoi >= 0 ? "text-emerald-300" : "text-rose-300"} hint={`P&L: ${fmtVndShort(sitOutCalc.simBetProfitVnd)}`} />
                <Kpi label="ROI mọi ngày" value={`${sitOutCalc.alwaysRoi.toFixed(1)}%`} accent={sitOutCalc.alwaysRoi >= 0 ? "text-emerald-300" : "text-rose-300"} hint={`P&L: ${fmtVndShort(sitOutCalc.alwaysBetProfitVnd)}`} />
                <Kpi label="Filter giúp/hại" value={`${sitOutCalc.savedVsAlways >= 0 ? "+" : ""}${fmtVndShort(sitOutCalc.savedVsAlways)}`} accent={sitOutCalc.savedVsAlways >= 0 ? "text-emerald-300" : "text-rose-300"} />
              </div>
            </div>
          )}

          {/* Martingale calculator */}
          <div className={`p-3 md:p-4 border-b border-white/[0.06] ${
            mgCalc.stopped ? "bg-rose-500/10" : !mgCalc.evPositive ? "bg-orange-500/10" : "bg-indigo-500/5"
          }`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-indigo-300">
                📊 Tự Tính Hạn Mức Cược (Martingale + CAP)
              </h4>
              {mgCalc.stopped && (
                <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-rose-500/30 text-rose-100 font-bold uppercase">
                  🛑 STOP — {mgCalc.consec} ngày lỗ ≥ {mgCalc.maxLoss}
                </span>
              )}
              {!mgCalc.stopped && !mgCalc.evPositive && (
                <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-orange-500/30 text-orange-100 font-bold uppercase">
                  ⚠️ EV ÂM — Martingale RỦI RO CAO
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
              <MgField label="Vốn ban đầu" suffix="n (= đ × 1k)" value={mgBankrollStr} onChange={(v) => setMg("mgBankroll", setMgBankrollStr, v)} />
              <MgField label="Target ROI" suffix="%/ngày" value={mgTargetStr} onChange={(v) => setMg("mgTarget", setMgTargetStr, v)} />
              <MgField label="P&L hôm qua" suffix="%" value={mgYesterdayStr} onChange={(v) => setMg("mgYesterdayPnl", setMgYesterdayStr, v)} />
              <MgField label="CAP cược" suffix="% vốn" value={mgCapPctStr} onChange={(v) => setMg("mgCapPct", setMgCapPctStr, v)} />
              <MgField label="Lỗ liên tiếp" suffix="ngày" value={mgConsecLossStr} onChange={(v) => setMg("mgConsecLoss", setMgConsecLossStr, v)} />
              <MgField label="Stop sau" suffix="ngày lỗ" value={mgMaxLossStr} onChange={(v) => setMg("mgMaxLossDays", setMgMaxLossStr, v)} />
            </div>
            <div className="rounded-lg bg-black/30 border border-indigo-500/30 p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <Kpi label="Hit rate" value={`${(mgCalc.hitRatePerPick * 100).toFixed(2)}%/pick`} accent={mgCalc.evPositive ? "text-emerald-300" : "text-rose-300"} hint={`Cần ${breakEvenHitPct.toFixed(2)}%`} />
                <Kpi label="EV per 1n" value={`${mgCalc.evPerN >= 0 ? "+" : ""}${fmtBet(mgCalc.evPerN)}đ`} accent={mgCalc.evPositive ? "text-emerald-300" : "text-rose-300"} hint={mgCalc.evPositive ? "Có edge mỏng" : "Lỗ kỳ vọng"} />
                <Kpi label="Cần lời/ngày" value={fmtVndShort(mgCalc.requiredGainVnd)} hint={`${(-mgCalc.yesterday + mgCalc.target).toFixed(1)}% vốn`} />
                <Kpi label="Tổng units" value={`${mgCalc.totalUnitsPerBase}`} hint={`${matchedItems.length} ${unitOfPick} × multipliers`} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                <div>
                  <div className="text-[0.65rem] text-slate-400 uppercase">Bet base đề xuất:</div>
                  <span className={`font-mono font-extrabold text-2xl ${mgCalc.stopped || !mgCalc.evPositive ? "text-rose-300" : "text-emerald-300"}`}>
                    {fmtBet(mgCalc.cappedSuggested)}n
                  </span>
                  {mgCalc.wasCapped && (
                    <span className="ml-2 text-[0.65rem] text-amber-300 font-mono">
                      (CAP: {fmtBet(mgCalc.suggestedBet)}n → {fmtBet(mgCalc.capBetBase)}n)
                    </span>
                  )}
                </div>
                <button
                  onClick={applyMartingale}
                  disabled={mgCalc.stopped || !mgCalc.evPositive || mgCalc.cappedSuggested <= 0}
                  className="px-3 py-2 text-xs rounded bg-indigo-500 hover:bg-indigo-400 text-white font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ⬇️ Áp xuống ô "Mức cược cơ bản"
                </button>
              </div>
            </div>
          </div>

          {/* Bet config bar */}
          <div className="p-3 md:p-4 border-b border-white/[0.06] bg-amber-500/5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[0.7rem] text-slate-300 font-semibold whitespace-nowrap">
                  💰 Mức cược cơ bản (1 mẫu khớp):
                </label>
                <div className="relative">
                  <input
                    value={betBaseStr}
                    onChange={(e) => handleBetBaseChange(e.target.value)}
                    inputMode="decimal"
                    className="w-24 px-2 py-1 text-center font-mono font-bold text-base rounded bg-[#1a2332] border-2 border-amber-500/50 focus:border-amber-300 text-amber-100 outline-none pr-5"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[0.65rem] text-amber-300 pointer-events-none">n</span>
                </div>
              </div>
              <div className="text-[0.7rem] text-slate-400">
                Khớp <b className="text-amber-300">N</b> mẫu → cược <b className="text-amber-300">{fmtBet(betBase)}n × N</b>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[0.7rem] text-slate-400">Tổng cược:</span>
                <span className="font-mono font-extrabold text-base text-amber-300">{fmtBet(totalBet)}n</span>
              </div>
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                onClick={copyBetString}
                disabled={matchedItems.length === 0 || betBase <= 0}
                className="px-3 py-1.5 text-xs rounded bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold disabled:opacity-40"
              >
                📋 Copy chuỗi đánh ({matchedItems.length} {unitOfPick} × mức cược)
              </button>
              <button
                onClick={copyMatched}
                disabled={matchedItems.length === 0}
                className="px-3 py-1.5 text-xs rounded bg-white/[0.08] hover:bg-white/[0.15] text-slate-200 font-semibold border border-slate-600 disabled:opacity-40"
                title="Chỉ copy danh sách số, không kèm mức cược"
              >
                📋 Copy số (không tiền)
              </button>
            </div>
          </div>

          {/* Matched list */}
          <div className="p-3 md:p-4">
            <h4 className="text-sm font-bold text-emerald-300 mb-2">
              ✅ {label} Khớp Mẫu ({matchedItems.length}) — sắp theo rank
            </h4>
            {matchedItems.length === 0 ? (
              <p className="text-center text-slate-500 text-xs py-4">
                Top {topK} không có {unitOfPick} nào khớp mẫu — thử tăng Top K hoặc đổi mẫu.
              </p>
            ) : (
              <div className="space-y-1.5">
                {matchedItems.map((x) => {
                  const isOpen = expandedNumber === x.number;
                  const bd = breakdownByNumber.get(x.number);
                  const highlightDigits = new Set<string>();
                  for (const matchedRaw of x.matchedPatterns) {
                    for (const ch of matchedRaw) highlightDigits.add(ch);
                  }
                  return (
                    <div key={x.number} className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 overflow-hidden">
                      <button
                        onClick={() => setExpandedNumber(isOpen ? null : x.number)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-emerald-500/10 transition text-left"
                      >
                        <span className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-base md:text-lg font-extrabold tracking-wider">
                            {x.number.split("").map((ch, i) => (
                              <span
                                key={i}
                                className={highlightDigits.has(ch) ? "text-yellow-300 bg-yellow-400/20 px-0.5 rounded" : "text-slate-400"}
                              >
                                {ch}
                              </span>
                            ))}
                          </span>
                          <span className="text-[0.7rem] font-mono text-emerald-300">#{x.rank}</span>
                          <span className="text-[0.65rem] text-slate-500">
                            {x.rank <= 10 ? "🏆 Top 10" : x.rank <= 30 ? "🥇 Top 30" : x.rank <= 100 ? "🥈 Top 100" : `Top ${topK}`}
                          </span>
                          <span className="text-[0.65rem] text-amber-300">
                            khớp <b>{x.matchedPatterns.length}</b> mẫu: <b>{x.matchedPatterns.join(", ")}</b>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono font-bold text-xs">
                            {fmtBet(betBase * x.matchedPatterns.length)}n
                          </span>
                        </span>
                        <span className="text-[0.7rem] text-slate-400 shrink-0">{isOpen ? "▼" : "▶"}</span>
                      </button>
                      {isOpen && bd && (
                        <div className="px-3 py-2 bg-[#0a0e17] border-t border-emerald-500/20">
                          <div className="text-[0.6rem] text-slate-400 uppercase mb-1.5">Điểm model thành phần (0-1):</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                            {Object.entries(bd).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.03] text-[0.65rem]">
                                <span className="text-slate-300 font-mono">{k}</span>
                                <span className="text-emerald-300 font-mono font-bold">{v.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[0.65rem] text-slate-500 italic">
              💡 Chữ <b className="text-yellow-300">vàng</b> = chữ số khớp mẫu (chỉ ở {numberDigits >= 3 ? "lô không có vị trí cố định" : "lô 2 chữ — match nguyên số"}).
              Pool {numberSpaceSize.toLocaleString()} số. Cost {fmtVndShort(costPerPick)}/điểm · Win {fmtVndShort(payoutPerHit)}/lần.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// Sub-components: small input + KPI card
// ─────────────────────────────────────────────

function MgField({
  label, suffix, value, onChange,
}: {
  label: string; suffix: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[0.6rem] text-slate-400 uppercase font-semibold">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="w-full px-2 py-1 mt-0.5 text-center font-mono font-bold text-sm rounded bg-[#1a2332] border-2 border-indigo-500/40 focus:border-indigo-300 text-indigo-100 outline-none"
      />
      <div className="text-[0.55rem] text-slate-500 mt-0.5">{suffix}</div>
    </div>
  );
}

function Kpi({
  label, value, hint, accent,
}: {
  label: string; value: string; hint?: string; accent?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-slate-700/40 p-2.5">
      <div className="text-[0.6rem] text-slate-400 uppercase font-semibold">{label}</div>
      <div className={`font-mono font-extrabold text-base md:text-lg mt-0.5 ${accent ?? "text-slate-100"}`}>{value}</div>
      {hint && <div className="text-[0.6rem] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
