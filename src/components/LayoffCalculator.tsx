"use client";

import { useMemo, useState } from "react";
import { POSITIONS, WIN_PER_POINT, STAKE_PRICE } from "@/lib/exposure";
import { REGION_LABELS, type Region } from "@/lib/types";

/**
 * Mua sỉ – bán lẻ.
 *
 * The third party takes any volume at a fixed price per point and settles
 * every win, so a bet passed straight through has no outcome risk at all:
 * the day's profit is (retail − wholesale) × points, known before the draw.
 * Whatever is kept instead carries the same expected profit only if the
 * wholesale price equals fair value — and buys variance for the privilege.
 *
 * The lesson the numbers keep repeating: the margin lives entirely in the gap
 * between the two prices, never in which numbers land.
 */

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "đ";
const tr = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)} triệu`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};

export default function LayoffCalculator({ region }: { region: Region }) {
  const [doanhSo, setDoanhSo] = useState(200_000_000);
  const [giaBan, setGiaBan] = useState(STAKE_PRICE[region]);
  const [giaDay, setGiaDay] = useState(STAKE_PRICE[region]);
  const [tyLeDay, setTyLeDay] = useState(100);

  const r = useMemo(() => {
    /** Expected payout per point — the true cost of carrying a bet. */
    const giaVon = (POSITIONS[region] / 100) * WIN_PER_POINT;
    const diem = giaBan > 0 ? doanhSo / giaBan : 0;

    const diemDay = (diem * tyLeDay) / 100;
    const diemGiu = diem - diemDay;

    // Passed through: certain. Kept: same expectation only when the wholesale
    // price is fair, but with the whole spread of outcomes attached.
    const loiDay = diemDay * (giaBan - giaDay);
    const loiGiuKyVong = diemGiu * (giaBan - giaVon);

    // Worst realistic day on the kept portion: every kept point sits on one lô
    // and it lands twice. Deliberately pessimistic — that is the point of a
    // worst case.
    const xauNhat = diemGiu * giaBan - diemGiu * WIN_PER_POINT * 2;

    return {
      giaVon,
      diem,
      diemDay,
      diemGiu,
      loiDay,
      loiGiuKyVong,
      tong: loiDay + loiGiuKyVong,
      xauNhat: loiDay + xauNhat,
      bien: doanhSo > 0 ? (loiDay + loiGiuKyVong) / doanhSo : 0,
    };
  }, [doanhSo, giaBan, giaDay, tyLeDay, region]);

  const chenh = giaBan - giaDay;

  return (
    <section className="plate rise rise-4 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">💱 Thử Mô Hình Mua Sỉ – Bán Lẻ</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Nhận của khách rồi đẩy sang bên thứ 3 — lời nằm ở phần chênh giá, không phụ thuộc số
            nào về
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-4">
        {/* Ô nhập */}
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Doanh số mỗi ngày"
            value={doanhSo}
            onChange={setDoanhSo}
            step={10_000_000}
            hint={`${Math.round(r.diem).toLocaleString("vi-VN")} điểm`}
          />
          <Field
            label="Giá BÁN cho khách"
            value={giaBan}
            onChange={setGiaBan}
            step={100}
            hint={`giá vốn thật ${vnd(r.giaVon)}`}
          />
          <Field
            label="Giá ĐẨY bên thứ 3"
            value={giaDay}
            onChange={setGiaDay}
            step={100}
            hint="tiền phải trả họ mỗi điểm"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--text-secondary)]">Tỉ lệ đẩy đi</span>
            <span className="numeric font-bold text-white">{tyLeDay}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={tyLeDay}
            onChange={(e) => setTyLeDay(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-[0.65rem] text-[var(--text-muted)]">
            <span>Ôm hết (rủi ro cao)</span>
            <span>Đẩy hết (không rủi ro)</span>
          </div>
        </div>

        {/* Kết quả */}
        <div className="grid gap-3 md:grid-cols-3">
          <Stat
            label="Chênh giá mỗi điểm"
            value={vnd(chenh)}
            tone={chenh > 0 ? "good" : chenh < 0 ? "bad" : "flat"}
          />
          <Stat
            label="Lời mỗi ngày"
            value={tr(r.tong)}
            tone={r.tong > 0 ? "good" : r.tong < 0 ? "bad" : "flat"}
            sub={`${(r.bien * 100).toFixed(2)}% doanh số`}
          />
          <Stat
            label="Lời mỗi tháng"
            value={tr(r.tong * 30)}
            tone={r.tong > 0 ? "good" : r.tong < 0 ? "bad" : "flat"}
          />
        </div>

        <div
          className={`rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed ${
            r.diemGiu < 1
              ? "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.45)] text-[#c9f4e0]"
              : "bg-[rgba(245,158,11,0.12)] border-[rgba(251,191,36,0.45)] text-[#ffe0a8]"
          }`}
        >
          {r.diemGiu < 1 ? (
            <>
              <strong>Đẩy 100% — không rủi ro.</strong> Số nào về cũng mặc kệ, bên thứ 3 trả. Lời{" "}
              <strong>{tr(r.tong)}</strong> mỗi ngày là con số <strong>biết trước khi xổ</strong>.
              {chenh <= 0 && (
                <>
                  <br />
                  ⚠️ Đang bán bằng hoặc dưới giá đẩy → lời {tr(r.tong)}. Phải bán cao hơn giá đẩy
                  mới có lời.
                </>
              )}
            </>
          ) : (
            <>
              <strong>Đang giữ lại {Math.round(r.diemGiu).toLocaleString("vi-VN")} điểm.</strong>{" "}
              Phần này lời kỳ vọng {tr(r.loiGiuKyVong)} nhưng <strong>có thể lỗ</strong> — ngày xấu
              nhất cả sổ về <strong className="text-[#ff9d9d]">{tr(r.xauNhat)}</strong>.
              {giaDay <= r.giaVon && (
                <>
                  <br />
                  💡 Giá đẩy ({vnd(giaDay)}) không cao hơn giá vốn ({vnd(r.giaVon)}) → giữ lại
                  không được lợi gì thêm mà vẫn ôm rủi ro. <strong>Nên đẩy 100%.</strong>
                </>
              )}
            </>
          )}
        </div>

        {/* Bảng giá bán */}
        <div>
          <div className="eyebrow mb-1.5">Nếu bán ở các mức giá khác (đẩy 100%)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[440px]">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-2 py-2 text-left font-bold">Giá bán khách</th>
                  <th className="px-2 py-2 text-right font-bold">Chênh/điểm</th>
                  <th className="px-2 py-2 text-right font-bold">Lời/ngày</th>
                  <th className="px-2 py-2 text-right font-bold">Lời/tháng</th>
                  <th className="px-2 py-2 text-right font-bold">Biên</th>
                </tr>
              </thead>
              <tbody>
                {[0, 250, 500, 750, 1000, 1421, 2000].map((them) => {
                  const g = giaDay + them;
                  const diem = g > 0 ? doanhSo / g : 0;
                  const loi = diem * them;
                  return (
                    <tr
                      key={them}
                      className={`border-t border-[var(--hairline)] ${
                        them === 1421 ? "bg-[rgba(16,185,129,0.1)]" : ""
                      }`}
                    >
                      <td className="px-2 py-2 numeric text-white">
                        {them === 1421 && "⭐ "}
                        {vnd(g)}
                      </td>
                      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                        {them === 0 ? "—" : "+" + vnd(them)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right numeric font-bold ${
                          loi > 0 ? "text-[#7ff0c0]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {tr(loi)}
                      </td>
                      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                        {tr(loi * 30)}
                      </td>
                      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                        {((them / g) * 100).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
          {REGION_LABELS[region]}: {POSITIONS[region]} vị trí giải/kỳ → giá vốn thật{" "}
          <strong>{vnd(r.giaVon)}</strong>/điểm. Đẩy hết thì mỗi ngày lời đúng bằng{" "}
          <em>chênh giá × số điểm</em> — không liên quan tới kết quả xổ, nên không có ngày lỗ và
          cũng không có ngày trúng đậm.
        </p>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-1">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="numeric w-full px-3 py-2 rounded-lg text-sm bg-[rgba(255,255,255,0.06)] border border-[var(--hairline)] text-white"
      />
      {hint && <div className="text-[0.65rem] text-[var(--text-muted)] mt-1">{hint}</div>}
    </label>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "flat";
  sub?: string;
}) {
  const color =
    tone === "good" ? "text-[#7ff0c0]" : tone === "bad" ? "text-[#ff9d9d]" : "text-white";
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className={`numeric text-xl font-bold mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
