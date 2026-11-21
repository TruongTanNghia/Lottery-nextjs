"use client";

/**
 * Bảng điều khiển bot gửi nhóm 2 ngay trên tab Dự Báo — khách 21/11: "anh gõ chat mà chưa được, em tự bật luôn đi".
 * Bấm "Tìm nhóm của nick phụ" → chọn nhóm (vd Tam Quốc) → "Bật tự gửi". Bật xong bot tự gửi mỗi ngày đúng khung
 * Gộp số: Mn 16:00, Mt 17:00, Mb 18:00. Ghi qua /api/bot-gui/nhom2 (cần đăng nhập web như mọi trang khác).
 */
import { useEffect, useState } from "react";

interface TinhTrang {
  nhom: number | null;
  tenNhom: string | null;
  noiDung: string;
  coTaiKhoan: boolean;
  goCua: string | null;
  mien: Record<"xsmn" | "xsmt" | "xsmb", { bat: boolean; tu: string; den: string; daGui: string | null }>;
}
const TEN = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" } as const;

export default function BotNhom2Panel() {
  const [tt, setTt] = useState<TinhTrang | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [ds, setDs] = useState<{ id: number; ten: string }[] | null>(null);
  const [dang, setDang] = useState(false);
  const [bao, setBao] = useState<string | null>(null);

  const tai = async () => {
    try {
      const r = await fetch("/api/bot-gui/nhom2", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail ?? String(r.status));
      setTt(j.data);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "lỗi không rõ");
    }
  };
  useEffect(() => { void tai(); }, []);

  const ghi = async (body: object, xong: string) => {
    setDang(true); setLoi(null); setBao(null);
    try {
      const r = await fetch("/api/bot-gui/nhom2", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail ?? String(r.status));
      setTt(j.data); setBao(xong);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "lỗi không rõ");
    } finally {
      setDang(false);
    }
  };
  const timNhom = async () => {
    setDang(true); setLoi(null); setBao(null);
    try {
      const r = await fetch("/api/bot-gui/nhom2?ds=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.status !== "success") throw new Error(j?.loi ?? j?.detail ?? String(r.status));
      setDs(j.nhom ?? []);
    } catch (e) {
      setLoi(`Không đọc được danh sách nhóm của nick phụ: ${e instanceof Error ? e.message : "lỗi không rõ"}`);
    } finally {
      setDang(false);
    }
  };

  const batHet = tt ? Object.values(tt.mien).every((m) => m.bat) : false;
  const nut = "px-2.5 py-1 rounded-lg text-xs font-bold disabled:opacity-50";
  return (
    <div className="rounded-xl border border-[#10b981]/60 bg-[#10b981]/10 px-3 py-3 space-y-2" data-bot2 data-bot2-nhom={tt?.nhom ?? ""} data-bot2-bat-het={batHet ? "1" : "0"}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="eyebrow">🤖 Bot gửi nhóm 2 — tự động mỗi ngày</span>
        {tt && <span className="text-[0.66rem] text-[var(--text-muted)]">gửi đúng khung Gộp số ở trên</span>}
      </div>
      {!tt && !loi && <p className="text-[0.74rem] text-[var(--text-muted)]">Đang tải tình trạng bot…</p>}
      {tt && (
        <>
          <div className="text-[0.76rem] text-[var(--text-secondary)]">
            Nhóm nhận: {tt.nhom != null ? <b className="text-white" data-bot2-ten>{tt.tenNhom ?? tt.nhom}</b> : <b className="text-[#ffd24a]">chưa chọn</b>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TEN) as (keyof typeof TEN)[]).map((r) => {
              const m = tt.mien[r];
              return (
                <span key={r} data-bot2-mien={r} data-bot2-mien-bat={m.bat ? "1" : "0"} className={`px-2 py-1 rounded-lg text-[0.7rem] font-bold ${m.bat ? "bg-[#10b981]/30 text-[#7ff0c0]" : "bg-white/[0.08] text-[#94a3b8]"}`}>
                  {TEN[r]} {m.tu} · {m.bat ? "✅ bật" : "⭕ tắt"}{m.daGui ? ` · hôm nay đã gửi ${m.daGui}` : ""}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button disabled={dang} onClick={timNhom} data-bot2-tim className={`${nut} bg-white/[0.10] text-[#e2e8f0] hover:bg-white/[0.18]`}>🔎 Tìm nhóm của nick phụ</button>
            <button disabled={dang || tt.nhom == null || batHet} onClick={() => ghi({ bat: true }, "✅ Đã bật — bot tự gửi Mn 16:00, Mt 17:00, Mb 18:00 mỗi ngày.")} data-bot2-bat className={`${nut} bg-[#10b981] text-white`}>✅ Bật tự gửi</button>
            <button disabled={dang || !Object.values(tt.mien).some((m) => m.bat)} onClick={() => ghi({ bat: false }, "⭕ Đã tắt bot gửi nhóm 2.")} data-bot2-tat className={`${nut} bg-white/[0.10] text-[#e2e8f0] hover:bg-white/[0.18]`}>⭕ Tắt</button>
          </div>
          {ds && (
            <div className="space-y-1" data-bot2-ds>
              {ds.length === 0 ? (
                <p className="text-[0.72rem] text-[#ffd24a]">Nick phụ chưa ở trong nhóm nào. Nhờ khách thêm nick phụ vào nhóm Tam Quốc.</p>
              ) : (
                ds.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-[0.74rem]">
                    <span className="text-white">{d.ten}</span>
                    <button disabled={dang} onClick={() => ghi({ nhom: d }, `✅ Đã chọn nhóm "${d.ten}". Bấm "Bật tự gửi" để bot chạy.`)} data-bot2-chon={d.id} className={`${nut} bg-[#7c3aed] text-white`}>Chọn nhóm này</button>
                  </div>
                ))
              )}
            </div>
          )}
          {!tt.coTaiKhoan && <p className="text-[0.7rem] text-[#ffd24a]">Chưa cài tài khoản gửi (nick phụ) trên máy chủ — bot nhận sẽ không đọc được tin.</p>}
        </>
      )}
      {bao && <p className="text-[0.74rem] text-[#7ff0c0]" data-bot2-bao>{bao}</p>}
      {loi && <p className="text-[0.74rem] text-[#ffd24a]" data-bot2-loi>⚠ {loi}</p>}
    </div>
  );
}
