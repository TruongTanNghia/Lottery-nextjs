"use client";

/**
 * Tab "📈 Track" — khách (29/10/2026): "nó là dạng track dữ liệu, không phải
 * thống kê; bám theo tháng hiện tại, tháng nào theo riêng tháng đó".
 *
 * Mỗi ngày một dòng: cài 190 ô theo đúng luật khách đang làm tay (ô tháng này
 * −% → 1n, +% → 0n, ít cặp → 0n), nhận cặp ở ô 1n, chốt thu – trả – lời/lỗ –
 * lũy kế. Dưới bảng: ngày ăn/thua, thua dài nhất, thua sâu nhất. Có cột so
 * sánh chiều ngược. Chỉ đọc; không chạm bảng đá đang chạy hay bot gửi.
 */
import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { dungKy } from "@/lib/slot-stats";
import { DIP_TOI_THIEU, GIA_DA, TRUNG_DA, tenBacDa } from "@/lib/da";
import { trackTheoThang, type ChieuTrack, type NgayTrack, type ThangTrack } from "@/lib/track-thang";
import { REGION_LABELS, type Region } from "@/lib/types";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2).replace(".", ",") + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const tenThang = (t: string) => `T${Number(t.slice(5))}/${t.slice(2, 4)}`;
const so = (n: number) => n.toLocaleString("vi-VN");
const tenO = (k: string) => { const [i, j] = k.split("-").map(Number); return i === j ? `${tenBacDa(i, "ngan")} × ${tenBacDa(i, "ngan")}` : `${tenBacDa(i, "ngan")} × ${tenBacDa(j, "ngan")}`; };

