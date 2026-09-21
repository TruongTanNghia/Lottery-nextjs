"use client";

import { useMemo, useState } from "react";
import type { KyDaRow } from "@/lib/da";
import { REGION_LABELS, type Region } from "@/lib/types";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

const CUA_SO = [30, 60, 90, 0] as const;

/**
 * Sổ đá lời hay lỗ, từng kỳ một — cùng khuôn với khối dò lại bên Dashboard.
 *
 * Cột đáng đọc nhất là "con về": kỳ nào cũng thu đúng ngần ấy tiền, còn tiền
 * trả thì do số con về quyết định, và quyết định theo bình phương. Nhìn cột đó
 * cạnh cột lời/lỗ là hiểu ngay vì sao đá có những kỳ lỗ rất sâu.
 */
export default function DaTungKy({ rows, region, daCai = false }: { rows: KyDaRow[]; region: Region; daCai?: boolean }) {
  const [soKy, setSoKy] = useState<number>(30);
  const [moBang, setMoBang] = useState(false);

  const v = useMemo(() => {
    const ds = soKy > 0 && soKy < rows.length ? rows.slice(-soKy) : rows;
    let don = 0, thu = 0, tra = 0, kyLo = 0, dinh = 0, sut = 0;
    const out = ds.map((r) => {
      don += r.lai;
      thu += r.thu;
      tra += r.tra;
      if (r.lai < 0) kyLo++;
      if (don > dinh) dinh = don;
      if (dinh - don > sut) sut = dinh - don;
      return { ...r, don };
    });
    const xep = [...out].sort((a, b) => b.lai - a.lai);
    return {
      ds: out, thu, tra, lai: thu - tra, kyLo, sut,
      dep: xep.slice(0, 5),
      te: xep.slice(-5).reverse(),
      veTB: out.length ? out.reduce((s, r) => s + r.soLoVe, 0) / out.length : 0,
    };
  }, [rows, soKy]);

  if (rows.length === 0) return null;
  const n = v.ds.length;

  return (
    <section className="plate rise rise-3">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📒 Đá Lời Hay Lỗ — Từng Kỳ</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} ·{" "}
            {daCai
              ? "tính theo Bảng Tiền Đá đã lưu — kỳ nào thu bao nhiêu tuỳ số cặp rơi vào từng ô"
              : `ôm đều 1 điểm mỗi cặp · kỳ nào cũng thu ${tien(rows[0].thu)}`}
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CUA_SO.map((k) => (
            <button
              key={k}
              onClick={() => setSoKy(k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                soKy === k ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {k === 0 ? `Tất cả ${rows.length} kỳ` : `${k} kỳ`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <O nhan={`Lãi / Lỗ · ${n} kỳ`} gt={dau(v.lai)} phu={`${pc(v.thu > 0 ? (v.lai / v.thu) * 100 : 0)} trên tổng thu`} m={mau(v.lai)} />
          <O nhan="Tổng thu" gt={tien(v.thu)} phu={`trả ra ${tien(v.tra)}`} m="#8fd0ff" />
          <O nhan="Số kỳ lỗ" gt={`${v.kyLo}/${n}`} phu={`trung bình ${v.veTB.toFixed(1)} con về mỗi kỳ`} m="#ffd24a" />
          <O nhan="Sụt sâu nhất" gt={v.sut > 0 ? "−" + tien(v.sut) : tien(0)} phu="từ đỉnh xuống đáy" m="#ff6b78" />
        </div>

        <Duong ds={v.ds} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Top tieuDe="5 kỳ ăn đậm nhất" ds={v.dep} />
          <Top tieuDe="5 kỳ lỗ nặng nhất" ds={v.te} />
        </div>

        <div>
          <button onClick={() => setMoBang((x) => !x)} className="text-[0.76rem] font-bold text-[#8fd0ff] hover:text-white">
            {moBang ? "▾" : "▸"} Xem từng kỳ — {n} kỳ, mới nhất ở trên
          </button>
          {moBang && (
            <div className="overflow-auto mt-2 max-h-[26rem] rounded-lg border border-[var(--hairline)]">
              <table className="w-full text-[0.72rem] min-w-[340px]">
                <thead className="sticky top-0 bg-[#16233d]">
                  <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-2 py-1.5 text-left font-bold">Kỳ</th>
                    <th className="px-2 py-1.5 text-right font-bold">Con về</th>
                    <th className="px-2 py-1.5 text-right font-bold">Cặp trúng</th>
                    <th className="px-2 py-1.5 text-right font-bold">Trả</th>
                    <th className="px-2 py-1.5 text-right font-bold">Lời / Lỗ</th>
                    <th className="px-2 py-1.5 text-right font-bold">Dồn</th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.ds].reverse().map((r) => (
                    <tr key={r.date} className="border-t border-[var(--hairline)]">
                      <td className="px-2 py-1 numeric text-white">{dd(r.date)}</td>
                      <td className="px-2 py-1 text-right numeric">{r.soLoVe}</td>
                      <td className="px-2 py-1 text-right numeric">{r.capTrung}</td>
                      <td className="px-2 py-1 text-right numeric text-[var(--text-secondary)]">{tien(r.tra)}</td>
                      <td className="px-2 py-1 text-right numeric font-bold" style={{ color: mau(r.lai) }}>{dau(r.lai)}</td>
                      <td className="px-2 py-1 text-right numeric" style={{ color: mau(r.don) }}>{dau(r.don)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
          Cặp trúng = ghép đôi mọi con đã về: 28 con về là 378 cặp, 32 con về là 496 cặp, 36 con về là
          630 cặp. Thu mỗi kỳ không đổi, nên kỳ nào đông con về là kỳ đó lỗ — và lỗ rất nhanh.
        </div>
      </div>
    </section>
  );
}

function Duong({ ds }: { ds: { date: string; don: number }[] }) {
  if (ds.length < 2) return null;
  const v = ds.map((d) => d.don);
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v);
  const span = hi - lo || 1;
  const W = 100, H = 26;
  const x = (i: number) => (i / (ds.length - 1)) * W;
  const y = (n: number) => H - ((n - lo) / span) * H;
  const d = v.map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join(" ");
  const cuoi = v[v.length - 1];
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-20 md:h-24">
        <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke="rgba(255,255,255,0.28)" strokeWidth="0.25" />
        <path d={`${d} L${W},${y(0)} L0,${y(0)} Z`} fill={cuoi >= 0 ? "rgba(52,230,168,0.14)" : "rgba(255,107,120,0.14)"} />
        <path d={d} fill="none" stroke={cuoi >= 0 ? "#34e6a8" : "#ff6b78"} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[0.62rem] text-[var(--text-muted)] numeric px-0.5">
        <span>{dd(ds[0].date)}</span>
        <span>tiền dồn · đường ngang = hoà</span>
        <span>{dd(ds[ds.length - 1].date)}</span>
      </div>
    </div>
  );
}

function Top({ tieuDe, ds }: { tieuDe: string; ds: KyDaRow[] }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2">
      <div className="eyebrow mb-1.5">{tieuDe}</div>
      <div className="space-y-1">
        {ds.map((r) => (
          <div key={r.date} className="flex items-baseline justify-between text-[0.74rem]">
            <span className="numeric text-white">
              {dd(r.date)} <span className="text-[var(--text-muted)]">· {r.soLoVe} con về</span>
            </span>
            <b className="numeric" style={{ color: mau(r.lai) }}>{dau(r.lai)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg md:text-xl leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.64rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
