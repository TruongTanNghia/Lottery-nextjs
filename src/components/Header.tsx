"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  scrapedDays: number | null;
  latestScraped?: string | null;
  lastUpdate: string;
  status: "loading" | "connected" | "error";
  statusText: string;
  onScrape: () => void;
  isScraping: boolean;
  onQuickUpdate?: () => void;
  isQuickUpdating?: boolean;
  onDedupe?: () => void;
  isDedupeRunning?: boolean;
  onBackfill?: () => void;
  backfillProgress?: { current: number; total: number; status: string } | null;
}

/**
 * Tỳ Hưu (Pixiu) — the wealth beast that swallows and never lets go, which is
 * the whole premise of a limit board.
 *
 * Uses the real artwork at /pixiu.png. Falls back to the drawn mark if that
 * file is missing so a header never renders as a broken-image icon.
 */
function PixiuMark() {
  const [broken, setBroken] = useState(false);

  if (!broken) {
    return (
      <span className="relative flex-shrink-0 w-10 h-10 md:w-12 md:h-12">
        <span className="absolute -inset-1 rounded-full bg-[var(--glow)] opacity-30 blur-[12px]" />
        <img
          src="/pixiu.png"
          alt="Gà Con"
          width={48}
          height={48}
          onError={() => setBroken(true)}
          className="relative w-full h-full rounded-full object-cover ring-1 ring-[rgba(200,225,255,0.45)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_16px_-4px_rgba(77,166,255,0.8)]"
        />
      </span>
    );
  }

  return (
    <span className="relative flex-shrink-0 w-9 h-9 md:w-11 md:h-11">
      <span className="absolute inset-0 rounded-full bg-[var(--glow)] opacity-25 blur-[10px]" />
      <svg viewBox="0 0 48 48" className="relative w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="pxSilver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#dce6f2" />
            <stop offset="54%" stopColor="#7b8ca6" />
            <stop offset="70%" stopColor="#f4f8fc" />
            <stop offset="100%" stopColor="#9fb0c8" />
          </linearGradient>
          <radialGradient id="pxCoin" cx="35%" cy="28%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#c3d1e4" />
            <stop offset="100%" stopColor="#6a7b94" />
          </radialGradient>
        </defs>
        {/* coin the beast guards */}
        <circle cx="24" cy="36.5" r="8.4" fill="url(#pxCoin)" stroke="#4e5d75" strokeWidth="0.7" />
        <rect x="21.4" y="33.9" width="5.2" height="5.2" rx="0.7" fill="#0a2050" />
        {/* mane, horns, muzzle */}
        <path
          d="M24 3.6c2.4 0 3.3 2 3 3.9 1.6-1.2 3.6-.8 4.3.9.6 1.6-.4 3-1.7 3.6 2.5.5 4.2 2.4 4.5 4.7.3 2.4-1 4.3-3 5.3 2.3.9 3.6 2.8 3.4 5-.2 2.4-2.2 4.2-4.8 4.4-1.5.1-2.7-.4-3.6-1.2-.5 1.4-1 2.2-1.9 2.9-1 .7-2.4.7-3.4 0-.9-.7-1.4-1.5-1.9-2.9-.9.8-2.1 1.3-3.6 1.2-2.6-.2-4.6-2-4.8-4.4-.2-2.2 1.1-4.1 3.4-5-2-1-3.3-2.9-3-5.3.3-2.3 2-4.2 4.5-4.7-1.3-.6-2.3-2-1.7-3.6.7-1.7 2.7-2.1 4.3-.9-.3-1.9.6-3.9 3-3.9Z"
          fill="url(#pxSilver)"
          stroke="#46536b"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        {/* glowing eyes */}
        <circle cx="20.6" cy="17.4" r="1.5" fill="#0a2050" />
        <circle cx="27.4" cy="17.4" r="1.5" fill="#0a2050" />
        <circle cx="20.9" cy="17" r="0.55" fill="#8fd0ff" />
        <circle cx="27.7" cy="17" r="0.55" fill="#8fd0ff" />
      </svg>
    </span>
  );
}