export default function TrackPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [thang, setThang] = useState<string | null>(null);
  const [chieu, setChieu] = useState<ChieuTrack>("am");
  const [mo, setMo] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setDraws(null); setLoi(null); setMo(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws((d.draws ?? []) as DrawHits[]))
      .catch(() => !huy && setLoi("Không tải được dữ liệu"));
    return () => { huy = true; };
  }, [region]);

  const ky = useMemo(() => (draws ? dungKy(draws) : null), [draws]);
  const am = useMemo(() => (ky ? trackTheoThang(ky, region, "am") : null), [ky, region]);
  const duong = useMemo(() => (ky ? trackTheoThang(ky, region, "duong") : null), [ky, region]);
  const kq = chieu === "am" ? am : duong;
  const kia = chieu === "am" ? duong : am;
  const cacThang = kq?.cacThang ?? [];
  const thangChon = thang && cacThang.some((t) => t.thang === thang) ? thang : cacThang[cacThang.length - 1]?.thang ?? null;
  const t = cacThang.find((x) => x.thang === thangChon) ?? null;
  const tKia = kia?.cacThang.find((x) => x.thang === thangChon) ?? null;

  return (
    <div className="space-y-4 md:space-y-6" data-track>
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">📈 Track dữ liệu — bám tháng hiện tại · {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Mỗi ngày cài lại 190 ô theo số liệu <b>từ đầu tháng tới hôm trước</b>: ô phần ăn <b>−%</b> → 1n, <b>+%</b> → 0n, dưới{" "}
              {so(DIP_TOI_THIEU)} cặp → 0n. Nhận mọi cặp ở ô 1n, chốt bằng kết quả hôm đó. Tháng nào riêng tháng đó. Giá{" "}
              {tien(GIA_DA[region])} / trúng {tien(TRUNG_DA[region])}.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
          {!kq && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính…</p>}
          {kq && (
            <>
              <div className="flex flex-wrap items-center gap-1.5" data-track-chieu>
                <span className="eyebrow">Chiều</span>
                {([["am", "Khách đang làm: nhận ô −%, chặn ô +%"], ["duong", "Chiều ngược: nhận ô +%, chặn ô −%"]] as [ChieuTrack, string][]).map(([k, ten]) => (
                  <button key={k} onClick={() => setChieu(k)} data-track-chieu-chon={k} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${chieu === k ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>
                    {ten}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" data-track-thang>
                <span className="eyebrow">Tháng</span>
                {cacThang.map((x) => (
                  <button key={x.thang} onClick={() => { setThang(x.thang); setMo(null); }} data-track-thang-chon={x.thang} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${thangChon === x.thang ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>
                    {tenThang(x.thang)} <span className="numeric" style={{ color: mau(x.tomTat.lai) }}>{dau(x.tomTat.lai)}</span>
                  </button>
                ))}
              </div>
              {t && <TomTatKhoi t={t} tKia={tKia} chieu={chieu} />}
              {t && <BangNgay t={t} mo={mo} setMo={setMo} region={region} />}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function TomTatKhoi({ t, tKia, chieu }: { t: ThangTrack; tKia: ThangTrack | null; chieu: ChieuTrack }) {
  const s = t.tomTat;
  return (
    <div className="space-y-2" data-track-tom-tat={t.thang}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <O nhan={`Tháng ${tenThang(t.thang)}`} gt={dau(s.lai)} phu={`${s.thu > 0 ? `phần ăn ${pc(s.pct)} · ` : ""}thu ${tien(s.thu)} · trả ${tien(s.tra)}`} m={mau(s.lai)} />
        <O nhan="Ngày ăn / thua / hoà" gt={`${s.ngayAn} / ${s.ngayThua} / ${s.ngayHoa}`} phu={`${s.soNgay} kỳ · ${s.ngayCho} ngày chờ dữ liệu`} m="#8fd0ff" />
        <O nhan="Thua dài nhất" gt={s.thuaDai.soNgay ? `${s.thuaDai.soNgay} ngày liền` : "—"} phu={s.thuaDai.tu ? `${ddmm(s.thuaDai.tu)} → ${ddmm(s.thuaDai.den!)}` : "không có ngày thua"} m="#ff9d9d" />
        <O nhan="Thua sâu nhất" gt={s.sutSau.tien ? `−${tien(s.sutSau.tien)}` : "—"} phu={s.sutSau.tu ? `từ đỉnh ${ddmm(s.sutSau.tu)} xuống ${ddmm(s.sutSau.den!)}` : "chưa sụt khỏi đỉnh"} m="#ff6b78" />
      </div>
      {tKia && (
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2 text-[0.72rem] leading-relaxed text-[var(--text-secondary)]" data-track-so-sanh>
          So với chiều ngược ({chieu === "am" ? "nhận ô +%, chặn ô −%" : "nhận ô −%, chặn ô +%"}) cùng tháng:{" "}
          <b style={{ color: mau(tKia.tomTat.lai) }}>{dau(tKia.tomTat.lai)}</b> · ăn/thua {tKia.tomTat.ngayAn}/{tKia.tomTat.ngayThua} · thua dài nhất{" "}
          {tKia.tomTat.thuaDai.soNgay} ngày · thua sâu nhất −{tien(tKia.tomTat.sutSau.tien)}.
        </div>
      )}
    </div>
  );
}

function BangNgay({ t, mo, setMo, region }: { t: ThangTrack; mo: string | null; setMo: (d: string | null) => void; region: Region }) {
  return (
    <div className="overflow-x-auto" data-track-bang>
      <table className="w-full text-[0.72rem]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1 pr-2 font-semibold">Ngày</th>
            <th className="py-1 pr-2 font-semibold text-right">Ô 1n</th>
            <th className="py-1 pr-2 font-semibold text-right">Cặp nhận</th>
            <th className="py-1 pr-2 font-semibold text-right">Trúng</th>
            <th className="py-1 pr-2 font-semibold text-right">Thu</th>
            <th className="py-1 pr-2 font-semibold text-right">Trả</th>
            <th className="py-1 pr-2 font-semibold text-right">Lời/lỗ</th>
            <th className="py-1 font-semibold text-right">Lũy kế</th>
          </tr>
        </thead>
        <tbody>
          {t.ngay.map((r: NgayTrack) => [
            <tr key={r.date} onClick={() => setMo(mo === r.date ? null : r.date)} data-track-ngay={r.date} data-track-cho={r.cho ? "1" : "0"} className={`border-t border-[var(--hairline)] cursor-pointer hover:bg-white/[0.04] ${mo === r.date ? "bg-white/[0.05]" : ""} ${r.cho ? "opacity-60" : ""}`}>
              <td className="py-1 pr-2 font-bold text-white">{ddmm(r.date)}</td>
              {r.cho ? (
                <td colSpan={6} className="py-1 pr-2 text-[var(--text-muted)] italic">chờ dữ liệu — chưa ô nào đủ {so(DIP_TOI_THIEU)} cặp trong tháng</td>
              ) : (
                <>
                  <td className="py-1 pr-2 text-right numeric">{r.soO}</td>
                  <td className="py-1 pr-2 text-right numeric">{so(r.soCap)}</td>
                  <td className="py-1 pr-2 text-right numeric">{so(r.capTrung)}</td>
                  <td className="py-1 pr-2 text-right numeric">{tien(r.thu)}</td>
                  <td className="py-1 pr-2 text-right numeric">{tien(r.tra)}</td>
                  <td className="py-1 pr-2 text-right numeric font-bold" style={{ color: mau(r.lai) }}>{dau(r.lai)}</td>
                </>
              )}
              <td className="py-1 text-right numeric" style={{ color: mau(r.don) }}>{dau(r.don)}</td>
            </tr>,
            mo === r.date && !r.cho && (
              <tr key={r.date + "-ct"} data-track-chi-tiet>
                <td colSpan={8} className="pb-2 pt-1 px-1 text-[0.68rem] leading-relaxed text-[var(--text-secondary)]">
                  Sáng {ddmm(r.date)}: <b>{r.soO}</b> ô cài 1n (số liệu từ đầu tháng tới hôm trước), nhận <b>{so(r.soCap)}</b> cặp × {tien(GIA_DA[region])} = thu{" "}
                  <b>{tien(r.thu)}</b>; về <b>{so(r.capTrung)}</b> cặp × {tien(TRUNG_DA[region])} = trả <b className="text-[#ff9d9d]">{tien(r.tra)}</b>.
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.o.map((k) => (
                      <span key={k} className="numeric rounded px-1.5 py-0.5 bg-white/[0.06] text-[#dbe7f7]" title={k}>{tenO(k)}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
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
