"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { luatChanLo } from "@/lib/chan-lo";
import { apChanLuat, capBiChan, chuanHoaBang, khoKyToi } from "@/lib/da";
import {
  bacDaMien, canCu, canTai, capDaBiChan, diemODa, docChuoi, kiemDa, kiemLo, luatLoMien, oDaCua, trangThaiChu, trungGiuaDong,
  type DuLieuMien, type GhiChu, type KetQuaDa, type KetQuaLo, type Khoi, type LuatLo, type LuatMien, type MucDo,
} from "@/lib/kiem-chuoi";
import { provincePrefix } from "@/lib/provinces";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const DAU_DAI: Record<Region, string> = { xsmn: provincePrefix("xsmn"), xsmt: provincePrefix("xsmt"), xsmb: provincePrefix("xsmb") };
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const so = (n: number) => n.toLocaleString("vi-VN");
const MAU: Record<MucDo, { vien: string; nen: string; chu: string; nhan: string }> = {
  dung: { vien: "rgba(52,211,153,0.55)", nen: "rgba(16,185,129,0.10)", chu: "#7ff0c0", nhan: "✅ ĐÚNG" },
  "luu-y": { vien: "rgba(251,191,36,0.6)", nen: "rgba(245,158,11,0.10)", chu: "#ffd24a", nhan: "⚠ CẦN XEM" },
  sai: { vien: "rgba(248,113,113,0.7)", nen: "rgba(220,38,38,0.12)", chu: "#ff9d9d", nhan: "❌ SAI" },
};
const NANG: Record<MucDo, number> = { dung: 0, "luu-y": 1, sai: 2 };
/** Thứ tự các ô của bảng hạn mức, đúng như trên màn hình cài. */
const THU_TU_O = [...Array.from({ length: 20 }, (_, d) => `ngay:${d}`), "tren", "chuoi:2", "chuoi:3", "chuoi:4"];

