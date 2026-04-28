"use client";

import { REGION_LABELS, type ConfigPayload, type Region } from "@/lib/types";

export default function PricingCard({
  region,
  config,
}: {
  region: Region;
  config: ConfigPayload | null;
}) {
  const ppp = config?.price_per_point ?? 75;
  const mult = config?.cost_multiplier ?? 18;
  const costPerPoint = mult * ppp;

  return (
    <div className="p-5 border-t border-white/[0.06]">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">💵 Bảng Tính Tiền Cược</h3>

      <div className="space-y-1.5 mb-3">
        <Row label="Khu vực" value={REGION_LABELS[region]} />
        <Row
          label="Xác cược / điểm"
          value={
            <>
              {mult} × {ppp}đ ={" "}
              <strong className="text-red-500">
                {costPerPoint.toLocaleString("vi-VN")}đ
              </strong>
            </>
          }
        />
        <Row
          label="Trúng cược / điểm / lần"
          value={<strong className="text-emerald-500">{ppp}đ</strong>}
        />
        <div className="flex items-center justify-between px-3 py-2 rounded text-xs bg-blue-500/[0.06] border border-blue-500/[0.18] text-slate-300">
          <span>VD: 100 điểm</span>
          <span>
            Cược{" "}
            <strong className="text-red-500">
              {(100 * costPerPoint).toLocaleString("vi-VN")}đ
            </strong>
            {" — "}
            Trúng/lần{" "}
            <strong className="text-emerald-500">
              {(100 * ppp).toLocaleString("vi-VN")}đ
            </strong>
          </span>
        </div>
      </div>

      <div className="text-[0.7rem] text-slate-500 px-3 py-2 rounded border border-dashed border-white/[0.06] bg-white/[0.02]">
        Hover vào ô lô bất kỳ để xem số tiền xác cược / trúng cược cụ thể.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded bg-white/[0.03] border border-white/[0.06] text-xs">
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="text-slate-100 font-mono">{value}</span>
    </div>
  );
}
