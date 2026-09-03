"use client";

import { useEffect, useMemo, useState } from "react";
import { chayLai, type DayRow, type DrawHits } from "@/lib/backtest";
import type { Schedule } from "@/lib/limit-engine";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const TEN_NGAN: Record<Region, string> = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" };
/** Tháng ít kỳ quá thì không phải một tháng — trừ tháng đang chạy. */
const KY_TOI_THIEU = 15;

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tenThang = (t: string) => `Tháng ${Number(t.slice(5))}/${t.slice(0, 4)}`;

interface OThang {
  thang: string;
  soKy: number;
  thu: number;
  bu: number;
  lai: number;
  pct: number;
}

interface MienData {
  region: Region;
  thang: OThang[];
  /** Dao động tự nhiên của một tháng, tính từ chính các tháng đã đủ kỳ. */
  bienDo: number;
  /** Từng kỳ của tháng đang chạy, để nhìn ra đang lời hay lỗ tới đâu. */
  thangNay: DayRow[];
}

/**
 * Báo cáo tháng — mỗi tháng đứng riêng, ba miền và một dòng gộp.
 *
 * Người vận hành cần đúng ba thứ ở đây: tháng này tới hôm nay đang đứng đâu,
 * mấy tháng trước thế nào, và con số đó có đáng để hành động chưa. Cái thứ ba
 * là chỗ dễ làm hỏng nhất — một tháng xanh nằm gọn trong dao động tự nhiên thì
 * không phải tin vui, mà báo cáo nào cũng có sẵn cám dỗ gọi nó là tin vui.
 *
 * Dòng GỘP 3 MIỀN không phải để cho đẹp. Ba miền xổ độc lập nên nhiễu bù nhau:
 * dao động của sổ gộp chỉ còn quanh ±1,9% thay vì ±4% của riêng Miền Nam. Nhìn
 * riêng từng miền thì tháng nào cũng có một miền đỏ và dễ hoảng vì chuyện không
 * có thật.
 */
