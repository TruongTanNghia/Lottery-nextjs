"use client";

/**
 * Tab "⚖️ Cân Sổ" — thử nghiệm, khách 30/10/2026: "những con số trên đó nếu
 * nhận được thì không nói, nếu không nhận được thì con số còn thiếu sẽ đánh
 * vào bao nhiêu để kiểu gì mình cũng có lời".
 *
 * Lấy đúng số máy đang dùng: hạn mức 100 lô (/api/limits — bảng 100 lô,
 * chuỗi copy, bot cùng một nguồn), cặp đá PA2 kỳ tới (bảng tiền đá PA2 + luật),
 * sổ đã nhận (tab Rủi Ro Tiền) và kết quả đã xổ. Dán số khách lẻ đã đánh,
 * máy đặt ba cách cạnh nhau và chạy trên các kỳ thật: không bù / đánh lên
 * đúng số nhận / bù số thiếu. Chỉ đọc — không lưu, không chạm tab nào khác.
 */
import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import {
  CAC_CACH, TEN_CACH, chayCanSo, chuoiDanhLenDa, chuoiDanhLenLo, diemBu, docDaNhan, docLoNhan, giaMacDinh, thieuCua,
  type Cach, type DongSo, type GiaBen, type KieuBu, type LoaiSo,
} from "@/lib/can-so";
import { apChanLuat, chuanHoaBang, khoKyToi, khoaCap, tenBacDa } from "@/lib/da";
import { TIEN_TO_NHAN_MAC_DINH, capNhan } from "@/lib/da-nhan";
import { REGION_LABELS, type Region } from "@/lib/types";
import { useToast } from "./Toast";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const so = (n: number) => n.toLocaleString("vi-VN");
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const homNayVN = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

