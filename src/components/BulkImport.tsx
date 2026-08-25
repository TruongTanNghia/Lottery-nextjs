"use client";

import { useMemo, useState } from "react";
import { useToast } from "./Toast";
import { parseBulkBets, STAKE_PRICE, type BulkDay } from "@/lib/exposure";
import type { Region } from "@/lib/types";

/**
 * Loads a stretch of past books in one paste.
 *
 * Everything the lab claims about strategy is guesswork until it runs on the
 * money that actually came in, and that history only exists in chat logs. So:
 * paste the chat, check the preview, save.
 */
export default function BulkImport({
  region,
  onImported,
}: {
  region: Region;
  onImported: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const days: BulkDay[] = useMemo(() => (text.trim() ? parseBulkBets(text) : []), [text]);
  const tongDiem = days.reduce(
    (s, d) => s + Object.values(d.points).reduce((a, b) => a + b, 0),
    0
  );
  const tongLoi = days.reduce((s, d) => s + d.bad.length, 0);

  async function save() {
    if (days.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bets/bulk?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: days.map((d) => ({ date: d.date, points: d.points })) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      toast.show("success", `Đã nạp ${j.days} ngày sổ cược`);
      setText("");
      onImported();
    } catch (err) {
      toast.show("error", `Lỗi nạp: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="plate rise rise-1 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📚 Nạp Sổ Cược Cũ</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Dán cả tháng tin nhắn cược vào đây — có ngày là máy tự tách ra từng kỳ
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="text-[0.72rem] text-[var(--text-muted)] leading-relaxed">
          Mỗi ngày một dòng, bắt đầu bằng ngày. Nhận mọi kiểu:{" "}
          <code className="numeric text-[#9fd0ff]">20/8</code>{" "}
          <code className="numeric text-[#9fd0ff]">20/08/2026</code>{" "}
          <code className="numeric text-[#9fd0ff]">2026-08-20</code>
          <br />
          Ví dụ:{" "}
          <code className="numeric text-[#9fd0ff]">20/8: 27b50n, 51b30n, 08b10n</code>
          <br />
          Dòng không có ngày thì tính vào ngày gần nhất phía trên — dán nhiều tin nhắn của cùng một
          ngày cũng được, máy tự cộng dồn.
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"20/8: 27b50n, 51b30n, 08b10n\n21/8: 05b100n, 99b25n\n22/8: ..."}
          className="numeric w-full px-3 py-2 rounded-lg text-xs bg-[rgba(255,255,255,0.05)] border border-[var(--hairline)] text-white placeholder:text-[var(--text-muted)]"
        />

        {days.length > 0 && (
          <div className="rounded-lg border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] px-3 py-2.5 text-xs text-[#c9f4e0]">
            Đọc được <strong>{days.length}</strong> ngày · <strong>{tongDiem.toLocaleString("vi-VN")}</strong>{" "}
            điểm · doanh số{" "}
            <strong>{(tongDiem * STAKE_PRICE[region]).toLocaleString("vi-VN")}đ</strong>
            {tongLoi > 0 && (
              <span className="text-[#ffd24a]"> · bỏ qua {tongLoi} mã không đọc được</span>
            )}
            <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5 text-[0.68rem] text-[var(--text-secondary)]">
              {days.slice(0, 40).map((d) => {
                const t = Object.values(d.points).reduce((a, b) => a + b, 0);
                return (
                  <div key={d.date} className="numeric">
                    {d.date} — {Object.keys(d.points).length} lô, {t} điểm
                    {d.bad.length > 0 && (
                      <span className="text-[#ffd24a]"> (lỗi: {d.bad.slice(0, 3).join(", ")})</span>
                    )}
                  </div>
                );
              })}
              {days.length > 40 && <div>… và {days.length - 40} ngày nữa</div>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={saving || days.length === 0}
            className="btn-chrome px-4 py-2 rounded-lg text-xs disabled:opacity-40"
          >
            {saving ? "Đang nạp…" : `💾 Nạp ${days.length} ngày vào hệ thống`}
          </button>
          <button onClick={() => setText("")} className="btn-ghost px-3 py-2 rounded-lg text-xs">
            Xoá ô nhập
          </button>
        </div>

        <p className="text-[0.65rem] text-[var(--text-muted)]">
          Nạp lại một ngày đã có sẽ <strong>ghi đè</strong> ngày đó, không cộng thêm — nên dán lại
          để sửa thì an toàn.
        </p>
      </div>
    </section>
  );
}
