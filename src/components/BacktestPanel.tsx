"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { chayLai, LOS, type BacktestResult, type DayRow, type DrawHits } from "@/lib/backtest";
import { STAKE_PRICE, WIN_PER_POINT } from "@/lib/exposure";
import type { Schedule } from "@/lib/limit-engine";
import type { Region } from "@/lib/types";

const CUA_SO = [30, 60, 90, 120];

const tr = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const ngay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * "Nếu chạy đúng bảng hạn mức này thì mấy chục kỳ vừa rồi lời hay lỗ."
 *
 * Runs in the browser off the same draw history the rest of the page uses, so
 * switching window or editing the schedule re-answers instantly instead of
 * waiting on a round trip. The replay itself lives in lib/backtest so the API
 * and this panel cannot report different numbers.
 */
export default function BacktestPanel({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [soKy, setSoKy] = useState(30);
  const [moNgay, setMoNgay] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setSched(null);
    setMoNgay(null);
    setLoi(null);
    Promise.all([
      fetch(`/api/history/hits?region=${region}`).then((r) => r.json()),
      fetch(`/api/config/schedule?region=${region}`).then((r) => r.json()),
    ])
      .then(([h, s]) => {
        if (huy) return;
        setDraws(h.draws ?? []);
        const d = s.data;
        setSched({
          base: Object.fromEntries(Object.entries(d.base ?? {}).map(([k, v]) => [Number(k), Number(v)])),
          min_limit: Number(d.min_limit ?? 10),
          consecutive: Object.fromEntries(
            Object.entries(d.consecutive ?? {}).map(([k, v]) => [Number(k), Number(v)])
          ),
          consecutive_reset_after: Number(d.consecutive_reset_after ?? 4),
        });
      })
      .catch(() => !huy && setLoi("Không tải được lịch sử hoặc bảng hạn mức"));
    return () => { huy = true; };
  }, [region]);

  const kq: BacktestResult | null = useMemo(
    () => (draws && sched ? chayLai(draws, sched, region, soKy) : null),
    [draws, sched, region, soKy]
  );

  const price = STAKE_PRICE[region];
  const lechDai = kq && Math.abs(kq.luotTB - kq.luotChuan) > 0.5;

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📒 Bảng Hạn Mức Này Lời Hay Lỗ</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Dò lại từng kỳ bằng đúng hạn mức của kỳ đó — không lấy mức hôm nay áp cho cả tháng
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {CUA_SO.map((n) => (
            <button
              key={n}
              onClick={() => { setSoKy(n); setMoNgay(null); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                soKy === n
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {n} kỳ
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
        {!kq && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}

        {kq && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
              <O
                nhan={`Lãi / Lỗ · ${kq.soKy} kỳ`}
                gt={(kq.lai >= 0 ? "+" : "") + tr(kq.lai)}
                phu={`${kq.phanTram >= 0 ? "+" : "−"}${Math.abs(kq.phanTram).toFixed(2)}% trên tổng thu`}
                mau={kq.lai > 0 ? "an" : kq.lai < 0 ? "thua" : "deu"}
              />
              <O nhan="Tổng Thu" gt={tr(kq.thu)} mau="an" />
              <O nhan="Tổng Bù" gt={"−" + tr(kq.bu)} mau="thua" />
              <O
                nhan="Kỳ Lỗ"
                gt={`${kq.kyLo}/${kq.soKy}`}
                phu={kq.sut ? `sụt sâu nhất ${tr(kq.sut.sau)}` : undefined}
                mau={kq.kyLo === 0 ? "an" : "thua"}
              />
            </div>

            <div
              className={`rounded-lg border px-3 py-2 text-[0.72rem] leading-relaxed ${
                lechDai
                  ? "border-[rgba(248,113,113,0.6)] bg-[rgba(220,38,38,0.14)] text-[#ffd9d9]"
                  : "border-[var(--hairline)] bg-white/[0.04] text-[var(--text-muted)]"
              }`}
            >
              {lechDai && (
                <div className="font-bold text-[#ffb4b4] mb-1">
                  ⚠️ ĐANG ĐẾM SAI ĐÀI — tiền bù phóng lên{" "}
                  {((kq.luotTB / kq.luotChuan - 1) * 100).toFixed(0)}%. Vào 📻 Đài Tính Kết Quả
                  bật lại rồi lưu.
                </div>
              )}
              Mỗi kỳ dùng đúng hạn mức mà bảng sinh ra{" "}
              <b className="text-[var(--text-secondary)]">sáng hôm đó</b>, chốt trước khi biết kết
              quả · mỗi kỳ đếm{" "}
              <b className={lechDai ? "text-[#ffb4b4]" : "text-[var(--text-secondary)]"}>
                {kq.luotTB.toFixed(1)} lượt lô về
              </b>{" "}
              (chuẩn <b>{kq.luotChuan}</b>) · sửa bảng hạn mức ở trên rồi lưu là bảng này tự tính lại.
              {kq.sut && (
                <>
                  <br />
                  Quãng thua nặng nhất: <b className="text-[#ffb4b4]">{ngay(kq.sut.tu)} → {ngay(kq.sut.den)}</b>,
                  mất {tr(kq.sut.sau)} tính từ đỉnh.
                </>
              )}
            </div>

            <Duong days={kq.days} />

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-3 py-2 text-left font-bold">Kỳ</th>
                    <th className="px-2 py-2 text-right font-bold">Tổng điểm</th>
                    <th className="px-2 py-2 text-right font-bold">Lô về</th>
                    <th className="px-2 py-2 text-right font-bold">Thu</th>
                    <th className="px-2 py-2 text-right font-bold">Bù</th>
                    <th className="px-2 py-2 text-right font-bold">Lãi/Lỗ</th>
                    <th className="px-3 py-2 text-right font-bold">Dồn</th>
                  </tr>
                </thead>
                <tbody>
                  {[...kq.days].reverse().map((d) => {
                    const mo = moNgay === d.date;
                    return (
                      <Fragment key={d.date}>
                        <tr
                          onClick={() => setMoNgay(mo ? null : d.date)}
                          className={`border-t border-[var(--hairline)] cursor-pointer hover:bg-white/[0.06] ${
                            mo ? "bg-white/[0.07]" : ""
                          }`}
                        >
                          <td className="px-3 py-2 numeric text-white">
                            {mo ? "▾ " : "▸ "}
                            {ngay(d.date)}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                            {d.points.toLocaleString("vi-VN")}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                            {d.soLoVe}
                            {d.luot > d.soLoVe && (
                              <span className="text-[#ffd24a]"> ({d.luot} lượt)</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[#7ff0c0]">{tr(d.thu)}</td>
                          <td className="px-2 py-2 text-right numeric text-[#ff9d9d]">{tr(d.bu)}</td>
                          <td
                            className={`px-2 py-2 text-right numeric font-bold ${
                              d.lai > 0 ? "text-[#7ff0c0]" : d.lai < 0 ? "text-[#ff9d9d]" : ""
                            }`}
                          >
                            {(d.lai >= 0 ? "+" : "") + tr(d.lai)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right numeric ${
                              d.don >= 0 ? "text-white" : "text-[#ffb4b4]"
                            }`}
                          >
                            {(d.don >= 0 ? "+" : "") + tr(d.don)}
                          </td>
                        </tr>
                        {mo && (
                          <tr className="bg-[rgba(0,0,0,0.25)]">
                            <td colSpan={7} className="px-3 py-3">
                              <ChiTiet d={d} price={price} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function O({
  nhan, gt, phu, mau,
}: { nhan: string; gt: string; phu?: string; mau: "an" | "thua" | "deu" }) {
  const c = mau === "an" ? "#34e6a8" : mau === "thua" ? "#ff6b78" : "#8fd0ff";
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg md:text-xl leading-none" style={{ color: c }}>
        {gt}
      </div>
      {phu && <div className="text-[0.66rem] text-[var(--text-muted)] mt-1">{phu}</div>}
    </div>
  );
}

/** Running total, so the worst stretch is a shape rather than a number to hunt for. */
function Duong({ days }: { days: DayRow[] }) {
  if (days.length < 2) return null;
  const v = days.map((d) => d.don);
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v);
  const span = hi - lo || 1;
  const W = 100, H = 26;
  const x = (i: number) => (i / (days.length - 1)) * W;
  const y = (n: number) => H - ((n - lo) / span) * H;
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join(" ");
  const zero = y(0);
  const cuoi = v[v.length - 1];

  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20 md:h-24">
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="rgba(255,255,255,0.28)" strokeWidth="0.25" />
        <path d={`${d} L${W},${zero} L0,${zero} Z`} fill={cuoi >= 0 ? "rgba(52,230,168,0.14)" : "rgba(255,107,120,0.14)"} />
        <path d={d} fill="none" stroke={cuoi >= 0 ? "#34e6a8" : "#ff6b78"} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[0.62rem] text-[var(--text-muted)] numeric px-0.5">
        <span>{ngay(days[0].date)}</span>
        <span>vốn dồn · đường ngang = hoà</span>
        <span>{ngay(days[days.length - 1].date)}</span>
      </div>
    </div>
  );
}

function ChiTiet({ d, price }: { d: DayRow; price: number }) {
  const nhan = LOS.filter((lo) => d.limits[lo] > 0);
  const ct = nhan
    .map((lo) => {
      const diem = d.limits[lo], ve = d.hits[lo] ?? 0;
      const tra = diem * WIN_PER_POINT * ve;
      return { lo, diem, ve, kho: d.gaps[lo], thu: diem * price, tra, lai: diem * price - tra };
    })
    .sort((a, b) => a.lai - b.lai);
  const thua = ct.filter((c) => c.lai < 0).slice(0, 6);
  // Chỉ con nào THẬT SỰ ăn mới vào hàng ăn. Trước đây lấy sáu con lãi cao nhất
  // bất kể dấu, nên hôm nào cả sổ chỉ nhận một lô mà lô đó về thì đúng con lỗ
  // nặng nhất lại đứng luôn ở hàng "ăn nhiều nhất" — nhìn như máy hỏng.
  const an = ct.filter((c) => c.lai > 0).reverse().slice(0, 6);

  const Chip = ({ c, do_ }: { c: (typeof ct)[0]; do_: boolean }) => (
    <span
      title={`Lô ${c.lo}: khô ${c.kho} kỳ → hạn mức ${c.diem}n${c.ve ? ` · về ${c.ve} nháy` : " · không về"}`}
      className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 numeric text-[0.66rem] border ${
        do_
          ? "bg-[rgba(220,38,38,0.2)] border-[rgba(248,113,113,0.45)] text-[#ffd9d9]"
          : "bg-[rgba(16,185,129,0.14)] border-[rgba(16,185,129,0.4)] text-[#c9f4e0]"
      }`}
    >
      <b className="text-white">{c.lo}</b>
      {c.ve > 0 && <span className="text-[#ffd24a]">×{c.ve}</span>}
      <span className="opacity-70">{c.diem}n</span>
      <b>{(c.lai >= 0 ? "+" : "") + tr(c.lai)}</b>
    </span>
  );

  return (
    <div className="space-y-2">
      {nhan.length < 20 && (
        <div className="rounded-lg border border-[rgba(251,191,36,0.5)] bg-[rgba(245,158,11,0.12)] px-2.5 py-2 text-[0.72rem] leading-relaxed text-[#ffe9c4]">
          ⚠️ Kỳ này <b>cả sổ chỉ nhận {nhan.length} lô</b> — bảng hạn mức đang để hầu hết các
          ngày về 0n. Thu vào có {tr(d.thu)} mà một con về là phải trả{" "}
          {tr(Math.max(...nhan.map((lo) => d.limits[lo])) * WIN_PER_POINT)}. Sổ mỏng thế này thì
          một nháy là gãy cả kỳ.
        </div>
      )}

      <div className="text-[0.7rem] text-[var(--text-muted)]">
        {nhan.length} lô nhận cược · {d.soLoVe} lô về ({d.luot} lượt) · thu {tr(d.thu)} − bù{" "}
        {tr(d.bu)} ={" "}
        <b className={d.lai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"}>
          {(d.lai >= 0 ? "+" : "") + tr(d.lai)}
        </b>
      </div>
      {thua.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow text-[#ff9d9d]">Mất tiền nhiều nhất</span>
          {thua.map((c) => <Chip key={c.lo} c={c} do_ />)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="eyebrow text-[#7ff0c0]">Ăn nhiều nhất</span>
        {an.length > 0 ? (
          an.map((c) => <Chip key={c.lo} c={c} do_={false} />)
        ) : (
          <span className="text-[0.7rem] text-[var(--text-muted)]">
            không con nào ăn — kỳ này lô nào nhận cược cũng về
          </span>
        )}
      </div>
      <div className="text-[0.66rem] text-[var(--text-muted)]">
        Số nhỏ dưới mỗi ô là hạn mức của <b>đúng kỳ này</b>, suy từ số kỳ con đó đã khô tính tới
        sáng hôm đó. Rê chuột vào ô để xem khô mấy kỳ.
      </div>
      <div className="grid grid-cols-10 gap-1">
        {LOS.map((lo) => {
          const diem = d.limits[lo] ?? 0;
          const ve = d.hits[lo] ?? 0;
          const lai = diem * price - diem * WIN_PER_POINT * ve;
          return (
            <div
              key={lo}
              title={`Lô ${lo}: khô ${d.gaps[lo]} kỳ → hạn mức ${diem}n${
                ve ? ` · về ${ve} nháy, trả ${tr(diem * WIN_PER_POINT * ve)}` : " · không về"
              }`}
              className={`rounded px-1 py-1 text-center leading-tight border ${
                diem === 0
                  ? "bg-white/[0.03] border-[var(--hairline)] opacity-50"
                  : ve > 0
                  ? "bg-[rgba(220,38,38,0.25)] border-[rgba(248,113,113,0.5)]"
                  : "bg-[rgba(16,185,129,0.16)] border-[rgba(16,185,129,0.4)]"
              }`}
            >
              <div className="numeric text-[0.68rem] font-bold text-white">
                {lo}
                {ve > 1 && <span className="text-[#ffd24a]">×{ve}</span>}
              </div>
              <div className="numeric text-[0.55rem] text-[var(--text-secondary)]">
                {diem === 0 ? "—" : `${diem}n`}
              </div>
              {diem > 0 && (
                <div
                  className={`numeric text-[0.52rem] font-bold ${
                    lai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                  }`}
                >
                  {(lai >= 0 ? "+" : "") + tr(lai)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
