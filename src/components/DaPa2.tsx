"use client";

/**
 * Hai khối chỉ tab Số Đá 2 (phương án 2) có — xem src/lib/da-nhan.ts.
 *
 *   DaSoNhan   — số nhận kỳ tới, copy được (khách: "copy được số nhận").
 *   DaTienNhan — tiền số nhận theo từng ngày, từng tháng, thời gian thực.
 *
 * Tab Số Đá (phương án 1) không gắn hai khối này.
 */
import { useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { GIA_DA, khoKyToi, soTungKyTheoBang, gomThang, type BangDa, type KyDa } from "@/lib/da";
import {
  LENH_NHAN_LOAI, LENH_NHAN_LQ, capNhan, chiaKhoiNhanDa, dongNhanLq, hauToNhan, khoiNhanLq, nhomNhanDa, tienNhanTheoNgay,
} from "@/lib/da-nhan";
import { provincePrefix } from "@/lib/provinces";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const so = (n: number) => n.toLocaleString("vi-VN");
const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2).replace(".", ",") + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const tenMien = (r: Region) => (r === "xsmn" ? "mn" : r === "xsmt" ? "mt" : "mb");

// ─────────────────────────────────────────────────────────────────────────────
// Số nhận kỳ tới
// ─────────────────────────────────────────────────────────────────────────────

