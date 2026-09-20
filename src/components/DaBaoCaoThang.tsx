"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { dungKy } from "@/lib/slot-stats";
import { bienDa, doLechKy, gomThang, soTungKy, type ThangDa } from "@/lib/da";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const TEN_NGAN: Record<Region, string> = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" };

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const tenThang = (t: string) => `Tháng ${Number(t.slice(5))}/${t.slice(0, 4)}`;

interface MienDa {
  region: Region;
  thang: ThangDa[];
  /** Độ lệch chuẩn lời/lỗ của MỘT kỳ — nhân căn số kỳ ra dao động của tháng. */
  sdKy: number;
  bienChuan: number;
  tuNgay: string;
  denNgay: string;
}

/**
 * Báo cáo tháng của sổ đá — cùng khuôn với Báo Cáo Tháng bên Dashboard.
 *
 * Cuốn sổ đem ra đo: ôm đều 1 điểm mỗi cặp, đủ 4.950 cặp ghép từ 100 con. Bên
 * lô, mức chờ đợi của một tháng là 0 nên câu hỏi chỉ là "lệch bao nhiêu thì
 * còn bình thường". Bên đá mức chờ đợi DƯƠNG, nên mỗi tháng phải so với hai
 * thứ: mức chờ đợi của nó, và khoảng dao động quanh mức đó. Một tháng đá lỗ
 * không có nghĩa là giá sai — tháng nào đông con về thì số cặp trúng tăng theo
 * bình phương, nên dao động của đá rộng hơn lô nhiều.
 */