export default function Header({
  scrapedDays,
  latestScraped,
  lastUpdate,
  status,
  statusText,
  onScrape,
  isScraping,
  onQuickUpdate,
  isQuickUpdating,
  onDedupe,
  isDedupeRunning,
  onBackfill,
  backfillProgress,
}: Props) {
  const router = useRouter();

  async function handleLogout() {
    if (!confirm("Đăng xuất?")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — middleware will redirect anyway on next request
    }
    router.push("/login");
    router.refresh();
  }

  const dotColor =
    status === "connected"
      ? "bg-emerald-400"
      : status === "error"
      ? "bg-red-400"
      : "bg-amber-400";

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 sm:gap-4 min-h-[60px] md:h-[76px] px-3 sm:px-5 md:px-7 py-2 md:py-0 bg-[rgba(4,9,26,0.82)] backdrop-blur-xl border-b border-[var(--hairline)]">
      <div className="flex items-center gap-2.5 sm:gap-3 md:gap-4 min-w-0">
        <PixiuMark />
        <div className="min-w-0">
          <h1 className="chrome text-base sm:text-lg md:text-xl truncate leading-tight">GÀ CON</h1>
          <p className="eyebrow truncate">Quản Lý Hạn Mức · 3 Miền</p>
        </div>
      </div>

      <div className="hidden lg:flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[rgba(140,180,240,0.06)] border border-[var(--hairline)] text-xs text-[var(--chrome-300)]">
        <span className="relative flex w-2 h-2">
          {status !== "connected" && (
            <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${dotColor}`} />
          )}
          <span className={`relative inline-flex w-2 h-2 rounded-full ${dotColor}`} />
        </span>
        <span>{statusText}</span>
      </div>

      <div className="flex items-center gap-2 md:gap-5">
        {/* Freshness at a glance: which draw the board is priced off. */}
        <div className="hidden md:flex flex-col items-end">
          <span className="eyebrow">KQ mới nhất</span>
          <span className="numeric text-sm font-bold text-[var(--glow-soft)]">
            {latestScraped ? latestScraped.slice(8, 10) + "/" + latestScraped.slice(5, 7) : "--"}
          </span>
        </div>
        <div className="hidden lg:flex flex-col items-end">
          <span className="eyebrow">Đã cào</span>
          <span className="numeric text-sm font-bold text-[var(--glow-soft)]">
            {scrapedDays !== null ? `${scrapedDays}d` : "--"}
          </span>
        </div>
        <div className="hidden xl:flex flex-col items-end">
          <span className="eyebrow">Tải lúc</span>
          <span className="numeric text-sm font-bold text-[var(--glow-soft)]">{lastUpdate}</span>
        </div>

        {/* Primary daily action — one tap, no prompt. */}
        {onQuickUpdate && (
          <button
            onClick={onQuickUpdate}
            disabled={isQuickUpdating || isScraping}
            title="Lấy kết quả kỳ mới nhất + tính lại hạn mức"
            className="btn-chrome inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded-lg text-xs md:text-sm"
          >
            <span className={isQuickUpdating ? "animate-spin" : ""}>⚡</span>
            <span>{isQuickUpdating ? "Đang lấy KQ..." : "Cập nhật KQ"}</span>
          </button>
        )}

        <button
          onClick={onScrape}
          disabled={isScraping || isQuickUpdating}
          title="Cào lại nhiều ngày — chọn số ngày"
          className="btn-ghost inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg text-xs"
        >
          <span className={isScraping ? "animate-spin" : ""}>🔄</span>
          <span className="hidden lg:inline">{isScraping ? "Đang cào..." : "Cào nhiều ngày"}</span>
        </button>
        {onBackfill && (
          <button
            onClick={onBackfill}
            disabled={!!backfillProgress}
            title="Auto scrape 180 ngày — chia 6 chunk × 30 ngày, tránh Vercel timeout"
            className="btn-ghost inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg text-xs"
          >
            <span className={backfillProgress ? "inline-block animate-spin" : ""}>📦</span>
            <span className="hidden md:inline">
              {backfillProgress
                ? `Chunk ${backfillProgress.current}/${backfillProgress.total}`
                : "Backfill 180d"}
            </span>
          </button>
        )}
        {onDedupe && (
          <button
            onClick={onDedupe}
            disabled={isDedupeRunning}
            title="Dọn data bị scrape lặp lại nhiều lần"
            className="btn-ghost inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg text-xs"
          >
            <span className={isDedupeRunning ? "inline-block animate-spin" : ""}>🧹</span>
            <span className="hidden md:inline">
              {isDedupeRunning ? "Đang dọn..." : "Dọn DB"}
            </span>
          </button>
        )}
        <button
          onClick={handleLogout}
          title="Đăng xuất"
          className="btn-ghost inline-flex items-center gap-1.5 px-2.5 md:px-3 py-2 md:py-2.5 rounded-lg text-xs hover:!bg-red-500/15 hover:!border-red-400/40 hover:!text-red-200"
        >
          <span>🚪</span>
          <span className="hidden md:inline">Đăng xuất</span>
        </button>
      </div>
    </header>
  );
}
