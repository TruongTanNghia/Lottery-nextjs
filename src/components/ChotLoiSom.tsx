"use client";

import { useEffect, useMemo, useState } from "react";
import { chayLai, type DrawHits } from "@/lib/backtest";
import type { Schedule } from "@/lib/limit-engine";
import { phanTichChotLoi, type ChotLoi, type KyLai, type ThangChuoi } from "@/lib/chot-loi";
import type { Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];

/**
 * Mọi số trong khối này đều ở cỡ triệu, nên số nhỏ cũng phải đứng bằng "tr".
 *
 * Cách hiện chung của app đổi sang đồng khi dưới một triệu, nên giữa một hàng
 * toàn "+310.3tr" lại chen vào "−726.750đ" — dấu chấm hàng nghìn khiến người
 * đọc lướt dễ thấy thành bảy trăm triệu. Ở đây ghi "−0.7tr" cho cùng một thước.
 */
const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 && a >= 50_000 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const dau = (n: number) => (n >= 50_000 ? "+" : "") + tien(n);
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
const tenThang = (t: string) => `Tháng ${Number(t.slice(5))}`;

/**
 * Chốt lời sớm — mọi tháng đều có đường như tháng 9, kèm luật nghỉ khi đã lời.
 *
 * Người vận hành xin "hiện giùm em mấy cái giống như T9 — để xem chốt lời sớm
 * được không — cứ một ngày ăn đậm là dễ bị thua đậm lại". Báo cáo tháng chỉ
 * có phần từng kỳ cho tháng đang chạy, nên các tháng đã qua thì không nhìn ra
 * được chuyện từng lên cao rồi rơi xuống — đúng cái họ đang nghi.
 *
 * Mỗi đường tháng có đánh dấu đỉnh, và đỉnh đó là chỗ nguy hiểm nhất của cả
 * khối: nhìn đường đã xong thì ai cũng thấy "giá mà dừng ở đây". Nên ngay dưới
 * là luật chốt lời LÀM ĐƯỢC (chỉ dùng thông tin có tại thời điểm đó) đứng cạnh
 * "dừng đúng đỉnh" có nhãn nhìn lại mới biết.
 */
