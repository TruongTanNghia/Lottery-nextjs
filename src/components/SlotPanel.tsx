"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { thongKeBac, TRAN_BAC, type SlotStats } from "@/lib/slot-stats";
import { useToast } from "./Toast";
import type { Region } from "@/lib/types";

const CUA_SO = [30, 60, 90, 120];
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
/** Tên ngày theo cách khách gọi, không phải chỉ số mảng. */
const ten = (b: number) => (b === 0 ? "vừa về" : b === TRAN_BAC ? `${TRAN_BAC}+ ngày` : `${b} ngày`);

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
      toast.show("success", `Đã cài 100n cho ${bacLoiCaBon.length} ngày, 0n cho phần còn lại`);
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
          <h2 className="plate-title">🎯 Ngày Nào Đẹp Nhất</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Lô khô bao nhiêu ngày thì nhận 100n có lời — đúng cột “Ngày” ở bảng hạn mức phía trên
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {!tk && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}

        {tk && (
          <>
            {/* Kết luận trước, số liệu sau. Bảng tám cột đọc trên điện thoại là
                cụt mất bốn cột cuối — đúng bốn cột quyết định. Nên mỗi ngày giờ
                là một dòng có nhãn phán rõ, số nằm dưới. */}
            <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.78rem] leading-relaxed">
              Đo trên <b className="text-[var(--text-secondary)]">{tk.soKy} kỳ</b>. Mỗi lô về{" "}
              <b className="text-[var(--text-secondary)]">{tk.chuan}%</b> số kỳ là mức chung — ngày
              nào về <b>dưới</b> mức đó thì ôm ngày đó có lời.
              <br />
              {bacLoiCaBon.length > 0 ? (
                <>
                  Đang có <b className="text-[#7ff0c0]">{bacLoiCaBon.length} ngày NÊN ÔM</b> (lời cả
                  4 chu kỳ):{" "}
                  <b className="text-[#7ff0c0]">{bacLoiCaBon.map((x) => ten(x)).join(" · ")}</b>
                </>
              ) : (
                <b className="text-[#ffd24a]">Không ngày nào lời được cả 4 chu kỳ.</b>
              )}
            </div>

            <div className="space-y-1.5">
              {tk.bang.filter((r) => r.mau >= 60).map((r) => {
                const co = CUA_SO.map((n) => r.theoCuaSo[n]).filter((v) => v != null) as number[];
                const hetLoi = co.length === 4 && co.every((v) => v > 0);
                const hetLo = co.length === 4 && co.every((v) => v < 0);
                const itMau = r.mau < 300;
                const phan = hetLoi
                  ? { chu: "NÊN ÔM", mau: "#7ff0c0", nen: "rgba(16,185,129,0.16)", vien: "rgba(16,185,129,0.5)" }
                  : hetLo
                  ? { chu: "NÉ RA", mau: "#ff9d9d", nen: "rgba(220,38,38,0.16)", vien: "rgba(248,113,113,0.45)" }
                  : { chu: "CHƯA CHẮC", mau: "#c2d4ea", nen: "rgba(255,255,255,0.07)", vien: "var(--hairline)" };
                return (
                  <div
                    key={r.bac}
                    className="rounded-lg border px-3 py-2"
                    style={{ background: phan.nen, borderColor: phan.vien }}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="numeric font-bold text-white text-[0.92rem] min-w-[5.2rem]">
                        {ten(r.bac)}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[0.66rem] font-bold tracking-wide"
                        style={{ color: phan.mau, background: "rgba(0,0,0,0.28)" }}
                      >
                        {phan.chu}
                      </span>
                      {itMau && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[0.66rem] font-bold text-[#ffd24a]"
                          style={{ background: "rgba(0,0,0,0.28)" }}
                          title="Ít lô rơi vào ngày này — con số ở đây rất dễ là may rủi"
                        >
                          ⚠ ÍT MẪU
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {CUA_SO.map((n) => {
                        const v = r.theoCuaSo[n];
                        return (
                          <span
                            key={n}
                            className={`numeric text-[0.68rem] rounded px-1.5 py-0.5 border ${
                              v == null
                                ? "border-[var(--hairline)] text-[var(--text-muted)]"
                                : v > 0
                                ? "border-[rgba(16,185,129,0.4)] text-[#7ff0c0] bg-[rgba(16,185,129,0.1)]"
                                : "border-[rgba(248,113,113,0.4)] text-[#ff9d9d] bg-[rgba(220,38,38,0.1)]"
                            }`}
                          >
                            {n} kỳ {v == null ? "—" : pc(v)}
                          </span>
                        );
                      })}
                    </div>

                    <div className="text-[0.66rem] text-[var(--text-muted)] mt-1 numeric">
                      {r.mau.toLocaleString("vi-VN")} lượt lô · về {(r.tyLeVe * 100).toFixed(2)}%
                      (chung {tk.chuan}%) · {r.kyLo}/{r.kyCo} kỳ lỗ
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 space-y-2">
              <div className="eyebrow text-[#ffe0a8]">
                Chọn ngày theo bảng trên có ăn thật không?
              </div>
              {tk.kiemThu ? (
                <>
                  <p className="text-[0.78rem] leading-relaxed text-[#ffe9c4]">
                    Bảng trên nói cái đã xảy ra. Muốn biết nó có dùng được không thì phải chọn
                    ngày bằng <b>{tk.kiemThu.kyHoc} kỳ đầu</b>, rồi đem đúng mấy ngày đó chơi{" "}
                    <b>{tk.kiemThu.kyThi} kỳ sau</b> — những kỳ lúc chọn chưa hề nhìn thấy:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[0.74rem]">
                    <div>
                      <div className="text-[var(--text-muted)]">
                        Cài 100 ở ngày đã chọn, 0 ở ngày còn lại
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
                      <div className="text-[var(--text-muted)]">Cài 100 ở TẤT CẢ các ngày</div>
                      <div className="numeric font-bold text-base text-white">
                        {pc(tk.kiemThu.bienTatCa)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Ngày chọn còn giữ được lời</div>
                      <div className="numeric font-bold text-base text-white">
                        {tk.kiemThu.bacConLoi}/{tk.kiemThu.bacChon.length}
                      </div>
                    </div>
                  </div>
                  <p className="text-[0.76rem] leading-relaxed font-bold text-[#ffe9c4]">
                    {tk.kiemThu.bienChon > tk.kiemThu.bienTatCa ? (
                      <>✅ Chọn ngày ăn hơn nhận tất — đáng theo dõi thêm vài tuần nữa rồi hẵng chốt.</>
                    ) : (
                      <>
                        ❌ Chọn ngày <b>thua</b> so với cứ nhận tất ({pc(tk.kiemThu.bienChon)} so với{" "}
                        {pc(tk.kiemThu.bienTatCa)}). Chỉ {tk.kiemThu.bacConLoi}/
                        {tk.kiemThu.bacChon.length} ngày giữ được lời sang kỳ sau — gần đúng tung
                        đồng xu. Mấy con số dương ở bảng trên là chuyện đã qua, không phải chuyện
                        sắp tới.
                      </>
                    )}
                  </p>
                  <p className="text-[0.72rem] leading-relaxed text-[#ffe9c4]">
                    Để ý cột <b>Số mẫu</b>: khô càng lâu càng ít lô rơi vào, có ngày chỉ vài chục
                    lượt. Mấy con ±30% ở đó là biên độ của mẫu nhỏ, không phải quy luật.
                  </p>
                </>
              ) : (
                <p className="text-[0.78rem] text-[#ffe9c4]">Chưa đủ kỳ để kiểm thử.</p>
              )}
            </div>

            <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[0.76rem] text-[var(--text-secondary)] mb-2">
                Khách muốn <b>ngày lời cài 100n, ngày lỗ về 0n</b>. Lời ở cả 4 chu kỳ hiện có{" "}
                <b className="text-[#7ff0c0]">
                  {bacLoiCaBon.length ? bacLoiCaBon.map(ten).join(" · ") : "không ngày nào"}
                </b>
                . Bấm là ghi thẳng vào bảng hạn mức và tính lại toàn bộ lịch sử.
              </div>
              {!chacChua ? (
                <button
                  onClick={() => setChacChua(true)}
                  disabled={bacLoiCaBon.length === 0}
                  className="btn btn-primary text-xs disabled:opacity-40"
                >
                  🎯 Cài 100n cho {bacLoiCaBon.length} ngày có lời, 0n cho phần còn lại
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
