"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { dungKy } from "@/lib/slot-stats";
import { GIA_DA, TRUNG_DA, bienDa, soTungKy, soVong, tinhVe } from "@/lib/da";
import DaBaoCaoThang from "./DaBaoCaoThang";
import DaCapNgay from "./DaCapNgay";
import DaTungKy from "./DaTungKy";
import ThuGon from "./ThuGon";
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

/**
 * Tab Số Đá — dựng theo đúng khuôn của Dashboard.
 *
 * Bản đầu chỉ có giá, máy tính vòng và một cái lưới màu; người vận hành xem
 * xong nói thẳng là "chưa có thống kê rõ ràng, bắt chước cái dash mà làm".
 * Dashboard trả lời ba câu bằng tiền, nên tab này giờ cũng trả lời đúng ba câu
 * đó cho đá: tháng này lời hay lỗ (Báo Cáo Tháng), từng kỳ ra sao (Từng Kỳ),
 * và cặp ngày nào đẹp (Cặp Ngày Nào Đẹp Nhất).
 *
 * Tất cả nằm trong tab này. Dashboard không bị đụng tới.
 */
export default function SoDaPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

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

  const ky = useMemo(() => (draws ? dungKy(draws) : null), [draws]);
  const rows = useMemo(() => (ky ? soTungKy(ky, region) : null), [ky, region]);
  const chuan = bienDa(region);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── Giá và phần ăn ─────────────────────────────────────────── */}
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
                      <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">{tien(b.traTB)}</td>
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
            <b className="text-white">Đá khác lô ở chỗ quyết định.</b> Lô ăn theo <b>từng nháy</b>: con về hai
            nháy thì trả hai lần, nên ở giá 27.000đ phần ăn đúng bằng <b>0,00%</b>. Đá ăn theo <b>cặp</b>: hai
            con cùng có mặt là trúng, đếm một lần. Nên ở giá đang chạy, phần ăn{" "}
            <b style={{ color: mau(chuan.bien) }}>{pc(chuan.bien)}</b> là <b>dương thật</b>.
            <br />
            Giá hoà vốn của {REGION_LABELS[region]} là <b className="text-white">{tien(chuan.giaHoaVon)}</b> một
            điểm — đang bán <b className="text-white">{tien(chuan.gia)}</b>.
          </div>
        </div>
      </section>

      {/* ── Ba khối thống kê, cùng khuôn Dashboard ──────────────────── */}
      <DaBaoCaoThang />

      {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
      {!ky && !loi && (
        <section className="plate rise rise-3">
          <div className="p-4 text-sm text-[var(--text-muted)]">Đang tính…</div>
        </section>
      )}
      {ky && rows && <DaTungKy rows={rows} region={region} />}
      {ky && <DaCapNgay ky={ky} region={region} />}

      {/* ── Máy tính vòng — công cụ tra, gập lại được ────────────────── */}
      <TinhVong region={region} />
    </div>
  );
}

function TinhVong({ region }: { region: Region }) {
  // Mặc định đúng ví dụ khách đưa: đá 5 con ra 10 vòng.
  const [soCon, setSoCon] = useState(5);
  const [diem, setDiem] = useState(1);
  const [conVe, setConVe] = useState(2);
  const ve = useMemo(() => tinhVe(soCon, diem, conVe, region), [soCon, diem, conVe, region]);

  return (
    <ThuGon
      khoa="da-tinh-vong"
      moSan
      className="plate rise rise-3"
      tieuDe="🧮 Tính Vòng"
      phu={<>Đá <b>a</b> con thì có <b>a × (a − 1) ÷ 2</b> vòng · {REGION_LABELS[region]}</>}
    >
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
          <O nhan="Số vòng" gt={String(ve.vong)} phu={`${ve.soCon} × ${ve.soCon - 1} ÷ 2`} m="#8fd0ff" />
          <O nhan="Khách đặt" gt={tien(ve.thu)} phu={`${ve.vong} vòng × ${diem} điểm`} m="#34e6a8" />
          <O nhan="Vòng trúng" gt={String(ve.vongTrung)} phu={`${ve.conVe} con về ghép được`} m="#ffd24a" />
          <O nhan="Mình phải trả" gt={tien(ve.tra)} phu={`${ve.vongTrung} vòng × ${tien(TRUNG_DA[region])}`} m="#ff6b78" />
        </div>

        <div
          className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed"
          style={{
            borderColor: ve.lai >= 0 ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
            background: ve.lai >= 0 ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
          }}
        >
          Vé này mình <b style={{ color: mau(ve.lai) }}>{ve.lai >= 0 ? "ăn" : "mất"} {tien(Math.abs(ve.lai))}</b>{" "}
          — thu <b>{tien(ve.thu)}</b>, trả <b>{tien(ve.tra)}</b>.
          {ve.conVe >= 2 && (
            <>
              {" "}Hoà vốn khi khách trúng dưới{" "}
              <b className="text-white">{((ve.vong * GIA_DA[region]) / TRUNG_DA[region]).toFixed(2)} vòng</b>.
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
    </ThuGon>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.64rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
