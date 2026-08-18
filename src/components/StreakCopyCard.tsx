"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import type { LimitItem, Region } from "@/lib/types";
import { provincePrefix } from "@/lib/provinces";

// Copy-format preferences. Defaults are what the bookie asked for — open the
// card, hit Copy, get "00b15dd15, ..." with no clicks. Any change the user
// makes is remembered so they never have to re-tick it.
const PREFS_KEY = "streak_copy_prefs_v1";

interface CopyPrefs {
  withAmount: boolean;
  withDe: boolean;
  keepNSuffix: boolean;
  skipZero: boolean;
  /** Prefix the string with the bookie's province codes: "st tv ag ...: 01b10n". */
  withProvinces: boolean;
}

const DEFAULT_PREFS: CopyPrefs = {
  withAmount: true,
  withDe: true,
  keepNSuffix: false,
  skipZero: false,
  withProvinces: true,
};

type Filter = "all" | "consecutive" | "cold";
type CopySep = "space" | "comma" | "newline";

interface Props {
  limits: LimitItem[];
  /** Whose province codes go in front of the string. */
  region: Region;
}

// Note: consecutive_days max = 4 (spec: "qua 4 ngày liên tiếp → reset về 1")
// → no "5+" / "6+" buckets because they would always be empty.
const STREAK_OPTIONS: Array<{ key: string; label: string; match: (l: LimitItem) => boolean }> = [
  { key: "1", label: "1 ngày", match: (l) => l.consecutive_days === 1 },
  { key: "2", label: "2 ngày", match: (l) => l.consecutive_days === 2 },
  { key: "3", label: "3 ngày", match: (l) => l.consecutive_days === 3 },
  { key: "4", label: "4 ngày (max)", match: (l) => l.consecutive_days === 4 },
];

const COLD_OPTIONS: Array<{ key: string; label: string; match: (l: LimitItem) => boolean }> = [
  { key: "0", label: "0 ngày (mới về)", match: (l) => l.days_since_last === 0 },
  { key: "1", label: "1 ngày", match: (l) => l.days_since_last === 1 },
  { key: "2", label: "2 ngày", match: (l) => l.days_since_last === 2 },
  { key: "3", label: "3 ngày", match: (l) => l.days_since_last === 3 },
  { key: "4", label: "4 ngày", match: (l) => l.days_since_last === 4 },
  { key: "5", label: "5 ngày", match: (l) => l.days_since_last === 5 },
  { key: "6+", label: "6+ ngày", match: (l) => l.days_since_last >= 6 },
];

// "Cả bảng" — every lô, no filtering. The limit engine already decided each
// amount, so this is the whole board as one paste-ready bet string.
const ALL_OPTIONS: Array<{ key: string; label: string; match: (l: LimitItem) => boolean }> = [
  { key: "all", label: "Cả 100 lô (00–99)", match: () => true },
];

const DEFAULT_OPTION_KEY: Record<Filter, string> = {
  all: "all",
  consecutive: "2",
  cold: "0",
};

