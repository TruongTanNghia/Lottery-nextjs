"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

interface DayCount {
  date: string;
  count: number;
}

interface NumberHeat {
  lo_number: string;
  days_since_last: number | null;
  last_appeared_date: string | null;
  consecutive_days: number;
  current_limit: number;
  last_7_days: DayCount[];
  total_30d: number;
  total_appearances_30d: number;
  heat: "hot" | "warm" | "cold" | "frozen";
}

interface WatcherResponse {
  status: string;
  region: Region;
  reference_dates: string[];
  items: NumberHeat[];
}

const SLOT_COUNT = 20; // 20 input slots
const STORAGE_KEY = "watcher_numbers_v1";
const PINNED_KEY = "watcher_pinned_v1";
const VIEW_DATE_KEY = "watcher_view_date_v1";
const DATE_STRIP_COUNT = 7; // # of date chips shown

// Tier-betting (Martingale 7d) constants
const TIER_COUNT = 7;
const TIER_LO_COUNT = 20;
const TIER_AMOUNTS_KEY = "watcher_tier_amounts_v1";
const TIER_LOS_KEY = "watcher_tier_los_v1";
const DEFAULT_TIER_AMOUNTS: number[] = [10, 20, 30, 40, 50, 80, 100];

function loadFromStorage(region: Region): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}_${region}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveToStorage(region: Region, nums: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}_${region}`, JSON.stringify(nums));
  } catch {
    /* ignore */
  }
}

function loadTierAmounts(region: Region): number[] {
  if (typeof window === "undefined") return [...DEFAULT_TIER_AMOUNTS];
  try {
    const raw = window.localStorage.getItem(`${TIER_AMOUNTS_KEY}_${region}`);
    if (!raw) return [...DEFAULT_TIER_AMOUNTS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== TIER_COUNT) return [...DEFAULT_TIER_AMOUNTS];
    return parsed.map((n) => (typeof n === "number" && n >= 0 ? n : 0));
  } catch {
    return [...DEFAULT_TIER_AMOUNTS];
  }
}

function loadTierLos(region: Region): string[] {
  if (typeof window === "undefined") return Array(TIER_LO_COUNT).fill("");
  try {
    const raw = window.localStorage.getItem(`${TIER_LOS_KEY}_${region}`);
    if (!raw) return Array(TIER_LO_COUNT).fill("");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Array(TIER_LO_COUNT).fill("");
    return Array(TIER_LO_COUNT).fill("").map((_, i) => (typeof parsed[i] === "string" ? parsed[i] : ""));
  } catch {
    return Array(TIER_LO_COUNT).fill("");
  }
}

function saveLS(key: string, region: Region, val: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${key}_${region}`, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

function loadViewDate(region: Region): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${VIEW_DATE_KEY}_${region}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function loadPinned(region: Region): boolean[] {
  const fallback = Array(SLOT_COUNT).fill(false);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${PINNED_KEY}_${region}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return Array(SLOT_COUNT).fill(false).map((_, i) => parsed[i] === true);
  } catch {
    return fallback;
  }
}

// days_since_last → tier index (0=1d, 6=7d). null/≥6 → 7d max.
function dayToTier(days: number | null): number {
  if (days === null) return 6;
  if (days <= 0) return 0;
  return Math.min(days, 6);
}

