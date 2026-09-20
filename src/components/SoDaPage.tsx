"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { dungKy } from "@/lib/slot-stats";
import {
  GIA_DA, TRUNG_DA, bienDa, soVong, thongKeDa, tinhVe,
  type ThongKeDa,
} from "@/lib/da";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const tenNgay = (i: number, tran: number) => (i === 0 ? "vừa ra" : i >= tran ? `${tran}+` : `${i}`);

/**
 * Tab Số Đá — khung sườn: giá, vòng, và thống kê theo cặp ngày.
 *
 * Khách đặt đúng thứ tự làm: "làm khung sườn trước, chiến lược sau", và
 * "trước mắt xử lý chính xác làm giá và tính vòng chuẩn". Nên trang này chưa
 * khuyên ôm nhóm nào — nó dựng đúng ba thứ đó rồi dừng.
 *
 * Phần đáng chú ý nhất nằm ngay ô đầu: bên lô, giá 27.000đ cho đúng biên
 * 0,00% nên không cách chặn nào đẻ ra lời. Bên đá, ở giá khách đang chạy,
 * biên DƯƠNG thật — vì đá ăn theo CẶP (hai con cùng có mặt thì trúng, đếm một
 * lần) chứ không ăn theo từng nháy như lô.
 */
export default function SoDaPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  // Máy tính vòng — mặc định đúng ví dụ khách đưa: đá 5 con ra 10 vòng.
  const [soCon, setSoCon] = useState(5);
  const [diem, setDiem] = useState(1);
  const [conVe, setConVe] = useState(2);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setLoi(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws((d.draws ?? []) as DrawHits[]))
      .catch(() => !huy && setLoi("Không tải được dữ liệu"));
    return () => { huy = true; };
  }, [region]);

  const tk: ThongKeDa | null = useMemo(() => {
    if (!draws) return null;
    return thongKeDa(dungKy(draws), region, 10);
  }, [draws, region]);

  const ve = useMemo(() => tinhVe(soCon, diem, conVe, region), [soCon, diem, conVe, region]);
  const chuan = bienDa(region);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── 1. Giá và biên ─────────────────────────────────────────── */}
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🎲 Giá Đá &amp; Phần Ăn</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Một vòng = hai con. Hai con cùng có mặt trong kỳ là trúng, đếm một lần.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[0.74rem]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1.5 pr-2 font-semibold">Miền</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">1 điểm</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Trúng</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Cả hai cùng về</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Trả TB</th>
                  <th className="py-1.5 font-semibold text-right">Phần ăn</th>
                </tr>
              </thead>
              <tbody>
                {MIEN.map((r) => {
                  const b = bienDa(r);
                  return (
                    <tr
                      key={r}
                      className="border-t border-[var(--hairline)]"
                      style={r === region ? { background: "rgba(59,130,246,0.1)" } : undefined}
                    >
                      <td className="py-1.5 pr-2">
                        <b className="text-white">{REGION_LABELS[r]}</b>
                        <div className="text-[0.64rem] text-[var(--text-muted)]">{b.giai} giải</div>
                      </td>
                      <td className="py-1.5 pr-2 text-right numeric">{tien(b.gia)}</td>
                      <td className="py-1.5 pr-2 text-right numeric">{tien(b.trung)}</td>
                      <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">
                        {(b.p * 100).toFixed(3)}%
                      </td>
                      <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">
                        {tien(b.traTB)}
                      </td>
                      <td className="py-1.5 text-right numeric font-bold" style={{ color: mau(b.bien) }}>
                        {pc(b.bien)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] px-3 py-2.5 text-[0.76rem] leading-relaxed text-[var(--text-secondary)]">
            <b className="text-white">Đá khác lô ở chỗ quyết định.</b> Lô ăn theo <b>từng nháy</b>:
            con về hai nháy thì trả hai lần, nên ở giá 27.000đ phần ăn đúng bằng{" "}
            <b>0,00%</b> — chặn kiểu gì cũng không đẻ ra lời. Đá ăn theo <b>cặp</b>: hai con cùng
            có mặt là trúng, đếm một lần. Nên ở giá đang chạy, phần ăn{" "}
            <b style={{ color: mau(chuan.bien) }}>{pc(chuan.bien)}</b> là{" "}
            <b>dương thật</b>.
            <br />
            Giá hoà vốn của {REGION_LABELS[region]} là{" "}
            <b className="text-white">{tien(chuan.giaHoaVon)}</b> một điểm — đang bán{" "}
            <b className="text-white">{tien(chuan.gia)}</b>.
          </div>
        </div>
      </section>

      {/* ── 2. Máy tính vòng ───────────────────────────────────────── */}
      <section className="plate rise rise-2">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🧮 Tính Vòng</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Đá <b>a</b> con thì có <b>a × (a − 1) ÷ 2</b> vòng · {REGION_LABELS[region]}
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { nhan: "Đá mấy con", gt: soCon, dat: setSoCon, min: 2, max: 40 },
              { nhan: "Mỗi vòng mấy điểm", gt: diem, dat: setDiem, min: 1, max: 1000 },
              { nhan: "Rồi mấy con về", gt: conVe, dat: setConVe, min: 0, max: 40 },
            ].map((x) => (
              <label key={x.nhan} className="block">
                <span className="eyebrow block mb-1">{x.nhan}</span>
                <input
                  type="number"
                  value={x.gt}
                  min={x.min}
                  max={x.max}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) x.dat(Math.max(x.min, Math.min(x.max, Math.floor(v))));
                  }}
                  className="w-full bg-black/25 border border-[var(--hairline)] rounded-lg px-2 py-1.5 text-white numeric text-sm"
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <O nhan="Số vòng" gt={String(ve.vong)} phu={`${ve.soCon} × ${ve.soCon - 1} ÷ 2`} mau="#8fd0ff" />
            <O nhan="Khách đặt" gt={tien(ve.thu)} phu={`${ve.vong} vòng × ${diem} điểm`} mau="#34e6a8" />
            <O nhan="Vòng trúng" gt={String(ve.vongTrung)} phu={`${ve.conVe} con về ghép được`} mau="#ffd24a" />
            <O nhan="Mình phải trả" gt={tien(ve.tra)} phu={`${ve.vongTrung} vòng × ${tien(TRUNG_DA[region])}`} mau="#ff6b78" />
          </div>

          <div
            className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed"
            style={{
              borderColor: ve.lai >= 0 ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
              background: ve.lai >= 0 ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
            }}
          >
            Vé này mình <b style={{ color: mau(ve.lai) }}>{ve.lai >= 0 ? "ăn" : "mất"} {tien(Math.abs(ve.lai))}</b>
            {" "}— thu <b>{tien(ve.thu)}</b>, trả <b>{tien(ve.tra)}</b>.
            {ve.conVe >= 2 && (
              <>
                {" "}Hoà vốn khi khách trúng dưới{" "}
                <b className="text-white">
                  {(ve.vong * GIA_DA[region] * diem / (TRUNG_DA[region] * diem)).toFixed(2)} vòng
                </b>.
              </>
            )}
          </div>

          <div>
            <div className="eyebrow mb-1.5">Tra nhanh — đá mấy con thì mấy vòng</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 11 }, (_, i) => i + 2).map((a) => (
                <button
                  key={a}
                  onClick={() => setSoCon(a)}
                  className={`rounded px-2 py-1 text-[0.7rem] border transition-colors ${
                    soCon === a
                      ? "border-[#2563eb] bg-[#2563eb] text-white"
                      : "border-[var(--hairline)] bg-white/[0.04] text-[var(--text-secondary)] hover:bg-white/[0.1]"
                  }`}
                >
                  <b className="numeric">{a}</b> con · <b className="numeric">{soVong(a)}</b> vòng
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Lưới cặp ngày ───────────────────────────────────────── */}
      <section className="plate rise rise-3">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">📊 Cặp Ngày — Đo Trên Lịch Sử</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Ghép hai con theo số kỳ chưa về, từ <b>vừa ra</b> tới <b>10</b> ·{" "}
              {REGION_LABELS[region]}
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
          {!draws && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}
          {tk && <LuoiCap tk={tk} />}
        </div>
      </section>
    </div>
  );
}