export function DaSoNhan({ draws, region, bang }: { draws: DrawHits[]; region: Region; bang: BangDa }) {
  const toast = useToast();
  const [khongLap, setKhongLap] = useState(false);
  const kq = useMemo(() => {
    const tt = khoKyToi(draws);
    if (!tt) return null;
    const cap = capNhan(tt.bac, bang);
    const muc = nhomNhanDa(cap, khongLap);
    const dau = provincePrefix(region);
    const chuoi = chiaKhoiNhanDa(dau, muc, Number.POSITIVE_INFINITY, region)[0] ?? "";
    const lq = khoiNhanLq([dongNhanLq(dau, muc, region)]);
    // Theo con: mỗi con nhận với bao nhiêu con, để nhìn nhanh con nào "mở" nhiều nhất.
    const dem = new Map<string, number>();
    for (const [a, b] of cap) { dem.set(a, (dem.get(a) ?? 0) + 1); dem.set(b, (dem.get(b) ?? 0) + 1); }
    return { ngayCuoi: tt.ngayCuoi, cap, muc, chuoi, lq, dem };
  }, [draws, bang, region, khongLap]);

  if (!kq) return null;
  const copy = async (s: string, bao: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.show("success", bao);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };
  const soTron = kq.muc.reduce((s, m) => s + m.conTron.length, 0);
  const soVong = kq.muc.reduce((s, m) => s + m.nhom.length, 0);
  const thu1Ky = kq.cap.reduce((s, c) => s + c[2], 0) * GIA_DA[region];
  const conMo = [...kq.dem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <section className="plate rise rise-1" data-da-so-nhan>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">✅ Số Nhận Kỳ Tới — {REGION_LABELS[region]}</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Cặp nào rơi vào ô đang cài trên 0 điểm là cặp NHẬN, nhận đúng số điểm của ô đó · theo kỳ {ddmm(kq.ngayCuoi)}
          </p>
        </div>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <O nhan="Cặp nhận" gt={`${so(kq.cap.length)}`} phu={`trên 4.950 cặp · chặn ${so(4950 - kq.cap.length)}`} m="#34e6a8" />
          <O nhan="Con nhận tròn" gt={String(soTron)} phu="nhận đủ 99 con ở một mức" m="#8fd0ff" />
          <O nhan="Số vòng" gt={so(soVong)} phu="các cặp còn lại gom vòng" m="#ffd24a" />
          <O nhan="Thu nếu khách đặt đủ" gt={tien(thu1Ky)} phu="mọi cặp nhận × điểm × giá" m="#c2d4ea" />
        </div>

        <div className="flex flex-wrap gap-1.5 text-[0.72rem]" data-nhan-muc>
          {kq.muc.map((m) => (
            <span key={m.diem} className="rounded px-2 py-1 bg-white/[0.06] border border-[var(--hairline)] text-[#dbe7f7]">
              <b className="numeric">{m.diem}</b> điểm: <b className="numeric">{so(m.soCap)}</b> cặp · {m.conTron.length} con tròn · đuôi <code>{hauToNhan(region, m.diem)}</code>
            </span>
          ))}
          {kq.muc.length === 0 && <span className="text-[#ff9d9d]">Bảng đang chặn hết — không nhận cặp nào.</span>}
        </div>

        <label className="flex items-center gap-2 text-[0.72rem] text-[#c2d4ea]">
          <input type="checkbox" checked={khongLap} onChange={(e) => setKhongLap(e.target.checked)} data-nhan-khong-lap />
          Không lặp cặp (mỗi cặp ghi đúng một lần — chuỗi dài hơn)
        </label>

        {kq.chuoi && (
          <div className="rounded-lg border border-[var(--hairline)] bg-black/20 px-2.5 py-2" data-nhan-chuoi>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.7rem] font-bold text-white">{LENH_NHAN_LOAI} · {so(kq.chuoi.length)} ký tự</span>
              <button
                onClick={() => copy(kq.chuoi, `Đã copy ${LENH_NHAN_LOAI}${kq.lq ? ` — còn ${LENH_NHAN_LQ} nữa, dán cả hai` : ""}`)}
                data-nhan-copy
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800"
              >
                📋 Copy {LENH_NHAN_LOAI}
              </button>
            </div>
            <code className="block mt-1 max-h-40 overflow-y-auto text-[0.66rem] leading-snug text-[#dbe7f7] break-all whitespace-pre-wrap" data-nhan-chuoi-xem>
              {kq.chuoi}
            </code>
          </div>
        )}
        {kq.lq && (
          <div className="rounded-lg border border-[#34e6a8]/40 bg-emerald-900/20 px-2.5 py-2" data-nhan-lq>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.7rem] font-bold text-[#7ff0c0]">{soTron} con nhận tròn — khối {LENH_NHAN_LQ}</span>
              <button
                onClick={() => copy(kq.lq, `Đã copy ${LENH_NHAN_LQ} — ${soTron} con nhận tròn`)}
                data-nhan-copy-lq
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800"
              >
                📋 Copy {LENH_NHAN_LQ}
              </button>
            </div>
            <code className="block mt-1 text-[0.66rem] leading-snug text-[#d8ffef] break-all whitespace-pre-wrap" data-nhan-lq-xem>{kq.lq}</code>
          </div>
        )}
        <div className="text-[0.66rem] text-[var(--text-muted)] leading-relaxed">
          Cùng khuôn chuỗi chặn: <code>01 10 11{hauToNhan(region, 0)}</code> là nhận 0 (chặn), nên <code>01 10 11{hauToNhan(region, 5)}</code> là
          nhận 5 điểm mỗi cặp trong vòng đó. Con nằm ở {LENH_NHAN_LQ} là nhận với cả 99 con còn lại. Dán <b>cả hai</b> khối mới đủ.
          Trên Telegram: <code>/nhanda2 {tenMien(region)}</code> (hay <code>/nhandam{tenMien(region).slice(1)}2</code>), <code>/nhanda2</code> là cả 3 miền.
        </div>

        <details className="text-[0.72rem]" data-nhan-theo-con>
          <summary className="cursor-pointer font-bold text-[#c2d4ea]">Xem theo con — mỗi con nhận với bao nhiêu con (bấm để mở)</summary>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {conMo.map(([c, n]) => (
              <span key={c} className="numeric rounded px-1.5 py-0.5 bg-white/[0.06] text-[#dbe7f7]" title={`${c} nhận với ${n}/99 con`}>
                <b>{c}</b> <span className="text-[var(--text-muted)]">{n}</span>
              </span>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiền số nhận theo ngày, theo tháng
// ─────────────────────────────────────────────────────────────────────────────

type Quang = "thang" | "3thang" | "het";

export function DaTienNhan({
  ky, region, bang, tuDong, buoc1, buoc2, moTay, hieuLuc,
}: {
  ky: KyDa[];
  region: Region;
  /** Bảng đã cài (chưa ép ô luật) — luật được chạy lại theo từng ngày. */
  bang: BangDa;
  tuDong: boolean;
  buoc1: boolean;
  buoc2: boolean;
  moTay: string[];
  /** Bảng đang hiệu lực hôm nay — chỉ để so "nếu dùng bảng hôm nay cho cả quãng". */
  hieuLuc: BangDa;
}) {
  const [quang, setQuang] = useState<Quang>("thang");
  const [mo, setMo] = useState<string | null>(null);
  const tn = useMemo(() => tienNhanTheoNgay(ky, region, bang, { tuDong, buoc1, buoc2, moTay }), [ky, region, bang, tuDong, buoc1, buoc2, moTay]);
  const nhinTruoc = useMemo(() => soTungKyTheoBang(ky.slice(tn.boQuaDau), region, hieuLuc), [ky, tn.boQuaDau, region, hieuLuc]);

  const cuoi = tn.ngay.length ? tn.ngay[tn.ngay.length - 1].date : "";
  const thangCuoi = cuoi.slice(0, 7);
  const tu = useMemo(() => {
    if (quang === "het" || !cuoi) return "";
    if (quang === "thang") return thangCuoi;
    const d = new Date(`${thangCuoi}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 2);
    return d.toISOString().slice(0, 7);
  }, [quang, cuoi, thangCuoi]);
  const ds = tn.ngay.filter((r) => r.date.slice(0, 7) >= tu);
  const dsTruoc = nhinTruoc.filter((r) => r.date.slice(0, 7) >= tu);
  const cong = (rs: { thu: number; tra: number; soCap: number; capTrung: number }[]) =>
    rs.reduce((a, r) => ({ thu: a.thu + r.thu, tra: a.tra + r.tra, soCap: a.soCap + r.soCap, capTrung: a.capTrung + r.capTrung }), { thu: 0, tra: 0, soCap: 0, capTrung: 0 });
  const t = cong(ds);
  const tt = cong(dsTruoc);
  const lai = t.thu - t.tra, laiTruoc = tt.thu - tt.tra;
  const thang = gomThang(tn.ngay);

  return (
    <section className="plate rise rise-1" data-da-tien-nhan>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">💵 Tiền Số Nhận — Từng Ngày, Từng Tháng</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · thời gian thực: sáng mỗi ngày luật chỉ nhìn các kỳ trước ngày đó, ô luật đã chặn thì giữ nguyên ·
            bỏ {tn.boQuaDau} kỳ đầu (luật chưa có gì để nhìn)
          </p>
        </div>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {([["thang", "Tháng này"], ["3thang", "3 tháng"], ["het", "Từ đầu"]] as [Quang, string][]).map(([k, ten]) => (
            <button
              key={k}
              onClick={() => setQuang(k)}
              data-nhan-quang={k}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${quang === k ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}
            >
              {ten}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" data-nhan-tong>
          <O nhan="Thu" gt={tien(t.thu)} phu={`${so(t.soCap)} cặp nhận · ${ds.length} kỳ`} m="#34e6a8" />
          <O nhan="Trả" gt={tien(t.tra)} phu={`${so(t.capTrung)} cặp trúng`} m="#ff6b78" />
          <O nhan="Lãi" gt={tien(lai)} phu={t.thu > 0 ? `phần ăn ${pc((lai / t.thu) * 100)}` : "—"} m={mau(lai)} />
          <O nhan="Ô luật đang chặn" gt={String(ds.length ? ds[ds.length - 1].oLuat : 0)} phu={tuDong ? "cộng dồn, chặn rồi giữ nguyên" : "luật đang tắt"} m="#ffd24a" />
        </div>

        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2 text-[0.72rem] leading-relaxed text-[var(--text-secondary)]" data-nhan-nhin-truoc>
          So sánh: nếu lấy <b>bảng hôm nay</b> chấm ngược cả quãng này thì lãi <b style={{ color: mau(laiTruoc) }}>{tien(laiTruoc)}</b>
          {tt.thu > 0 && <> (phần ăn <b style={{ color: mau(laiTruoc) }}>{pc((laiTruoc / tt.thu) * 100)}</b>)</>}. Con số đó luôn đẹp hơn thật vì
          bảng hôm nay đã "biết trước" các kỳ đã qua — số ở trên mới là số làm ra được. Số điểm từng ô thì dùng đúng số đang cài (không có lịch sử sửa bảng).
        </div>

        <div data-nhan-theo-thang>
          <div className="eyebrow mb-1.5">Theo tháng</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.72rem]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1 pr-2 font-semibold">Tháng</th>
                  <th className="py-1 pr-2 font-semibold text-right">Kỳ</th>
                  <th className="py-1 pr-2 font-semibold text-right">Thu</th>
                  <th className="py-1 pr-2 font-semibold text-right">Trả</th>
                  <th className="py-1 pr-2 font-semibold text-right">Lãi</th>
                  <th className="py-1 font-semibold text-right">Phần ăn</th>
                </tr>
              </thead>
              <tbody>
                {thang.map((m) => (
                  <tr key={m.thang} className="border-t border-[var(--hairline)]" data-nhan-thang={m.thang}>
                    <td className="py-1 pr-2 font-bold text-white">T{Number(m.thang.slice(5))}/{m.thang.slice(2, 4)}{m.dangChay ? " ·đang chạy" : ""}</td>
                    <td className="py-1 pr-2 text-right numeric">{m.soKy}</td>
                    <td className="py-1 pr-2 text-right numeric">{tien(m.thu)}</td>
                    <td className="py-1 pr-2 text-right numeric">{tien(m.tra)}</td>
                    <td className="py-1 pr-2 text-right numeric font-bold" style={{ color: mau(m.lai) }}>{tien(m.lai)}</td>
                    <td className="py-1 text-right numeric" style={{ color: mau(m.pct) }}>{pc(m.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div data-nhan-theo-ngay>
          <div className="eyebrow mb-1.5">Theo ngày — bấm một ngày để xem luật hôm đó</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.72rem]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1 pr-2 font-semibold">Ngày</th>
                  <th className="py-1 pr-2 font-semibold text-right">Cặp nhận</th>
                  <th className="py-1 pr-2 font-semibold text-right">Trúng</th>
                  <th className="py-1 pr-2 font-semibold text-right">Lãi</th>
                  <th className="py-1 font-semibold text-right">Cộng dồn</th>
                </tr>
              </thead>
              <tbody>
                {[...ds].reverse().map((r) => {
                  const dongTu = ds[0];
                  const donQuang = r.don - (dongTu ? dongTu.don - dongTu.lai : 0);
                  return [
                    <tr
                      key={r.date}
                      onClick={() => setMo(mo === r.date ? null : r.date)}
                      data-nhan-ngay={r.date}
                      className={`border-t border-[var(--hairline)] cursor-pointer hover:bg-white/[0.04] ${mo === r.date ? "bg-white/[0.05]" : ""}`}
                    >
                      <td className="py-1 pr-2 font-bold text-white">{ddmm(r.date)}</td>
                      <td className="py-1 pr-2 text-right numeric">{so(r.soCap)}</td>
                      <td className="py-1 pr-2 text-right numeric">{so(r.capTrung)}</td>
                      <td className="py-1 pr-2 text-right numeric font-bold" style={{ color: mau(r.lai) }}>{tien(r.lai)}</td>
                      <td className="py-1 text-right numeric" style={{ color: mau(donQuang) }}>{tien(donQuang)}</td>
                    </tr>,
                    mo === r.date && (
                      <tr key={r.date + "-ct"} data-nhan-chi-tiet>
                        <td colSpan={5} className="pb-2 pt-1 px-1 text-[0.68rem] leading-relaxed text-[var(--text-secondary)]">
                          Luật sáng {ddmm(r.date)} lập từ <b>{r.soKyTruoc}</b> kỳ trước đó · đang chặn <b>{r.oLuat}</b> ô
                          {r.oMoi.length > 0 && <> (bắt thêm hôm đó: {r.oMoi.join(", ")})</>} · {r.soLoVe} con về ·
                          thu <b>{tien(r.thu)}</b> − trả <b>{tien(r.tra)}</b> = <b style={{ color: mau(r.lai) }}>{tien(r.lai)}</b>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
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

