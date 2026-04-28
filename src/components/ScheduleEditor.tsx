"use client";

import { useEffect, useState } from "react";

interface ScheduleData {
  base: Record<string, number>;
  min_limit: number;
  consecutive: Record<string, number>;
  consecutive_reset_after: number;
}

const DEFAULT_SCHEDULE: ScheduleData = {
  base: { "0": 200, "1": 180, "2": 160, "3": 140, "4": 120, "5": 100, "6": 80, "7": 60, "8": 40, "9": 20 },
  min_limit: 10,
  consecutive: { "2": 150, "3": 100, "4": 50 },
  consecutive_reset_after: 4,
};

export default function ScheduleEditor({ onSaved }: { onSaved: () => void }) {
  const [schedule, setSchedule] = useState<ScheduleData>(DEFAULT_SCHEDULE);
  const [original, setOriginal] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    fetch("/api/config/schedule")
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setSchedule(d.data);
          setOriginal(JSON.stringify(d.data));
        }
      })
      .catch(() => void 0);
  }, []);

  const dirty = JSON.stringify(schedule) !== original;

  function setBase(day: string, value: number) {
    setSchedule((s) => ({ ...s, base: { ...s.base, [day]: value } }));
  }
  function setConsec(day: string, value: number) {
    setSchedule((s) => ({ ...s, consecutive: { ...s.consecutive, [day]: value } }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/config/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOriginal(JSON.stringify(schedule));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved();
    } catch (err) {
      alert(`Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!confirm("Khôi phục schedule mặc định?")) return;
    setSchedule(DEFAULT_SCHEDULE);
  }

  return (
    <div className="p-6 border-t border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">
          📋 Hạn Mức Theo Số Ngày Chưa Về <span className="text-xs text-slate-500 font-normal">(click số để sửa)</span>
        </h3>
        <div className="flex gap-1.5">
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06] rounded"
          >
            ↺ Mặc định
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`px-3 py-1.5 text-xs rounded font-semibold transition-all ${
              dirty
                ? "bg-emerald-600 text-white shadow-[0_2px_12px_rgba(16,185,129,0.35)] animate-pulse"
                : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {saving ? "⏳ Đang lưu..." : savedFlash ? "✅ Đã lưu" : "💾 Lưu"}
          </button>
        </div>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: "50px repeat(11, 1fr)" }}>
        <div className="text-xs text-center py-1 font-semibold text-slate-500">Ngày</div>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <div key={d} className="text-xs text-center py-1 font-semibold text-slate-500">
            {d}
          </div>
        ))}
        <div className="text-xs text-center py-1 font-semibold text-slate-500">10+</div>

        <div className="text-xs text-center py-1.5 font-semibold text-slate-400">Max</div>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <input
            key={d}
            type="number"
            value={schedule.base[String(d)] ?? 0}
            onChange={(e) => setBase(String(d), parseInt(e.target.value) || 0)}
            min={0}
            max={200}
            className="text-center text-xs font-mono font-semibold py-1.5 rounded bg-[#0f1623] border border-[#1f2937] text-slate-100 hover:border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        ))}
        <input
          type="number"
          value={schedule.min_limit}
          onChange={(e) => setSchedule((s) => ({ ...s, min_limit: parseInt(e.target.value) || 0 }))}
          min={0}
          max={200}
          className="text-center text-xs font-mono font-semibold py-1.5 rounded bg-[#0f1623] border border-[#1f2937] text-slate-100 hover:border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="mt-3 px-3 py-2.5 rounded bg-amber-500/[0.06] border border-amber-500/[0.18] text-xs text-slate-300 flex flex-wrap items-center gap-1.5">
        <strong className="w-full text-amber-500 mb-1">Lô về liên tiếp (cap):</strong>
        <span>2 ngày →</span>
        <input
          type="number"
          value={schedule.consecutive["2"] ?? 0}
          onChange={(e) => setConsec("2", parseInt(e.target.value) || 0)}
          className="w-14 h-6 text-center text-xs font-mono rounded bg-[#0f1623] border border-[#1f2937] text-slate-100"
        />
        đ <span>| 3 ngày →</span>
        <input
          type="number"
          value={schedule.consecutive["3"] ?? 0}
          onChange={(e) => setConsec("3", parseInt(e.target.value) || 0)}
          className="w-14 h-6 text-center text-xs font-mono rounded bg-[#0f1623] border border-[#1f2937] text-slate-100"
        />
        đ <span>| 4 ngày →</span>
        <input
          type="number"
          value={schedule.consecutive["4"] ?? 0}
          onChange={(e) => setConsec("4", parseInt(e.target.value) || 0)}
          className="w-14 h-6 text-center text-xs font-mono rounded bg-[#0f1623] border border-[#1f2937] text-slate-100"
        />
        đ <span>| &gt;4 ngày → reset về base</span>
      </div>
    </div>
  );
}
