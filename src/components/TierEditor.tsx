"use client";

import { DEFAULT_TIERS, tierTotal, type Tier } from "@/lib/sim-ai";

/**
 * The bookie's tier table, editable.
 *
 * Kept as a plain table rather than something clever: the operator already
 * thinks in these terms — so many numbers at this price, so many at that — and
 * the useful thing to show alongside is the consequence, not a nicer widget.
 */
export default function TierEditor({
  tiers,
  onChange,
}: {
  tiers: Tier[];
  onChange: (t: Tier[]) => void;
}) {
  const tongLo = tiers.reduce((s, t) => s + t.soLo, 0);
  const tongDiem = tierTotal(tiers);
  const cao = Math.max(...tiers.map((t) => t.tien));
  const thap = Math.min(...tiers.filter((t) => t.soLo > 0).map((t) => t.tien));
  const chenh = thap > 0 ? cao / thap : Infinity;

  const set = (i: number, k: keyof Tier, v: number) => {
    const next = tiers.map((t, j) => (j === i ? { ...t, [k]: Math.max(0, Math.round(v)) } : t));
    onChange(next);
  };

  /** Squeeze every tier toward the average — the one knob that moves risk. */
  const thuHep = (factor: number) => {
    const tb = tongDiem / Math.max(1, tongLo);
    onChange(tiers.map((t) => ({ ...t, tien: Math.max(1, Math.round(tb + (t.tien - tb) * factor)) })));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">Thu hẹp khoảng cách bậc</span>
        {[
          { f: 0.75, ten: "−25%" },
          { f: 0.5, ten: "−50%" },
          { f: 0.25, ten: "−75%" },
          { f: 0, ten: "Phẳng hẳn" },
        ].map((b) => (
          <button
            key={b.ten}
            onClick={() => thuHep(b.f)}
            className="px-2.5 py-1 rounded text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
          >
            {b.ten}
          </button>
        ))}
        {/* Squeezing is one-way arithmetic — without this the operator loses
            their own table the moment they try a preset. */}
        <button
          onClick={() => onChange(DEFAULT_TIERS)}
          className="px-2.5 py-1 rounded text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.18]"
        >
          ↺ Bảng gốc
        </button>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-[0.75rem] leading-relaxed ${
          chenh <= 1.01
            ? "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] text-[#c9f4e0]"
            : chenh <= 4
            ? "border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.1)] text-[#ffe0a8]"
            : "border-[rgba(248,113,113,0.45)] bg-[rgba(220,38,38,0.12)] text-[#ffd9d9]"
        }`}
      >
        <strong>{tongLo}</strong> lô · tổng <strong>{tongDiem.toLocaleString("vi-VN")}</strong> điểm
        · bậc cao <strong>{cao}n</strong> ↔ bậc thấp <strong>{thap}n</strong> ={" "}
        <strong>chênh {chenh === Infinity ? "∞" : chenh.toFixed(1)} lần</strong>
        <br />
        {chenh <= 1.01
          ? "Phẳng hoàn toàn — tiền phải trả là con số cố định, không có ngày lỗ."
          : chenh <= 4
          ? "Chênh vừa phải — vẫn có ngày lỗ nhưng biên độ nhỏ."
          : "Chênh lớn — ngày cháy sẽ đau. Chênh càng nhiều biến động càng mạnh, mà lãi trung bình không đổi."}
        {tongLo !== 100 && (
          <>
            <br />
            <strong className="text-[#ffb4b4]">
              ⚠️ Tổng {tongLo} lô, không phải 100 — {tongLo < 100 ? `${100 - tongLo} lô sẽ không nhận cược` : "thừa lô, phần dư bị bỏ"}.
            </strong>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="px-2 py-1.5 text-left font-bold">Bậc</th>
              <th className="px-2 py-1.5 text-right font-bold">Số lô</th>
              <th className="px-2 py-1.5 text-right font-bold">Điểm mỗi lô</th>
              <th className="px-2 py-1.5 text-right font-bold">Tiền nhận</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i} className="border-t border-[var(--hairline)]">
                <td className="px-2 py-1 numeric text-[var(--text-muted)]">{i + 1}</td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    value={t.soLo}
                    min={0}
                    max={100}
                    onChange={(e) => set(i, "soLo", Number(e.target.value))}
                    className="numeric w-16 px-2 py-1 rounded text-xs text-right bg-[rgba(255,255,255,0.07)] border border-[var(--hairline)] text-white"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    value={t.tien}
                    min={0}
                    onChange={(e) => set(i, "tien", Number(e.target.value))}
                    className="numeric w-20 px-2 py-1 rounded text-xs text-right bg-[rgba(255,255,255,0.07)] border border-[var(--hairline)] text-white"
                  />
                </td>
                <td className="px-2 py-1 text-right numeric text-[var(--text-muted)]">
                  {(t.soLo * t.tien).toLocaleString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
