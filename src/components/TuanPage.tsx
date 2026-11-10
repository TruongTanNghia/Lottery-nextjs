"use client";

/**
 * Tab "📅 Tuần" — khách 09/11/2026: "lấy dữ liệu tầm 3 năm, phân tích theo
 * từng tuần; có tuần đánh thì ăn, có tuần đánh thì thua; tìm ra dấu hiệu đó".
 * Khách 10/11: "UI ít thông tin thôi: tuần tiếp theo có nên đánh hay không".
 *
 * Mặc định chỉ hiện: câu trả lời cho tuần này / tuần tới, dải 8 tuần gần nhất,
 * và luật nào nói gì. Bảng chi tiết (luật, lịch, năm, từng tuần) giấu sau nút.
 *
 * Dữ liệu: kho dài cào sẵn 3 năm (public/kho-dai/<miền>.json) gộp với kho
 * đang chạy (/api/history/hits, trùng ngày lấy kho đang chạy). Chấm từng tuần
 * theo cách khách đánh, thử 8 luật tuần, mỗi luật so với may rủi bằng hoán vị.
 * Chỉ đọc; không chạm tab nào khác.
 */
import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { CAC_LUAT, NGUONG_MAY_RUI, SO_HOAN_VI, docKhoDai, gopKho, loiKhuyenTuan, phanTichTuan, type CachDanh, type KhoDai, type PhiaNhin, type Tuan } from "@/lib/tuan";
import { REGION_LABELS, type Region } from "@/lib/types";

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
const ddmmyy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

const KET = {
  danh: { chu: "ĐÁNH", vien: "rgba(52,211,153,0.8)", nen: "rgba(16,185,129,0.14)", mau: "#7ff0c0" },
  nghi: { chu: "NGHỈ", vien: "rgba(248,113,113,0.8)", nen: "rgba(239,68,68,0.12)", mau: "#ff9d9d" },
  nhuNhau: { chu: "ĐÁNH HAY NGHỈ NHƯ NHAU", vien: "rgba(148,163,184,0.6)", nen: "rgba(148,163,184,0.10)", mau: "#e2e8f0" },
} as const;

