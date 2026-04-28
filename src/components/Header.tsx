"use client";

interface Props {
  scrapedDays: number | null;
  lastUpdate: string;
  status: "loading" | "connected" | "error";
  statusText: string;
  onScrape: () => void;
  isScraping: boolean;
}

export default function Header({
  scrapedDays,
  lastUpdate,
  status,
  statusText,
  onScrape,
  isScraping,
}: Props) {
  const dotColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : "bg-amber-500";

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 h-[72px] px-7 bg-[#0a0e17] border-b border-white/[0.06]">
      <div className="flex items-center gap-4 min-w-0">
        <div className="text-3xl drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">🎯</div>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent truncate">
            Lottery Limit Manager
          </h1>
          <p className="text-[0.65rem] uppercase tracking-wider text-slate-500">
            Quản Lý Hạn Mức Lô 3 Miền
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-slate-400">
        <span
          className={`w-2 h-2 rounded-full ${dotColor} ${
            status !== "connected" ? "animate-pulse" : ""
          }`}
        />
        <span>{statusText}</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">Scraped</span>
          <span className="text-sm font-bold font-mono text-blue-400">
            {scrapedDays !== null ? `${scrapedDays} ngày` : "--"}
          </span>
        </div>
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[0.6rem] uppercase tracking-wider text-slate-500">Cập nhật</span>
          <span className="text-sm font-bold font-mono text-blue-400">{lastUpdate}</span>
        </div>
        <button
          onClick={onScrape}
          disabled={isScraping}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-semibold text-sm shadow-[0_2px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_4px_20px_rgba(59,130,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
        >
          <span className={isScraping ? "animate-spin" : ""}>🔄</span>
          <span>{isScraping ? "Đang cập nhật..." : "Cập nhật"}</span>
        </button>
      </div>
    </header>
  );
}
