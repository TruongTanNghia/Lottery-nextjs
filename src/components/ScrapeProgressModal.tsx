"use client";

interface Props {
  open: boolean;
  progress: number; // 0..100
  statusText: string;
  regionStatus: { xsmn: string; xsmb: string; xsmt: string };
}

export default function ScrapeProgressModal({ open, progress, statusText, regionStatus }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#111827] border border-white/[0.06] shadow-2xl text-center">
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-bold">🔄 Đang Cập Nhật Dữ Liệu</h2>
        </div>

        <div className="p-6">
          <div className="space-y-2 mb-4 text-left">
            {(["xsmn", "xsmb", "xsmt"] as const).map((r) => {
              const label = r === "xsmn" ? "🌴 Miền Nam" : r === "xsmb" ? "🏯 Miền Bắc" : "⛩️ Miền Trung";
              return (
                <div
                  key={r}
                  className="flex items-center justify-between px-3.5 py-2 rounded bg-white/[0.03] border border-white/[0.06] text-sm text-slate-300"
                >
                  <span>{label}</span>
                  <span className="text-base">{regionStatus[r]}</span>
                </div>
              );
            })}
          </div>

          <div className="w-full h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-sm text-slate-300">{statusText}</p>
          <p className="text-xs text-slate-500 mt-2">
            Vercel free tier giới hạn 60s/request, nên scrape 5 ngày/lần.
          </p>
        </div>
      </div>
    </div>
  );
}