export default function TuanPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [kho, setKho] = useState<{ capNhat: string; tu: string | null; den: string | null; soKy: number } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [cach, setCach] = useState<CachDanh>("khach");
  const [phia, setPhia] = useState<PhiaNhin>("gui");
  const [moChiTiet, setMoChiTiet] = useState(false);
  const [moTuan, setMoTuan] = useState(false);

  useEffect(() => {
    let huy = false;
    setDraws(null); setKho(null); setLoi(null); setMoTuan(false);
    (async () => {
      try {
        const [rDai, rMoi] = await Promise.all([fetch(`/kho-dai/${region}.json`, { cache: "no-store" }), fetch(`/api/history/hits?region=${region}`, { cache: "no-store" })]);
        if (!rMoi.ok) throw new Error(`kho đang chạy trả ${rMoi.status}`);
        const moi = ((await rMoi.json()).draws ?? []) as DrawHits[];
        let dai: DrawHits[] = [];
        if (rDai.ok) {
          const k = (await rDai.json()) as KhoDai & { soKy?: number };
          dai = docKhoDai(k);
          if (!huy) setKho({ capNhat: k.capNhat, tu: k.tu, den: k.den, soKy: dai.length });
        } else if (!huy) setKho({ capNhat: "", tu: null, den: null, soKy: 0 });
        if (!huy) setDraws(gopKho(dai, moi));
      } catch (e) {
        if (!huy) setLoi(e instanceof Error ? e.message : "lỗi không rõ");
      }
    })();
    return () => { huy = true; };
  }, [region]);

  const kq = useMemo(() => (draws ? phanTichTuan(draws, region, cach, phia) : null), [draws, region, cach, phia]);
  const lk = useMemo(() => (kq ? loiKhuyenTuan(kq) : null), [kq]);
  const an = kq ? kq.tuan.filter((t) => t.lai > 0).length : 0;
  const thua = kq ? kq.tuan.filter((t) => t.lai < 0).length : 0;
  const moc = kq?.luat.find((l) => l.luat === "luon");
  const coVuot = kq ? kq.luat.some((l) => l.vuot) : false;
  const k = lk ? KET[lk.ket] : null;

  return (
    <div className="space-y-4 md:space-y-6" data-tuan>
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">📅 Tuần — tuần tới có nên đánh không · {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Chấm 3 năm theo tuần (thứ 2 → chủ nhật), theo cách anh đang đánh ({phia === "gui" ? "anh đánh lên cửa trên" : "bên nhận"}, {cach === "khach" ? "ô −% → 1n" : "nhận đều 1n"}). Thử {CAC_LUAT.length - 1} luật tuần, mỗi luật so với may rủi.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          {loi && <p className="text-sm text-[#ff9d9d]">Không tải được dữ liệu: {loi}</p>}
          {!kq && !loi && <p className="text-sm text-[var(--text-muted)]">Đang gom 3 năm kết quả…</p>}
          {kq && lk && k && (
            <>
              <div className="rounded-2xl border-2 px-4 py-4 text-center space-y-2" data-tuan-loi-khuyen={lk.ket} data-tuan-tuan-xet={lk.tuan.khoa} style={{ borderColor: k.vien, background: k.nen }}>
                <div className="text-[0.7rem] uppercase tracking-wider text-[var(--text-muted)]">
                  {lk.daBatDau ? "Tuần này" : "Tuần tới"} · {ddmm(lk.tuan.thu2)} → {ddmm(lk.tuan.cn)}
                  {lk.daBatDau ? ` · đã xổ ${lk.soKyDaXo} kỳ, đang ${dau(lk.laiDangCo)}` : ""}
                </div>
                <div className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: k.mau }} data-tuan-ket-chu>{k.chu}</div>
                <p className="text-[0.8rem] leading-relaxed text-[var(--text-secondary)] text-left" data-tuan-ly-do>{lk.lyDo}</p>
              </div>

              <div className="space-y-1" data-tuan-gan>
                <span className="eyebrow">8 tuần gần nhất · xanh ăn, đỏ thua · {an} ăn / {thua} thua trong {so(kq.tuan.length)} tuần</span>
                <div className="grid grid-cols-8 gap-1">
                  {lk.tuanGan.map((t) => (
                    <div key={t.khoa} data-tuan-gan-o={t.khoa} data-tuan-gan-lai={t.lai} className="rounded-lg px-1 py-1.5 text-center" style={{ background: t.lai > 0 ? "rgba(52,211,153,0.22)" : t.lai < 0 ? "rgba(248,113,113,0.22)" : "rgba(203,213,225,0.15)" }}>
                      <div className="text-[0.58rem] text-[var(--text-muted)] numeric">{ddmm(t.thu2)}</div>
                      <div className="text-[0.66rem] font-bold numeric leading-tight" style={{ color: mau(t.lai) }}>{t.lai > 0 ? "ăn" : t.lai < 0 ? "thua" : "hoà"}</div>
                      <div className="text-[0.56rem] numeric" style={{ color: mau(t.lai) }}>{dau(t.lai)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[0.7rem]" data-tuan-bang-noi>
                  <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">Luật</th><th className="py-1 pr-2">{lk.daBatDau ? "Tuần này" : "Tuần tới"}</th><th className="py-1 pr-2">3 năm</th><th className="py-1">Tin được?</th></tr></thead>
                  <tbody>
                    {lk.luat.map((l) => (
                      <tr key={l.luat} data-tuan-noi={l.luat} data-tuan-noi-danh={l.danh ? "1" : "0"} className="border-t border-[var(--hairline)]">
                        <td className="py-1 pr-2 text-white">{l.ten}</td>
                        <td className="py-1 pr-2 font-bold" style={{ color: l.danh ? "#7ff0c0" : "#ff9d9d" }}>{l.danh ? "đánh" : "nghỉ"}</td>
                        <td className="py-1 pr-2 numeric">{l.tuanAn} ăn / {l.tuanThua} thua · <span style={{ color: mau(l.lai) }}>{dau(l.lai)}</span></td>
                        <td className="py-1" style={{ color: l.vuot ? "#ffd24a" : "#94a3b8" }}>{l.vuot ? "⚠ nổi lên" : `may rủi ${(l.mayRui * 100).toFixed(0)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button onClick={() => setMoChiTiet((v) => !v)} data-tuan-mo-chi-tiet className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">{moChiTiet ? "Ẩn chi tiết" : "Chi tiết 3 năm, đổi cách đánh"}</button>

              {moChiTiet && (
                <div className="space-y-3 border-t border-[var(--hairline)] pt-3" data-tuan-chi-tiet>
                  <div className="text-[0.72rem] text-[var(--text-secondary)]" data-tuan-kho={kq.soKy}>
                    Dữ liệu: <b className="text-white numeric">{so(kq.soKy)}</b> kỳ, {ddmmyy(kq.tuNgay)} → {ddmmyy(kq.denNgay)}, <b className="text-white numeric">{so(kq.tuan.length)}</b> tuần.{" "}
                    {kho && kho.soKy > 0 ? `Kho dài cào sẵn ${so(kho.soKy)} kỳ (cập nhật ${ddmmyy(kho.capNhat)}) gộp với kho đang chạy.` : "Chưa có kho dài cào sẵn, đang dùng kho đang chạy."}{" "}
                    Mỗi luật so với may rủi: chọn ngẫu nhiên cùng số tuần {so(SO_HOAN_VI)} lần, xem bao nhiêu lần ngẫu nhiên cũng ăn bằng hoặc hơn. Dưới {pct(NGUONG_MAY_RUI)} mới gọi là dấu hiệu.
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" data-tuan-cach>
                    <span className="eyebrow">Cách đánh</span>
                    {([["khach", "Luật khách (ô −% → 1n, như tab Track)"], ["deu", "Nhận đều 4.950 cặp 1n"]] as [CachDanh, string][]).map(([key, t]) => (
                      <button key={key} onClick={() => setCach(key)} data-tuan-cach-chon={key} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${cach === key ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{t}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" data-tuan-phia>
                    <span className="eyebrow">Nhìn từ phía</span>
                    {([["gui", "Anh đánh lên cửa trên (bỏ 54n, ăn 580n)"], ["nhan", "Bên nhận (thu 54n, trả 580n)"]] as [PhiaNhin, string][]).map(([key, t]) => (
                      <button key={key} onClick={() => setPhia(key)} data-tuan-phia-chon={key} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${phia === key ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{t}</button>
                    ))}
                  </div>

                  <div className="rounded-xl border-2 px-4 py-3 text-[0.82rem] leading-relaxed" data-tuan-ket-luan={coVuot ? "co" : "khong"} style={{ borderColor: coVuot ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.55)", background: coVuot ? "rgba(245,158,11,0.10)" : "rgba(16,185,129,0.10)" }}>
                    <b className="text-white">{coVuot ? "⚠ Có luật nổi lên, nhưng chưa đủ tin." : "Kết luận: không có dấu hiệu, tuần ăn tuần thua là dao động bình thường."}</b>
                    <div className="mt-1 text-[var(--text-secondary)]">{kq.ketLuan}</div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" data-tuan-tom-tat>
                    <O nhan="Tuần ăn / thua" gt={`${an} / ${thua}`} phu={`${so(kq.tuan.length)} tuần · ${so(kq.soKy)} kỳ`} m="#8fd0ff" />
                    <O nhan="Đánh mọi tuần" gt={moc ? dau(moc.lai) : "—"} phu={moc ? `trung bình ${dau(moc.laiTB)} mỗi tuần` : ""} m={mau(moc?.lai ?? 0)} />
                    <O nhan="Ăn liền dài nhất" gt={kq.chuoi.an.soTuan ? `${kq.chuoi.an.soTuan} tuần` : "—"} phu={kq.chuoi.an.tu ? `${ddmm(kq.chuoi.an.tu)} → ${ddmm(kq.chuoi.an.den)} · ${dau(kq.chuoi.an.lai)}` : ""} m="#7ff0c0" />
                    <O nhan="Thua liền dài nhất" gt={kq.chuoi.thua.soTuan ? `${kq.chuoi.thua.soTuan} tuần` : "—"} phu={kq.chuoi.thua.tu ? `${ddmm(kq.chuoi.thua.tu)} → ${ddmm(kq.chuoi.thua.den)} · ${dau(kq.chuoi.thua.lai)}` : ""} m="#ff9d9d" />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.72rem]" data-tuan-bang-luat>
                      <thead>
                        <tr className="text-[var(--text-muted)] text-left">
                          <th className="py-1 pr-2">Luật tuần</th><th className="py-1 pr-2">Tuần đánh</th><th className="py-1 pr-2">Ăn / thua</th><th className="py-1 pr-2">Tổng lãi</th><th className="py-1 pr-2">TB mỗi tuần</th><th className="py-1 pr-2">May rủi đuổi kịp</th><th className="py-1">Kết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kq.luat.map((l) => (
                          <tr key={l.luat} data-tuan-luat={l.luat} data-tuan-vuot={l.vuot ? "1" : "0"} className="border-t border-[var(--hairline)]">
                            <td className="py-1.5 pr-2"><b className="text-white">{l.ten}</b><div className="text-[0.62rem] text-[var(--text-muted)]">{l.moTa}</div></td>
                            <td className="py-1.5 pr-2 numeric">{l.tuanDanh}</td>
                            <td className="py-1.5 pr-2 numeric">{l.tuanAn} / {l.tuanThua}</td>
                            <td className="py-1.5 pr-2 numeric" style={{ color: mau(l.lai) }}>{dau(l.lai)}</td>
                            <td className="py-1.5 pr-2 numeric" style={{ color: mau(l.laiTB) }}>{dau(l.laiTB)}</td>
                            <td className="py-1.5 pr-2 numeric">{l.luat === "luon" ? "mốc" : pct(l.mayRui)}</td>
                            <td className="py-1.5 font-bold" style={{ color: l.vuot ? "#ffd24a" : "#cbd5e1" }}>{l.luat === "luon" ? "—" : l.vuot ? "⚠ nổi lên" : "may rủi"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[0.68rem] text-[var(--text-muted)]">
                    "May rủi đuổi kịp" = trong {so(SO_HOAN_VI)} lần chọn ngẫu nhiên cùng số tuần, bao nhiêu phần trăm ăn bằng hoặc hơn luật. Tương quan tuần này với tuần sau:{" "}
                    <b className="text-white numeric">{kq.tuongQuan.toFixed(2)}</b> (0 là không liên quan, ±1 là theo nhau hoàn toàn).
                  </p>

                  <LichTuan tuan={kq.tuan} />

                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.72rem]" data-tuan-bang-nam>
                      <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">Năm</th><th className="py-1 pr-2">Tuần</th><th className="py-1 pr-2">Ăn / thua</th><th className="py-1 pr-2">Tiền xác</th><th className="py-1">Lãi</th></tr></thead>
                      <tbody>
                        {kq.theoNam.map((y) => (
                          <tr key={y.nam} data-tuan-nam={y.nam} className="border-t border-[var(--hairline)]">
                            <td className="py-1 pr-2 numeric text-white font-bold">{y.nam}</td><td className="py-1 pr-2 numeric">{y.soTuan}</td><td className="py-1 pr-2 numeric">{y.tuanAn} / {y.tuanThua}</td>
                            <td className="py-1 pr-2 numeric">{tien(y.xac)}</td><td className="py-1 numeric" style={{ color: mau(y.lai) }}>{dau(y.lai)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button onClick={() => setMoTuan((v) => !v)} data-tuan-mo className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">{moTuan ? "Ẩn" : "Xem"} từng tuần ({so(kq.tuan.length)})</button>
                  {moTuan && (
                    <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                      <table className="w-full text-[0.7rem]" data-tuan-bang-tuan>
                        <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">Tuần</th><th className="py-1 pr-2">Từ → đến</th><th className="py-1 pr-2">Kỳ</th><th className="py-1 pr-2">Tiền xác</th><th className="py-1 pr-2">Tiền trúng</th><th className="py-1">Lãi</th></tr></thead>
                        <tbody>
                          {[...kq.tuan].reverse().map((t) => (
                            <tr key={t.khoa} data-tuan-dong={t.khoa} className="border-t border-[var(--hairline)]">
                              <td className="py-1 pr-2 numeric text-white">{t.khoa.replace("-W", " T")}</td><td className="py-1 pr-2 numeric">{ddmm(t.thu2)} → {ddmm(t.cn)}</td>
                              <td className="py-1 pr-2 numeric">{t.soNgayDanh < t.soKy ? `${t.soNgayDanh}/${t.soKy}` : t.soKy}</td>
                              <td className="py-1 pr-2 numeric">{tien(t.xac)}</td><td className="py-1 pr-2 numeric">{tien(t.trung)}</td>
                              <td className="py-1 numeric" style={{ color: mau(t.lai) }}>{dau(t.lai)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Lịch tuần: mỗi ô một tuần, xanh ăn đỏ thua, xếp theo năm — nhìn là biết có chu kỳ hay không. */
function LichTuan({ tuan }: { tuan: Tuan[] }) {
  const max = Math.max(1, ...tuan.map((t) => Math.abs(t.lai)));
  const theoNam = new Map<number, Tuan[]>();
  for (const t of tuan) { const a = theoNam.get(t.nam) ?? []; a.push(t); theoNam.set(t.nam, a); }
  return (
    <div className="space-y-1.5" data-tuan-lich>
      <span className="eyebrow">Lịch tuần: xanh ăn, đỏ thua, đậm nhạt theo tiền</span>
      {[...theoNam.entries()].sort((a, b) => a[0] - b[0]).map(([nam, ds]) => (
        <div key={nam} className="flex items-center gap-1.5">
          <span className="w-9 text-[0.66rem] text-[var(--text-muted)] numeric">{nam}</span>
          <div className="flex flex-wrap gap-[3px]">
            {ds.map((t) => {
              const d = Math.min(1, Math.abs(t.lai) / max);
              const bg = t.lai > 0 ? `rgba(52,211,153,${0.25 + 0.75 * d})` : t.lai < 0 ? `rgba(248,113,113,${0.25 + 0.75 * d})` : "rgba(203,213,225,0.35)";
              return <span key={t.khoa} title={`${t.khoa} · ${ddmm(t.thu2)} → ${ddmm(t.cn)} · ${dau(t.lai)}`} data-tuan-o={t.khoa} className="inline-block w-[9px] h-[14px] rounded-[2px]" style={{ background: bg }} />;
            })}
          </div>
        </div>
      ))}
    </div>
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