export default function StreakCopyCard({ limits, region }: Props) {
  const toast = useToast();
  const [filterMode, setFilterMode] = useState<Filter>("all");
  const [optionKey, setOptionKey] = useState<string>("all");
  const [sep, setSep] = useState<CopySep>("space");
  // Bet-string mode: emit "<lô>b<hạn mức>n" like the Theo Dõi tab, so the output
  // can be pasted straight to a bookie. Separator is fixed to ", " there.
  const [withAmount, setWithAmount] = useState(DEFAULT_PREFS.withAmount);
  const [skipZero, setSkipZero] = useState(DEFAULT_PREFS.skipZero);
  // Đề rider: "<lô>b<tiền>dd<tiền>" — same stake on lô and đề, per the bookie's
  // own example (85b200dd200, 86b15dd15). Some bookies want the "n" (nghìn)
  // suffix kept on each amount, so that stays switchable — a wrong token gets
  // the whole bet line rejected.
  const [withDe, setWithDe] = useState(DEFAULT_PREFS.withDe);
  const [keepNSuffix, setKeepNSuffix] = useState(DEFAULT_PREFS.keepNSuffix);
  const [withProvinces, setWithProvinces] = useState(DEFAULT_PREFS.withProvinces);

  // Hydrate after mount — reading localStorage during render would desync SSR.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<CopyPrefs>;
      if (typeof p.withAmount === "boolean") setWithAmount(p.withAmount);
      if (typeof p.withDe === "boolean") setWithDe(p.withDe);
      if (typeof p.keepNSuffix === "boolean") setKeepNSuffix(p.keepNSuffix);
      if (typeof p.skipZero === "boolean") setSkipZero(p.skipZero);
      if (typeof p.withProvinces === "boolean") setWithProvinces(p.withProvinces);
    } catch {
      /* corrupt/unavailable storage — defaults are fine */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ withAmount, withDe, keepNSuffix, skipZero, withProvinces })
      );
    } catch {
      /* storage full or blocked — preferences just won't persist */
    }
  }, [withAmount, withDe, keepNSuffix, skipZero, withProvinces]);

  const options =
    filterMode === "all"
      ? ALL_OPTIONS
      : filterMode === "consecutive"
      ? STREAK_OPTIONS
      : COLD_OPTIONS;
  const currentOption = options.find((o) => o.key === optionKey) ?? options[0];

  const filtered = useMemo(() => {
    const base = limits
      .filter(currentOption.match)
      .sort((a, b) => a.lo_number.localeCompare(b.lo_number));
    // limit 0 = "lô vừa về, không nhận cược" — keep by default so the string
    // still lists every lô matching the filter.
    return withAmount && skipZero ? base.filter((l) => l.current_limit > 0) : base;
  }, [limits, currentOption, withAmount, skipZero]);

  const formatted = useMemo(() => {
    // The province list belongs inside the copied text, not beside it: a
    // pasted bet string has to say which provinces it covers on its own.
    const lead = withProvinces ? `${provincePrefix(region)}: ` : "";

    if (withAmount) {
      // Plain lô keeps the "n" it always had; the đề variant follows the
      // bookie's example, where the suffix is dropped unless asked for.
      const unit = withDe && !keepNSuffix ? "" : "n";
      return (
        lead +
        filtered
          .map((l) => {
            const lo = `${l.lo_number}b${l.current_limit}${unit}`;
            return withDe ? `${lo}dd${l.current_limit}${unit}` : lo;
          })
          .join(", ")
      );
    }
    const sepChar = sep === "space" ? " " : sep === "comma" ? ", " : "\n";
    return lead + filtered.map((l) => l.lo_number).join(sepChar);
  }, [filtered, sep, withAmount, withDe, keepNSuffix, withProvinces, region]);

  const totalPoints = useMemo(
    () => filtered.reduce((s, l) => s + l.current_limit, 0),
    [filtered]
  );

  function switchMode(m: Filter) {
    setFilterMode(m);
    setOptionKey(DEFAULT_OPTION_KEY[m]);
  }

  async function handleCopy() {
    if (filtered.length === 0) {
      toast.show("info", "Không có lô nào trong filter này.");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatted);
      toast.show(
        "success",
        withAmount
          ? `Đã copy chuỗi đánh ${filtered.length} lô • ${
              withDe ? `lô ${totalPoints}n + đề ${totalPoints}n` : `${totalPoints}n`
            }`
          : `Đã copy ${filtered.length} lô vào clipboard`
      );
    } catch {
      toast.show("error", "Trình duyệt không cho phép copy. Bấm vào textbox để select rồi Ctrl+C.");
    }
  }

  const sepLabels: Record<CopySep, string> = {
    space: "Khoảng cách",
    comma: "Dấu phẩy",
    newline: "Mỗi số 1 dòng",
  };

  return (
    <section className="rounded-2xl bg-gradient-to-br from-amber-900/25 to-rose-900/15 border border-amber-500/30 overflow-hidden mb-4 md:mb-6">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.06]">
        <h2 className="text-sm md:text-base font-bold flex items-center gap-2">
          🔥 Copy Lô Theo Tiêu Chí
        </h2>
        <p className="text-[0.7rem] md:text-xs text-slate-400 mt-0.5">
          Copy cả bảng 100 lô, hoặc lọc theo "ngày liên tiếp về" / "ngày chưa về" → copy 1 phát.
        </p>
      </div>

      <div className="p-4 md:p-5">
        {/* Mode toggle */}
        <div className="mb-3 flex flex-wrap gap-1.5 p-1 rounded-full bg-[#0f1623] border border-[#1f2937] w-fit">
          <button
            onClick={() => switchMode("all")}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${
              filterMode === "all"
                ? "bg-emerald-500 text-white"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            📋 Cả bảng
          </button>
          <button
            onClick={() => switchMode("consecutive")}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${
              filterMode === "consecutive"
                ? "bg-amber-500 text-white"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            🔥 Liên tiếp về
          </button>
          <button
            onClick={() => switchMode("cold")}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-colors ${
              filterMode === "cold"
                ? "bg-blue-500 text-white"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            ❄️ Chưa về
          </button>
        </div>

        {/* Filter options — "Cả bảng" has nothing to narrow down */}
        <div className={`mb-3 ${filterMode === "all" ? "hidden" : ""}`}>
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Tiêu chí lọc:</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const count = limits.filter(opt.match).length;
              const active = opt.key === optionKey;
              return (
                <button
                  key={opt.key}
                  onClick={() => setOptionKey(opt.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    active
                      ? filterMode === "consecutive"
                        ? "bg-amber-500 text-white"
                        : "bg-blue-500 text-white"
                      : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
                  }`}
                >
                  {opt.label}
                  <span className={`ml-1.5 text-[0.65rem] ${active ? "opacity-90" : "opacity-60"}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Output mode: plain numbers vs bet string with amounts */}
        <div className="mb-3">
          <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Kiểu copy:</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setWithAmount(false)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                !withAmount
                  ? "bg-emerald-500 text-white"
                  : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
              }`}
            >
              Chỉ số
            </button>
            <button
              onClick={() => setWithAmount(true)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                withAmount
                  ? "bg-emerald-500 text-white"
                  : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
              }`}
            >
              💰 Số + tiền (chuỗi đánh)
            </button>
          </div>
        </div>

        {/* Applies to both modes: the receiver needs the provinces either way */}
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none mb-2">
          <input
            type="checkbox"
            checked={withProvinces}
            onChange={(e) => setWithProvinces(e.target.checked)}
            className="accent-emerald-500"
          />
          Kèm tên tỉnh ở đầu chuỗi
          <span className="text-slate-500 truncate">({provincePrefix(region).slice(0, 22)}…:)</span>
        </label>

        {/* Format options — separator only matters for the plain-number mode */}
        {withAmount ? (
          <div className="mb-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipZero}
                onChange={(e) => setSkipZero(e.target.checked)}
                className="accent-emerald-500"
              />
              Bỏ lô hạn mức 0n (lô vừa về, không nhận cược)
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={withDe}
                onChange={(e) => setWithDe(e.target.checked)}
                className="accent-emerald-500"
              />
              Kèm đề <code className="text-emerald-400">dd</code> — đánh đề cùng mức tiền với lô
            </label>

            {withDe && (
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none pl-6">
                <input
                  type="checkbox"
                  checked={keepNSuffix}
                  onChange={(e) => setKeepNSuffix(e.target.checked)}
                  className="accent-emerald-500"
                />
                Giữ chữ <code className="text-slate-300">n</code> sau số tiền
                <span className="text-slate-500">
                  ({keepNSuffix ? "85b200ndd200n" : "85b200dd200"})
                </span>
              </label>
            )}
          </div>
        ) : (
          <div className="mb-3">
            <div className="text-[0.7rem] text-slate-400 mb-1.5 font-semibold">Format:</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(sepLabels) as CopySep[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSep(s)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    sep === s
                      ? "bg-blue-500/30 border border-blue-400/50 text-blue-200"
                      : "bg-white/[0.03] border border-white/[0.08] text-slate-400 hover:bg-white/[0.08]"
                  }`}
                >
                  {sepLabels[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        <textarea
          readOnly
          value={formatted || "(không có lô nào)"}
          rows={!withAmount && sep === "newline" ? Math.min(filtered.length, 8) || 2 : 3}
          className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 font-mono text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
          <span className="text-[0.7rem] text-slate-500">
            {filtered.length} lô • {formatted.length} ký tự
            {withAmount && (
              <>
                {" "}• tổng lô <strong className="text-emerald-400">{totalPoints}n</strong>
                {withDe && (
                  <>
                    {" "}+ đề <strong className="text-emerald-400">{totalPoints}n</strong> ={" "}
                    <strong className="text-amber-400">{totalPoints * 2}n</strong>
                  </>
                )}
              </>
            )}
          </span>
          <button
            onClick={handleCopy}
            disabled={filtered.length === 0}
            className="px-4 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold text-sm shadow-[0_2px_12px_rgba(245,158,11,0.35)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📋 Copy ({filtered.length} lô)
          </button>
        </div>
      </div>
    </section>
  );
}