export default function DaBaoCaoThang() {
  const [ds, setDs] = useState<MienDa[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    Promise.all(
      MIEN.map(async (r) => {
        const h = await fetch(`/api/history/hits?region=${r}`).then((x) => x.json());
        const ky = dungKy((h.draws ?? []) as DrawHits[]);
        const rows = soTungKy(ky, r);
        return {
          region: r,
          thang: gomThang(rows),
          sdKy: doLechKy(rows),
          bienChuan: bienDa(r).bien,
          tuNgay: rows[0]?.date ?? "",
          denNgay: rows[rows.length - 1]?.date ?? "",
        };
      })
    )
      .then((x) => !huy && setDs(x))
      .catch(() => !huy && setLoi("Không tải được dữ liệu báo cáo"));
    return () => { huy = true; };
  }, []);

  const cacThang = useMemo(() => {
    if (!ds) return [];
    const chung = ds.map((d) => d.thang.map((t) => t.thang)).reduce((a, b) => a.filter((x) => b.includes(x)));
    return [...chung].sort().reverse();
  }, [ds]);

  return (
    <section className="plate rise rise-2">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📅 Báo Cáo Tháng — Số Đá</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Ôm đều 1 điểm mỗi cặp, đủ 4.950 cặp · mỗi tháng đứng riêng
            {ds?.[0]?.tuNgay && ` · đo từ ${ds[0].tuNgay.slice(8, 10)}/${ds[0].tuNgay.slice(5, 7)}`}
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
        {!ds && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}

        {ds &&
          cacThang.map((thang, idx) => {
            const dong = ds.map((d) => ({ d, o: d.thang.find((t) => t.thang === thang)! }));
            const gThu = dong.reduce((s, x) => s + x.o.thu, 0);
            const gTra = dong.reduce((s, x) => s + x.o.tra, 0);
            const gLai = gThu - gTra;
            const choDoi = dong.reduce((s, x) => s + (x.d.bienChuan / 100) * x.o.thu, 0);
            // Ba miền xổ độc lập nên dao động cộng theo bình phương.
            const sd = Math.sqrt(dong.reduce((s, x) => s + x.d.sdKy ** 2 * x.o.soKy, 0));
            const lech = gLai - choDoi;
            const trong = Math.abs(lech) <= 2 * sd;
            const dangChay = idx === 0;

            return (
              <div
                key={thang}
                className="rounded-lg border px-3 py-2.5"
                style={{
                  borderColor: dangChay ? "rgba(59,130,246,0.5)" : "var(--hairline)",
                  background: dangChay ? "rgba(37,99,235,0.07)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-extrabold text-white text-[0.9rem]">{tenThang(thang)}</span>
                  {dangChay && (
                    <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-bold bg-[rgba(59,130,246,0.25)] text-[#a9c9ff]">
                      ĐANG CHẠY
                    </span>
                  )}
                  <span className="text-[0.66rem] text-[var(--text-muted)]">{dong[0].o.soKy} kỳ</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[0.74rem] min-w-[300px]">
                    <thead>
                      <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="py-1 pr-2 text-left font-bold">Miền</th>
                        <th className="py-1 pr-2 text-right font-bold">Nhận</th>
                        <th className="py-1 pr-2 text-right font-bold">Trả</th>
                        <th className="py-1 pr-2 text-right font-bold">Lời / Lỗ</th>
                        <th className="py-1 text-right font-bold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dong.map(({ d, o }) => (
                        <tr key={d.region} className="border-t border-[var(--hairline)]">
                          <td className="py-1 pr-2 text-white">
                            <b>{TEN_NGAN[d.region]}</b>{" "}
                            <span className="text-[var(--text-muted)]">{REGION_LABELS[d.region]}</span>
                          </td>
                          <td className="py-1 pr-2 text-right numeric">{tien(o.thu)}</td>
                          <td className="py-1 pr-2 text-right numeric">{tien(o.tra)}</td>
                          <td className="py-1 pr-2 text-right numeric font-bold" style={{ color: mau(o.lai) }}>
                            {dau(o.lai)}
                          </td>
                          <td className="py-1 text-right numeric" style={{ color: mau(o.pct) }}>{pc(o.pct)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[var(--hairline)]">
                        <td className="py-1.5 pr-2 font-extrabold text-white">GỘP 3 MIỀN</td>
                        <td className="py-1.5 pr-2 text-right numeric font-bold">{tien(gThu)}</td>
                        <td className="py-1.5 pr-2 text-right numeric font-bold">{tien(gTra)}</td>
                        <td className="py-1.5 pr-2 text-right numeric font-extrabold" style={{ color: mau(gLai) }}>
                          {dau(gLai)}
                        </td>
                        <td className="py-1.5 text-right numeric font-bold" style={{ color: mau(gLai) }}>
                          {pc(gThu > 0 ? (gLai / gThu) * 100 : 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-1.5 text-[0.7rem] leading-relaxed text-[var(--text-secondary)]">
                  Theo giá thì tháng này chờ đợi <b style={{ color: mau(choDoi) }}>{dau(choDoi)}</b>, dao động
                  bình thường <b>±{tien(2 * sd)}</b> quanh mức đó —{" "}
                  {trong ? (
                    <b className="text-white">tháng này nằm trong khoảng bình thường</b>
                  ) : lech > 0 ? (
                    <b className="text-[#7ff0c0]">tháng này vượt LÊN TRÊN khoảng bình thường</b>
                  ) : (
                    <b className="text-[#ff9d9d]">tháng này tụt XUỐNG DƯỚI khoảng bình thường</b>
                  )}
                  {dangChay && " (tháng chưa xong nên con số còn chạy)"}.
                </div>
              </div>
            );
          })}

        <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
          <b>Đọc báo cáo này thế nào.</b> Đây là cuốn sổ <b>mô phỏng ôm đều</b> — mỗi cặp 1 điểm, đủ
          4.950 cặp mỗi kỳ — để đo xem <b>giá đá</b> đang chạy cho ra gì trên kết quả xổ thật. Nó
          chưa phải tiền đá thật trong túi, vì máy chưa có sổ đá thật. Đá dao động mạnh hơn lô: kỳ nào
          đông con về thì số cặp trúng tăng rất nhanh (30 con về là 435 cặp, 36 con về đã là 630
          cặp), nên một tháng lỗ vẫn có thể nằm trong khoảng bình thường.
        </div>
      </div>
    </section>
  );
}
