"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { KY_TOI_THIEU_LO, chuoiChanLo, luatChanLo, type LoChan } from "@/lib/chan-lo";
import { STAKE_PRICE, WIN_PER_POINT } from "@/lib/exposure";
import { provincePrefix } from "@/lib/provinces";
import ChanNgayKhoi from "./ChanNgayKhoi";
import TienChanLo from "./TienChanLo";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tl = (n: number) => (n * 100).toFixed(1) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
const tenThang = (t: string) => `tháng ${Number(t.slice(5))}`;
const LY_DO: Record<string, string> = { tong: "bước 1 · tổng thể", thang: "bước 2 · 2 tháng gần", cahai: "cả hai bước" };

/**
 * Tab Chặn Lô — luật hai bước của khách cho lô, cả ba miền (xem chan-lo.ts).
 *
 * Tab riêng chứ không chen vào Dashboard: Dashboard đang chạy ổn và người vận
 * hành dặn không đụng. Ở đây chỉ trả lời "kỳ tới chặn lô nào và vì sao", kèm
 * nút copy đúng chuỗi mà bot /chanlo trả. Không tự đổi hạn mức.
 */
export default function ChanLoPage({ region }: { region: Region }) {
  const toast = useToast();
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [chon, setChon] = useState<string | null>(null);
  // Hai công tắc của luật lô — lưu ở máy chủ, dùng chung cho danh sách lô và khối theo bậc.
  const [buoc, setBuoc] = useState<{ buoc1: boolean; buoc2: boolean }>({ buoc1: true, buoc2: true });
  const [phienBan, setPhienBan] = useState(0);
  const [banBuoc, setBanBuoc] = useState(false);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setLoi(null);
    setChon(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws((d.draws ?? []) as DrawHits[]))
      .catch(() => !huy && setLoi("Không tải được dữ liệu"));
    fetch(`/api/config/chan-ngay?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && d?.data?.buoc && setBuoc({ buoc1: d.data.buoc.buoc1 !== false, buoc2: d.data.buoc.buoc2 !== false }))
      .catch(() => {});
    return () => { huy = true; };
  }, [region]);

  const kq = useMemo(() => (draws ? luatChanLo(draws, region, buoc) : null), [draws, region, buoc]);

  const doiBuoc = async (k: "buoc1" | "buoc2") => {
    const moi = { ...buoc, [k]: !buoc[k] };
    setBanBuoc(true);
    try {
      const r = await fetch(`/api/config/chan-ngay?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moi),
      });
      const d = await r.json();
      if (!r.ok || d.status !== "success") throw new Error(d.detail ?? "Lưu không được");
      setBuoc({ buoc1: d.data.buoc.buoc1 !== false, buoc2: d.data.buoc.buoc2 !== false });
      setPhienBan((v) => v + 1);
      toast.show("success", `Đã ${moi[k] ? "bật" : "tắt"} ${k === "buoc1" ? "chặn quá mức chung" : "chặn lỗ 2 tháng gần"} cho ${REGION_LABELS[region]} — bot và khối theo ngày đọc theo`);
    } catch (e) {
      toast.show("error", e instanceof Error ? e.message : "Lưu không được");
    } finally {
      setBanBuoc(false);
    }
  };

  if (loi) return <p className="text-sm text-[#ff9d9d]">{loi}</p>;
  if (!kq) return <section className="plate rise rise-1"><div className="p-4 text-sm text-[var(--text-muted)]">Đang tính…</div></section>;

  const chuoi = chuoiChanLo(provincePrefix(region), kq.chan);
  const bangChan = kq.bang.filter((x) => x.lyDo);
  const theo = new Map(kq.bang.map((x) => [x.lo, x]));
  const dangXem = chon ? theo.get(chon) ?? null : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chuoi);
      toast.show("success", `Đã copy ${kq.chan.length} lô chặn ${REGION_LABELS[region]}`);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="plate rise rise-1" data-chan-lo>
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🚫 Chặn Lô 2 Bước</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              {REGION_LABELS[region]} · {kq.soKy} kỳ{kq.tuNgay && ` (${dd(kq.tuNgay)} → ${dd(kq.denNgay!)})`} · mức chung{" "}
              {Math.round(kq.mucChung * 100)} nháy / 100 kỳ · giá {STAKE_PRICE[region].toLocaleString("vi-VN")}đ, thắng{" "}
              {WIN_PER_POINT.toLocaleString("vi-VN")}đ/nháy
            </p>
          </div>
        </div>

        <div className="p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2" data-chan-lo-cong-tac>
            <button
              onClick={() => doiBuoc("buoc1")}
              disabled={banBuoc}
              data-lo-buoc1
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border ${buoc.buoc1 ? "bg-[#059669] border-[#34e6a8] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.14]"} disabled:opacity-40`}
            >
              {buoc.buoc1 ? "✅ Chặn quá mức chung: BẬT" : "⭕ Chặn quá mức chung: tắt"}
            </button>
            <button
              onClick={() => doiBuoc("buoc2")}
              disabled={banBuoc}
              data-lo-buoc2
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border ${buoc.buoc2 ? "bg-[#059669] border-[#34e6a8] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.14]"} disabled:opacity-40`}
            >
              {buoc.buoc2 ? "✅ Chặn lỗ 2 tháng gần: BẬT" : "⭕ Chặn lỗ 2 tháng gần: tắt"}
            </button>
            <span className="text-[0.68rem] text-[var(--text-muted)]">lưu ngay, dùng chung cho danh sách lô, khối theo ngày và bot</span>
          </div>

          <ul className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)] space-y-0.5">
            <li>
              <b className="text-white">Bước 1 — tổng thể {kq.soKy} kỳ:</b> lô nào về <b>cao hơn</b> mức chung{" "}
              {Math.round(kq.mucChung * 100)}/100 kỳ → chặn.
            </li>
            <li>
              <b className="text-white">Bước 2 — {kq.thang2.map(tenThang).join(" + ")} ({kq.soKy2} kỳ):</b> lô nào phần ăn{" "}
              <b>dưới 0%</b> → chặn.
            </li>
            <li>
              Lô ít hơn {KY_TOI_THIEU_LO} kỳ trong quãng xét thì bước đó bỏ qua. Danh sách <b className="text-white">tính lại mỗi kỳ</b>{" "}
              và <b className="text-white">không tự đổi hạn mức</b> bên Dashboard — chỉ để dán cho người ghi cược.
            </li>
          </ul>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-chan-lo-tong>
            <O nhan="Lô bị chặn" gt={String(kq.chan.length)} phu="trên 100 lô" m="#ff6b78" />
            <O nhan="Bước 1" gt={String(kq.dem.tong + kq.dem.cahai)} phu="về trên mức chung" m="#ffd24a" />
            <O nhan="Bước 2" gt={String(kq.dem.thang + kq.dem.cahai)} phu="2 tháng gần lỗ" m="#ffd24a" />
            <O nhan="Cả hai bước" gt={String(kq.dem.cahai)} phu="dính cả 1 lẫn 2" m="#ff9d9d" />
          </div>

          {/* ── Chuỗi dán ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-[var(--hairline)] bg-black/20 px-3 py-2.5" data-chan-lo-lenh>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Lệnh chặn lô kỳ tới</span>
              <span className="text-[0.72rem] text-[var(--text-secondary)]">
                <b className="text-white" data-chan-lo-so>{kq.chan.length} lô</b> · <code className="text-[#c2d4ea]">05b0n</code> = lô 05, 0 nhận
              </span>
              <button
                onClick={copy}
                disabled={kq.chan.length === 0}
                data-chan-lo-copy
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-40"
              >
                📋 Copy
              </button>
            </div>
            <div className="text-[0.66rem] text-[var(--text-muted)] mt-1">
              Trên Telegram gõ <code className="text-[#c2d4ea]">/chanlo</code> là ra cả 3 miền, <code className="text-[#c2d4ea]">/chanlo mn</code> riêng một miền.
            </div>
            {chuoi && (
              <code className="block mt-1.5 text-[0.68rem] leading-snug text-[#c2d4ea] break-all" data-chan-lo-chuoi>{chuoi}</code>
            )}
          </div>

          {/* ── Bảng 100 lô ───────────────────────────────────────── */}
          <div>
            <div className="eyebrow mb-1.5">100 lô — đỏ là chặn, bấm để xem số</div>
            <div className="grid grid-cols-10 gap-1" data-chan-lo-bang>
              {kq.bang.map((x) => (
                <button
                  key={x.lo}
                  onClick={() => setChon(chon === x.lo ? null : x.lo)}
                  data-lo={x.lo}
                  data-chan={x.lyDo ?? "0"}
                  title={`Lô ${x.lo} · về ${tl(x.tyLe)} (${x.nhay}/${x.ky}) · 2 tháng ${tl(x.tyLe2)} (${x.nhay2}/${x.ky2})`}
                  className="rounded-md border py-1 leading-none transition-colors"
                  style={{
                    background: x.lyDo ? "rgba(220,38,38,0.8)" : `rgba(16,185,129,${(0.12 + Math.max(0, kq.mucChung - x.tyLe) * 1.2).toFixed(3)})`,
                    color: "#fff",
                    borderColor: chon === x.lo ? "#fff" : "transparent",
                  }}
                >
                  <div className="numeric text-[0.78rem] font-extrabold">{x.lo}</div>
                  <div className="text-[0.5rem] mt-0.5 opacity-85 numeric">{Math.round(x.tyLe * 100)}</div>
                </button>
              ))}
            </div>
            <div className="mt-1 text-[0.64rem] text-[var(--text-muted)]">
              Số nhỏ dưới mỗi lô là số nháy trên 100 kỳ (cả quãng); mức chung là {Math.round(kq.mucChung * 100)}.
            </div>
          </div>

          {dangXem && <ChiTiet x={dangXem} kq={kq} />}

          {/* ── Danh sách lô chặn ─────────────────────────────────── */}
          <div>
            <div className="eyebrow mb-1.5">Lô đang chặn — {bangChan.length} lô</div>
            {bangChan.length === 0 ? (
              <div className="text-[0.76rem] text-[var(--text-muted)]">Không lô nào dính luật.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.72rem] min-w-[360px]">
                  <thead>
                    <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="px-2 py-1 text-left font-bold">Lô</th>
                      <th className="px-2 py-1 text-left font-bold">Lý do</th>
                      <th className="px-2 py-1 text-right font-bold">Về / 100 kỳ</th>
                      <th className="px-2 py-1 text-right font-bold">Phần ăn</th>
                      <th className="px-2 py-1 text-right font-bold">2 tháng về</th>
                      <th className="px-2 py-1 text-right font-bold">2 tháng ăn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bangChan.map((x) => (
                      <tr key={x.lo} className="border-t border-[var(--hairline)]" data-chan-lo-dong={x.lo}>
                        <td className="px-2 py-1 numeric font-extrabold text-white">{x.lo}</td>
                        <td className="px-2 py-1 text-[#ff9d9d]">{LY_DO[x.lyDo!]}</td>
                        <td className="px-2 py-1 text-right numeric" style={{ color: x.b1 ? "#ff9d9d" : "#cbd5e1" }}>{(x.tyLe * 100).toFixed(1)}</td>
                        <td className="px-2 py-1 text-right numeric" style={{ color: mau(x.bien) }}>{pc(x.bien)}</td>
                        <td className="px-2 py-1 text-right numeric" style={{ color: x.b2 ? "#ff9d9d" : "#cbd5e1" }}>{(x.tyLe2 * 100).toFixed(1)}</td>
                        <td className="px-2 py-1 text-right numeric" style={{ color: mau(x.bien2) }}>{pc(x.bien2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
            <b>Đọc thế nào.</b> Một lô về nhiều hơn mức chung trong {kq.soKy} kỳ là chuyện <b>đã xảy ra</b>; ở giá hiện tại
            phần ăn của lô bằng 0 nên "lô nào cũng về đúng 36/100 về lâu dài" — lô về nhiều hôm nay không có xu hướng về nhiều
            ngày mai (Dashboard đã đo: chặn theo ô lỗ không hơn bốc bừa). Luật này chặn bớt lô đang "hot", tức là nhận ít tiền
            hơn, chứ không làm phần ăn cao lên. Làm đúng ý khách, ghi rõ để khách biết.
          </div>
        </div>
      </section>

      {/* Khách: "tính tiền giùm phần này… ngày nào tính ngày đó theo thời gian thực". */}
      {draws && <TienChanLo draws={draws} region={region} buoc={buoc} />}

      {/* Khách: "mình áp dụng theo ngày á — theo từng kỳ": cùng luật, đơn vị là bậc ngày, ghi vào lịch hạn mức. */}
      <ChanNgayKhoi region={region} phienBan={phienBan} />
    </div>
  );
}

function ChiTiet({ x, kq }: { x: LoChan; kq: ReturnType<typeof luatChanLo> }) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-[0.76rem] leading-relaxed"
      data-chan-lo-chi-tiet={x.lo}
      style={{
        borderColor: x.lyDo ? "rgba(248,113,113,0.5)" : "rgba(16,185,129,0.45)",
        background: x.lyDo ? "rgba(220,38,38,0.1)" : "rgba(16,185,129,0.08)",
      }}
    >
      <div className="font-extrabold text-white text-[0.9rem]">
        Lô {x.lo} — {x.lyDo ? `CHẶN (${LY_DO[x.lyDo]})` : "nhận bình thường"}
      </div>
      <div className="text-[var(--text-secondary)] mt-0.5">
        Bước 1: về <b className="numeric text-white">{x.nhay}</b> nháy / {x.ky} kỳ = <b style={{ color: x.b1 ? "#ff9d9d" : "#7ff0c0" }}>{tl(x.tyLe)}</b> so
        với mức chung {tl(kq.mucChung)} → {x.b1 ? "trên mức, chặn" : "không quá mức"}. Phần ăn cả quãng{" "}
        <b style={{ color: mau(x.bien) }}>{pc(x.bien)}</b>.
        <br />
        Bước 2 ({kq.thang2.map(tenThang).join(" + ")}): về <b className="numeric text-white">{x.nhay2}</b> nháy / {x.ky2} kỳ ={" "}
        <b className="numeric">{tl(x.tyLe2)}</b>, phần ăn <b style={{ color: mau(x.bien2) }}>{pc(x.bien2)}</b> →{" "}
        {x.b2 ? "dưới 0%, chặn" : "không lỗ"}.
      </div>
    </div>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-[1.05rem] leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.62rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
