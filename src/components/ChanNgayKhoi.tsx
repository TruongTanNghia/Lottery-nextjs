"use client";

import { useEffect, useState } from "react";
import type { KetQuaChanNgay, DoiLich } from "@/lib/chan-ngay";
import { MAU_TOI_THIEU_NGAY } from "@/lib/chan-ngay";
import type { Schedule } from "@/lib/limit-engine";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tl = (n: number) => (n * 100).toFixed(1) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const tenThang = (t: string) => `tháng ${Number(t.slice(5))}`;
const LY_DO: Record<string, string> = { tong: "bước 1 · tổng thể", thang: "bước 2 · 2 tháng gần", cahai: "cả hai bước" };

interface TrangThai {
  auto: boolean;
  kq: KetQuaChanNgay;
  lichHienTai: Schedule;
  lichSau: Schedule;
  doi: DoiLich[];
  apLuc: string | null;
}

/**
 * Chặn theo ngày (bậc) — áp vào bảng Hạn Mức Theo Số Ngày Chưa Về.
 *
 * Khách: "mình áp dụng theo ngày á — áp dụng nó theo từng kỳ". Cùng luật hai
 * bước, nhưng đơn vị là BẬC (vừa về, liên tiếp 2/3/4, 1…19+ kỳ chưa về) chứ
 * không phải con lô; bậc bị chặn thì ô của nó trong lịch về 0. Có nút áp
 * ngay và công tắc tự áp sau mỗi kỳ cào kết quả. Cả hai đều ghi thật vào
 * lịch (như khách bấm Lưu trên bảng), nên mặc định tự áp là TẮT.
 */
