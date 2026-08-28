"use client";

import { formatVND } from "@/lib/format";
import type { ProfitStats } from "@/lib/types";

export default function StatsBar({ stats }: { stats: ProfitStats | null }) {
  const thu = stats?.total_thu_vnd ?? stats?.total_bet_vnd ?? 0;
  const bu = stats?.total_bu_vnd ?? stats?.total_win_vnd ?? 0;
  const lai = stats?.net_profit_vnd ?? thu - bu;

  const soKy = stats?.so_ky;
  const luot = stats?.luot_ve_tb;
  const chuan = stats?.luot_chuan;
  // Half a hit a draw is already 1,4% of the payout; anything past that is a
  // counting fault, not rounding.
  const lechDai = luot != null && chuan != null && Math.abs(luot - chuan) > 0.5;

  return (
    <div className="mb-4 md:mb-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
        <Card
          label={soKy != null ? `Lãi / Lỗ · ${soKy} kỳ` : "Lãi / Lỗ · 30 ngày"}
          value={formatVND(lai)}
          tone={lai < 0 ? "loss" : "gain"}
          lead
        />
        <Card label="Tổng Thu" value={formatVND(thu)} tone="gain" />
        <Card label="Tổng Bù" value={formatVND(-bu)} tone="loss" />
        <Card
          label="Tỷ Lệ Ăn"
          value={stats ? `${stats.win_rate.toFixed(1)}%` : "--"}
          tone="neutral"
        />
      </section>

      {stats && (
        <div
          className={`mt-2 rounded-lg border px-3 py-2 text-[0.72rem] leading-relaxed ${
            lechDai
              ? "border-[rgba(248,113,113,0.6)] bg-[rgba(220,38,38,0.14)] text-[#ffd9d9]"
              : "border-[var(--hairline)] bg-white/[0.04] text-[var(--text-muted)]"
          }`}
        >
          {lechDai && (
            <div className="font-bold text-[#ffb4b4] mb-1">
              ⚠️ ĐANG ĐẾM SAI ĐÀI — số tiền bù ở trên đang phóng lên{" "}
              {((luot! / chuan! - 1) * 100).toFixed(0)}%. Vào 📻 Đài Tính Kết Quả bật lại
              rồi lưu.
            </div>
          )}
          Tính trên <b className="text-[var(--text-secondary)]">{soKy} kỳ</b> có kết quả trong
          30 ngày gần đây · mỗi kỳ đếm{" "}
          <b className={lechDai ? "text-[#ffb4b4]" : "text-[var(--text-secondary)]"}>
            {luot?.toFixed(1)} lượt lô về
          </b>{" "}
          (chuẩn <b>{chuan}</b>) ·{" "}
          <b className="text-[var(--text-secondary)]">dùng hạn mức HIỆN TẠI</b> áp cho từng kỳ
          đó, không phải hạn mức lúc đó.
          <br />
          Thu = Σ điểm × giá bán. Bù = Σ điểm × 75.000đ × số nháy về. Nếu để{" "}
          <b>hạn mức phẳng</b> thì hai bên phải bằng nhau đúng bằng 0đ — lệch là có chỗ sai.
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, { text: string; bar: string }> = {
  gain: { text: "#34e6a8", bar: "#34e6a8" },
  loss: { text: "#ff6b78", bar: "#ff6b78" },
  neutral: { text: "#8fd0ff", bar: "#8fd0ff" },
};

function Card({
  label,
  value,
  tone,
  lead,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE | string;
  lead?: boolean;
}) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <div className={`plate rise ${lead ? "rise-1 col-span-2 lg:col-span-1" : "rise-2"} p-3.5 md:p-5`}>
      {/* tone bar doubles as the plate's lit edge */}
      <div className="absolute top-0 left-0 h-[3px] w-full" style={{ background: t.bar }} />
      <div className="eyebrow mb-1.5">{label}</div>
      <div
        className={`numeric font-extrabold leading-none ${lead ? "text-2xl md:text-[2rem]" : "text-lg md:text-2xl"}`}
        style={{ color: t.text }}
      >
        {value}
      </div>
    </div>
  );
}