export default function WatcherPage({ region }: { region: Region }) {
  const toast = useToast();
  const [slots, setSlots] = useState<string[]>(() => Array(SLOT_COUNT).fill(""));
  const [data, setData] = useState<WatcherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Time-travel viewDate: null = "Hôm nay" (current state), else YYYY-MM-DD historical mode.
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]); // all scraped dates desc

  // Pinned slots: pinned[i]=true means slot i survives "Xoá hết" and "Import VIP Top 20".
  const [pinned, setPinned] = useState<boolean[]>(() => Array(SLOT_COUNT).fill(false));

  // Hydrate from localStorage on region change
  useEffect(() => {
    const saved = loadFromStorage(region);
    const filled = Array(SLOT_COUNT)
      .fill("")
      .map((_, i) => saved[i] ?? "");
    setSlots(filled);
    setViewDate(loadViewDate(region));
    setPinned(loadPinned(region));
  }, [region]);

  // Fetch list of scraped dates for the strip
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scrape/status?region=${region}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const dates: string[] = j?.by_region?.[region]?.dates ?? [];
        setAvailableDates(dates);
        // If saved viewDate is no longer in scraped dates (rare — e.g. cleanup wiped it), reset.
        if (viewDate && !dates.includes(viewDate)) {
          setViewDate(null);
          saveLS(VIEW_DATE_KEY, region, null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // viewDate intentionally excluded — only refetch on region change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  function pickViewDate(d: string | null) {
    setViewDate(d);
    saveLS(VIEW_DATE_KEY, region, d);
  }

  // Cleaned, deduped, sorted list of watched numbers
  const watched = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      const v = s.trim();
      if (/^\d{1,2}$/.test(v)) set.add(v.padStart(2, "0"));
    }
    return Array.from(set).sort();
  }, [slots]);

  const fetchHeat = useCallback(async () => {
    if (watched.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const dateQ = viewDate ? `&date=${viewDate}` : "";
      const res = await fetch(`/api/watcher?region=${region}&numbers=${watched.join(",")}${dateQ}`);
      const json = await res.json();
      if (json.status === "success") {
        setData(json);
      }
    } catch {
      toast.show("error", "Lỗi khi load watcher");
    } finally {
      setLoading(false);
    }
  }, [region, watched, viewDate, toast]);

  useEffect(() => {
    fetchHeat();
  }, [fetchHeat]);

  function handleSlotChange(idx: number, value: string) {
    // Allow only 0-2 digit numeric
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    const next = [...slots];
    next[idx] = cleaned;
    setSlots(next);
    saveToStorage(region, next);
  }

  function clearAll() {
    // Keep pinned slots; only clear unpinned ones.
    const next = slots.map((v, i) => (pinned[i] ? v : ""));
    setSlots(next);
    saveToStorage(region, next);
    const anyLeft = next.some((s) => /^\d{1,2}$/.test(s.trim()));
    if (!anyLeft) setData(null);
  }

  function togglePin(idx: number) {
    const next = [...pinned];
    next[idx] = !next[idx];
    setPinned(next);
    saveLS(PINNED_KEY, region, next);
  }

  function clearPins() {
    const empty = Array(SLOT_COUNT).fill(false);
    setPinned(empty);
    saveLS(PINNED_KEY, region, empty);
  }

  async function importFromVip() {
    if (importing) return;
    if (viewDate) {
      toast.show("error", "Đang ở chế độ lịch sử — quay về 'Hôm nay' để import");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/predict/vip?region=${region}&window=90`);
      const json = await res.json();
      const picks: string[] = (json.final ?? [])
        .slice(0, 20)
        .map((p: { lo_number: string }) => p.lo_number);
      if (picks.length === 0) {
        toast.show("error", "Chưa có VIP prediction. Vào tab VIP trước.");
        return;
      }
      // Pinned slots keep their current value. Unpinned slots get filled from VIP picks
      // (in order, skipping picks already present in pinned slots to avoid duplicates).
      const pinnedNumbers = new Set(
        slots.filter((_, i) => pinned[i]).map((s) => s.trim()).filter(Boolean)
      );
      const remaining = picks.filter((p) => !pinnedNumbers.has(p));
      let r = 0;
      const filled = Array(SLOT_COUNT)
        .fill("")
        .map((_, i) => {
          if (pinned[i]) return slots[i];
          return remaining[r++] ?? "";
        });
      setSlots(filled);
      saveToStorage(region, filled);
      const pinnedCount = pinned.filter(Boolean).length;
      toast.show(
        "success",
        pinnedCount > 0
          ? `Import xong — giữ ${pinnedCount} ô đã gim, fill ${SLOT_COUNT - pinnedCount} ô còn lại từ VIP`
          : `Đã import top ${picks.length} từ VIP`
      );
    } catch {
      toast.show("error", "Lỗi khi gọi VIP");
    } finally {
      setImporting(false);
    }
  }

  // ───────────────────────────────────────────────
  // Tier betting (Martingale 7d) — independent state + fetch
  // ───────────────────────────────────────────────
  const [tierAmounts, setTierAmounts] = useState<number[]>(() => [...DEFAULT_TIER_AMOUNTS]);
  const [tierLos, setTierLos] = useState<string[]>(() => Array(TIER_LO_COUNT).fill(""));
  const [tierData, setTierData] = useState<WatcherResponse | null>(null);
  const [tierLoading, setTierLoading] = useState(false);

  // Hydrate tier state from localStorage on region change
  useEffect(() => {
    setTierAmounts(loadTierAmounts(region));
    setTierLos(loadTierLos(region));
  }, [region]);

  const tierWatched = useMemo(() => {
    const set = new Set<string>();
    for (const s of tierLos) {
      const v = s.trim();
      if (/^\d{1,2}$/.test(v)) set.add(v.padStart(2, "0"));
    }
    return Array.from(set).sort();
  }, [tierLos]);

  // Fetch heat data for the tier lô list (independent of the 20-slot fetch).
  // Honors viewDate when set so tier mapping also time-travels.
  useEffect(() => {
    if (tierWatched.length === 0) {
      setTierData(null);
      return;
    }
    let cancelled = false;
    setTierLoading(true);
    const dateQ = viewDate ? `&date=${viewDate}` : "";
    fetch(`/api/watcher?region=${region}&numbers=${tierWatched.join(",")}${dateQ}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.status === "success") setTierData(j);
      })
      .catch(() => {
        /* swallow */
      })
      .finally(() => {
        if (!cancelled) setTierLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [region, tierWatched, viewDate]);

  function handleTierAmountChange(idx: number, value: string) {
    const num = parseInt(value.replace(/\D/g, "")) || 0;
    const next = [...tierAmounts];
    next[idx] = num;
    setTierAmounts(next);
    saveLS(TIER_AMOUNTS_KEY, region, next);
  }

  function handleTierLoChange(idx: number, value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    const next = [...tierLos];
    next[idx] = cleaned;
    setTierLos(next);
    saveLS(TIER_LOS_KEY, region, next);
  }

  function copyTierFromTop() {
    if (viewDate) {
      toast.show("error", "Đang ở chế độ lịch sử — quay về 'Hôm nay' để import");
      return;
    }
    const picks = slots
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}$/.test(s))
      .slice(0, TIER_LO_COUNT);
    const filled = Array(TIER_LO_COUNT)
      .fill("")
      .map((_, i) => picks[i] ?? "");
    setTierLos(filled);
    saveLS(TIER_LOS_KEY, region, filled);
    toast.show("success", `Đã lấy ${picks.length} lô từ Watcher`);
  }

  function clearTierLos() {
    const empty = Array(TIER_LO_COUNT).fill("");
    setTierLos(empty);
    saveLS(TIER_LOS_KEY, region, empty);
    setTierData(null);
  }

  function resetTierAmounts() {
    const next = [...DEFAULT_TIER_AMOUNTS];
    setTierAmounts(next);
    saveLS(TIER_AMOUNTS_KEY, region, next);
  }

  const tierSummary = useMemo(() => {
    if (!tierData || tierWatched.length === 0) return [];
    return tierWatched.map((lo) => {
      const item = tierData.items.find((it) => it.lo_number === lo);
      const days = item?.days_since_last ?? null;
      const tierIdx = dayToTier(days);
      const amount = tierAmounts[tierIdx] ?? 0;
      return {
        lo_number: lo,
        days,
        tier_idx: tierIdx,
        tier_label: `${tierIdx + 1}d`,
        amount,
        days_text:
          days === null
            ? "Chưa về ≥7d"
            : days === 0
            ? "Hôm nay ✨"
            : `${days} ngày`,
      };
    });
  }, [tierWatched, tierData, tierAmounts]);

  async function copyTierString() {
    if (tierSummary.length === 0) return;
    const txt = tierSummary.map((s) => `${s.lo_number}b${s.amount}n`).join(", ");
    try {
      await navigator.clipboard.writeText(txt);
      toast.show("success", `Copy ${tierSummary.length} lô × mức cược`);
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  return (
    <>
      {/* Header */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-rose-900/30 via-orange-900/20 to-red-900/20 border border-rose-500/40 p-4 md:p-6">
        <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
          🔥 Theo Dõi Lô — {REGION_LABELS[region]}
        </h2>
        <p className="text-xs md:text-sm text-slate-300 mt-1">
          Nhập lô anh muốn theo dõi → xem độ nóng/lạnh + lịch sử 7 ngày gần nhất.
          Bấm <b>📥 Import VIP Top 20</b> để lấy nhanh predictions.
        </p>
        <p className="text-[0.7rem] text-slate-400 mt-1">
          Tự lưu vào trình duyệt — F5 không mất.
        </p>
      </section>

      {/* Date strip — click to time-travel */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            📅 Xem theo ngày
            {viewDate && (
              <span className="px-2 py-0.5 text-[0.65rem] rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono">
                Lịch sử: {viewDate}
              </span>
            )}
          </h3>
          {viewDate && (
            <button
              onClick={() => pickViewDate(null)}
              className="px-2.5 py-1 text-[0.7rem] rounded bg-rose-600 hover:bg-rose-500 text-white font-bold"
            >
              ⮌ Về Hôm Nay
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <DateChip
            label="Hôm nay"
            active={viewDate === null}
            onClick={() => pickViewDate(null)}
          />
          {availableDates.slice(0, DATE_STRIP_COUNT).map((d) => (
            <DateChip
              key={d}
              label={d.slice(5)}
              sub={d.slice(0, 4)}
              active={viewDate === d}
              onClick={() => pickViewDate(d)}
            />
          ))}
        </div>
        {viewDate && (
          <p className="text-[0.7rem] text-amber-300 mt-2">
            ⚠️ Đang xem chế độ lịch sử — tất cả "ngày chưa ra" tính tới {viewDate}, không phải hôm nay.
          </p>
        )}
      </section>

      {/* Input slots */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-[#0f1722] border border-slate-700/50 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-200">
            ⌨️ Nhập lô muốn theo dõi ({watched.length}/{SLOT_COUNT})
            {pinned.some(Boolean) && (
              <span className="ml-2 text-[0.65rem] text-amber-300 font-mono">
                · 📌 {pinned.filter(Boolean).length} đã gim
              </span>
            )}
          </h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={importFromVip}
              disabled={importing || !!viewDate}
              title={viewDate ? "Quay về 'Hôm nay' để import" : undefined}
              className="px-3 py-1.5 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? "⏳ Đang load..." : "📥 Import VIP Top 20"}
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-xs rounded bg-slate-600 hover:bg-slate-500 text-white font-bold"
              title="Xoá các ô CHƯA gim"
            >
              🗑️ Xoá hết
            </button>
            {pinned.some(Boolean) && (
              <button
                onClick={clearPins}
                className="px-3 py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white font-bold"
                title="Bỏ gim toàn bộ ô"
              >
                📌 Bỏ gim tất cả
              </button>
            )}
          </div>
        </div>
        <p className="text-[0.65rem] text-slate-500 mb-2">
          💡 Bấm 📌 ở góc mỗi ô để gim — ô gim sẽ KHÔNG bị xoá khi Xoá hết / Import VIP. Vẫn gõ tay đè được bình thường.
        </p>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 md:gap-2">
          {slots.map((val, i) => {
            const isPinned = pinned[i];
            return (
              <div key={i} className="relative">
                <input
                  value={val}
                  onChange={(e) => handleSlotChange(i, e.target.value)}
                  maxLength={2}
                  inputMode="numeric"
                  placeholder="—"
                  className={`w-full aspect-square text-center font-mono font-bold text-base md:text-xl rounded bg-[#1a2332] border-2 ${
                    isPinned
                      ? "border-amber-500 shadow-[0_0_0_1px_rgba(245,158,11,0.4)_inset]"
                      : "border-slate-700"
                  } focus:border-rose-400 text-slate-100 placeholder:text-slate-700 outline-none transition-colors`}
                />
                <button
                  onClick={() => togglePin(i)}
                  title={isPinned ? "Bỏ gim" : "Gim ô này"}
                  aria-label={isPinned ? "Bỏ gim" : "Gim ô này"}
                  className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center text-[0.7rem] rounded transition-colors ${
                    isPinned
                      ? "text-amber-300 hover:text-amber-200"
                      : "text-slate-700 hover:text-slate-400"
                  }`}
                >
                  📌
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────────────────────────────────── */}
      {/* Tier betting (Martingale 7d) section       */}
      {/* ─────────────────────────────────────────── */}
      <section className="mb-4 md:mb-6 rounded-2xl bg-gradient-to-br from-emerald-900/25 via-teal-900/15 to-cyan-900/15 border border-emerald-500/40 overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
          <h3 className="text-sm md:text-base font-bold flex items-center gap-2">
            💰 Bảng Cược Theo Tầng — Martingale 7 ngày
          </h3>
          <p className="text-[0.7rem] text-slate-400 mt-0.5">
            Tầng <b className="text-emerald-300">1d</b> = ra hôm nay → <b className="text-emerald-300">7d</b> = ≥6 ngày chưa về. Anh tự cài mức cược mỗi tầng, hệ thống tự gán theo "days_since_last". Tự lưu local, F5 không mất.
          </p>
        </div>

        {/* Tier amounts (7 inputs) */}
        <div className="p-3 md:p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[0.7rem] text-slate-300 font-semibold">
              ▸ Mức cược mỗi tầng (đơn vị: <b className="text-amber-300">nghìn đồng</b>)
            </div>
            <button
              onClick={resetTierAmounts}
              className="px-2.5 py-1 text-[0.6rem] rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold"
              title="Reset về 10/20/30/40/50/80/100"
            >
              ↺ Mặc định
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 md:gap-2">
            {tierAmounts.map((amt, i) => (
              <div key={i} className="flex flex-col">
                <label className="text-[0.6rem] text-emerald-300 text-center font-mono font-bold mb-0.5">
                  {i + 1}d
                </label>
                <div className="relative">
                  <input
                    value={amt}
                    onChange={(e) => handleTierAmountChange(i, e.target.value)}
                    inputMode="numeric"
                    className="w-full text-center font-mono font-bold text-sm md:text-base rounded bg-[#1a2332] border-2 border-slate-700 focus:border-emerald-400 text-slate-100 outline-none py-1.5 pr-5"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[0.6rem] text-slate-500 pointer-events-none">n</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tier lô inputs */}
        <div className="p-3 md:p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[0.7rem] text-slate-300 font-semibold">
              ▸ {TIER_LO_COUNT} lô áp dụng chiến thuật ({tierWatched.length}/{TIER_LO_COUNT})
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={copyTierFromTop}
                disabled={!!viewDate}
                title={viewDate ? "Quay về 'Hôm nay' để import" : undefined}
                className="px-2.5 py-1 text-[0.65rem] rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📥 Lấy {TIER_LO_COUNT} từ Watcher trên
              </button>
              <button
                onClick={clearTierLos}
                className="px-2.5 py-1 text-[0.65rem] rounded bg-slate-600 hover:bg-slate-500 text-white font-bold"
              >
                🗑 Xoá
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 md:gap-2">
            {tierLos.map((val, i) => (
              <input
                key={i}
                value={val}
                onChange={(e) => handleTierLoChange(i, e.target.value)}
                maxLength={2}
                inputMode="numeric"
                placeholder="—"
                className="w-full aspect-square text-center font-mono font-bold text-base md:text-xl rounded bg-[#1a2332] border-2 border-slate-700 focus:border-emerald-400 text-slate-100 placeholder:text-slate-700 outline-none transition-colors"
              />
            ))}
          </div>
        </div>

        {/* Summary + Copy */}
        <div className="p-3 md:p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[0.7rem] text-slate-300 font-semibold">▸ BẢNG TỔNG KẾT</div>
            <button
              onClick={copyTierString}
              disabled={tierSummary.length === 0}
              className="px-3 py-1.5 text-xs rounded bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold disabled:opacity-40"
            >
              📋 Copy chuỗi đánh
            </button>
          </div>
          {tierWatched.length === 0 ? (
            <p className="text-center text-slate-500 text-xs py-6">
              ↑ Nhập {TIER_LO_COUNT} lô (hoặc bấm <b className="text-emerald-300">Lấy {TIER_LO_COUNT} từ Watcher trên</b>) để xem bảng cược
            </p>
          ) : tierLoading ? (
            <p className="text-center text-slate-500 text-xs py-6">⏳ Đang load độ nóng...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.72rem] md:text-xs">
                  <thead className="text-slate-400 uppercase bg-white/[0.03]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Lô</th>
                      <th className="px-2 py-1.5 text-left">Ra cách đây</th>
                      <th className="px-2 py-1.5 text-center">Tầng</th>
                      <th className="px-2 py-1.5 text-right">Mức cược</th>
                      <th className="px-2 py-1.5 text-right">Chuỗi copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierSummary.map((s) => {
                      const isHot = s.tier_idx <= 1;
                      const isCold = s.tier_idx >= 5;
                      const rowBg = isHot
                        ? "bg-rose-500/5 border-l-2 border-rose-500/50"
                        : isCold
                        ? "bg-cyan-500/5 border-l-2 border-cyan-500/50"
                        : "border-l-2 border-transparent";
                      return (
                        <tr key={s.lo_number} className={`${rowBg} border-t border-white/[0.04] hover:bg-white/[0.03]`}>
                          <td className="px-2 py-1.5 font-mono font-extrabold text-white text-base">{s.lo_number}</td>
                          <td className="px-2 py-1.5 text-slate-300">{s.days_text}</td>
                          <td className="px-2 py-1.5 text-center font-mono font-bold text-emerald-300">{s.tier_label}</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-300">
                            {s.amount}<span className="text-slate-500">n</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                            {s.lo_number}b{s.amount}n
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.65rem] text-slate-500 italic mt-2">
                💡 Hàng đỏ = tầng nóng (1d-2d, vừa ra). Hàng xanh = tầng lạnh (6d-7d, lâu chưa về). Tổng cược: <b className="text-amber-300">{tierSummary.reduce((s, x) => s + x.amount, 0)}n</b>
              </p>
            </>
          )}
        </div>
      </section>

      {/* Heat cards */}
      {watched.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          ↑ Nhập lô vào các ô trên hoặc bấm <b>📥 Import VIP Top 20</b> để bắt đầu
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-slate-500">⏳ Đang load độ nóng...</div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm md:text-base font-bold">
              🌡️ Độ nóng — sắp xếp theo "chưa ra"
            </h3>
            <div className="flex gap-2 text-[0.65rem]">
              <Legend color="bg-rose-500" label="🔥 Hot" />
              <Legend color="bg-amber-500" label="🌤 Warm" />
              <Legend color="bg-slate-500" label="❄️ Cold" />
              <Legend color="bg-cyan-500" label="🧊 Frozen" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[...data.items]
              .sort((a, b) => {
                // Hot first, then by days_since_last desc
                const heatRank = { hot: 0, warm: 1, cold: 2, frozen: 3 };
                if (a.heat !== b.heat) return heatRank[a.heat] - heatRank[b.heat];
                return (b.days_since_last ?? 999) - (a.days_since_last ?? 999);
              })
              .map((item) => (
                <HeatCard key={item.lo_number} item={item} />
              ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-slate-500 text-sm">
          Không có data cho các lô đã nhập (chưa scrape?)
        </div>
      )}

    </>
  );
}

function DateChip({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg border-2 transition-colors min-w-[64px] ${
        active
          ? "bg-rose-600 border-rose-400 text-white shadow-[0_2px_8px_rgba(244,63,94,0.35)]"
          : "bg-[#1a2332] border-slate-700 text-slate-300 hover:bg-[#243044] hover:border-slate-500"
      }`}
    >
      <span className={`text-[0.6rem] font-mono ${active ? "text-rose-100" : "text-slate-500"}`}>
        {sub ?? ""}
      </span>
      <span className="text-xs md:text-sm font-bold font-mono">{label}</span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded ${color}`}></span>
      <span className="text-slate-400">{label}</span>
    </span>
  );
}

function HeatCard({ item }: { item: NumberHeat }) {
  const heatStyle = {
    hot: {
      border: "border-rose-500/60",
      bg: "bg-gradient-to-br from-rose-900/40 to-orange-900/20",
      text: "text-rose-300",
      label: "🔥 HOT — đang về liên tiếp",
    },
    warm: {
      border: "border-amber-500/50",
      bg: "bg-gradient-to-br from-amber-900/30 to-yellow-900/15",
      text: "text-amber-300",
      label: "🌤 WARM — gần đây có về",
    },
    cold: {
      border: "border-slate-600/40",
      bg: "bg-[#111827]",
      text: "text-slate-400",
      label: "❄️ COLD — nghỉ lâu",
    },
    frozen: {
      border: "border-cyan-500/40",
      bg: "bg-gradient-to-br from-cyan-900/20 to-blue-900/10",
      text: "text-cyan-300",
      label: "🧊 FROZEN — chưa về lâu",
    },
  }[item.heat];

  const daysText = item.days_since_last === null
    ? "—"
    : item.days_since_last === 0
    ? "Hôm nay ✨"
    : `${item.days_since_last} ngày`;

  return (
    <div className={`rounded-xl border-2 ${heatStyle.border} ${heatStyle.bg} p-3 md:p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-mono text-3xl md:text-4xl font-extrabold text-white">
          {item.lo_number}
        </div>
        <div className="text-right">
          <div className={`text-[0.65rem] font-bold ${heatStyle.text}`}>
            CHƯA RA
          </div>
          <div className={`font-mono font-extrabold text-xl ${heatStyle.text}`}>
            {daysText}
          </div>
        </div>
      </div>

      {/* Heat label */}
      <div className={`text-[0.7rem] font-bold ${heatStyle.text} mb-2`}>
        {heatStyle.label}
      </div>

      {/* Last 7 days strip */}
      <div>
        <div className="text-[0.6rem] text-slate-400 uppercase font-semibold mb-1">
          7 ngày gần nhất (cũ → mới)
        </div>
        <div className="flex gap-1">
          {item.last_7_days.map((d) => {
            const isHit = d.count > 0;
            const isToday = d === item.last_7_days[item.last_7_days.length - 1];
            return (
              <div
                key={d.date}
                title={`${d.date} — ${isHit ? `về ${d.count} lần` : "không về"}`}
                className={`flex-1 aspect-square rounded flex flex-col items-center justify-center text-[0.6rem] font-mono ${
                  isHit
                    ? "bg-emerald-500/40 border border-emerald-400 text-emerald-100 font-bold"
                    : "bg-slate-800/60 border border-slate-700 text-slate-600"
                } ${isToday ? "ring-2 ring-blue-400/50" : ""}`}
              >
                <div className="text-[0.55rem] opacity-70">{d.date.slice(8)}</div>
                <div className="text-base md:text-lg">{isHit ? `×${d.count}` : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 30-day stats */}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] grid grid-cols-3 gap-1.5 text-[0.65rem]">
        <Stat label="30 ngày" value={`${item.total_appearances_30d}d`} hint={`về ${item.total_30d} lần`} />
        <Stat
          label="Liên tiếp"
          value={item.consecutive_days > 0 ? `${item.consecutive_days}d` : "—"}
          accent={item.consecutive_days >= 2 ? "text-rose-300" : undefined}
        />
        <Stat label="Limit" value={item.current_limit.toString()} hint="điểm" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded bg-white/[0.04] px-2 py-1">
      <div className="text-slate-500 uppercase text-[0.55rem]">{label}</div>
      <div className={`font-mono font-bold text-sm ${accent ?? "text-slate-200"}`}>{value}</div>
      {hint && <div className="text-slate-500 text-[0.55rem]">{hint}</div>}
    </div>
  );
}