export default function ChanNgayKhoi({ region }: { region: Region }) {
  const toast = useToast();
  const [tt, setTt] = useState<TrangThai | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [ban, setBan] = useState(false);

  const tai = async (huy?: { v: boolean }) => {
    const d = await fetch(`/api/config/chan-ngay?region=${region}`).then((r) => r.json());
    if (huy?.v) return;
    if (d.status !== "success") throw new Error(d.detail ?? "lỗi");
    setTt(d.data as TrangThai);
  };

  useEffect(() => {
    const huy = { v: false };
    setTt(null);
    setLoi(null);
    tai(huy).catch(() => !huy.v && setLoi("Không tải được luật theo ngày"));
    return () => { huy.v = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const apNgay = async () => {
    if (!tt || tt.doi.length === 0) return;
    if (!window.confirm(`Ghi 0 vào ${tt.doi.length} ô của bảng Hạn Mức ${REGION_LABELS[region]} và tính lại hạn mức? (${tt.doi.map((d) => d.o).join(", ")})`)) return;
    setBan(true);
    try {
      const r = await fetch(`/api/config/chan-ngay?region=${region}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.status !== "success") throw new Error(d.detail ?? "Áp không được");
      setTt(d.data as TrangThai);
      toast.show("success", `Đã áp vào bảng Hạn Mức ${REGION_LABELS[region]} — Dashboard sẽ hiện số mới`);
    } catch (e) {
      toast.show("error", e instanceof Error ? e.message : "Áp không được");
    } finally {
      setBan(false);
    }
  };

  const doiAuto = async () => {
    if (!tt) return;
    setBan(true);
    try {
      const r = await fetch(`/api/config/chan-ngay?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: !tt.auto }),
      });
      const d = await r.json();
      if (!r.ok || d.status !== "success") throw new Error(d.detail ?? "Lưu không được");
      setTt(d.data as TrangThai);
      toast.show("success", d.data.auto ? "Đã bật tự áp dụng — sau mỗi kỳ cào kết quả, máy tự ghi 0 vào ô bậc chặn" : "Đã tắt tự áp dụng");
    } catch (e) {
      toast.show("error", e instanceof Error ? e.message : "Lưu không được");
    } finally {
      setBan(false);
    }
  };

  if (loi) return <p className="text-sm text-[#ff9d9d]">{loi}</p>;
  if (!tt) return <section className="plate rise rise-2"><div className="p-4 text-sm text-[var(--text-muted)]">Đang tính…</div></section>;

  const { kq } = tt;
  const bangChan = kq.bang.filter((x) => x.lyDo);
  const oCua = (x: (typeof kq.bang)[number]) => (x.viTri.loai === "base" ? `ngày ${x.viTri.so}` : `liên tiếp ${x.viTri.so}`);
  const hienTai = (x: (typeof kq.bang)[number]) => {
    const b = x.viTri.loai === "base" ? tt.lichHienTai.base : tt.lichHienTai.consecutive;
    return x.viTri.so in b ? b[x.viTri.so] : null;
  };

  return (
    <section className="plate rise rise-2" data-chan-ngay>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🗓 Chặn Theo Ngày — Áp Vào Bảng Hạn Mức</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · {kq.soKy} kỳ · bậc = các nhóm của &ldquo;Ngày Nào Đẹp Nhất&rdquo; · mức chung{" "}
            {Math.round(kq.mucChung * 100)}/100 · bước 2 chấm {kq.thang2.map(tenThang).join(" + ")} ({kq.soKy2} kỳ)
            {tt.apLuc && ` · áp lần cuối ${new Date(tt.apLuc).toLocaleString("vi-VN")}`}
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
          Cùng luật hai bước, nhưng chấm từng <b className="text-white">bậc ngày</b>: bậc nào tổng thể về trên mức chung, hoặc 2 tháng
          gần phần ăn dưới 0% → ô của bậc đó trong bảng <b className="text-white">Hạn Mức Theo Số Ngày Chưa Về</b> về{" "}
          <b className="text-white">0</b>. Bậc không bị chặn thì <b>giữ nguyên số anh đang cài</b>. Bỏ qua bậc dưới{" "}
          {MAU_TOI_THIEU_NGAY} lô-kỳ. &ldquo;Vừa về&rdquo; là ngày 0, &ldquo;về liên tiếp n&rdquo; là mức riêng n.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-chan-ngay-tong>
          <O nhan="Bậc bị chặn" gt={`${kq.chan.length}/${kq.bang.length}`} phu={`bước 1: ${kq.dem.tong + kq.dem.cahai} · bước 2: ${kq.dem.thang + kq.dem.cahai}`} m="#ff6b78" />
          <O nhan="Ô sẽ đổi" gt={String(tt.doi.length)} phu={tt.doi.length ? tt.doi.map((d) => d.o).join(", ") : "lịch đã khớp luật"} m={tt.doi.length ? "#ffd24a" : "#7ff0c0"} />
          <O nhan="Tự áp mỗi kỳ" gt={tt.auto ? "BẬT" : "tắt"} phu={tt.auto ? "sau mỗi lần cào kết quả" : "chỉ áp khi bấm nút"} m={tt.auto ? "#7ff0c0" : "#cbd5e1"} />
          <O nhan="Áp lần cuối" gt={tt.apLuc ? new Date(tt.apLuc).toLocaleDateString("vi-VN") : "—"} phu={tt.apLuc ? new Date(tt.apLuc).toLocaleTimeString("vi-VN") : "chưa áp lần nào"} m="#8fd0ff" />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: tt.doi.length ? "rgba(251,191,36,0.55)" : "var(--hairline)", background: tt.doi.length ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)" }}>
          <span className="text-[0.74rem] text-[var(--text-secondary)] flex-1 min-w-[160px]" data-chan-ngay-trang-thai>
            {tt.doi.length ? (
              <>
                <b className="text-[#ffd24a]">{tt.doi.length} ô sẽ về 0:</b>{" "}
                {tt.doi.map((d) => `${d.o} (${d.tu} → 0)`).join(", ")}. Bấm Áp là ghi thật vào bảng và tính lại hạn mức.
              </>
            ) : (
              <>Lịch hạn mức đang khớp với luật — không ô nào cần đổi.</>
            )}
          </span>
          <button
            onClick={doiAuto}
            disabled={ban}
            data-chan-ngay-auto
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${tt.auto ? "bg-[#059669] border-[#34e6a8] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.14]"} disabled:opacity-40`}
          >
            {tt.auto ? "🔁 Tự áp mỗi kỳ: BẬT" : "🔁 Tự áp mỗi kỳ: tắt"}
          </button>
          <button
            onClick={apNgay}
            disabled={ban || tt.doi.length === 0}
            data-chan-ngay-ap
            className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-40"
          >
            {ban ? "Đang áp…" : "🚫 Áp vào bảng Hạn Mức ngay"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.72rem] min-w-[420px]">
            <thead>
              <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-2 py-1 text-left font-bold">Bậc</th>
                <th className="px-2 py-1 text-left font-bold">Ô trong lịch</th>
                <th className="px-2 py-1 text-right font-bold">Đang cài</th>
                <th className="px-2 py-1 text-right font-bold">Về / lô-kỳ</th>
                <th className="px-2 py-1 text-right font-bold">Phần ăn</th>
                <th className="px-2 py-1 text-right font-bold">2 tháng ăn</th>
                <th className="px-2 py-1 text-left font-bold">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {kq.bang.map((x) => {
                const cai = hienTai(x);
                const it = x.mau < MAU_TOI_THIEU_NGAY;
                return (
                  <tr key={x.key} className="border-t border-[var(--hairline)]" data-chan-ngay-bac={x.key} data-chan={x.lyDo ?? "0"} style={x.lyDo ? { background: "rgba(220,38,38,0.1)" } : undefined}>
                    <td className="px-2 py-1 text-white font-bold">{x.ten}</td>
                    <td className="px-2 py-1 text-[var(--text-muted)]">{oCua(x)}{cai === null && <span className="text-[#ffd24a]"> (không có ô)</span>}</td>
                    <td className="px-2 py-1 text-right numeric">{cai === null ? "—" : cai}</td>
                    <td className="px-2 py-1 text-right numeric" style={{ color: x.b1 ? "#ff9d9d" : "#cbd5e1" }}>{tl(x.tyLe)}{it && <span className="text-[#ffd24a]"> ít</span>}</td>
                    <td className="px-2 py-1 text-right numeric" style={{ color: mau(x.bien) }}>{pc(x.bien)}</td>
                    <td className="px-2 py-1 text-right numeric" style={{ color: mau(x.bien2) }}>{x.mau2 >= MAU_TOI_THIEU_NGAY ? pc(x.bien2) : "ít"}</td>
                    <td className="px-2 py-1 font-bold" style={{ color: x.lyDo ? "#ff9d9d" : "#7ff0c0" }}>{x.lyDo ? `CHẶN · ${LY_DO[x.lyDo]}` : "nhận"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
          <b>Trước khi bật tự áp.</b> {bangChan.length}/{kq.bang.length} bậc đang dính luật. Dashboard đã đo trên chính bảng này: chặn
          theo bậc lỗ không hơn bốc bừa, vì ở phần ăn 0% bậc nào cũng dao động quanh mức chung. Áp luật là nhận ít tiền hơn chứ không
          phải ăn nhiều hơn — khách hiểu vậy thì bật.
        </div>
      </div>
    </section>
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
