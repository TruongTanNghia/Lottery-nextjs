"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { thongKeBac, TRAN_BAC, type SlotStats } from "@/lib/slot-stats";
import { useToast } from "./Toast";
import type { Region } from "@/lib/types";

const CUA_SO = [30, 60, 90, 120];
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";

/**
 * Answers the operator's question — which bậc made money — and then answers the
 * one they did not ask, which is whether that list is worth acting on.
 *
 * Both halves belong on the same screen. A table of past margins with a button
 * that turns it into a live schedule is a machine for buying last month's luck;
 * the split-half check sitting under it is the only thing that makes the button
 * safe to hand over.
 */
export default function SlotPanel({ region }: { region: Region }) {
  const toast = useToast();
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [chacChua, setChacChua] = useState(false);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setChacChua(false);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws(d.draws ?? []))
      .catch(() => !huy && setDraws([]));
    return () => { huy = true; };
  }, [region]);

  const tk: SlotStats | null = useMemo(
    () => (draws ? thongKeBac(draws, region) : null),
    [draws, region]
  );

  /** Bậc lời ở CẢ bốn chu kỳ — đúng tiêu chí khách đưa. */
  const bacLoiCaBon = useMemo(() => {
    if (!tk) return [];
    return tk.bang
      .filter((r) => CUA_SO.every((n) => (r.theoCuaSo[n] ?? -1) > 0))
      .map((r) => r.bac);
  }, [tk]);

  const apDung = async () => {
    if (!tk) return;
    setDangLuu(true);
    try {
      const base: Record<string, number> = {};
      for (let b = 0; b <= TRAN_BAC; b++) base[String(b)] = bacLoiCaBon.includes(b) ? 100 : 0;
      const r = await fetch(`/api/config/schedule?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base,
          min_limit: 0,
          consecutive: {},
          consecutive_reset_after: 4,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      toast.show("success", `Đã cài 100n cho ${bacLoiCaBon.length} bậc, 0n cho phần còn lại`);
      setChacChua(false);
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast.show("error", "Không lưu được bảng hạn mức");
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <section className="plate rise rise-3 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎯 Bậc Nào Có Lời</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Gom mọi lô theo số kỳ đã khô, xem nhận 100n ở bậc đó thì lời hay lỗ
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {!tk && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}

        {tk && (
          <>
            <div className="text-[0.72rem] text-[var(--text-muted)]">
              Đo trên <b className="text-[var(--text-secondary)]">{tk.soKy} kỳ</b> · mức chung mỗi
              lô về <b className="text-[var(--text-secondary)]">{tk.chuan}%</b> số kỳ · bậc nào về
              dưới mức chung thì ôm bậc đó có lời
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-2 py-2 text-left font-bold">Bậc</th>
                    <th className="px-2 py-2 text-right font-bold">Số mẫu</th>
                    <th className="px-2 py-2 text-right font-bold">Tỉ lệ về</th>
                    <th className="px-2 py-2 text-right font-bold">Kỳ lỗ</th>
                    {CUA_SO.map((n) => (
                      <th key={n} className="px-2 py-2 text-right font-bold">{n} kỳ</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tk.bang.filter((r) => r.mau >= 60).map((r) => {
                    const caBon = bacLoiCaBon.includes(r.bac);
                    return (
                      <tr
                        key={r.bac}
                        className={`border-t border-[var(--hairline)] ${
                          caBon ? "bg-[rgba(16,185,129,0.1)]" : ""
                        }`}
                      >
                        <td className="px-2 py-2 numeric text-white font-bold">
                          {r.bac === TRAN_BAC ? `${TRAN_BAC}+` : r.bac}
                          {caBon && <span className="text-[#7ff0c0] text-[0.6rem]"> ✓ cả 4</span>}
                        </td>
                        <td
                          className={`px-2 py-2 text-right numeric ${
                            r.mau < 300 ? "text-[#ffd24a]" : "text-[var(--text-secondary)]"
                          }`}
                          title={r.mau < 300 ? "Ít mẫu — con số ở đây rất dễ là may rủi" : ""}
                        >
                          {r.mau.toLocaleString("vi-VN")}
                          {r.mau < 300 && " ⚠"}
                        </td>
                        <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                          {(r.tyLeVe * 100).toFixed(2)}%
                        </td>
                        <td className="px-2 py-2 text-right numeric text-[var(--text-muted)]">
                          {r.kyLo}/{r.kyCo}
                        </td>
                        {CUA_SO.map((n) => {
                          const v = r.theoCuaSo[n];
                          return (
                            <td
                              key={n}
                              className={`px-2 py-2 text-right numeric font-bold ${
                                v == null ? "text-[var(--text-muted)]"
                                  : v > 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                              }`}
                            >
                              {v == null ? "—" : pc(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 space-y-2">
              <div className="eyebrow text-[#ffe0a8]">
                Chọn theo bảng trên có ăn thật không?
              </div>
              {tk.kiemThu ? (
                <>
                  <p className="text-[0.78rem] leading-relaxed text-[#ffe9c4]">
                    Bảng trên nói cái đã xảy ra. Muốn biết nó có dùng được không thì phải chọn
                    bậc bằng <b>{tk.kiemThu.kyHoc} kỳ đầu</b>, rồi đem đúng mấy bậc đó chơi{" "}
                    <b>{tk.kiemThu.kyThi} kỳ sau</b> — những kỳ lúc chọn chưa hề nhìn thấy:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[0.74rem]">
                    <div>
                      <div className="text-[var(--text-muted)]">
                        Cài 100 ở bậc đã chọn, 0 ở bậc còn lại
                      </div>
                      <div
                        className={`numeric font-bold text-base ${
                          tk.kiemThu.bienChon > 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                        }`}
                      >
                        {pc(tk.kiemThu.bienChon)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Cài 100 ở TẤT CẢ các bậc</div>
                      <div className="numeric font-bold text-base text-white">
                        {pc(tk.kiemThu.bienTatCa)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Bậc chọn còn giữ được lời</div>
                      <div className="numeric font-bold text-base text-white">
                        {tk.kiemThu.bacConLoi}/{tk.kiemThu.bacChon.length}
                      </div>
                    </div>
                  </div>
                  <p className="text-[0.76rem] leading-relaxed font-bold text-[#ffe9c4]">
                    {tk.kiemThu.bienChon > tk.kiemThu.bienTatCa ? (
                      <>✅ Chọn bậc ăn hơn nhận tất — đáng theo dõi thêm vài tuần nữa rồi hẵng chốt.</>
                    ) : (
                      <>
                        ❌ Chọn bậc <b>thua</b> so với cứ nhận tất ({pc(tk.kiemThu.bienChon)} so với{" "}
                        {pc(tk.kiemThu.bienTatCa)}). Chỉ {tk.kiemThu.bacConLoi}/
                        {tk.kiemThu.bacChon.length} bậc giữ được lời sang kỳ sau — gần đúng tung
                        đồng xu. Mấy con số dương ở bảng trên là chuyện đã qua, không phải chuyện
                        sắp tới.
                      </>
                    )}
                  </p>
                  <p className="text-[0.72rem] leading-relaxed text-[#ffe9c4]">
                    Để ý cột <b>Số mẫu</b>: bậc càng cao càng ít lô rơi vào, có bậc chỉ vài chục
                    lượt. Mấy con ±30% ở đó là biên độ của mẫu nhỏ, không phải quy luật.
                  </p>
                </>
              ) : (
                <p className="text-[0.78rem] text-[#ffe9c4]">Chưa đủ kỳ để kiểm thử.</p>
              )}
            </div>

            <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[0.76rem] text-[var(--text-secondary)] mb-2">
                Khách muốn <b>bậc lời cài 100n, bậc lỗ về 0n</b>. Lời ở cả 4 chu kỳ hiện có{" "}
                <b className="text-[#7ff0c0]">
                  {bacLoiCaBon.length ? bacLoiCaBon.map((b) => (b === TRAN_BAC ? `${b}+` : b)).join(", ") : "không bậc nào"}
                </b>
                . Bấm là ghi thẳng vào bảng hạn mức và tính lại toàn bộ lịch sử.
              </div>
              {!chacChua ? (
                <button
                  onClick={() => setChacChua(true)}
                  disabled={bacLoiCaBon.length === 0}
                  className="btn btn-primary text-xs disabled:opacity-40"
                >
                  🎯 Cài 100n cho {bacLoiCaBon.length} bậc lời, 0n cho phần còn lại
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.76rem] text-[#ffd24a] font-bold">
                    Ghi đè bảng hạn mức {region.toUpperCase()} và tính lại hết. Chắc chưa?
                  </span>
                  <button onClick={apDung} disabled={dangLuu} className="btn btn-primary text-xs">
                    {dangLuu ? "Đang lưu…" : "Chắc, cài đi"}
                  </button>
                  <button
                    onClick={() => setChacChua(false)}
                    className="px-2.5 py-1 rounded text-xs font-bold bg-white/[0.09] text-[#c2d4ea]"
                  >
                    Thôi
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