async function lay(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url.split("?")[0]} trả ${r.status}`);
  return r.json();
}

/** Tải MỚI mỗi lần kiểm — trang này tồn tại để bắt số cũ, nó không được tự giữ số cũ. */
async function taiMien(region: Region, canDa: boolean, canChanLo: boolean): Promise<DuLieuMien> {
  const [h, s, l, pair, top, watch, manual, d, c] = await Promise.all([
    lay(`/api/history/hits?region=${region}`),
    lay(`/api/config/schedule?region=${region}`),
    lay(`/api/limits?region=${region}`),
    lay(`/api/config/pair?region=${region}`),
    lay(`/api/config/top?region=${region}`),
    lay(`/api/config/watch?region=${region}`),
    lay(`/api/config/manual?region=${region}`),
    canDa ? lay(`/api/config/da?region=${region}`) : null,
    canChanLo ? lay(`/api/config/chan-ngay?region=${region}`) : null,
  ]);
  if (!Array.isArray(h.draws) || !s.data || !Array.isArray(l.data) || !pair.data || !top.data || !watch.data || !manual.data) {
    throw new Error("máy chủ trả thiếu dữ liệu");
  }
  const draws = h.draws as DrawHits[];
  const buoc = c?.data?.buoc ? { buoc1: c.data.buoc.buoc1 !== false, buoc2: c.data.buoc.buoc2 !== false } : undefined;
  return {
    region, draws, lich: s.data, may: l.data,
    cong: {
      pair: { enabled: pair.data.enabled !== false },
      top: { size: Number(top.data.size) || 0, dir: top.data.dir === "cold" ? "cold" : "hot", enabled: top.data.enabled !== false, halve: top.data.halve !== false },
      watch: { enabled: watch.data.enabled !== false, halve: watch.data.halve !== false, min_gap: Number(watch.data.min_gap) || 1, max_gap: Number(watch.data.max_gap) || 3 },
      manual: { los: Array.isArray(manual.data.los) ? manual.data.los : [], halve: manual.data.halve !== false },
    },
    da: d?.data ? { bang: d.data.bang ?? {}, tuDong: d.data.tuDong !== false, chanLuat: d.data.chanLuat ?? [], rutGon: d.data.rutGon === true, nguongGon: Number(d.data.nguongGon) || 90 } : null,
    chanLoLuat: canChanLo ? luatChanLo(draws, region, buoc).chan : null,
  };
}

interface KetQuaChuoi {
  luc: Date;
  luat: Partial<Record<Region, LuatMien>>;
  dl: Partial<Record<Region, DuLieuMien>>;
  lo: KetQuaLo[];
  da: KetQuaDa[];
  boQua: { dong: number; chu: string }[];
}

interface KyToi {
  luc: Date;
  dl: DuLieuMien;
  luat: LuatMien;
  /** Đá: số cặp tính lại, số cặp bộ máy đá ra, và có khớp không. */
  da: { tinhLai: number; may: number; khop: boolean } | null;
}

/**
 * Tab Check — hai việc:
 *
 *  1. "Số kỳ tới": tự chạy khi mở tab. Tính lại hạn mức của 100 lô cho kỳ tới
 *     từ đầu (kết quả xổ + bảng hạn mức + 4 danh sách giảm nửa) và so với số
 *     máy đang đưa ra. Đúng câu khách hỏi: "những số chuẩn bị ôm có sai không,
 *     mình tính có bị sai không". Mỗi số ghi rõ về ngày nào, vì sao chặn / vì
 *     sao nhận / vì sao giảm nửa.
 *  2. "Kiểm chuỗi đã copy": dán chuỗi vào, chấm từng số theo kết quả tính lại.
 *
 * Phần tính nằm ở kiem-chuoi.ts và cố ý không dùng chung bộ máy hạn mức.
 */
export default function CheckPage({ region }: { region: Region }) {
  return (
    <div className="space-y-4 md:space-y-6" data-check>
      <SoKyToi region={region} />
      <KiemChuoi region={region} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phần 1 — số kỳ tới
// ─────────────────────────────────────────────────────────────────────────────

function SoKyToi({ region }: { region: Region }) {
  const [kq, setKq] = useState<KyToi | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [ban, setBan] = useState(false);
  const lan = useRef(0);

  const tai = async () => {
    const id = ++lan.current;
    setBan(true); setLoi(null); setKq(null);
    try {
      const dl = await taiMien(region, true, false);
      const luat = luatLoMien(dl);
      let da: KyToi["da"] = null;
      if (dl.da) {
        const tinhLai = capDaBiChan(dl, luat);
        const tt = khoKyToi(dl.draws);
        const bangHL = dl.da.tuDong ? apChanLuat(chuanHoaBang(dl.da.bang), dl.da.chanLuat) : chuanHoaBang(dl.da.bang);
        const may = new Set((tt ? capBiChan(tt.kho, bangHL) : []).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
        da = { tinhLai: tinhLai.size, may: may.size, khop: tinhLai.size === may.size && [...tinhLai].every((p) => may.has(p)) };
      }
      if (id === lan.current) setKq({ luc: new Date(), dl, luat, da });
    } catch (e) {
      if (id === lan.current) setLoi(e instanceof Error ? e.message : "lỗi không rõ");
    } finally {
      if (id === lan.current) setBan(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void tai(); }, [region]);

  const L = kq ? Object.values(kq.luat.lo) : [];
  const chan = L.filter((l) => l.dung <= 0);
  const nua = L.filter((l) => l.dung > 0 && l.chiaDoi);
  const du = L.filter((l) => l.dung > 0 && !l.chiaDoi);
  const lech = L.filter((l) => l.lechMay.length);
  const tong = L.reduce((s, l) => s + l.dung, 0);

  return (
    <section className="plate rise rise-1" data-ky-toi={region}>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎯 Số Kỳ Tới — Máy Tính Có Đúng Không</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · tính lại từ đầu cả 100 số anh sắp ôm, rồi so với số máy đang đưa ra (bảng 100 lô, chuỗi copy, bot)
          </p>
        </div>
        <button onClick={() => void tai()} disabled={ban} data-ky-toi-tai className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/[0.08] border border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.16] disabled:opacity-40">
          {ban ? "Đang tính…" : "↻ Kiểm lại"}
        </button>
      </div>
      <div className="p-3 md:p-4 space-y-3">
        {loi && (
          <div data-ky-toi-loi className="rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2.5 text-[0.8rem] text-[#ffd0d0]">
            <b>Chưa kiểm được.</b> {loi}. Bấm “Kiểm lại”.
          </div>
        )}
        {!kq && !loi && <p className="text-sm text-[var(--text-muted)]">Đang tính lại 100 số…</p>}
        {kq && (
          <>
            <div
              data-ky-toi-tong={lech.length ? "sai" : "dung"}
              className="rounded-xl border-2 px-4 py-3"
              style={{ borderColor: lech.length ? "#f87171" : "rgba(52,211,153,0.6)", background: lech.length ? "rgba(127,29,29,0.45)" : "rgba(16,185,129,0.10)" }}
            >
              <div className="text-lg font-extrabold" style={{ color: lech.length ? "#fff" : "#7ff0c0" }}>
                {lech.length ? `🚨 MÁY TÍNH SAI ${lech.length} SỐ LÔ` : `✅ Máy tính ĐÚNG cả 100 số lô ${REGION_LABELS[region]}`}
              </div>
              <div className="text-[0.76rem] text-[var(--text-secondary)] mt-1 leading-relaxed">
                Kỳ tới = kỳ sau kết quả ngày <b className="text-white">{ddmm(kq.luat.ngayCuoi)}</b> · tính lại từ {kq.luat.soKy} kỳ đã xổ, bảng hạn mức
                đang cài và 4 danh sách giảm nửa (nhịp đều, top, tự thêm, cặp đảo) · kiểm lúc {kq.luc.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </div>
              {lech.length > 0 && (
                <div className="mt-2 text-[0.8rem] leading-relaxed text-[#ffe1e1]" data-ky-toi-lech>
                  Số máy đang đưa ra khác với cách tính lại. Đây là lỗi phần mềm — <b>đừng dùng chuỗi copy hôm nay cho các số này</b>, chụp màn hình gửi người làm phần mềm:
                  <ul className="mt-1 space-y-1">
                    {lech.map((l) => (
                      <li key={l.lo} className="rounded bg-black/25 px-2 py-1">
                        <b className="numeric text-white text-base">{l.lo}</b> · {l.lechMay.join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-ky-toi-o>
              <OTong nhan="CHẶN (không nhận)" gt={String(chan.length)} m="#ff9d9d" />
              <OTong nhan="GIẢM MỘT NỬA" gt={String(nua.length)} m="#ffd24a" />
              <OTong nhan="NHẬN ĐỦ" gt={String(du.length)} m="#7ff0c0" />
              <OTong nhan="TỔNG NHẬN (điểm)" gt={`${so(tong)}n`} m="#8fd0ff" />
            </div>

            <ChuThichDai kyGan={kq.luat.kyGan} ngayCuoi={kq.luat.ngayCuoi} />

            <NhomKyToi tieuDe="🚫 CHẶN" phu="không nhận cược kỳ tới" ds={chan} luat={kq.luat} mau="sai" khoa="chan" />
            <NhomKyToi tieuDe="✂ GIẢM MỘT NỬA" phu="nhận một nửa mức của ô" ds={nua} luat={kq.luat} mau="luu-y" khoa="nua" />
            <NhomKyToi tieuDe="✅ NHẬN ĐỦ" phu="nhận đúng mức của ô" ds={du} luat={kq.luat} mau="dung" khoa="du" />

            {kq.da && (
              <div
                data-ky-toi-da={kq.da.khop ? "dung" : "sai"}
                className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed"
                style={{ borderColor: kq.da.khop ? "rgba(52,211,153,0.5)" : "#f87171", background: kq.da.khop ? "rgba(16,185,129,0.08)" : "rgba(220,38,38,0.12)" }}
              >
                <b className="text-white">🎲 Đá kỳ tới:</b>{" "}
                {kq.da.khop ? (
                  <>
                    bảng tiền đá đang chặn <b className="numeric text-white">{so(kq.da.tinhLai)}</b>/4.950 cặp — máy và cách tính lại{" "}
                    <b style={{ color: "#7ff0c0" }}>khớp nhau</b>.
                  </>
                ) : (
                  <b style={{ color: "#ff9d9d" }}>
                    máy ra {so(kq.da.may)} cặp, tính lại ra {so(kq.da.tinhLai)} cặp — LỆCH. Chụp màn hình gửi người làm phần mềm.
                  </b>
                )}{" "}
                Muốn soát từng cặp thì dán chuỗi /chanloai + /chanlq vào ô kiểm bên dưới.
                <OChanDa dl={kq.dl} luat={kq.luat} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function OTong({ nhan, gt, m }: { nhan: string; gt: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-[1.2rem] leading-none" style={{ color: m }}>{gt}</div>
    </div>
  );
}

function ChuThichDai({ kyGan, ngayCuoi }: { kyGan: string[]; ngayCuoi: string | null }) {
  return (
    <div className="text-[0.72rem] text-[var(--text-muted)] leading-snug">
      Mỗi số một dòng. Mười ô vuông là 10 kỳ gần nhất, từ <b className="text-white">{ddmm(kyGan[0] ?? null)}</b> (trái) tới{" "}
      <b className="text-white">{ddmm(ngayCuoi)}</b> (phải); ô <span className="text-[#34e6a8] font-bold">xanh</span> là kỳ số đó về. Dòng “Vì sao” nói
      số đó đang ở ô nào của bảng hạn mức và ô đó anh đang cài bao nhiêu.
    </div>
  );
}

/** Một nhóm (chặn / giảm nửa / nhận đủ), chia tiếp theo ô của bảng hạn mức. */
function NhomKyToi({ tieuDe, phu, ds, luat, mau, khoa }: { tieuDe: string; phu: string; ds: LuatLo[]; luat: LuatMien; mau: MucDo; khoa: string }) {
  if (ds.length === 0) return null;
  return (
    <details open className="rounded-xl border overflow-hidden" style={{ borderColor: MAU[mau].vien }} data-nhom-ky-toi={khoa}>
      <summary className="cursor-pointer px-3 py-2 text-[0.88rem] font-extrabold flex flex-wrap items-center gap-x-2" style={{ background: MAU[mau].nen, color: MAU[mau].chu }}>
        {tieuDe} — {ds.length} số <span className="text-[0.7rem] font-normal text-[var(--text-muted)]">({phu} · bấm để thu gọn)</span>
        <span className="w-full text-[0.74rem] font-bold numeric text-white tracking-wide">{ds.map((l) => l.lo).sort().join(" ")}</span>
      </summary>
      {THU_TU_O.map((o) => {
        const nhom = ds.filter((l) => l.oKhoa === o).sort((a, b) => a.lo.localeCompare(b.lo));
        if (nhom.length === 0) return null;
        const l0 = nhom[0];
        return (
          <div key={o} data-o-ky-toi={o}>
            <div className="px-3 py-1.5 text-[0.76rem] font-bold flex flex-wrap items-center gap-x-2 border-t border-[var(--hairline)] bg-white/[0.05]">
              <span className="text-white">Ô “{l0.oTen}”</span>
              <span style={{ color: l0.mucO === 0 ? "#ff9d9d" : "#7ff0c0" }}>{l0.mucO === 0 ? "đang cài 0 = CHẶN" : `đang cài ${so(l0.mucO)}`}</span>
              <span className="text-[var(--text-muted)] font-normal">· {nhom.length} số</span>
            </div>
            {nhom.map((l) => (
              <DongSo key={l.lo} l={l} kyGan={luat.kyGan} ben={<GiaTri l={l} />} />
            ))}
          </div>
        );
      })}
    </details>
  );
}

function GiaTri({ l }: { l: LuatLo }) {
  if (l.dung === 0) return <b className="text-[#ff9d9d]">CHẶN</b>;
  return (
    <b className="numeric" style={{ color: l.chiaDoi ? "#ffd24a" : "#7ff0c0" }}>
      nhận {so(l.dung)}
      {l.chiaDoi && <span className="text-[var(--text-muted)] font-normal"> (½ của {so(l.mucO)})</span>}
    </b>
  );
}

/** Một số: dải 10 kỳ, ngày về, vì sao — dùng chung cho cả hai phần của trang. */
function DongSo({ l, kyGan, ben, nen, them }: { l: LuatLo; kyGan: string[]; ben: React.ReactNode; nen?: string; them?: React.ReactNode }) {
  return (
    <div data-check-so={l.lo} className="px-3 py-2 border-t border-[var(--hairline)]" style={nen ? { background: nen } : undefined}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="numeric font-extrabold text-lg text-white w-8">{l.lo}</span>
        <span className="flex gap-[2px]" title={kyGan.map((d, i) => `${ddmm(d)}: ${l.veGan[i] > 0 ? "về" : "không"}`).join(" · ")}>
          {kyGan.map((d, i) => (
            <span key={d} className="inline-block w-[11px] h-[11px] rounded-[2px]" style={{ background: l.veGan[i] > 0 ? "#34e6a8" : "rgba(255,255,255,0.10)" }} />
          ))}
        </span>
        <span className="ml-auto text-[0.8rem]">{ben}</span>
      </div>
      <div className="text-[0.72rem] text-[var(--text-secondary)] mt-1 leading-snug">
        <span className="text-[var(--text-muted)]">Về trong 10 kỳ: </span>
        {l.cacNgayVe.length ? <b className="numeric text-white">{l.cacNgayVe.map(ddmm).join(", ")}</b> : <b className="text-white">không kỳ nào</b>}
        <span className="text-[var(--text-muted)]"> · Hiện tại: </span>
        {trangThaiChu(l)}
      </div>
      <div className="text-[0.74rem] mt-0.5 leading-snug" data-vi-sao>
        <b style={{ color: l.dung === 0 ? "#ff9d9d" : l.chiaDoi ? "#ffd24a" : "#7ff0c0" }}>
          {l.dung === 0 ? "Vì sao CHẶN:" : l.chiaDoi ? `Vì sao nhận ${l.dung}:` : `Vì sao nhận ${l.dung}:`}
        </b>{" "}
        <span className="text-[var(--text-secondary)]">{canCu(l)}</span>
      </div>
      {l.lechMay.length > 0 && (
        <div className="text-[0.74rem] font-bold mt-0.5 text-[#ff9d9d]">🚨 Máy lệch: {l.lechMay.join("; ")}</div>
      )}
      {them}
    </div>
  );
}

/** Các ô của bảng tiền đá đang chặn ở kỳ tới — vì sao các cặp đá bị chặn. */
function OChanDa({ dl, luat }: { dl: DuLieuMien; luat: LuatMien }) {
  if (!dl.da) return null;
  const bac = bacDaMien(dl, luat);
  const dem = new Map<string, number>();
  const LOS = Object.keys(bac).sort();
  for (let x = 0; x < LOS.length; x++) for (let y = x + 1; y < LOS.length; y++) {
    const o = oDaCua(bac[LOS[x]], bac[LOS[y]]);
    if (diemODa(dl.da, o) <= 0) dem.set(o, (dem.get(o) ?? 0) + 1);
  }
  const ten = (n: number) => (n >= 15 ? "15+ ngày" : n === 0 ? "vừa về" : `${n} ngày`);
  const ds = [...dem].sort((a, b) => b[1] - a[1]);
  if (ds.length === 0) return null;
  return (
    <details className="mt-1.5" data-o-chan-da>
      <summary className="cursor-pointer text-[0.74rem] font-bold text-[#c2d4ea]">Vì sao các cặp đá bị chặn — {ds.length} ô của bảng tiền đá đang chặn (bấm để xem)</summary>
      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 text-[0.72rem] numeric">
        {ds.map(([o, n]) => {
          const [a, b] = o.split("-").map(Number);
          const luatDong = dl.da!.tuDong && dl.da!.chanLuat.includes(o);
          return (
            <div key={o}>
              ô <b className="text-white">{o}</b> ({ten(a)} đá {ten(b)}) · <b className="text-white">{so(n)}</b> cặp kỳ tới · {luatDong ? "luật tự chặn" : "anh cài 0"}
            </div>
          );
        })}
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phần 2 — kiểm chuỗi đã copy
// ─────────────────────────────────────────────────────────────────────────────

function KiemChuoi({ region }: { region: Region }) {
  const [text, setText] = useState("");
  const [ban, setBan] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [kq, setKq] = useState<KetQuaChuoi | null>(null);
  const [chiSai, setChiSai] = useState(false);
  // Mỗi lần đổi chữ / đổi miền / bấm Xoá là một "lượt" mới: kết quả của lượt cũ về muộn thì bỏ.
  const lan = useRef(0);
  const boKq = () => { lan.current++; setKq(null); setLoi(null); };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { boKq(); }, [region]);

  const dan = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t); boKq();
      if (!t.trim()) setLoi("Bộ nhớ tạm đang trống — copy chuỗi trước rồi bấm Dán.");
    } catch {
      setLoi("Trình duyệt không cho đọc bộ nhớ tạm — bấm giữ vào ô rồi chọn Dán.");
    }
  };

  const kiem = async () => {
    const id = ++lan.current;
    setBan(true); setLoi(null); setKq(null);
    try {
      const { khoi, boQua, soPhan } = docChuoi(text, DAU_DAI);
      if (khoi.length === 0) throw new Error("Không đọc được dòng nào là chuỗi lô hay chuỗi chặn đá. Dán nguyên chuỗi vừa copy (vd: “st tv ag …: 00b15dd15, 01b200dd200” hoặc “/chanloai …”).");
      const can = canTai(khoi, region);
      const dl: Partial<Record<Region, DuLieuMien>> = {};
      await Promise.all(MIEN.filter((r) => can[r].can).map(async (r) => { dl[r] = await taiMien(r, can[r].da, can[r].chanLo); }));
      const luat: Partial<Record<Region, LuatMien>> = {};
      for (const r of MIEN) if (dl[r]) luat[r] = luatLoMien(dl[r]!);
      const mienCua = (k: Khoi) => k.mien ?? region;
      const lo = khoi.filter((k) => k.loai !== "da").map((k) => kiemLo(k, mienCua(k), luat[mienCua(k)]!, dl[mienCua(k)]!, DAU_DAI));
      trungGiuaDong(lo);
      const da = MIEN.map((r) => ({ r, ds: khoi.filter((k) => k.loai === "da" && mienCua(k) === r) }))
        .filter((x) => x.ds.length > 0)
        .map((x) => kiemDa(x.ds, x.r, luat[x.r]!, dl[x.r]!, soPhan, DAU_DAI));
      if (id === lan.current) setKq({ luc: new Date(), luat, dl, lo, da, boQua });
    } catch (e) {
      // Không tải được thì KHÔNG được báo đúng — nói rõ là chưa kiểm.
      if (id === lan.current) setLoi(e instanceof Error ? e.message : "Lỗi không rõ — chưa kiểm được");
    } finally {
      if (id === lan.current) setBan(false);
    }
  };

  const tong: MucDo | null = kq ? [...kq.lo.map((x) => x.mucDo), ...kq.da.map((x) => x.mucDo)].reduce<MucDo>((a, b) => (NANG[b] > NANG[a] ? b : a), "dung") : null;
  const lechMay = kq ? MIEN.filter((r) => (kq.luat[r]?.soLechMay ?? 0) > 0) : [];
  const soSai = kq ? kq.lo.reduce((s, x) => s + x.soSai, 0) + kq.da.reduce((s, x) => s + x.soSai, 0) : 0;
  const tatCaGhiChu: { noi: string; g: GhiChu }[] = kq
    ? [
        ...kq.lo.flatMap((x) => x.ghiChu.map((g) => ({ noi: `Lô ${REGION_LABELS[x.region]} (dòng ${x.khoi.dong})`, g }))),
        ...kq.da.flatMap((x) => x.ghiChu.map((g) => ({ noi: `Đá ${REGION_LABELS[x.region]}`, g }))),
      ]
    : [];
  const ghiSai = tatCaGhiChu.filter((x) => x.g.muc === "sai");
  const ghiLuuY = tatCaGhiChu.filter((x) => x.g.muc === "luu-y");
  const soSoSai = kq ? kq.lo.reduce((s, x) => s + x.loi.length + (x.thieuLaSai ? x.thieu.length : 0), 0) : 0;

  return (
    <>
      <section className="plate rise rise-2">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🔎 Kiểm Chuỗi Đã Copy</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Dán chuỗi vừa copy (ở web hay bot) vào đây. Máy chấm từng số theo cách tính lại ở trên và chỉ ra số nào sai, vì sao.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-2.5">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); boKq(); }}
            rows={6}
            data-check-o
            placeholder={"Dán chuỗi vào đây. Kiểm được:\n• chuỗi lô: st tv ag …: 00b15dd15, 01b200dd200 (web, /copy, bot gửi)\n• danh sách số: 04 78 90 hoặc Mn: 04 78 90 (/chanso)\n• chặn lô: …: 05b0n 17b0n (/chanlo)\n• chặn đá: /chanloai … và /chanlq … (dán cả hai càng tốt)\nKHÔNG kiểm: chuỗi đẩy ở tab Rủi Ro Tiền, sổ cược khách gửi."}
            className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 font-mono text-[0.78rem] leading-relaxed focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={dan} data-check-dan className="px-3 py-2 rounded-lg text-xs font-bold bg-white/[0.08] border border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.16]">
              📋 Dán từ bộ nhớ tạm
            </button>
            <button onClick={() => { setText(""); boKq(); }} className="px-3 py-2 rounded-lg text-xs font-bold bg-white/[0.04] border border-[var(--hairline)] text-slate-400 hover:bg-white/[0.1]">
              Xoá
            </button>
            <button
              onClick={kiem}
              disabled={ban || !text.trim()}
              data-check-kiem
              className="ml-auto px-5 py-2 rounded-lg text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {ban ? "Đang kiểm…" : "🔎 Kiểm tra"}
            </button>
          </div>
          <p className="text-[0.68rem] text-[var(--text-muted)] leading-snug">
            Chuỗi có tên đài (st tv ag… / dnang pyen… / mb) thì máy tự biết miền. Chuỗi <b>không</b> có tên đài sẽ tính theo tab miền đang chọn:{" "}
            <b className="text-white">{REGION_LABELS[region]}</b>.
          </p>
          {loi && (
            <div data-check-loi className="rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2.5 text-[0.78rem] text-[#ffd0d0]">
              <b>Chưa kiểm được.</b> {loi}
            </div>
          )}
        </div>
      </section>

      {kq && tong && (
        <>
          <section data-check-tong={tong} className="rounded-2xl border-2 px-4 py-3.5" style={{ borderColor: MAU[tong].vien, background: MAU[tong].nen }}>
            <div className="text-xl font-extrabold" style={{ color: MAU[tong].chu }}>
              {tong === "sai"
                ? `❌ SAI ${soSai} chỗ`
                : tong === "luu-y"
                  ? `⚠ Tiền từng số đều đúng — nhưng có ${ghiLuuY.length} điều anh cần xem`
                  : "✅ ĐÚNG với luật đang cài — không có gì cần sửa"}
            </div>
            <div className="text-[0.74rem] text-[var(--text-secondary)] mt-1 leading-relaxed">
              {MIEN.filter((r) => kq.luat[r]).map((r) => (
                <span key={r} className="mr-3">
                  {REGION_LABELS[r]}: tính theo kết quả tới kỳ <b className="text-white">{ddmm(kq.luat[r]!.ngayCuoi)}</b>
                </span>
              ))}
              · kiểm lúc {kq.luc.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </div>
            {(ghiSai.length > 0 || soSoSai > 0 || ghiLuuY.length > 0) && (
              <ol className="mt-2 space-y-1 text-[0.8rem] leading-snug list-decimal pl-5" data-check-tom-tat>
                {soSoSai > 0 && <li className="text-[#ffd0d0] font-bold">{soSoSai} số sai tiền / sai trạng thái — đánh dấu ❌ ở danh sách số bên dưới</li>}
                {ghiSai.map((x, i) => (
                  <li key={`s${i}`} className="text-[#ffd0d0] font-bold">{x.noi}: {x.g.tieuDe}</li>
                ))}
                {ghiLuuY.map((x, i) => (
                  <li key={`l${i}`} className="text-[#ffe9c4]">{x.noi}: {x.g.tieuDe}</li>
                ))}
              </ol>
            )}
            {tong === "sai" && (
              <div className="text-[0.72rem] text-[var(--text-muted)] mt-2">
                Chuỗi được copy <b>trước</b> khi cập nhật kết quả hay trước khi bấm Lưu bảng thì đã cũ — copy lại rồi kiểm lần nữa. Từng mục có “Anh cần làm” ở bên dưới.
              </div>
            )}
          </section>

          {lechMay.length > 0 && (
            <section data-check-lech-may className="rounded-2xl border-2 border-[#f87171] bg-[#7f1d1d]/40 px-4 py-3.5 text-[0.8rem] leading-relaxed text-[#ffe1e1]">
              <div className="text-base font-extrabold text-white">🚨 MÁY ĐANG TÍNH LỆCH BẢNG HẠN MỨC</div>
              Số máy đang đưa ra (bảng 100 lô, chuỗi copy, bot) khác với kết quả tính lại. Đây là lỗi phần mềm, không phải lỗi chuỗi — chụp màn hình này
              gửi người làm phần mềm. Trang này đã chấm chuỗi theo kết quả <b>tính lại</b>.
              {lechMay.map((r) => (
                <div key={r} className="mt-1.5">
                  <b>{REGION_LABELS[r]} — {kq.luat[r]!.soLechMay} lô:</b>
                  <ul className="list-disc pl-5">
                    {Object.values(kq.luat[r]!.lo).filter((l) => l.lechMay.length).slice(0, 12).map((l) => (
                      <li key={l.lo}><b className="numeric">{l.lo}</b>: {l.lechMay.join("; ")}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] select-none">
            <button
              onClick={() => setChiSai((v) => !v)}
              data-check-chi-sai
              className={`px-3 py-1.5 rounded-lg font-bold border ${chiSai ? "bg-[#b91c1c] border-[#f87171] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea]"}`}
            >
              {chiSai ? "Đang hiện: chỉ số sai / thiếu" : "Đang hiện: tất cả các số"}
            </button>
            bấm để đổi
          </div>

          {kq.lo.map((x, i) => (
            <KhoiLo key={i} x={x} luat={kq.luat[x.region]!} chiSai={chiSai} />
          ))}
          {kq.da.map((x) => (
            <KhoiDa key={x.region} x={x} luat={kq.luat[x.region]!} dl={kq.dl[x.region]!} />
          ))}

          {kq.boQua.length > 0 && (
            <details className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2 text-[0.72rem] text-[var(--text-muted)]" data-check-bo-qua>
              <summary className="cursor-pointer">{kq.boQua.length} dòng không có số nào để kiểm (tiêu đề, lời dặn của bot…) — đã bỏ qua, bấm để xem</summary>
              {kq.boQua.map((b) => (
                <div key={b.dong} className="mt-1 font-mono break-all">dòng {b.dong}: {b.chu.slice(0, 160)}</div>
              ))}
            </details>
          )}
        </>
      )}
    </>
  );
}

/** Một ghi chú, đủ bốn phần: chuyện gì · số nào · vì sao · anh cần làm gì. */
function TheGhiChu({ g }: { g: GhiChu }) {
  const m = MAU[g.muc];
  return (
    <div data-ghi-chu={g.muc} className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed" style={{ borderColor: m.vien, background: m.nen }}>
      <div className="font-extrabold" style={{ color: m.chu }}>
        {g.muc === "sai" ? "❌" : "⚠"} {g.tieuDe}
      </div>
      {g.so.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {g.so.slice(0, 60).map((s) => (
            <span key={s} className="numeric rounded px-1.5 py-0.5 text-[0.74rem] font-bold text-white bg-black/30 border border-white/15">{s}</span>
          ))}
          {g.so.length > 60 && <span className="text-[var(--text-muted)]">… và {g.so.length - 60} số nữa</span>}
        </div>
      )}
      <div className="mt-1 text-[var(--text-secondary)]">{g.giaiThich}</div>
      <div className="mt-1 font-bold text-white">👉 Anh cần làm: <span className="font-normal">{g.canLam}</span></div>
    </div>
  );
}

function Chip({ m }: { m: MucDo }) {
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[0.68rem] font-extrabold whitespace-nowrap" style={{ color: MAU[m].chu, background: "rgba(0,0,0,0.35)", border: `1px solid ${MAU[m].vien}` }}>
      {MAU[m].nhan}
    </span>
  );
}

function KhoiLo({ x, luat, chiSai }: { x: KetQuaLo; luat: LuatMien; chiSai: boolean }) {
  const k = x.khoi;
  const coTien = k.loai === "lo-tien";
  const chuoiGhi = new Map(k.muc.map((m) => [m.lo, m]));
  const trongChuoi = coTien ? [...new Set(k.muc.map((m) => m.lo))] : [...new Set(k.so)];
  const saiCua = new Map<string, string[]>();
  for (const e of x.loi) saiCua.set(e.lo, [...(saiCua.get(e.lo) ?? []), e.chu]);
  const thieu = new Set(x.thieu.map((l) => l.lo));
  const moi = [...new Set([...trongChuoi, ...x.thieu.map((l) => l.lo)])].sort();
  const hien = chiSai ? moi.filter((lo) => saiCua.has(lo) || (thieu.has(lo) && x.thieuLaSai)) : moi;
  const ten = !coTien
    ? x.laChanso ? "danh sách lô chặn (/chanso)" : "danh sách số (không có tiền)"
    : x.chanLo ? "chuỗi chặn lô (/chanlo)" : k.tienTo ? `chuỗi bot gửi (tiền tố “${k.tienTo}”)` : "chuỗi cược lô";

  return (
    <section className="plate" data-check-lo={x.region} data-muc={x.mucDo}>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎯 Lô · {REGION_LABELS[x.region]} · {ten}</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            dòng {k.dong} · {trongChuoi.length} số trong chuỗi{k.dauDai ? ` · tên đài: ${k.dauDai.length > 26 ? k.dauDai.slice(0, 26) + "…" : k.dauDai}` : ""}
          </p>
        </div>
        <Chip m={x.mucDo} />
      </div>
      <div className="p-3 md:p-4 space-y-2.5">
        <div className="rounded-lg border px-3 py-2.5 text-[0.8rem] leading-relaxed" style={{ borderColor: MAU[x.mucDo].vien, background: MAU[x.mucDo].nen }} data-check-lo-tom-tat>
          {coTien && !x.chanLo ? (
            <>
              <b className="text-white">{x.soDung}/{trongChuoi.length} số đúng tiền</b>
              {x.soSai > 0 && <> · <b style={{ color: MAU.sai.chu }}>{x.soSai} chỗ sai</b></>}
              {" "}· tổng chuỗi <b className="numeric text-white">{so(x.tongChuoi)}n</b>, đúng phải là <b className="numeric text-white">{so(x.tongDung)}n</b>
            </>
          ) : x.chanLo ? (
            <>
              So với lệnh <b>/chanlo</b> (luật chặn lô 2 bước):{" "}
              {x.chanLo.khop ? <b style={{ color: MAU.dung.chu }} data-check-chanlo="khop">khớp đủ {trongChuoi.length} lô</b> : <b style={{ color: MAU.sai.chu }} data-check-chanlo="lech">không khớp</b>}
              {x.soSai > 0 && <> · <b style={{ color: MAU.sai.chu }}>{x.soSai} chỗ sai</b></>}
            </>
          ) : x.laChanso ? (
            <>
              <b className="text-white">{x.soDung}/{trongChuoi.length} số đúng là đang chặn</b>
              {x.thieu.length > 0 && <> · <b style={{ color: MAU.sai.chu }}>sót {x.thieu.length} lô đang chặn: <span className="numeric">{x.thieu.map((l) => l.lo).join(" ")}</span></b></>}
            </>
          ) : (
            <>
              <b className="text-white">{trongChuoi.length} số</b>: {trongChuoi.filter((lo) => luat.lo[lo].dung > 0).length} đang nhận,{" "}
              <b style={{ color: MAU.sai.chu }}>{trongChuoi.filter((lo) => luat.lo[lo].dung <= 0).length} đang CHẶN</b>
            </>
          )}
          {x.nhom && <div>Chuỗi khớp trọn nhóm: <b className="text-white">{x.nhom}</b>.</div>}
          {x.thieuLaSai && x.thieu.length > 0 && !x.laChanso && (
            <div style={{ color: MAU.sai.chu }} className="font-bold">
              {x.thieu.length} lô {x.thieuChu}: <span className="numeric">{x.thieu.map((l) => l.lo).join(" ")}</span>
            </div>
          )}
        </div>

        {x.ghiChu.map((g, i) => <TheGhiChu key={i} g={g} />)}

        <ChuThichDai kyGan={luat.kyGan} ngayCuoi={luat.ngayCuoi} />

        {THU_TU_O.map((o) => {
          const ds = hien.filter((lo) => luat.lo[lo].oKhoa === o);
          if (ds.length === 0) return null;
          const l0 = luat.lo[ds[0]];
          return (
            <div key={o} className="rounded-lg border border-[var(--hairline)] overflow-hidden" data-check-o-lich={o}>
              <div className="px-3 py-1.5 text-[0.76rem] font-bold flex flex-wrap items-center gap-x-2" style={{ background: l0.mucO === 0 ? "rgba(220,38,38,0.16)" : "rgba(255,255,255,0.06)" }}>
                <span className="text-white">Ô “{l0.oTen}”</span>
                <span style={{ color: l0.mucO === 0 ? "#ff9d9d" : "#7ff0c0" }}>{l0.mucO === 0 ? "đang cài 0 = CHẶN" : `đang cài ${so(l0.mucO)}`}</span>
                <span className="text-[var(--text-muted)] font-normal">· {ds.length} số</span>
              </div>
              {ds.map((lo) => {
                const l = luat.lo[lo];
                const sai = saiCua.get(lo) ?? [];
                const vang = thieu.has(lo);
                const hong = sai.length > 0 || (vang && x.thieuLaSai);
                const ghi = coTien ? chuoiGhi.get(lo)?.diem ?? null : null;
                return (
                  <DongSo
                    key={lo}
                    l={l}
                    kyGan={luat.kyGan}
                    nen={hong ? "rgba(220,38,38,0.14)" : vang ? "rgba(245,158,11,0.10)" : undefined}
                    ben={
                      <span data-kq={hong ? "sai" : vang ? "thieu" : "dung"} className="numeric">
                        {vang ? (
                          <b style={{ color: hong ? MAU.sai.chu : MAU["luu-y"].chu }}>KHÔNG có trong chuỗi {hong ? "❌" : "⚠"}</b>
                        ) : coTien ? (
                          <>
                            <span className="text-[var(--text-muted)]">chuỗi </span>
                            <b style={{ color: hong ? MAU.sai.chu : "#fff" }}>{ghi}</b>
                            <span className="text-[var(--text-muted)]"> · đúng </span>
                            {x.chanLo ? <b className="text-[#ff9d9d]">0 (chặn)</b> : <GiaTri l={l} />} {hong ? "❌" : "✅"}
                          </>
                        ) : (
                          <><GiaTri l={l} /> {hong ? "❌" : x.laChanso ? "✅" : ""}</>
                        )}
                      </span>
                    }
                    them={
                      <>
                        {vang && (
                          <div className="text-[0.76rem] font-bold mt-0.5" style={{ color: hong ? MAU.sai.chu : MAU["luu-y"].chu }}>
                            {hong ? "❌" : "⚠"} {x.thieuChu}
                          </div>
                        )}
                        {sai.map((t, i) => (
                          <div key={i} className="text-[0.76rem] font-bold mt-0.5" style={{ color: MAU.sai.chu }}>❌ {t}</div>
                        ))}
                      </>
                    }
                  />
                );
              })}
            </div>
          );
        })}
        {hien.length === 0 && <p className="text-[0.76rem] text-[var(--text-muted)]">Không có số nào sai hay thiếu.</p>}
      </div>
    </section>
  );
}

function KhoiDa({ x, luat, dl }: { x: KetQuaDa; luat: LuatMien; dl: DuLieuMien }) {
  const bac = bacDaMien(dl, luat);
  const tenBac = (n: number) => (n >= 15 ? "15+ ngày" : n === 0 ? "vừa về" : `${n} ngày`);
  /** "05 (3 ngày) đá 17 (vừa về) → ô 0-3 đang cài 0" — cho người đọc tự soi lại bảng tiền đá. */
  const giai = (p: string) => {
    const [a, b] = p.split("-");
    const o = oDaCua(bac[a], bac[b]);
    const d = dl.da ? diemODa(dl.da, o) : 0;
    return `${a} (${tenBac(bac[a])}) đá ${b} (${tenBac(bac[b])}) → ô ${o} ${d > 0 ? `đang cài ${d} = NHẬN` : "đang cài 0 = CHẶN"}`;
  };
  const co = [x.coLoai ? "/chanloai" : "", x.coLq ? "/chanlq" : ""].filter(Boolean).join(" + ");
  return (
    <section className="plate" data-check-da={x.region} data-muc={x.mucDo}>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎲 Đá · {REGION_LABELS[x.region]} · {co || "chuỗi chặn đá"}</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">dòng {x.khoi.map((k) => k.dong).join(", ")} · bậc ngày tính tới kỳ {ddmm(luat.ngayCuoi)}</p>
        </div>
        <Chip m={x.mucDo} />
      </div>
      <div className="p-3 md:p-4 space-y-2.5">
        <div className="rounded-lg border px-3 py-2.5 text-[0.8rem] leading-relaxed" style={{ borderColor: MAU[x.mucDo].vien, background: MAU[x.mucDo].nen }} data-check-da-tom-tat>
          Bảng tiền đá đang chặn <b className="numeric text-white">{so(x.soCapLuat)} cặp</b> · chuỗi chặn <b className="numeric text-white">{so(x.soCapChuoi)} cặp</b>
          {x.capLap > 0 && <span className="text-[var(--text-muted)]"> (có {so(x.capLap)} cặp ghi lặp ở hai vòng — vô hại)</span>}.
          <div>
            Sót (bảng chặn mà chuỗi không chặn): <b style={{ color: x.thieu.length ? MAU.sai.chu : MAU.dung.chu }} data-check-da-thieu>{so(x.thieu.length)} cặp</b> · Chặn oan (bảng đang nhận):{" "}
            <b style={{ color: x.thua.length ? MAU.sai.chu : MAU.dung.chu }} data-check-da-thua>{so(x.thua.length)} cặp</b>
            {x.thuaLamTron > 0 && <> · chặn thêm do chặn tròn (rút gọn): <b className="text-[#ffd24a]" data-check-da-lam-tron>{so(x.thuaLamTron)} cặp</b></>}
          </div>
        </div>

        {x.ghiChu.map((g, i) => <TheGhiChu key={i} g={g} />)}

        {x.tron.length > 0 && (
          <div className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-[0.76rem] leading-relaxed" data-check-da-tron>
            <b className="text-white">{x.tron.length} con chặn tròn trong chuỗi</b> — mỗi con đang ở ngày nào, và bảng tiền đá thật sự chặn nó với bao nhiêu con
            (đã lưu: {x.rutGon ? `Rút gọn từ ${x.nguong}/99` : "Rút gọn tắt, phải đủ 99/99"}{x.nguongChuoi !== null && x.nguongChuoi !== x.nguong ? `; chuỗi này dùng mức ${x.nguongChuoi}/99` : ""}):
            <div className="mt-1 flex flex-wrap gap-1.5">
              {x.tron.map((t) => (
                <span key={t.con} className="numeric rounded px-1.5 py-0.5 border" style={{ borderColor: t.bac >= 50 ? "rgba(52,211,153,0.5)" : "#f87171", color: t.bac >= 50 ? "#c9f7e4" : "#ffd0d0" }}>
                  <b>{t.con}</b> · {tenBac(bac[t.con])} · {t.bac}/99
                </span>
              ))}
            </div>
          </div>
        )}

        {x.thieu.length > 0 && (
          <div className="rounded-lg border px-3 py-2 text-[0.74rem] leading-relaxed" style={{ borderColor: x.thieuLaSai ? "rgba(248,113,113,0.6)" : "rgba(251,191,36,0.6)" }} data-check-da-ds-thieu>
            <b style={{ color: x.thieuLaSai ? MAU.sai.chu : MAU["luu-y"].chu }}>Các cặp {x.thieuLaSai ? "bị sót" : "chưa thấy"}{x.thieu.length > 40 ? ` (40 đầu / ${so(x.thieu.length)})` : ""}:</b>
            {x.thieu.slice(0, 40).map((p) => <div key={p} className="numeric">{giai(p)}</div>)}
          </div>
        )}
        {x.thua.length > 0 && (
          <div className="rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2 text-[0.74rem] leading-relaxed" data-check-da-ds-thua>
            <b style={{ color: MAU.sai.chu }}>Các cặp chặn oan{x.thua.length > 40 ? ` (40 đầu / ${so(x.thua.length)})` : ""}:</b>
            {x.thua.slice(0, 40).map((p) => <div key={p} className="numeric">{giai(p)}</div>)}
          </div>
        )}
      </div>
    </section>
  );
}