async function lay(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url.split("?")[0]} trả ${r.status}`);
  return r.json();
}

interface HanMucLo { diem: Record<string, number>; o: Record<string, string> }
interface HanMucDa { diem: Record<string, number>; o: Record<string, string>; ngayCuoi: string }

export default function CanSoPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [lo, setLo] = useState<HanMucLo | null>(null);
  const [da, setDa] = useState<HanMucDa | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setDraws(null); setLo(null); setDa(null); setLoi(null);
    (async () => {
      try {
        const [h, l, d] = await Promise.all([
          lay(`/api/history/hits?region=${region}`),
          lay(`/api/limits?region=${region}`),
          lay(`/api/config/da?region=${region}&pa=2`),
        ]);
        if (huy) return;
        const ds = (h.draws ?? []) as DrawHits[];
        setDraws(ds);
        const diemLo: Record<string, number> = {}, oLo: Record<string, string> = {};
        for (const r of (l.data ?? []) as { lo_number: string; current_limit: number; o_ten?: string }[]) {
          diemLo[r.lo_number] = Math.max(0, Number(r.current_limit) || 0);
          oLo[r.lo_number] = r.o_ten ?? "";
        }
        setLo({ diem: diemLo, o: oLo });
        const tt = khoKyToi(ds);
        if (tt && d?.data) {
          const bang = d.data.tuDong !== false ? apChanLuat(chuanHoaBang(d.data.bang), d.data.chanLuat ?? []) : chuanHoaBang(d.data.bang);
          const diemDa: Record<string, number> = {}, oDa: Record<string, string> = {};
          for (const [lon, nho, diem] of capNhan(tt.bac, bang)) {
            const k = `${nho}-${lon}`;
            diemDa[k] = diem;
            oDa[k] = `${tenBacDa(tt.bac[nho], "ngan")} × ${tenBacDa(tt.bac[lon], "ngan")}`;
          }
          setDa({ diem: diemDa, o: oDa, ngayCuoi: tt.ngayCuoi });
        } else setDa({ diem: {}, o: {}, ngayCuoi: tt?.ngayCuoi ?? "" });
      } catch (e) {
        if (!huy) setLoi(e instanceof Error ? e.message : "lỗi không rõ");
      }
    })();
    return () => { huy = true; };
  }, [region]);

  return (
    <div className="space-y-4 md:space-y-6" data-canso>
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">⚖️ Cân Sổ — thử nghiệm · {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Số máy đang đưa ra cho kỳ tới, dán số khách lẻ đã đánh vào, máy đặt ba cách cạnh nhau và chạy trên các kỳ đã xổ thật:{" "}
              <b>không bù</b> · <b>đánh lên đúng số nhận</b> · <b>bù số thiếu</b>. Chỉ tính, không lưu gì.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-2 text-[0.78rem] leading-relaxed text-[var(--text-secondary)]">
          <p>
            <b className="text-white">Kiểu gì cũng lời chỉ có một dạng:</b> đánh lên cửa trên <b>đúng con đã nhận, đúng tiền</b>, ở giá rẻ hơn giá thu. Khách về thì cửa trên
            trả về đúng số mình phải trả; khách trượt thì mình giữ chênh giá. Kỳ nào cũng còn <b>(giá thu − giá đánh) × tiền nhận</b>.
          </p>
          <p>
            <b className="text-white">Bù vào con còn thiếu</b> thì không có mức nào chắc: mình thua khi con khách đánh về, còn con bù chỉ trả khi chính nó về — hai chuyện không
            cùng lúc nên không bù trừ. Bảng chạy thử bên dưới cho thấy điều đó trên số thật.
          </p>
          {loi && <p className="text-sm text-[#ff9d9d]">Không tải được dữ liệu: {loi}</p>}
        </div>
      </section>
      {draws && lo && (
        <KhoiCanSo
          loai="lo" region={region} draws={draws} hanMuc={lo.diem} tenO={lo.o}
          tieuDe="🔢 Lô — 100 con, hạn mức máy đang đưa ra kỳ tới"
          goiY='Dán đúng khuôn chuỗi copy / tab Rủi Ro Tiền: "23b1, 24b1, 25b10" (tiền tố đài có hay không đều được)'
        />
      )}
      {draws && da && (
        <KhoiCanSo
          loai="da" region={region} draws={draws} hanMuc={da.diem} tenO={da.o}
          tieuDe={`🎲 Đá PA2 — ${so(Object.keys(da.diem).length)} cặp đang nhận kỳ tới${da.ngayCuoi ? ` (sau kết quả ${ddmm(da.ngayCuoi)})` : ""}`}
          goiY='Dán đúng khuôn bot: "24 95dx10n 37 82dx6n", vòng "01 10 11dx5n" (Bắc "da10n")'
        />
      )}
      {!draws && !loi && <p className="text-sm text-[var(--text-muted)] px-1">Đang tải số máy đang dùng…</p>}
    </div>
  );
}

interface KhoiProps {
  loai: LoaiSo;
  region: Region;
  draws: DrawHits[];
  hanMuc: Record<string, number>;
  tenO: Record<string, string>;
  tieuDe: string;
  goiY: string;
}

function KhoiCanSo({ loai, region, draws, hanMuc, tenO, tieuDe, goiY }: KhoiProps) {
  const toast = useToast();
  const macDinh = giaMacDinh(loai, region);
  const [thuN, setThuN] = useState(String(macDinh.thu / 1000));
  const [danhN, setDanhN] = useState(String(macDinh.danh / 1000));
  const [tienTo, setTienTo] = useState(TIEN_TO_NHAN_MAC_DINH[region]);
  const [daNhan, setDaNhan] = useState<Record<string, number>>({});
  const [dan, setDan] = useState("");
  const [buKieu, setBuKieu] = useState<"thieu" | "codinh">("thieu");
  const [buN, setBuN] = useState("1");
  const [soKy, setSoKy] = useState<30 | 90 | 0>(0);
  const [moNgay, setMoNgay] = useState(false);
  const [moDong, setMoDong] = useState(false);
  // Sổ lô đã lưu ở tab Rủi Ro Tiền — nạp theo ngày, chỉ đọc.
  const [ngaySo, setNgaySo] = useState(homNayVN);
  const [cacNgaySo, setCacNgaySo] = useState<string[]>([]);

  useEffect(() => {
    setDaNhan({}); setDan(""); setThuN(String(macDinh.thu / 1000)); setDanhN(String(macDinh.danh / 1000)); setTienTo(TIEN_TO_NHAN_MAC_DINH[region]);
    if (loai !== "lo") return;
    let huy = false;
    lay(`/api/bets?region=${region}&date=${homNayVN()}`).then((d) => !huy && setCacNgaySo(Array.isArray(d.dates) ? d.dates : [])).catch(() => undefined);
    return () => { huy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, loai]);

  const gia: GiaBen = useMemo(() => ({ thu: Math.max(0, Number(thuN) || 0) * 1000, danh: Math.max(0, Number(danhN) || 0) * 1000, tra: macDinh.tra }), [thuN, danhN, macDinh.tra]);
  const bu: KieuBu = useMemo(() => (buKieu === "thieu" ? { kieu: "thieu" } : { kieu: "codinh", n: Math.max(0, Number(buN) || 0) }), [buKieu, buN]);
  const ds: DongSo[] = useMemo(() => {
    const khoa = new Set([...Object.keys(hanMuc).filter((k) => hanMuc[k] > 0), ...Object.keys(daNhan).filter((k) => daNhan[k] > 0)]);
    return [...khoa].sort().map((k) => ({ khoa: k, hanMuc: hanMuc[k] ?? 0, daNhan: daNhan[k] ?? 0 }));
  }, [hanMuc, daNhan]);
  const drawsChon = useMemo(() => {
    const sap = [...draws].sort((a, b) => a.date.localeCompare(b.date));
    return soKy ? sap.slice(-soKy) : sap;
  }, [draws, soKy]);
  const kq = useMemo(() => chayCanSo(ds, gia, bu, loai, drawsChon), [ds, gia, bu, loai, drawsChon]);
  const chuoi = useMemo(() => (loai === "lo" ? chuoiDanhLenLo(ds, tienTo) : chuoiDanhLenDa(ds, region, tienTo)), [ds, loai, region, tienTo]);
  const dv = loai === "lo" ? "con" : "cặp";

  function congDan() {
    const r = loai === "lo" ? docLoNhan(dan) : docDaNhan(dan);
    const soMuc = loai === "lo" ? (r as ReturnType<typeof docLoNhan>).soMuc : (r as ReturnType<typeof docDaNhan>).soCap;
    if (soMuc === 0) { toast.show("error", `Không đọc được ${dv} nào trong đoạn vừa dán`); return; }
    setDaNhan((prev) => { const n = { ...prev }; for (const [k, v] of Object.entries(r.diem)) n[k] = (n[k] ?? 0) + v; return n; });
    setDan("");
    toast.show(r.la.length ? "info" : "success", `Đã cộng ${soMuc} ${dv}` + (r.la.length ? ` · bỏ qua ${r.la.length} mẩu lạ: ${r.la.slice(0, 3).join(", ")}` : ""));
  }
  async function napSo() {
    try {
      const d = await lay(`/api/bets?region=${region}&date=${ngaySo}`);
      const p = (d.points ?? {}) as Record<string, number>;
      if (Object.keys(p).length === 0) { toast.show("info", `Ngày ${ddmm(ngaySo)} chưa có sổ ở tab Rủi Ro Tiền`); return; }
      setDaNhan(p);
      toast.show("success", `Đã nạp sổ ngày ${ddmm(ngaySo)}: ${Object.keys(p).length} con`);
    } catch { toast.show("error", "Không tải được sổ"); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(chuoi); toast.show("success", "Đã copy chuỗi đánh lên"); } catch { toast.show("error", "Không copy được — bấm giữ vào ô rồi chọn Copy"); }
  }

  const chenh = gia.thu - gia.danh;
  const ketLuan = kq.tongNhan === 0
    ? "Chưa có số đã nhận — dán số khách lẻ đã đánh vào."
    : chenh > 0
      ? `Luôn lời chỉ có cách "đánh lên đúng số nhận": mỗi kỳ còn đúng ${tien(kq.chenhChac)} = ${tien(chenh)} × ${so(kq.tongNhan)}n, không phụ thuộc kết quả.`
      : chenh === 0
        ? "Giá thu đang bằng giá đánh nên đánh lên ra đúng 0 mọi kỳ — không có cách nào lời chắc ở giá này. Nếu khách lẻ trả giá cao hơn, nhập giá thu thật vào ô trên."
        : "Giá đánh cao hơn giá thu: đánh lên lỗ chắc. Không có cách nào lời chắc.";
  const dongHien = moDong ? ds : ds.filter((d) => d.daNhan > 0).slice(0, 60);

  return (
    <section className="plate rise rise-2" data-canso-khoi={loai}>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">{tieuDe}</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">{goiY}</p>
        </div>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-[0.72rem] text-[var(--text-secondary)]" data-canso-gia>
          <label className="flex flex-col gap-0.5">Giá thu mỗi 1 điểm (n)
            <input value={thuN} onChange={(e) => setThuN(e.target.value)} inputMode="decimal" data-canso-gia-thu className="w-20 px-2 py-1 rounded bg-white/[0.06] border border-[var(--hairline)] text-white numeric" />
          </label>
          <label className="flex flex-col gap-0.5">Giá đánh lên (n)
            <input value={danhN} onChange={(e) => setDanhN(e.target.value)} inputMode="decimal" data-canso-gia-danh className="w-20 px-2 py-1 rounded bg-white/[0.06] border border-[var(--hairline)] text-white numeric" />
          </label>
          <span className="pb-1">Trả mỗi lần trúng <b className="text-white numeric">{tien(macDinh.tra)}</b>{loai === "da" ? " (cặp về, đếm một lần)" : " (mỗi nháy)"}</span>
          <label className="flex flex-col gap-0.5">Tiền tố
            <input value={tienTo} onChange={(e) => setTienTo(e.target.value)} data-canso-tien-to className="w-16 px-2 py-1 rounded bg-white/[0.06] border border-[var(--hairline)] text-white" />
          </label>
        </div>

        <div className="space-y-1.5">
          <textarea value={dan} onChange={(e) => setDan(e.target.value)} rows={2} placeholder={loai === "lo" ? "23b1, 24b1, 25b10" : "24 95dx10n 37 82dx6n"} data-canso-dan className="w-full px-2.5 py-2 rounded-lg bg-white/[0.05] border border-[var(--hairline)] text-sm text-white font-mono" />
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={congDan} data-canso-cong className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2563eb] text-white hover:bg-[#1d4ed8]">Cộng vào sổ đã nhận</button>
            <button onClick={() => setDaNhan({})} data-canso-xoa className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">Xoá hết</button>
            {loai === "lo" && (
              <>
                <input type="date" value={ngaySo} onChange={(e) => setNgaySo(e.target.value)} list={`canso-ngay-${region}`} data-canso-ngay-so className="px-2 py-1 rounded bg-white/[0.06] border border-[var(--hairline)] text-xs text-white" />
                <datalist id={`canso-ngay-${region}`}>{cacNgaySo.map((d) => <option key={d} value={d} />)}</datalist>
                <button onClick={() => void napSo()} data-canso-nap className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">Nạp sổ ngày đó (tab Rủi Ro Tiền)</button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" data-canso-tong>
          <O nhan="Đã nhận" gt={`${so(kq.tongNhan)}n`} phu={`${so(kq.dongNhan)} ${dv} · thu ${tien(kq.tongNhan * gia.thu)}${kq.dongNgoai ? ` · ${kq.dongNgoai} ${dv} ngoài hạn mức` : ""}`} m="#8fd0ff" />
          <O nhan="Còn thiếu so với hạn mức" gt={`${so(kq.tongThieu)}n`} phu={`${so(kq.dongThieu)} ${dv} chưa đủ`} m="#ffd24a" />
          <O nhan="Đánh lên đúng số nhận" gt={dau(kq.chenhChac)} phu="còn lại MỌI KỲ, không phụ thuộc kết quả" m={mau(kq.chenhChac)} />
          <O nhan="Bù số thiếu" gt={`${so(kq.tongBu)}n`} phu="không có mức nào chắc lời — xem bảng chạy thử" m="#ff9d9d" />
        </div>

        <div className="rounded-lg border px-3 py-2 text-[0.78rem] leading-relaxed" data-canso-ket-luan={kq.tongNhan === 0 ? "trong" : chenh > 0 ? "co" : "khong"} style={{ borderColor: chenh > 0 && kq.tongNhan > 0 ? "rgba(52,211,153,0.55)" : "rgba(251,191,36,0.6)", background: chenh > 0 && kq.tongNhan > 0 ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)" }}>
          <b className="text-white">{ketLuan}</b>
        </div>

        {chuoi && (
          <div className="space-y-1" data-canso-chuoi-khoi>
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Chuỗi đánh lên đúng số nhận ({so(kq.dongNhan)} {dv})</span>
              <button onClick={() => void copy()} data-canso-copy className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">📋 Copy</button>
            </div>
            <textarea readOnly value={chuoi} rows={2} data-canso-chuoi className="w-full px-2.5 py-2 rounded-lg bg-black/30 border border-[var(--hairline)] text-sm text-white font-mono" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.72rem] text-[var(--text-secondary)]" data-canso-bu>
          <span className="eyebrow">Bù số thiếu</span>
          <button onClick={() => setBuKieu("thieu")} data-canso-bu-kieu="thieu" className={`px-2 py-1 rounded-lg text-xs font-bold ${buKieu === "thieu" ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>đúng phần thiếu (hạn mức − đã nhận)</button>
          <span className="flex items-center gap-1">
            <button onClick={() => setBuKieu("codinh")} data-canso-bu-kieu="codinh" className={`px-2 py-1 rounded-lg text-xs font-bold ${buKieu === "codinh" ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>cố định</button>
            <input value={buN} onChange={(e) => { setBuN(e.target.value); setBuKieu("codinh"); }} inputMode="numeric" data-canso-bu-n className="w-12 px-1.5 py-0.5 rounded bg-white/[0.06] border border-[var(--hairline)] text-white numeric" /> n mỗi {dv} thiếu
          </span>
          <span className="eyebrow">Chạy thử</span>
          {([[30, "30 kỳ"], [90, "90 kỳ"], [0, `tất cả ${so(draws.length)} kỳ`]] as [30 | 90 | 0, string][]).map(([k, t]) => (
            <button key={k} onClick={() => setSoKy(k)} data-canso-so-ky={k} className={`px-2 py-1 rounded-lg text-xs font-bold ${soKy === k ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{t}</button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.72rem]" data-canso-tom-tat>
            <thead>
              <tr className="text-[var(--text-muted)] text-left">
                <th className="py-1 pr-2">Cách</th><th className="py-1 pr-2">Kỳ lời / lỗ / hoà</th><th className="py-1 pr-2">Tệ nhất</th><th className="py-1 pr-2">Tốt nhất</th><th className="py-1 pr-2">TB mỗi kỳ</th><th className="py-1 pr-2">Tổng</th><th className="py-1">Luôn lời?</th>
              </tr>
            </thead>
            <tbody>
              {CAC_CACH.map((c) => <DongCach key={c} c={c} t={kq.tomTat[c]} />)}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setMoNgay((v) => !v)} data-canso-mo-ngay className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">{moNgay ? "Ẩn" : "Xem"} từng kỳ</button>
          <button onClick={() => setMoDong((v) => !v)} data-canso-mo-dong className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">{moDong ? `Chỉ ${dv} đã nhận` : `Xem cả ${so(ds.length)} ${dv} kỳ tới`}</button>
        </div>

        {moNgay && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-[0.7rem]" data-canso-bang-ngay>
              <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">Kỳ</th><th className="py-1 pr-2">{loai === "lo" ? "Nháy rơi vào số nhận" : "Cặp nhận về"}</th><th className="py-1 pr-2">Không bù</th><th className="py-1 pr-2">Đánh lên</th><th className="py-1">Bù số thiếu</th></tr></thead>
              <tbody>
                {[...kq.ky].reverse().map((k) => (
                  <tr key={k.date} data-canso-ngay={k.date} className="border-t border-[var(--hairline)]">
                    <td className="py-1 pr-2 numeric">{ddmm(k.date)}</td><td className="py-1 pr-2 numeric">{k.trungNhan}</td>
                    <td className="py-1 pr-2 numeric" style={{ color: mau(k.khongBu) }}>{dau(k.khongBu)}</td>
                    <td className="py-1 pr-2 numeric" style={{ color: mau(k.danhLen) }}>{dau(k.danhLen)}</td>
                    <td className="py-1 numeric" style={{ color: mau(k.buThieu) }}>{dau(k.buThieu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-[0.7rem]" data-canso-bang-dong>
            <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">{loai === "lo" ? "Lô" : "Cặp"}</th><th className="py-1 pr-2">Ô</th><th className="py-1 pr-2">Hạn mức</th><th className="py-1 pr-2">Đã nhận</th><th className="py-1 pr-2">Thiếu</th><th className="py-1 pr-2">Đánh lên</th><th className="py-1">Bù</th></tr></thead>
            <tbody>
              {dongHien.length === 0 && <tr><td colSpan={7} className="py-2 text-[var(--text-muted)]">Chưa có {dv} nào đã nhận.</td></tr>}
              {dongHien.map((d) => (
                <tr key={d.khoa} data-canso-dong={d.khoa} className="border-t border-[var(--hairline)]">
                  <td className="py-1 pr-2 numeric text-white font-bold">{d.khoa.replace("-", " ")}</td>
                  <td className="py-1 pr-2">{tenO[d.khoa] ?? ""}</td>
                  <td className="py-1 pr-2 numeric">{d.hanMuc > 0 ? `${so(d.hanMuc)}n` : <span className="text-[#ff9d9d]">chặn</span>}</td>
                  <td className="py-1 pr-2"><input value={d.daNhan || ""} onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setDaNhan((p) => { const n = { ...p }; if (v > 0) n[d.khoa] = v; else delete n[d.khoa]; return n; }); }} inputMode="numeric" placeholder="0" data-canso-nhap={d.khoa} className="w-14 px-1.5 py-0.5 rounded bg-white/[0.06] border border-[var(--hairline)] text-white numeric" /></td>
                  <td className="py-1 pr-2 numeric" style={{ color: thieuCua(d) > 0 ? "#ffd24a" : "#cbd5e1" }}>{so(thieuCua(d))}n</td>
                  <td className="py-1 pr-2 numeric" style={{ color: d.daNhan > 0 ? "#7ff0c0" : "#cbd5e1" }}>{so(d.daNhan)}n</td>
                  <td className="py-1 numeric" style={{ color: diemBu(d, bu) > 0 ? "#ff9d9d" : "#cbd5e1" }}>{so(diemBu(d, bu))}n</td>
                </tr>
              ))}
              {!moDong && ds.filter((d) => d.daNhan > 0).length > 60 && <tr><td colSpan={7} className="py-1 text-[var(--text-muted)]">… còn {so(ds.filter((d) => d.daNhan > 0).length - 60)} {dv} đã nhận nữa, bấm "Xem cả" để thấy hết.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DongCach({ c, t }: { c: Cach; t: ReturnType<typeof chayCanSo>["tomTat"][Cach] }) {
  return (
    <tr data-canso-cach={c} data-canso-luon-loi={t.luonLoi ? "1" : "0"} className="border-t border-[var(--hairline)]">
      <td className="py-1.5 pr-2 font-bold text-white">{TEN_CACH[c]}</td>
      <td className="py-1.5 pr-2 numeric">{t.kyLoi} / {t.kyLo} / {t.kyHoa}</td>
      <td className="py-1.5 pr-2 numeric" style={{ color: mau(t.teNhat) }}>{t.soKy ? `${dau(t.teNhat)} (${ddmm(t.ngayTeNhat)})` : "—"}</td>
      <td className="py-1.5 pr-2 numeric" style={{ color: mau(t.totNhat) }}>{t.soKy ? `${dau(t.totNhat)} (${ddmm(t.ngayTotNhat)})` : "—"}</td>
      <td className="py-1.5 pr-2 numeric" style={{ color: mau(t.trungBinh) }}>{dau(t.trungBinh)}</td>
      <td className="py-1.5 pr-2 numeric" style={{ color: mau(t.tong) }}>{dau(t.tong)}</td>
      <td className="py-1.5 font-bold" style={{ color: t.luonLoi ? "#7ff0c0" : "#ff9d9d" }}>{t.soKy === 0 ? "—" : t.luonLoi ? (t.coDinh ? "✅ mọi kỳ, cố định" : "✅ mọi kỳ") : t.coDinh ? "— cố định, không lời" : "❌ có kỳ lỗ"}</td>
    </tr>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2">
      <div className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">{nhan}</div>
      <div className="text-lg font-extrabold numeric" style={{ color: m }}>{gt}</div>
      <div className="text-[0.66rem] text-[var(--text-secondary)] leading-snug">{phu}</div>
    </div>
  );
}