/** Lưới tam giác: mỗi ô là một cặp bậc ngày, tô theo phần ăn đo được. */
function LuoiCap({ tk }: { tk: ThongKeDa }) {
  const [chon, setChon] = useState<string | null>(null);
  const tran = tk.tran;
  const bang = new Map(tk.bang.map((x) => [`${x.i}-${x.j}`, x]));
  const oChon = chon ? bang.get(chon) : null;

  // Tô theo phần ăn, lấy mức chuẩn làm gốc để mắt so được.
  const nen = (bien: number) => {
    const d = Math.max(-8, Math.min(8, bien)) / 8;
    return d >= 0
      ? `rgba(16,185,129,${(0.08 + d * 0.32).toFixed(3)})`
      : `rgba(220,38,38,${(0.08 + -d * 0.32).toFixed(3)})`;
  };

  return (
    <>
      <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
        Đo trên <b className="text-white">{tk.soKy} kỳ</b>: gộp hết lại thì{" "}
        <b className="text-white">{tk.tong.dip.toLocaleString("vi-VN")}</b> cặp, có{" "}
        <b className="text-white">{(tk.tong.tyLe * 100).toFixed(3)}%</b> số cặp cả hai cùng về —
        mức tính bằng toán là <b>{(tk.chuan.p * 100).toFixed(3)}%</b>. Phần ăn đo được{" "}
        <b style={{ color: mau(tk.tong.bien) }}>{pc(tk.tong.bien)}</b>, mức chuẩn{" "}
        <b style={{ color: mau(tk.chuan.bien) }}>{pc(tk.chuan.bien)}</b>.
      </div>

      <div className="overflow-x-auto">
        <table className="text-[0.62rem] border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="text-[var(--text-muted)] font-semibold px-1">ngày</th>
              {Array.from({ length: tran + 1 }, (_, j) => (
                <th key={j} className="text-[var(--text-muted)] font-semibold px-1 numeric">
                  {tenNgay(j, tran)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: tran + 1 }, (_, i) => (
              <tr key={i}>
                <th className="text-[var(--text-muted)] font-semibold px-1 text-right numeric">
                  {tenNgay(i, tran)}
                </th>
                {Array.from({ length: tran + 1 }, (_, j) => {
                  if (j < i) return <td key={j} />;
                  const key = `${i}-${j}`;
                  const o = bang.get(key);
                  if (!o) return <td key={j} className="text-[var(--text-muted)] text-center">·</td>;
                  return (
                    <td key={j}>
                      <button
                        onClick={() => setChon(chon === key ? null : key)}
                        title={`${tenNgay(i, tran)} + ${tenNgay(j, tran)} · ${o.dip.toLocaleString("vi-VN")} cặp · cả hai cùng về ${(o.tyLe * 100).toFixed(2)}%`}
                        className="w-full rounded px-1 py-1 numeric font-bold"
                        style={{
                          background: nen(o.bien),
                          color: mau(o.bien),
                          outline: chon === key ? "2px solid #2563eb" : "none",
                        }}
                      >
                        {o.bien >= 0 ? "+" : "−"}{Math.abs(o.bien).toFixed(1)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
        Mỗi ô là phần ăn (%) của cặp ngày đó, đo trên lịch sử. Xanh là mình ăn, đỏ là mình lỗ.
        Bấm vào ô để xem chi tiết. Ô có ít cặp thì con số rất dễ là may rủi — xem cột &ldquo;số
        cặp&rdquo; trước khi tin.
      </div>

      {oChon && (
        <div className="rounded-lg border border-[rgba(59,130,246,0.45)] bg-[rgba(37,99,235,0.1)] px-3 py-2.5 text-[0.76rem] leading-relaxed">
          <div className="font-extrabold text-white mb-1">
            Ngày {tenNgay(oChon.i, tran)} ghép ngày {tenNgay(oChon.j, tran)}
          </div>
          <div className="text-[var(--text-secondary)]">
            <b className="text-white">{oChon.dip.toLocaleString("vi-VN")}</b> cặp trong{" "}
            {tk.soKy} kỳ, trong đó <b className="text-white">{oChon.caHai.toLocaleString("vi-VN")}</b>{" "}
            cặp cả hai cùng về = <b className="text-white">{(oChon.tyLe * 100).toFixed(3)}%</b>{" "}
            (mức chuẩn {(tk.chuan.p * 100).toFixed(3)}%).
            <br />
            Nếu ôm 1 điểm mỗi cặp: thu <b className="text-[#7ff0c0]">{tien(oChon.thu)}</b>, trả{" "}
            <b className="text-[#ff9d9d]">{tien(oChon.tra)}</b> →{" "}
            <b style={{ color: mau(oChon.lai) }}>
              {oChon.lai >= 0 ? "ăn" : "lỗ"} {tien(Math.abs(oChon.lai))}
            </b>{" "}
            ({pc(oChon.bien)}).
          </div>
        </div>
      )}
    </>
  );
}

function O({ nhan, gt, phu, mau: m }: { nhan: string; gt: string; phu: string; mau: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.64rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