export default function MonthlyReport() {
  const [ds, setDs] = useState<MienData[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [moChiTiet, setMoChiTiet] = useState(false);

  useEffect(() => {
    let huy = false;
    Promise.all(
      MIEN.map(async (r) => {
        const [h, s] = await Promise.all([
          fetch(`/api/history/hits?region=${r}`).then((x) => x.json()),
          fetch(`/api/config/schedule?region=${r}`).then((x) => x.json()),
        ]);
        const d = s.data;
        const sched: Schedule = {
          base: Object.fromEntries(
            Object.entries(d.base ?? {}).map(([k, v]) => [Number(k), Number(v)])
          ),
          min_limit: Number(d.min_limit ?? 10),
          consecutive: Object.fromEntries(
            Object.entries(d.consecutive ?? {}).map(([k, v]) => [Number(k), Number(v)])
          ),
          consecutive_reset_after: Number(d.consecutive_reset_after ?? 4),
        };
        const kq = chayLai((h.draws ?? []) as DrawHits[], sched, r);
        const gom = new Map<string, OThang>();
        for (const day of kq?.days ?? []) {
          const t = day.date.slice(0, 7);
          let a = gom.get(t);
          if (!a) gom.set(t, (a = { thang: t, soKy: 0, thu: 0, bu: 0, lai: 0, pct: 0 }));
          a.soKy++;
          a.thu += day.thu;
          a.bu += day.bu;
          a.lai += day.lai;
        }
        const thang = [...gom.values()].sort((a, b) => a.thang.localeCompare(b.thang));
        for (const t of thang) t.pct = t.thu > 0 ? (t.lai / t.thu) * 100 : 0;

        // Biên độ tính từ các tháng ĐÃ ĐỦ, không tính tháng đang chạy dở.
        const du = thang.filter((t) => t.soKy >= KY_TOI_THIEU).slice(0, -1);
        const m = du.length ? du.reduce((s2, t) => s2 + t.pct, 0) / du.length : 0;
        const bienDo = du.length
          ? Math.sqrt(du.reduce((s2, t) => s2 + (t.pct - m) ** 2, 0) / du.length)
          : 0;

        const moi = thang[thang.length - 1]?.thang ?? "";
        return {
          region: r,
          thang,
          bienDo,
          thangNay: (kq?.days ?? []).filter((x) => x.date.startsWith(moi)),
        };
      })
    )
      .then((x) => !huy && setDs(x))
      .catch(() => !huy && setLoi("Không tải được dữ liệu báo cáo"));
    return () => { huy = true; };
  }, []);

  /** Các tháng mà cả ba miền đều có, mới nhất trước. */
  const cacThang = useMemo(() => {
    if (!ds) return [];
    const chung = ds
      .map((d) => d.thang.map((t) => t.thang))
      .reduce((a, b) => a.filter((x) => b.includes(x)));
    return [...chung].sort().reverse();
  }, [ds]);

  const thangDangChay = cacThang[0] ?? "";
  const ngayCuoi = ds?.[0]?.thangNay?.at(-1)?.date ?? "";

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">📅 Báo Cáo Tháng</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Từ mùng 1 tới hết tháng · mỗi tháng đứng riêng, không cộng dồn
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
        {!ds && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}

        {ds && cacThang.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">Chưa đủ dữ liệu để làm báo cáo tháng.</p>
        )}

        {ds &&
          cacThang.map((thang, i) => {
            const dong = ds.map((d) => ({
              d,
              o: d.thang.find((t) => t.thang === thang)!,
            }));
            const gopThu = dong.reduce((s, x) => s + x.o.thu, 0);
            const gopBu = dong.reduce((s, x) => s + x.o.bu, 0);
            const gopLai = gopThu - gopBu;
            const gopPct = gopThu > 0 ? (gopLai / gopThu) * 100 : 0;
            // Ba miền xổ độc lập nên nhiễu cộng theo bình phương, không cộng thẳng.
            const gopBienDo =
              gopThu > 0
                ? (Math.sqrt(
                    dong.reduce((s, x) => s + ((x.d.bienDo / 100) * x.o.thu) ** 2, 0)
                  ) /
                    gopThu) *
                  100
                : 0;
            const dangChay = i === 0;

            return (
              <div
                key={thang}
                className={`rounded-lg border ${
                  dangChay
                    ? "border-[rgba(96,165,250,0.5)] bg-[rgba(37,99,235,0.1)]"
                    : "border-[var(--hairline)] bg-white/[0.03]"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-2 px-3 pt-2.5">
                  <span className="font-bold text-white text-[0.95rem]">{tenThang(thang)}</span>
                  {dangChay && (
                    <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold text-[#a9c9ff] bg-black/30">
                      ĐANG CHẠY · tới {ngayCuoi.slice(8, 10)}/{ngayCuoi.slice(5, 7)}
                    </span>
                  )}
                  <span className="text-[0.66rem] text-[var(--text-muted)] numeric">
                    {dong[0].o.soKy} kỳ
                  </span>
                </div>

                <div className="overflow-x-auto px-1 pb-2">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="px-2 py-1.5 text-left font-bold">Miền</th>
                        <th className="px-2 py-1.5 text-right font-bold">Nhận</th>
                        <th className="px-2 py-1.5 text-right font-bold">Bù</th>
                        <th className="px-2 py-1.5 text-right font-bold">Lời / Lỗ</th>
                        <th className="px-2 py-1.5 text-right font-bold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dong.map(({ d, o }) => (
                        <tr key={d.region} className="border-t border-[var(--hairline)]">
                          <td className="px-2 py-1.5 text-white">
                            <b>{TEN_NGAN[d.region]}</b>
                            <span className="text-[0.62rem] text-[var(--text-muted)]">
                              {" "}
                              {REGION_LABELS[d.region]}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right numeric text-[#7ff0c0]">
                            {tien(o.thu)}
                          </td>
                          <td className="px-2 py-1.5 text-right numeric text-[#ff9d9d]">
                            {tien(o.bu)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right numeric font-bold ${
                              o.lai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                            }`}
                          >
                            {(o.lai >= 0 ? "+" : "") + tien(o.lai)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right numeric ${
                              o.pct >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                            }`}
                          >
                            {pc(o.pct)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[var(--rule-strong,rgba(255,255,255,0.25))]">
                        <td className="px-2 py-1.5 font-bold text-white">GỘP 3 MIỀN</td>
                        <td className="px-2 py-1.5 text-right numeric font-bold text-[#7ff0c0]">
                          {tien(gopThu)}
                        </td>
                        <td className="px-2 py-1.5 text-right numeric font-bold text-[#ff9d9d]">
                          {tien(gopBu)}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right numeric font-bold ${
                            gopLai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                          }`}
                        >
                          {(gopLai >= 0 ? "+" : "") + tien(gopLai)}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right numeric font-bold ${
                            gopPct >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                          }`}
                        >
                          {pc(gopPct)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="px-3 pb-2.5 text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
                  {gopBienDo > 0 && (
                    <>
                      Dao động tự nhiên của một tháng khi gộp 3 miền là{" "}
                      <b className="text-[var(--text-secondary)]">±{gopBienDo.toFixed(2)}%</b> —{" "}
                      <b
                        className={
                          Math.abs(gopPct) <= gopBienDo
                            ? "text-[var(--text-secondary)]"
                            : gopPct > 0
                            ? "text-[#7ff0c0]"
                            : "text-[#ffb4b4]"
                        }
                      >
                        {Math.abs(gopPct) <= gopBienDo
                          ? "tháng này nằm trong khoảng bình thường"
                          : gopPct > 0
                          ? "tháng này vượt LÊN TRÊN khoảng bình thường"
                          : "tháng này tụt XUỐNG DƯỚI khoảng bình thường"}
                      </b>
                      {dangChay && " (tháng chưa xong nên con số còn chạy)"}
                    </>
                  )}
                </div>
              </div>
            );
          })}

        {ds && ds[0]?.thangNay.length > 0 && (
          <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] p-3">
            <button
              onClick={() => setMoChiTiet(!moChiTiet)}
              className="text-[0.78rem] font-bold text-[#a9c9ff] hover:text-white"
            >
              {moChiTiet ? "▾" : "▸"} Từng kỳ của {tenThang(thangDangChay)} — xem đang lời lỗ tới đâu
            </button>
            {moChiTiet && <TungKy ds={ds} />}
          </div>
        )}

        <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
          <b>Đọc báo cáo này thế nào.</b> Con số ở đây tính trên{" "}
          <b>hạn mức đang cài × 100 lô × mỗi kỳ</b> — tức là nếu nhận đủ kín sổ. Sổ cược thật của
          anh nhỏ hơn và lệch hơn, nên đây là <b>thước đo bảng hạn mức</b>, chưa phải lãi lỗ thật
          trong túi. Muốn ra con số thật thì nạp phiếu cược vào máy, lúc đó cắt lời cắt lỗ mới
          bám đúng tiền.
        </div>
      </div>
    </section>
  );
}

/**
 * Từng kỳ trong tháng đang chạy, cộng dồn — chỗ để quyết định cắt lời cắt lỗ.
 *
 * Cột dồn quan trọng hơn cột lãi từng kỳ: người ta không cắt vì một đêm xấu, họ
 * cắt vì cả tháng đã đi tới đâu.
 */
function TungKy({ ds }: { ds: MienData[] }) {
  const ngay = [...new Set(ds.flatMap((d) => d.thangNay.map((x) => x.date)))].sort();
  let don = 0;
  const dong = ngay.map((n) => {
    const lai = ds.reduce((s, d) => s + (d.thangNay.find((x) => x.date === n)?.lai ?? 0), 0);
    don += lai;
    return { n, lai, don };
  });

  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-2 py-1.5 text-left font-bold">Kỳ</th>
            <th className="px-2 py-1.5 text-right font-bold">Lời/Lỗ 3 miền</th>
            <th className="px-2 py-1.5 text-right font-bold">Dồn từ mùng 1</th>
          </tr>
        </thead>
        <tbody>
          {[...dong].reverse().map((r) => (
            <tr key={r.n} className="border-t border-[var(--hairline)]">
              <td className="px-2 py-1 numeric text-white">
                {r.n.slice(8, 10)}/{r.n.slice(5, 7)}
              </td>
              <td
                className={`px-2 py-1 text-right numeric ${
                  r.lai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                }`}
              >
                {(r.lai >= 0 ? "+" : "") + tien(r.lai)}
              </td>
              <td
                className={`px-2 py-1 text-right numeric font-bold ${
                  r.don >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                }`}
              >
                {(r.don >= 0 ? "+" : "") + tien(r.don)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
