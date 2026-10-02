"use client";

import { useEffect, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { luatChanLo } from "@/lib/chan-lo";
import {
  bacDaMien, canCu, canTai, diemODa, docChuoi, kiemDa, kiemLo, luatLoMien, oDaCua,
  type DuLieuMien, type KetQuaDa, type KetQuaLo, type Khoi, type LuatLo, type LuatMien, type MucDo,
} from "@/lib/kiem-chuoi";
import { provincePrefix } from "@/lib/provinces";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];
const DAU_DAI: Record<Region, string> = { xsmn: provincePrefix("xsmn"), xsmt: provincePrefix("xsmt"), xsmb: provincePrefix("xsmb") };
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const so = (n: number) => n.toLocaleString("vi-VN");
const MAU: Record<MucDo, { vien: string; nen: string; chu: string; nhan: string }> = {
  dung: { vien: "rgba(52,211,153,0.55)", nen: "rgba(16,185,129,0.10)", chu: "#7ff0c0", nhan: "✅ ĐÚNG" },
  "luu-y": { vien: "rgba(251,191,36,0.6)", nen: "rgba(245,158,11,0.10)", chu: "#ffd24a", nhan: "⚠ CÓ LƯU Ý" },
  sai: { vien: "rgba(248,113,113,0.7)", nen: "rgba(220,38,38,0.12)", chu: "#ff9d9d", nhan: "❌ SAI" },
};
const NANG: Record<MucDo, number> = { dung: 0, "luu-y": 1, sai: 2 };

interface KetQua {
  luc: Date;
  mienMacDinh: Region;
  luat: Partial<Record<Region, LuatMien>>;
  dl: Partial<Record<Region, DuLieuMien>>;
  lo: KetQuaLo[];
  da: KetQuaDa[];
  boQua: { dong: number; chu: string }[];
}

