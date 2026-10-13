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
import { GIA_DA, TRUNG_DA, khoKyToi, soTungKyTheoBang, gomThang, type BangDa, type KyDa } from "@/lib/da";
import { TIEN_TO_NHAN_MAC_DINH, capNhan, chuoiNhanMien, hauToNhan, nhomNhanDa, tienNhanTheoNgay } from "@/lib/da-nhan";
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

const TEN_NGAN: Record<Region, string> = { xsmn: "Mn", xsmt: "Mt", xsmb: "Mb" };

/** Đang sửa bảng mà chưa Lưu: số ở khối này vẫn theo bảng ĐÃ LƯU. */
function CanhBaoChuaLuu() {
  return (
    <div className="rounded-lg border border-[#fbbf24]/60 bg-[#b45309]/20 px-3 py-2 text-[0.74rem] leading-relaxed text-[#ffe9b0]" data-nhan-chua-luu>
      ⚠ <b>Bảng tiền đang sửa mà CHƯA LƯU.</b> Số dưới đây vẫn tính theo bảng đã lưu (ô cũ vẫn là số điểm cũ). Bấm <b>Lưu</b> ở Bảng Tiền Đá
      thì chuỗi nhận và tiền mới đổi theo số điểm vừa cài.
    </div>
  );
}