export default function ChotLoiSom() {
  const [dsKy, setDsKy] = useState<KyLai[][] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [moThang, setMoThang] = useState<string | null>(null);

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
          base: Object.fromEntries(Object.entries(d.base ?? {}).map(([k, v]) => [Number(k), Number(v)])),
          min_limit: Number(d.min_limit ?? 10),
          consecutive: Object.fromEntries(
            Object.entries(d.consecutive ?? {}).map(([k, v]) => [Number(k), Number(v)])
          ),
          consecutive_reset_after: Number(d.consecutive_reset_after ?? 4),
        };
        const kq = chayLai((h.draws ?? []) as DrawHits[], sched, r);
        return (kq?.days ?? []).map((x) => ({ date: x.date, lai: x.lai, thu: x.thu }));
      })
    )
      .then((x) => !huy && setDsKy(x))
      .catch(() => !huy && setLoi("Không tải được dữ liệu"));
    return () => { huy = true; };
  }, []);

  const kq: ChotLoi | null = useMemo(() => (dsKy ? phanTichChotLoi(dsKy) : null), [dsKy]);

  if (loi || !kq) {
    return (
      <section className="plate rise rise-2 mb-4 md:mb-6">
        <div className="plate-hd"><h2 className="plate-title">💰 Chốt Lời Sớm</h2></div>
        <div className="p-4 text-sm text-[var(--text-muted)]">
          {loi ?? (dsKy ? "Chưa đủ kỳ để phân tích." : "Đang tính…")}
        </div>
      </section>
    );
  }

  const tot = [...kq.nguongs].sort((a, b) => b.tong - a.tong)[0];
  const coLuatHon = tot.hon > 0;
  const s = kq.sauAnDam;
  const tqNhieu = Math.abs(kq.tuongQuan) <= kq.nguongNhieu;

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">💰 Chốt Lời Sớm — Lời Tới Đâu Thì Nghỉ</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Gộp 3 miền · mọi tháng đều có đường từng kỳ như tháng 9 · {kq.thangDu.length} tháng đủ
            để chấm
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-4">
        {/* ── 1. Từng tháng chạy thế nào ─────────────────────────────── */}
        <div>
          <div className="eyebrow mb-1.5">Từng tháng chạy thế nào — bấm vào tháng để xem từng kỳ</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...kq.thang].reverse().map((t) => (
              <OThang
                key={t.thang}
                t={t}
                mo={moThang === t.thang}
                bam={() => setMoThang(moThang === t.thang ? null : t.thang)}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
            Chấm vàng là <b>đỉnh</b> — chỗ cao nhất tháng đó từng lên. Nhìn tháng đã xong thì đỉnh
            rất rõ, nhưng lúc đang chạy thì không ai biết hôm đó là đỉnh. Nên đừng so với đỉnh —
            so với luật ở ngay dưới.
          </div>
          {kq.thangKhoiDong && (
            <div className="mt-1.5 text-[0.68rem] text-[#ffd24a] leading-relaxed">
              <b>{tenThang(kq.thangKhoiDong)} là tháng khởi động</b> — tháng đầu tiên của kho. Máy
              dò lại bắt đầu đếm từ đó, nên mấy chục kỳ đầu nó chưa biết con nào đã khô bao lâu và
              hạn mức còn lệch (kỳ đầu kho ra đúng 0đ). Tháng này vẫn vẽ ra để xem, nhưng không đem
              ra chấm luật ở dưới.
            </div>
          )}
        </div>

        {/* ── 2. Luật chốt lời làm được thật ─────────────────────────── */}
        <div>
          <div className="eyebrow mb-1.5">Nếu tháng lời tới mức X thì nghỉ hết tháng</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.74rem]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1.5 pr-2 font-semibold">Cách làm</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Tháng chạm</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Giữ được</th>
                  <th className="py-1.5 font-semibold text-right">Hơn/kém</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--hairline)]">
                  <td className="py-1.5 pr-2">
                    <b className="text-white">Không dừng</b>
                    <div className="text-[0.66rem] text-[var(--text-muted)]">chạy hết tháng như bây giờ — mốc để so</div>
                  </td>
                  <td className="py-1.5 pr-2 text-right numeric text-[var(--text-muted)]">—</td>
                  <td className="py-1.5 pr-2 text-right numeric font-bold" style={{ color: mau(kq.khongDung) }}>
                    {dau(kq.khongDung)}
                  </td>
                  <td className="py-1.5 text-right numeric text-[var(--text-muted)]">—</td>
                </tr>
                {kq.nguongs.map((n) => (
                  <tr key={n.pct} className="border-t border-[var(--hairline)]">
                    <td className="py-1.5 pr-2">
                      <b className="text-white">Lời tới {tien(n.nguong)} thì nghỉ</b>
                      <div className="text-[0.66rem] text-[var(--text-muted)]">
                        tức {n.pct}% tiền nhận một tháng
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">
                      {n.soThangCham}/{kq.thangDu.length}
                    </td>
                    <td className="py-1.5 pr-2 text-right numeric font-bold" style={{ color: mau(n.tong) }}>
                      {dau(n.tong)}
                    </td>
                    <td className="py-1.5 text-right numeric" style={{ color: mau(n.hon) }}>
                      {dau(n.hon)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--hairline)] opacity-60">
                  <td className="py-1.5 pr-2">
                    <b className="text-[#ffd24a]">Dừng đúng đỉnh mọi tháng</b>
                    <div className="text-[0.66rem] text-[#ffd24a]">
                      nhìn lại mới biết — KHÔNG làm được, để thấy nó ảo cỡ nào
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right numeric text-[var(--text-muted)]">—</td>
                  <td className="py-1.5 pr-2 text-right numeric font-bold text-[#ffd24a]">
                    {dau(kq.dungDungDinh)}
                  </td>
                  <td className="py-1.5 text-right numeric text-[#ffd24a]">
                    {dau(kq.dungDungDinh - kq.khongDung)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 3. Ăn đậm có kéo theo thua đậm không ───────────────────── */}
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
          <div className="eyebrow mb-1.5">&ldquo;Cứ một ngày ăn đậm là dễ thua đậm lại&rdquo; — có thật không</div>
          Trong {kq.soCap + 1} kỳ, có <b className="text-white">{s.soLan} lần ăn đậm</b> (lời từ{" "}
          <b style={{ color: "#7ff0c0" }}>{tien(s.mucAnDam)}</b> trở lên — 10% kỳ tốt nhất). Kỳ ngay sau đó:
          <ul className="mt-1.5 space-y-1">
            <li>
              • <b>thua đậm</b> (lỗ từ {tien(Math.abs(s.mucThuaDam))} trở lên):{" "}
              <b className="numeric text-white">{(s.tyLeKyKeThuaDam * 100).toFixed(0)}%</b> số lần —
              bình thường là <b>10%</b>
            </li>
            <li>
              • <b>lỗ</b> (bất kể nhiều ít):{" "}
              <b className="numeric text-white">{(s.tyLeKyKeLo * 100).toFixed(0)}%</b> — mọi kỳ nói chung
              là <b>{(s.tyLeLoChung * 100).toFixed(0)}%</b>
            </li>
            <li>
              • trung bình kỳ kế: <b style={{ color: mau(s.tbKyKe) }}>{dau(s.tbKyKe)}</b> — mọi kỳ
              nói chung <b style={{ color: mau(s.tbChung) }}>{dau(s.tbChung)}</b>
            </li>
          </ul>
          <div className="mt-1.5">
            Độ dính giữa kỳ này và kỳ sau: <b className="numeric text-white">{kq.tuongQuan.toFixed(2)}</b>{" "}
            {tqNhieu ? (
              <>
                — nằm trong ±{kq.nguongNhieu.toFixed(2)}, tức <b>không khác gì tung đồng xu</b>. Kỳ
                trước ăn hay thua không nói gì về kỳ sau.
              </>
            ) : (
              <>
                — vượt ±{kq.nguongNhieu.toFixed(2)}, tức có dấu hiệu{" "}
                {kq.tuongQuan < 0 ? "ăn xong hay thua lại" : "ăn xong hay ăn tiếp"}. Đáng theo dõi thêm.
              </>
            )}
          </div>
          <div className="mt-1 text-[0.66rem] text-[var(--text-muted)]">
            Chỉ có {s.soLan} lần ăn đậm để soi, nên mấy tỷ lệ trên còn xê dịch nhiều. Con số độ dính
            dùng cả {kq.soCap} cặp kỳ nên đáng tin hơn.
          </div>
        </div>

        {/* Kết luận bằng tiền. */}
        <div
          className="rounded-lg border px-3 py-2.5 text-[0.76rem] leading-relaxed"
          style={{
            borderColor: coLuatHon ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
            background: coLuatHon ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
          }}
        >
          <div className="font-extrabold mb-1 text-white">
            {coLuatHon
              ? `Chốt lời ở ${tien(tot.nguong)} giữ thêm được ${tien(tot.hon)}`
              : "Không mức chốt lời nào giữ được nhiều hơn chạy hết tháng"}
          </div>
          <div className="text-[var(--text-secondary)]">
            Chạy hết tháng: <b style={{ color: mau(kq.khongDung) }}>{dau(kq.khongDung)}</b> qua{" "}
            {kq.thangDu.length} tháng. Mức chốt lời tốt nhất trong bảng ra{" "}
            <b style={{ color: mau(tot.tong) }}>{dau(tot.tong)}</b>.{" "}
            {coLuatHon ? (
              <>
                Nhưng phần hơn đó chỉ dựa trên <b>{tot.soThangCham}/{kq.thangDu.length} tháng có chạm
                mức</b>, và mức đó được chọn SAU khi đã thấy kết quả của chính {kq.thangDu.length}{" "}
                tháng này — thử 5 mức rồi lấy mức đẹp nhất thì kiểu gì cũng có một mức đẹp. Chưa đủ
                tháng để tin nó lặp lại.
              </>
            ) : (
              <>
                Tháng lỗ thì hầu như không lời tới mức để mà nghỉ, còn tháng lời thì bị cắt ngang
                trước khi kịp lời thêm — nên nghỉ sớm chủ yếu là cắt bớt tháng tốt.
              </>
            )}{" "}
            Còn &ldquo;dừng đúng đỉnh&rdquo; ra <b className="text-[#ffd24a]">{dau(kq.dungDungDinh)}</b> — con số
            đó không ai lấy được, vì phải đợi hết tháng mới biết đỉnh nằm ở đâu.
          </div>
        </div>
      </div>
    </section>
  );
}