async function lay(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url.split("?")[0]} trả ${r.status}`);
  return r.json();
}

/** Tải MỚI mỗi lần bấm Kiểm tra — trang này tồn tại để bắt số cũ, nó không được tự giữ số cũ. */
async function taiMien(region: Region, canDa: boolean, canChanLo: boolean): Promise<DuLieuMien> {
  const [h, s, l, d, c] = await Promise.all([
    lay(`/api/history/hits?region=${region}`),
    lay(`/api/config/schedule?region=${region}`),
    lay(`/api/limits?region=${region}`),
    canDa ? lay(`/api/config/da?region=${region}`) : null,
    canChanLo ? lay(`/api/config/chan-ngay?region=${region}`) : null,
  ]);
  if (!Array.isArray(h.draws) || !s.data || !Array.isArray(l.data)) throw new Error("máy chủ trả thiếu dữ liệu");
  const draws = h.draws as DrawHits[];
  const buoc = c?.data?.buoc ? { buoc1: c.data.buoc.buoc1 !== false, buoc2: c.data.buoc.buoc2 !== false } : undefined;
  return {
    region, draws, lich: s.data, may: l.data,
    da: d?.data ? { bang: d.data.bang ?? {}, tuDong: d.data.tuDong !== false, chanLuat: d.data.chanLuat ?? [], rutGon: d.data.rutGon === true, nguongGon: Number(d.data.nguongGon) || 90 } : null,
    chanLoLuat: canChanLo ? luatChanLo(draws, region, buoc).chan : null,
  };
}

/**
 * Tab Check — dán chuỗi vừa copy vào, máy tính LẠI từ đầu rồi nói đúng hay sai.
 *
 * Khách: "check xem cái chuỗi sau khi mình copy nó có ra đúng không, đúng quy
 * luật của mình không… hiện lại những số đó 1 lần nữa xem nó ra ngày nào ngày
 * nào, giá ra sao, có đúng với rule ban đầu không — càng rõ càng tốt".
 *
 * Nên mỗi số được trải ra đủ ba thứ: về những ngày nào (10 kỳ gần nhất), vì
 * vậy rơi vào ô nào của bảng và ô đó đang cài bao nhiêu, rồi chuỗi ghi bao
 * nhiêu. Phần tính nằm ở kiem-chuoi.ts và cố ý không dùng chung bộ máy hạn mức.
 */
export default function CheckPage({ region }: { region: Region }) {
  const [text, setText] = useState("");
  const [ban, setBan] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [kq, setKq] = useState<KetQua | null>(null);
  const [chiSai, setChiSai] = useState(false);

  // Đổi miền là đổi cách hiểu chuỗi không có đầu đài — kết quả cũ không còn đúng.
  useEffect(() => { setKq(null); setLoi(null); }, [region]);

  const dan = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t); setKq(null); setLoi(null);
      if (!t.trim()) setLoi("Bộ nhớ tạm đang trống — copy chuỗi trước rồi bấm Dán.");
    } catch {
      setLoi("Trình duyệt không cho đọc bộ nhớ tạm — bấm giữ vào ô rồi chọn Dán.");
    }
  };

  const kiem = async () => {
    setBan(true); setLoi(null); setKq(null);
    try {
      const { khoi, boQua } = docChuoi(text, DAU_DAI);
      if (khoi.length === 0) throw new Error("Không đọc được dòng nào là chuỗi lô hay chuỗi chặn đá. Dán nguyên chuỗi vừa copy (vd: “st tv ag …: 00b15dd15, 01b200dd200” hoặc “/chanloai …”).");
      const can = canTai(khoi, region);
      const dl: Partial<Record<Region, DuLieuMien>> = {};
      await Promise.all(MIEN.filter((r) => can[r].can).map(async (r) => { dl[r] = await taiMien(r, can[r].da, can[r].chanLo); }));
      const luat: Partial<Record<Region, LuatMien>> = {};
      for (const r of MIEN) if (dl[r]) luat[r] = luatLoMien(dl[r]!);
      const mienCua = (k: Khoi) => k.mien ?? region;
      const lo = khoi.filter((k) => k.loai !== "da").map((k) => kiemLo(k, mienCua(k), luat[mienCua(k)]!, dl[mienCua(k)]!));
      const da = MIEN.map((r) => ({ r, ds: khoi.filter((k) => k.loai === "da" && mienCua(k) === r) }))
        .filter((x) => x.ds.length > 0)
        .map((x) => kiemDa(x.ds, x.r, luat[x.r]!, dl[x.r]!));
      setKq({ luc: new Date(), mienMacDinh: region, luat, dl, lo, da, boQua });
    } catch (e) {
      // Không tải được thì KHÔNG được báo đúng — nói rõ là chưa kiểm.
      setLoi(e instanceof Error ? e.message : "Lỗi không rõ — chưa kiểm được");
    } finally {
      setBan(false);
    }
  };

  const tong: MucDo | null = kq ? [...kq.lo.map((x) => x.mucDo), ...kq.da.map((x) => x.mucDo)].reduce<MucDo>((a, b) => (NANG[b] > NANG[a] ? b : a), "dung") : null;
  const lechMay = kq ? MIEN.filter((r) => (kq.luat[r]?.soLechMay ?? 0) > 0) : [];
  const soSai = kq ? kq.lo.reduce((s, x) => s + x.loi.length + (x.khoi.laChanso ? x.thieu.length : 0), 0) + kq.da.reduce((s, x) => s + x.thieu.length + x.thua.length + x.loiDang.length, 0) : 0;

  return (
    <div className="space-y-4 md:space-y-6" data-check>
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">✅ Check Chuỗi Đã Copy</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Dán chuỗi vừa copy (ở web hay bot) vào đây. Máy tính lại từ kết quả xổ và bảng đang cài, rồi chỉ ra từng số đúng hay sai.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-2.5">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setKq(null); setLoi(null); }}
            rows={6}
            data-check-o
            placeholder={"Dán chuỗi vào đây. Nhận được:\n• chuỗi lô: st tv ag …: 00b15dd15, 01b200dd200 (web, /copy, bot gửi)\n• danh sách số: 04 78 90 hoặc Mn: 04 78 90 (/chanso)\n• chặn lô: …: 05b0n 17b0n (/chanlo)\n• chặn đá: /chanloai … và /chanlq … (dán cả hai càng tốt)"}
            className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 font-mono text-[0.78rem] leading-relaxed focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={dan} data-check-dan className="px-3 py-2 rounded-lg text-xs font-bold bg-white/[0.08] border border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.16]">
              📋 Dán từ bộ nhớ tạm
            </button>
            <button onClick={() => { setText(""); setKq(null); setLoi(null); }} className="px-3 py-2 rounded-lg text-xs font-bold bg-white/[0.04] border border-[var(--hairline)] text-slate-400 hover:bg-white/[0.1]">
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
            Chuỗi có đầu đài (st tv ag… / dnang pyen… / mb) thì máy tự biết miền. Chuỗi <b>không</b> có đầu đài sẽ tính theo tab miền đang chọn:{" "}
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
          <section
            data-check-tong={tong}
            className="rounded-2xl border px-4 py-3.5"
            style={{ borderColor: MAU[tong].vien, background: MAU[tong].nen }}
          >
            <div className="text-xl font-extrabold" style={{ color: MAU[tong].chu }}>
              {tong === "sai" ? `❌ SAI ${soSai} chỗ` : tong === "luu-y" ? "⚠ Không sai tiền, nhưng có lưu ý" : "✅ ĐÚNG với luật đang cài"}
            </div>
            <div className="text-[0.74rem] text-[var(--text-secondary)] mt-1 leading-relaxed">
              {MIEN.filter((r) => kq.luat[r]).map((r) => (
                <span key={r} className="mr-3">
                  {REGION_LABELS[r]}: tính theo kết quả tới kỳ <b className="text-white">{ddmm(kq.luat[r]!.ngayCuoi)}</b> ({kq.luat[r]!.soKy} kỳ)
                </span>
              ))}
              · kiểm lúc {kq.luc.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </div>
            {tong === "sai" && (
              <div className="text-[0.72rem] text-[var(--text-muted)] mt-1">
                Nếu chuỗi được copy <b>trước</b> khi cập nhật kết quả hay trước khi bấm Lưu bảng thì chuỗi đó đã cũ — copy lại rồi kiểm lần nữa.
              </div>
            )}
          </section>

          {lechMay.length > 0 && (
            <section data-check-lech-may className="rounded-2xl border-2 border-[#f87171] bg-[#7f1d1d]/40 px-4 py-3.5 text-[0.8rem] leading-relaxed text-[#ffe1e1]">
              <div className="text-base font-extrabold text-white">🚨 MÁY ĐANG TÍNH LỆCH BẢNG HẠN MỨC</div>
              Số máy đang đưa ra (bảng 100 lô, chuỗi copy, bot) khác với kết quả tính lại từ kết quả xổ + bảng đang cài. Đây là lỗi phần mềm, không
              phải lỗi chuỗi — chụp màn hình này gửi người làm phần mềm. Trang này đã chấm chuỗi theo kết quả <b>tính lại</b>.
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

          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] select-none">
            <button
              onClick={() => setChiSai((v) => !v)}
              data-check-chi-sai
              className={`px-3 py-1.5 rounded-lg font-bold border ${chiSai ? "bg-[#b91c1c] border-[#f87171] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea]"}`}
            >
              {chiSai ? "Đang hiện: chỉ số sai / thiếu" : "Đang hiện: tất cả các số"}
            </button>
            bấm để đổi
          </label>

          {kq.lo.map((x, i) => (
            <KhoiLo key={i} x={x} luat={kq.luat[x.region]!} chiSai={chiSai} />
          ))}
          {kq.da.map((x) => (
            <KhoiDa key={x.region} x={x} luat={kq.luat[x.region]!} dl={kq.dl[x.region]!} />
          ))}

          {kq.boQua.length > 0 && (
            <details className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2 text-[0.72rem] text-[var(--text-muted)]" data-check-bo-qua>
              <summary className="cursor-pointer">{kq.boQua.length} dòng không phải chuỗi (tiêu đề, lời dặn…) — đã bỏ qua, bấm để xem</summary>
              {kq.boQua.map((b) => (
                <div key={b.dong} className="mt-1 font-mono break-all">dòng {b.dong}: {b.chu.slice(0, 160)}</div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ m, chu }: { m: MucDo; chu?: string }) {
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[0.68rem] font-extrabold whitespace-nowrap" style={{ color: MAU[m].chu, background: "rgba(0,0,0,0.35)", border: `1px solid ${MAU[m].vien}` }}>
      {chu ?? MAU[m].nhan}
    </span>
  );
}

/** Thứ tự các ô của bảng hạn mức, đúng như trên màn hình cài. */
const THU_TU_O = [...Array.from({ length: 20 }, (_, d) => `ngay:${d}`), "tren", "chuoi:2", "chuoi:3", "chuoi:4"];

function KhoiLo({ x, luat, chiSai }: { x: KetQuaLo; luat: LuatMien; chiSai: boolean }) {
  const k = x.khoi;
  const coTien = k.loai === "lo-tien";
  const chuoiGhi = new Map(k.muc.map((m) => [m.lo, m]));
  const trongChuoi = coTien ? [...new Set(k.muc.map((m) => m.lo))] : [...new Set(k.so)];
  const saiCua = new Map<string, string[]>();
  for (const e of x.loi) saiCua.set(e.lo, [...(saiCua.get(e.lo) ?? []), e.chu]);
  const thieu = new Set(x.thieu.map((l) => l.lo));
  const moi = [...trongChuoi, ...x.thieu.map((l) => l.lo)].sort();
  const hien = chiSai ? moi.filter((lo) => saiCua.has(lo) || thieu.has(lo)) : moi;
  const toan0 = coTien && k.muc.length > 0 && k.muc.every((m) => m.diem === 0 && m.de === null);
  const ten = !coTien ? (k.laChanso ? "danh sách lô chặn (/chanso)" : "danh sách số (không có tiền)") : toan0 ? "chuỗi chặn lô (b0n)" : k.tienTo ? `chuỗi bot gửi (tiền tố “${k.tienTo}”)` : "chuỗi cược lô";
  const la = x.loi.filter((e) => e.lo === "??");

  return (
    <section className="plate" data-check-lo={x.region} data-muc={x.mucDo}>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎯 Lô · {REGION_LABELS[x.region]} · {ten}</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">dòng {k.dong} · {trongChuoi.length} lô trong chuỗi{k.dauDai ? ` · đầu đài: ${k.dauDai.length > 26 ? k.dauDai.slice(0, 26) + "…" : k.dauDai}` : ""}</p>
        </div>
        <Chip m={x.mucDo} />
      </div>
      <div className="p-3 md:p-4 space-y-2.5">
        <div className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed" style={{ borderColor: MAU[x.mucDo].vien, background: MAU[x.mucDo].nen }} data-check-lo-tom-tat>
          {coTien ? (
            <>
              <b className="text-white">{x.soDung}/{trongChuoi.length} lô đúng tiền</b>
              {x.loi.length > 0 && <> · <b style={{ color: MAU.sai.chu }}>{x.loi.length} chỗ sai</b></>}
              {!toan0 && <> · tổng chuỗi <b className="numeric text-white">{so(x.tongChuoi)}n</b>, đúng phải là <b className="numeric text-white">{so(x.tongDung)}n</b></>}
            </>
          ) : k.laChanso ? (
            <><b className="text-white">{x.soDung}/{trongChuoi.length} số đúng là đang chặn</b>{x.thieu.length > 0 && <> · <b style={{ color: MAU.sai.chu }}>sót {x.thieu.length} lô đang chặn</b></>}</>
          ) : (
            <><b className="text-white">{trongChuoi.length} số</b>: {trongChuoi.filter((lo) => luat.lo[lo].dung > 0).length} đang nhận, <b style={{ color: MAU.sai.chu }}>{trongChuoi.filter((lo) => luat.lo[lo].dung <= 0).length} đang CHẶN</b></>
          )}
          {x.nhom && <div>Chuỗi khớp trọn nhóm: <b className="text-white">{x.nhom}</b>.</div>}
          {x.chanLo && (
            <div data-check-chanlo>
              So với lệnh <b>/chanlo</b> (luật 2 bước):{" "}
              {x.chanLo.khop ? <b style={{ color: MAU.dung.chu }}>khớp đủ {trongChuoi.length} lô</b> : <b style={{ color: MAU.sai.chu }}>không khớp — thừa {x.chanLo.thua.length} ({x.chanLo.thua.join(" ") || "—"}), thiếu {x.chanLo.thieu.length} ({x.chanLo.thieu.join(" ") || "—"})</b>}
            </div>
          )}
          {!k.laChanso && x.thieu.length > 0 && (
            <div style={{ color: MAU["luu-y"].chu }} data-check-thieu>
              <b>Thiếu {x.thieu.length} lô đang nhận</b> không có trong chuỗi: <span className="numeric">{x.thieu.map((l) => l.lo).join(" ")}</span>. (Nếu anh copy theo một tiêu chí lọc khác thì bỏ qua dòng này.)
            </div>
          )}
          {x.luuY.map((t, i) => <div key={i} style={{ color: MAU["luu-y"].chu }}>• {t}</div>)}
          {la.map((e, i) => <div key={i} style={{ color: MAU.sai.chu }}>• {e.chu}</div>)}
        </div>

        <div className="text-[0.7rem] text-[var(--text-muted)] leading-snug">
          <b className="text-[var(--text-secondary)]">Từng số — về ngày nào, rơi vào ô nào, giá ô đó bao nhiêu.</b> Mười ô vuông là 10 kỳ gần nhất, từ{" "}
          <b className="text-white">{ddmm(luat.kyGan[0] ?? null)}</b> (trái) tới <b className="text-white">{ddmm(luat.ngayCuoi)}</b> (phải); ô <span className="text-[#34e6a8]">xanh</span> là kỳ số đó về.
        </div>

        {THU_TU_O.map((o) => {
          const ds = hien.filter((lo) => luat.lo[lo].oKhoa === o);
          if (ds.length === 0) return null;
          const l0 = luat.lo[ds[0]];
          return (
            <div key={o} className="rounded-lg border border-[var(--hairline)] overflow-hidden" data-check-o-lich={o}>
              <div className="px-3 py-1.5 text-[0.76rem] font-bold flex flex-wrap items-center gap-x-2" style={{ background: l0.mucO === 0 ? "rgba(220,38,38,0.16)" : "rgba(255,255,255,0.06)" }}>
                <span className="text-white">Ô “{l0.oTen}”</span>
                <span style={{ color: l0.mucO === 0 ? "#ff9d9d" : "#7ff0c0" }}>{l0.mucO === 0 ? "đang cài 0 = CHẶN" : `đang cài ${so(l0.mucO)}n`}</span>
                <span className="text-[var(--text-muted)] font-normal">· {ds.length} lô</span>
              </div>
              {ds.map((lo) => (
                <DongLo key={lo} l={luat.lo[lo]} ghi={coTien ? chuoiGhi.get(lo)?.diem ?? null : null} coTien={coTien} sai={saiCua.get(lo) ?? []} thieu={thieu.has(lo)} kyGan={luat.kyGan} chanLoKhop={!!x.chanLo?.khop} />
              ))}
            </div>
          );
        })}
        {hien.length === 0 && <p className="text-[0.76rem] text-[var(--text-muted)]">Không có số nào sai hay thiếu.</p>}
      </div>
    </section>
  );
}

function DongLo({ l, ghi, coTien, sai, thieu, kyGan, chanLoKhop }: { l: LuatLo; ghi: number | null; coTien: boolean; sai: string[]; thieu: boolean; kyGan: string[]; chanLoKhop: boolean }) {
  const hong = sai.length > 0;
  return (
    <div
      data-check-so={l.lo}
      data-kq={hong ? "sai" : thieu ? "thieu" : "dung"}
      className="px-3 py-2 border-t border-[var(--hairline)]"
      style={hong ? { background: "rgba(220,38,38,0.14)" } : thieu ? { background: "rgba(245,158,11,0.10)" } : undefined}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="numeric font-extrabold text-base text-white w-7">{l.lo}</span>
        <span className="flex gap-[2px]" title={kyGan.map((d, i) => `${ddmm(d)}: ${l.veGan[i] > 0 ? "về" : "không"}`).join(" · ")}>
          {kyGan.map((d, i) => (
            <span key={d} className="inline-block w-[11px] h-[11px] rounded-[2px]" style={{ background: l.veGan[i] > 0 ? "#34e6a8" : "rgba(255,255,255,0.10)" }} />
          ))}
        </span>
        <span className="ml-auto text-[0.76rem] numeric">
          {thieu ? (
            <b style={{ color: MAU["luu-y"].chu }}>KHÔNG có trong chuỗi · đúng {l.dung}n</b>
          ) : coTien ? (
            <>
              <span className="text-[var(--text-muted)]">chuỗi </span>
              <b style={{ color: hong ? MAU.sai.chu : "#fff" }}>{ghi}</b>
              <span className="text-[var(--text-muted)]"> · đúng </span>
              <b style={{ color: l.dung === 0 ? "#ff9d9d" : "#7ff0c0" }}>{l.dung === 0 ? "0 (chặn)" : l.dung}</b>{" "}
              {hong ? "❌" : chanLoKhop && ghi !== l.dung ? "✅ theo /chanlo" : "✅"}
            </>
          ) : (
            <b style={{ color: hong ? MAU.sai.chu : l.dung === 0 ? "#ff9d9d" : "#7ff0c0" }}>{l.dung === 0 ? "CHẶN" : `nhận ${l.dung}n`} {hong ? "❌" : ""}</b>
          )}
        </span>
      </div>
      <div className="text-[0.7rem] text-[var(--text-secondary)] mt-1 leading-snug">
        <span className="text-[var(--text-muted)]">Về trong 10 kỳ: </span>
        {l.cacNgayVe.length ? <b className="numeric text-white">{l.cacNgayVe.map(ddmm).join(", ")}</b> : <b className="text-white">không kỳ nào</b>}
        <span className="text-[var(--text-muted)]"> · </span>
        {canCu(l)}
      </div>
      {sai.map((t, i) => (
        <div key={i} className="text-[0.74rem] font-bold mt-0.5" style={{ color: MAU.sai.chu }}>❌ {t}</div>
      ))}
    </div>
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
        <div className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed" style={{ borderColor: MAU[x.mucDo].vien, background: MAU[x.mucDo].nen }} data-check-da-tom-tat>
          Bảng tiền đá đang chặn <b className="numeric text-white">{so(x.soCapLuat)} cặp</b> · chuỗi chặn <b className="numeric text-white">{so(x.soCapChuoi)} cặp</b>
          {x.capLap > 0 && <span className="text-[var(--text-muted)]"> (có {so(x.capLap)} cặp ghi lặp trong hai vòng — vô hại)</span>}.
          <div>
            Sót (bảng chặn mà chuỗi không chặn): <b style={{ color: x.thieu.length ? MAU.sai.chu : MAU.dung.chu }} data-check-da-thieu>{so(x.thieu.length)} cặp</b> · Chặn oan (bảng đang nhận):{" "}
            <b style={{ color: x.thua.length ? MAU.sai.chu : MAU.dung.chu }} data-check-da-thua>{so(x.thua.length)} cặp</b>
            {x.thuaLamTron > 0 && <> · chặn thêm do con chặn tròn: <b className="text-[#ffd24a]" data-check-da-lam-tron>{so(x.thuaLamTron)} cặp</b></>}
          </div>
          {x.loiDang.map((t, i) => <div key={i} style={{ color: MAU.sai.chu }}>❌ {t}</div>)}
          {x.luuY.map((t, i) => <div key={i} style={{ color: MAU["luu-y"].chu }}>• {t}</div>)}
        </div>

        {x.tron.length > 0 && (
          <div className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-[0.74rem] leading-relaxed" data-check-da-tron>
            <b className="text-white">{x.tron.length} con chặn tròn trong chuỗi</b> — mỗi con đang ở ngày nào và thật sự bị bảng chặn với bao nhiêu con (mức đã lưu:{" "}
            {x.rutGon ? `Rút gọn từ ${x.nguong}/99` : "Rút gọn tắt, phải đủ 99/99"}):
            <div className="mt-1 flex flex-wrap gap-1.5">
              {x.tron.map((t) => (
                <span key={t.con} className="numeric rounded px-1.5 py-0.5 border" style={{ borderColor: t.bac >= x.nguong ? "rgba(52,211,153,0.5)" : "rgba(251,191,36,0.6)", color: t.bac >= x.nguong ? "#c9f7e4" : "#ffe9c4" }}>
                  <b>{t.con}</b> · {tenBac(bac[t.con])} · {t.bac}/99
                </span>
              ))}
            </div>
          </div>
        )}

        {x.thieu.length > 0 && (
          <div className="rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2 text-[0.74rem] leading-relaxed" data-check-da-ds-thieu>
            <b style={{ color: MAU.sai.chu }}>Các cặp bị sót{x.thieu.length > 40 ? ` (40 đầu / ${so(x.thieu.length)})` : ""}:</b>
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