export function DaSoNhan({ draws, region, bang, tienTo, chuaLuu = false }: { draws: DrawHits[]; region: Region; bang: BangDa; tienTo: string | null; chuaLuu?: boolean }) {
  const toast = useToast();
  const tt = tienTo ?? TIEN_TO_NHAN_MAC_DINH[region];
  const kq = useMemo(() => {
    const k = khoKyToi(draws);
    if (!k) return null;
    const cap = capNhan(k.bac, bang);
    const muc = nhomNhanDa(cap);
    // Web không cắt khúc: một chuỗi trọn cho cả miền (bot mới cắt cho vừa tin Telegram).
    const chuoi = chuoiNhanMien(tt, muc, region, Number.POSITIVE_INFINITY)[0] ?? "";
    const soVong = muc.reduce((s, m) => s + m.nhom.length, 0);
    const dem = new Map<string, number>();
    for (const [a, b] of cap) { dem.set(a, (dem.get(a) ?? 0) + 1); dem.set(b, (dem.get(b) ?? 0) + 1); }
    return { ngayCuoi: k.ngayCuoi, cap, muc, chuoi, soVong, dem };
  }, [draws, bang, region, tt]);

  if (!kq) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(kq.chuoi);
      toast.show("success", `Đã copy số nhận ${TEN_NGAN[region]} — ${so(kq.cap.length)} cặp, mỗi cặp 1 lần`);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };
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
        {chuaLuu && <CanhBaoChuaLuu />}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <O nhan="Cặp nhận" gt={`${so(kq.cap.length)}`} phu={`trên 4.950 cặp · chặn ${so(4950 - kq.cap.length)}`} m="#34e6a8" />
          <O nhan="Số vòng" gt={so(kq.soVong)} phu="mỗi cặp nằm trong đúng 1 vòng" m="#ffd24a" />
          <O nhan="Mức điểm" gt={kq.muc.map((m) => m.diem).join(" · ") || "—"} phu="điểm nhận mỗi cặp" m="#8fd0ff" />
          <O nhan="Thu nếu khách đặt đủ" gt={tien(thu1Ky)} phu="mọi cặp nhận × điểm × giá" m="#c2d4ea" />
        </div>

        {kq.muc.length > 1 && (
          <div className="flex flex-wrap gap-1.5 text-[0.72rem]" data-nhan-muc>
            {kq.muc.map((m) => (
              <span key={m.diem} className="rounded px-2 py-1 bg-white/[0.06] border border-[var(--hairline)] text-[#dbe7f7]">
                <b className="numeric">{m.diem}</b> điểm: <b className="numeric">{so(m.soCap)}</b> cặp · đuôi <code>{hauToNhan(region, m.diem)}</code>
              </span>
            ))}
          </div>
        )}

        {kq.chuoi ? (
          <div className="rounded-lg border border-[var(--hairline)] bg-black/20 px-2.5 py-2" data-nhan-chuoi>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.7rem] font-bold text-white">
                {TEN_NGAN[region]}: {so(kq.cap.length)} cặp · {so(kq.chuoi.length)} ký tự
              </span>
              <button
                onClick={copy}
                data-nhan-copy
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800"
              >
                📋 Copy số nhận
              </button>
            </div>
            <code className="block mt-1 max-h-40 overflow-y-auto text-[0.66rem] leading-snug text-[#dbe7f7] break-all whitespace-pre-wrap" data-nhan-chuoi-xem>
              {kq.chuoi}
            </code>
          </div>
        ) : (
          <div className="text-[0.74rem] text-[#ff9d9d]">Bảng đang chặn hết — không nhận cặp nào.</div>
        )}
        <div className="text-[0.66rem] text-[var(--text-muted)] leading-relaxed">
          Chỉ có cặp ghép với nhau, mở bằng tiền tố đài <code>{tt.trim() || "(trống)"}</code> (đúng tiền tố bot gửi lô).{" "}
          <code>01 10 11{hauToNhan(region, 5)}</code> là nhận 5 điểm cho cả 3 cặp 01-10, 01-11, 10-11. <b>Mỗi cặp ghi đúng một lần</b> —
          phần mềm đếm ra đúng {so(kq.cap.length)} cặp. Trên Telegram: <code>/nhandam{tenMien(region).slice(1)}2</code>, <code>/nhanda2</code> là cả 3 miền.
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
  ky, region, bang, tuDong, buoc1, buoc2, moTay, hieuLuc, lichBang = {}, chuaLuu = false,
}: {
  /** Sổ bảng thật đã chạy từng kỳ: "ngày" → bảng dùng cho kỳ ngay sau ngày đó. */
  lichBang?: Record<string, BangDa>;
  chuaLuu?: boolean;
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
  const tn = useMemo(() => tienNhanTheoNgay(ky, region, bang, { tuDong, buoc1, buoc2, moTay, lichBang }), [ky, region, bang, tuDong, buoc1, buoc2, moTay, lichBang]);
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
            {REGION_LABELS[region]} · ô n điểm: thu n × {tien(GIA_DA[region])}, trúng trả n × {tien(TRUNG_DA[region])} mỗi cặp ·
            ngày có ✔ là tính theo <b>đúng bảng đã chạy hôm đó</b>; ngày khác dựng lại bằng luật + bảng điểm hôm nay
          </p>
        </div>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        {chuaLuu && <CanhBaoChuaLuu />}
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
                      <td className="py-1 pr-2 font-bold text-white">
                        {ddmm(r.date)} {r.that ? <span className="text-[#7ff0c0]" title="tính theo đúng bảng đã chạy hôm đó" data-nhan-that>✔</span> : null}
                      </td>
                      <td className="py-1 pr-2 text-right numeric">{so(r.soCap)}</td>
                      <td className="py-1 pr-2 text-right numeric">{so(r.capTrung)}</td>
                      <td className="py-1 pr-2 text-right numeric font-bold" style={{ color: mau(r.lai) }}>{tien(r.lai)}</td>
                      <td className="py-1 text-right numeric" style={{ color: mau(donQuang) }}>{tien(donQuang)}</td>
                    </tr>,
                    mo === r.date && (
                      <tr key={r.date + "-ct"} data-nhan-chi-tiet>
                        <td colSpan={5} className="pb-2 pt-1 px-1 text-[0.68rem] leading-relaxed text-[var(--text-secondary)]">
                          {r.that ? (
                            <>✔ Tính theo <b>đúng bảng đã chạy</b> cho kỳ {ddmm(r.date)} (bảng chặn <b>{r.oLuat}</b> ô)</>
                          ) : (
                            <>Dựng lại: luật sáng {ddmm(r.date)} lập từ <b>{r.soKyTruoc}</b> kỳ trước đó, chặn <b>{r.oLuat}</b> ô
                            {r.oMoi.length > 0 && <> (bắt thêm hôm đó: {r.oMoi.join(", ")})</>}, số điểm từng ô lấy theo bảng hôm nay</>
                          )}{" "}
                          · {r.soLoVe} con về
                          <div className="mt-1 space-y-0.5" data-nhan-theo-muc>
                            {r.theoMuc.map((m) => (
                              <div key={m.diem} className="numeric">
                                Ô <b className="text-white">{m.diem} điểm</b>: {so(m.soCap)} cặp × {m.diem} × {tien(GIA_DA[region])} = thu <b>{tien(m.thu)}</b> ·{" "}
                                {so(m.capTrung)} cặp trúng × {m.diem} × {tien(TRUNG_DA[region])} = trả <b className="text-[#ff9d9d]">{tien(m.tra)}</b>
                              </div>
                            ))}
                          </div>
                          <div className="mt-0.5">
                            Cả ngày: thu <b>{tien(r.thu)}</b> − trả <b>{tien(r.tra)}</b> = <b style={{ color: mau(r.lai) }}>{tien(r.lai)}</b>
                          </div>
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