/** Một tháng: đường tiền dồn nhỏ, ba con số, bấm để xem từng kỳ như tháng 9. */
function OThang({ t, mo, bam }: { t: ThangChuoi; mo: boolean; bam: () => void }) {
  const n = t.don.length;
  const W = 100, H = 22;
  const lo = Math.min(0, ...t.don), hi = Math.max(0, ...t.don);
  const span = hi - lo || 1;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - ((v - lo) / span) * H;
  const duong = t.don.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const iDinh = t.ngay.indexOf(t.dinhNgay);

  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${mo ? "sm:col-span-2" : ""}`}
      style={{
        borderColor: t.khoiDong ? "rgba(251,191,36,0.35)" : "var(--hairline)",
        background: "rgba(255,255,255,0.03)",
        opacity: t.khoiDong && !mo ? 0.75 : 1,
      }}
    >
      <button onClick={bam} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold text-white text-[0.82rem]">
            {mo ? "▾" : "▸"} {tenThang(t.thang)}
            {t.khoiDong && (
              <span className="ml-1.5 rounded px-1 py-0.5 text-[0.58rem] font-bold bg-[rgba(245,158,11,0.2)] text-[#ffd24a]">
                KHỞI ĐỘNG
              </span>
            )}
            {t.dangChay && (
              <span className="ml-1.5 rounded px-1 py-0.5 text-[0.58rem] font-bold bg-[rgba(59,130,246,0.25)] text-[#a9c9ff]">
                ĐANG CHẠY
              </span>
            )}
          </span>
          <span className="numeric font-extrabold text-[0.86rem]" style={{ color: mau(t.cuoi) }}>
            {dau(t.cuoi)}
          </span>
        </div>
        {n > 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10 mt-1">
            <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke="rgba(255,255,255,0.28)" strokeWidth="0.25" />
            <path d={duong} fill="none" stroke={t.cuoi >= 0 ? "#34e6a8" : "#ff6b78"} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
            {iDinh >= 0 && <circle cx={x(iDinh)} cy={y(t.dinh)} r="1.1" fill="#ffd24a" />}
          </svg>
        )}
        <div className="flex justify-between text-[0.64rem] numeric mt-0.5 text-[var(--text-muted)]">
          <span>{t.ngay.length} kỳ</span>
          <span>
            đỉnh <b className="text-[#ffd24a]">{dau(t.dinh)}</b> ({dd(t.dinhNgay)})
          </span>
          <span>
            đáy <b style={{ color: mau(t.day) }}>{dau(t.day)}</b>
          </span>
        </div>
      </button>

      {mo && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[0.72rem] min-w-[280px]">
            <thead>
              <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-2 py-1 text-left font-bold">Kỳ</th>
                <th className="px-2 py-1 text-right font-bold">Lời/Lỗ 3 miền</th>
                <th className="px-2 py-1 text-right font-bold">Dồn từ mùng 1</th>
              </tr>
            </thead>
            <tbody>
              {t.ngay.map((ng, i) => ({ ng, i })).reverse().map(({ ng, i }) => (
                <tr key={ng} className="border-t border-[var(--hairline)]" style={ng === t.dinhNgay ? { background: "rgba(255,210,74,0.1)" } : undefined}>
                  <td className="px-2 py-1 numeric text-white">
                    {dd(ng)}
                    {ng === t.dinhNgay && <span className="ml-1 text-[0.58rem] text-[#ffd24a]">đỉnh</span>}
                  </td>
                  <td className="px-2 py-1 text-right numeric" style={{ color: mau(t.laiKy[i]) }}>
                    {dau(t.laiKy[i])}
                  </td>
                  <td className="px-2 py-1 text-right numeric font-bold" style={{ color: mau(t.don[i]) }}>
                    {dau(t.don[i])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
