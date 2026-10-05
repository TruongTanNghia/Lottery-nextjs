"use client";

import { useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { luatChanLo, type CongTacBuocLo } from "@/lib/chan-lo";
import { STAKE_PRICE } from "@/lib/exposure";
import { CAC_NHOM, phanAn, tienChanLoTheoNgay, tienNhinTruoc, type NhomTien, type Tien } from "@/lib/tien-chan-lo";
import { REGION_LABELS, type Region } from "@/lib/types";

const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : n > 0 ? "+" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(2).replace(".", ",")}tr`;
  return `${s}${Math.round(a).toLocaleString("vi-VN")}đ`;
};
const tienKhongDau = (n: number) => tien(n).replace(/^[+−]/, "");
const pc = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2).replace(".", ",") + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");

const TEN: Record<NhomTien, string> = {
  nhan: "Lô NHẬN (không dính luật)",
  tong: "Chỉ bước 1",
  thang: "Chỉ bước 2",
  cahai: "Cả hai bước",
};

type Quang = "thang" | "30" | "het";

/**
 * Tính tiền cho luật chặn lô 2 bước, ngày nào theo luật của ngày đó.
 *
 * Khách: "tính tiền giùm phần này được không. Ngày nào tính ngày đó theo thời
 * gian thực." Mỗi kỳ, danh sách chặn lập từ các kỳ TRƯỚC kỳ đó (đúng thứ anh
 * thấy nếu mở tab hôm ấy), rồi chốt sổ bằng kết quả kỳ đó. Phần tính ở
 * tien-chan-lo.ts.
 */
export default function TienChanLo({ draws, region, buoc }: { draws: DrawHits[]; region: Region; buoc: CongTacBuocLo }) {
  const [diemNhap, setDiemNhap] = useState("1");
  const [quang, setQuang] = useState<Quang>("thang");
  const [mo, setMo] = useState<string | null>(null);
  const diem = Math.max(1, Math.min(100_000, Math.round(Number(diemNhap)) || 1));

  const sap = useMemo(() => [...draws].sort((a, b) => a.date.localeCompare(b.date)), [draws]);
  const tuNgay = useMemo(() => {
    if (!sap.length) return null;
    if (quang === "het") return null;
    if (quang === "thang") return sap[sap.length - 1].date.slice(0, 7) + "-01";
    return sap[Math.max(0, sap.length - 30)].date;
  }, [sap, quang]);

  const kq = useMemo(() => tienChanLoTheoNgay(sap, region, buoc, diem, tuNgay), [sap, region, buoc, diem, tuNgay]);
  const homNay = useMemo(() => luatChanLo(sap, region, buoc), [sap, region, buoc]);
  // Theo tháng, luôn trên cả quãng: một tháng đẹp chưa nói được gì, phải nhìn các tháng cạnh nhau.
  const theoThang = useMemo(() => {
    const het = quang === "het" ? kq : tienChanLoTheoNgay(sap, region, buoc, diem, null);
    const m = new Map<string, { nhan: Tien; ky: number }>();
    for (const x of het.ngay) {
      const k = x.date.slice(0, 7);
      if (!m.has(k)) m.set(k, { nhan: { luot: 0, nhay: 0, thu: 0, tra: 0, lai: 0 }, ky: 0 });
      const t = m.get(k)!;
      t.ky++; t.nhan.thu += x.tien.nhan.thu; t.nhan.tra += x.tien.nhan.tra; t.nhan.lai += x.tien.nhan.lai;
    }
    return [...m];
  }, [sap, region, buoc, diem, quang, kq]);
  const nhinTruoc = useMemo(() => tienNhinTruoc(sap, region, homNay.chan, diem, tuNgay), [sap, region, homNay, diem, tuNgay]);

  if (kq.ngay.length === 0) {
    return (
      <section className="plate rise rise-2" data-tien-chan-lo>
        <div className="p-4 text-sm text-[var(--text-muted)]">Chưa đủ kỳ để tính tiền (cần hơn {kq.boQuaDau} kỳ).</div>
      </section>
    );
  }

  const chan: Tien = { luot: 0, nhay: 0, thu: 0, tra: 0, lai: 0 };
  for (const g of ["tong", "thang", "cahai"] as NhomTien[]) {
    chan.luot += kq.tong[g].luot; chan.nhay += kq.tong[g].nhay; chan.thu += kq.tong[g].thu; chan.tra += kq.tong[g].tra; chan.lai += kq.tong[g].lai;
  }
  const n = kq.ngay.length;
  const tbNhan = kq.tong.nhan.luot / n;
  const ngayLoi = kq.ngay.filter((x) => x.tien.nhan.lai > 0).length;
  let donNhan = 0;
  const dong = kq.ngay.map((x) => { donNhan += x.tien.nhan.lai; return { x, don: donNhan }; }).reverse();
  const gia = STAKE_PRICE[region];

  return (
    <section className="plate rise rise-2" data-tien-chan-lo>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">💰 Tính Tiền — Chặn Lô 2 Bước, Ngày Nào Theo Luật Ngày Đó</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · {n} kỳ ({dd(kq.ngay[0].date)} → {dd(kq.ngay[n - 1].date)}) · mỗi kỳ luật chỉ dùng các kỳ TRƯỚC đó,
            rồi chốt sổ bằng kết quả kỳ đó — đúng như anh mở tab hôm ấy
          </p>
        </div>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[0.74rem]">
          <span className="text-[var(--text-secondary)]">Quãng:</span>
          {([["thang", "Tháng này"], ["30", "30 kỳ gần"], ["het", "Từ đầu"]] as [Quang, string][]).map(([k, t]) => (
            <button
              key={k}
              onClick={() => setQuang(k)}
              data-tien-quang={k}
              className={`px-3 py-1 rounded-lg font-bold border ${quang === k ? "bg-[#2563eb] border-[#7fc4ff] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea]"}`}
            >
              {t}
            </button>
          ))}
          <span className="ml-2 text-[var(--text-secondary)]">Mỗi lô ôm</span>
          <input
            value={diemNhap}
            onChange={(e) => setDiemNhap(e.target.value)}
            inputMode="numeric"
            data-tien-diem
            className="w-16 px-2 py-1 rounded bg-[#0f1623] border border-[#1f2937] text-white text-center font-mono"
          />
          <span className="text-[var(--text-secondary)]">điểm ({tienKhongDau(diem * gia)}/lô/kỳ, về 1 nháy trả {tienKhongDau(diem * 75_000)})</span>
        </div>

        {/* ── Bốn ô của tab, giờ có tiền ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2" data-tien-o>
          <OTien nhan={TEN.nhan} t={kq.tong.nhan} phu={`~${tbNhan.toFixed(0)} lô mỗi kỳ — đây là phần anh ôm`} noi data="nhan" />
          <OTien nhan="Lô BỊ CHẶN (cả 3 nhóm)" t={chan} phu={`~${(chan.luot / n).toFixed(0)} lô mỗi kỳ — tiền này anh không ôm`} data="chan" />
          <OTien nhan={TEN.tong} t={kq.tong.tong} phu="về trên mức chung cả quãng" data="tong" />
          <OTien nhan={TEN.thang} t={kq.tong.thang} phu="2 tháng gần lỗ" data="thang" />
          <OTien nhan={TEN.cahai} t={kq.tong.cahai} phu="dính cả 1 lẫn 2" data="cahai" />
          <OTien nhan="Nếu NHẬN CẢ 100 lô" t={kq.tatCa} phu="không chặn gì — để so" data="tatca" />
        </div>

        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.78rem] leading-relaxed text-[var(--text-secondary)]" data-tien-ket-luan>
          <b className="text-white">Đọc nhanh:</b> trong {n} kỳ, nếu mỗi ngày anh chỉ ôm các lô NHẬN của chính ngày đó (~{tbNhan.toFixed(0)} lô) thì{" "}
          <b style={{ color: mau(kq.tong.nhan.lai) }}>{kq.tong.nhan.lai >= 0 ? "lời" : "lỗ"} {tienKhongDau(kq.tong.nhan.lai)}</b> (phần ăn{" "}
          <b style={{ color: mau(phanAn(kq.tong.nhan)) }}>{pc(phanAn(kq.tong.nhan))}</b>), lời <b className="text-white">{ngayLoi}/{n}</b> ngày. Các lô bị chặn mà
          nếu ôm thì {chan.lai >= 0 ? "đã lời" : "đã lỗ"} <b style={{ color: mau(chan.lai) }}>{tienKhongDau(chan.lai)}</b>
          {chan.lai < 0 ? " — chặn giúp anh tránh được khoản đó." : " — chặn làm anh mất khoản đó."}
        </div>

        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.76rem] leading-relaxed" data-tien-theo-thang>
          <b className="text-white">Lô NHẬN theo từng tháng</b> <span className="text-[var(--text-muted)]">(mỗi ngày theo luật của ngày đó):</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {theoThang.map(([k, t]) => (
              <span key={k} className="numeric rounded px-2 py-0.5 bg-black/25 border border-white/10">
                T{Number(k.slice(5))}: <b style={{ color: mau(t.nhan.lai) }}>{pc(phanAn(t.nhan))}</b> <span className="text-[var(--text-muted)]">({t.ky} kỳ, {tien(t.nhan.lai)})</span>
              </span>
            ))}
          </div>
          {n < 20 && (
            <div className="mt-1 text-[#ffd24a]">Quãng đang xem chỉ có {n} kỳ — quá ít để kết luận. Bấm “Từ đầu” để xem cả quãng.</div>
          )}
        </div>

        <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.76rem] leading-relaxed text-[#ffe9c4]" data-tien-nhin-truoc>
          <b>Vì sao phải tính theo từng ngày.</b> Nếu lấy danh sách chặn HÔM NAY ({homNay.chan.length} lô, còn {100 - homNay.chan.length} lô nhận) đem chấm ngược
          cho cùng quãng thì nhóm nhận trông như ăn <b>{pc(phanAn(nhinTruoc))}</b> ({tien(nhinTruoc.lai)}). Con số đó là ảo: lô bị chặn hôm nay chính là lô
          đã về nhiều trong quá khứ, nên bỏ chúng ra thì quá khứ đương nhiên đẹp. Số thật — mỗi ngày dùng danh sách của ngày đó — là{" "}
          <b>{pc(phanAn(kq.tong.nhan))}</b> ở trên.
        </div>

        {/* ── Từng ngày ── */}
        <div>
          <div className="eyebrow mb-1.5">Từng ngày — mới nhất ở trên, bấm một dòng để xem lô nào ôm, lô nào về</div>
          <div>
            <table className="w-full text-[0.72rem] table-fixed" data-tien-ngay>
              <thead>
                <tr className="text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-2 py-1 text-left font-bold">Ngày</th>
                  <th className="px-2 py-1 text-right font-bold">Lô ôm / về</th>
                  <th className="px-2 py-1 text-right font-bold">Lãi lô ôm</th>
                  <th className="px-2 py-1 text-right font-bold">Cộng dồn</th>
                  <th className="px-2 py-1 text-right font-bold">Chặn nếu ôm</th>
                </tr>
              </thead>
              <tbody>
                {dong.map(({ x, don }) => {
                  const laiChan = x.tien.tong.lai + x.tien.thang.lai + x.tien.cahai.lai;
                  const veNhan = x.lo.nhan.filter((l) => x.ve[l]);
                  return (
                    <FragmentRow
                      key={x.date}
                      mo={mo === x.date}
                      bam={() => setMo(mo === x.date ? null : x.date)}
                      hang={
                        <>
                          <td className="px-2 py-1 numeric text-white font-bold">{dd(x.date)}</td>
                          <td className="px-2 py-1 text-right numeric">{x.lo.nhan.length} / {x.tien.nhan.nhay}</td>
                          <td className="px-2 py-1 text-right numeric font-bold" style={{ color: mau(x.tien.nhan.lai) }}>{tien(x.tien.nhan.lai)}</td>
                          <td className="px-2 py-1 text-right numeric" style={{ color: mau(don) }}>{tien(don)}</td>
                          <td className="px-2 py-1 text-right numeric" style={{ color: mau(laiChan) }}>{tien(laiChan)}</td>
                        </>
                      }
                      chiTiet={
                        <div className="text-[0.72rem] leading-relaxed text-[var(--text-secondary)] space-y-1">
                          <div>
                            Luật hôm đó lập từ <b className="text-white">{x.kyTruoc}</b> kỳ trước {dd(x.date)}. Ôm <b className="text-white">{x.lo.nhan.length}</b> lô:{" "}
                            <span className="numeric">
                              {x.lo.nhan.map((l) => (
                                <span key={l} className={x.ve[l] ? "text-[#ff9d9d] font-bold" : ""}>{l}{x.ve[l] ? `×${x.ve[l]}` : ""} </span>
                              ))}
                            </span>
                          </div>
                          <div>
                            Thu <b className="text-white">{tienKhongDau(x.tien.nhan.thu)}</b> ({x.lo.nhan.length} lô × {tienKhongDau(diem * gia)}), trả{" "}
                            <b className="text-white">{tienKhongDau(x.tien.nhan.tra)}</b> ({x.tien.nhan.nhay} nháy về{veNhan.length ? `: ${veNhan.join(", ")}` : ""}) → lãi{" "}
                            <b style={{ color: mau(x.tien.nhan.lai) }}>{tien(x.tien.nhan.lai)}</b>.
                          </div>
                          <div>
                            Chặn: bước 1 <b className="text-white">{x.lo.tong.length}</b> · bước 2 <b className="text-white">{x.lo.thang.length}</b> · cả hai{" "}
                            <b className="text-white">{x.lo.cahai.length}</b> lô — nếu ôm cả số này thì {tien(laiChan)}.
                          </div>
                        </div>
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function OTien({ nhan, t, phu, noi, data }: { nhan: string; t: Tien; phu: string; noi?: boolean; data: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      data-tien-nhom={data}
      style={{ borderColor: noi ? "rgba(52,211,153,0.5)" : "var(--hairline)", background: noi ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)" }}
    >
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-[1.1rem] leading-none" style={{ color: mau(t.lai) }}>{tien(t.lai)}</div>
      <div className="text-[0.66rem] mt-1 numeric" style={{ color: mau(phanAn(t)) }}>phần ăn {pc(phanAn(t))}</div>
      <div className="text-[0.62rem] text-[var(--text-muted)] mt-0.5 leading-snug">
        thu {tienKhongDau(t.thu)} · trả {tienKhongDau(t.tra)} · {phu}
      </div>
    </div>
  );
}

function FragmentRow({ mo, bam, hang, chiTiet }: { mo: boolean; bam: () => void; hang: React.ReactNode; chiTiet: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-[var(--hairline)] cursor-pointer hover:bg-white/[0.04]" onClick={bam} data-tien-dong>
        {hang}
      </tr>
      {mo && (
        <tr className="bg-white/[0.03]">
          <td colSpan={5} className="px-2 py-2 whitespace-normal break-words">{chiTiet}</td>
        </tr>
      )}
    </>
  );
}
