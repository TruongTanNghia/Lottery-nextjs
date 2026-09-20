"use client";

import { useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import {
  GIA_DA, TRUNG_DA, bienDa, khoKyToi, soVong, thongKeCapTheoThang,
  type KyDa, type NhanO,
} from "@/lib/da";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const TRAN = 10;
const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tenNgay = (i: number) => (i === 0 ? "vừa ra" : i >= TRAN ? `${TRAN}+ kỳ` : `${i} kỳ`);
const nhanNgan = (i: number) => (i === 0 ? "mới" : i >= TRAN ? `${TRAN}+` : `${i}k`);
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

const XANH = { nen: "rgba(16,185,129,0.85)", vien: "#34e6a8", chu: "#04281c" };
const DO = { nen: "rgba(239,68,68,0.85)", vien: "#ff8a8a", chu: "#2b0606" };

interface OCuThe {
  i: number;
  j: number;
  nhan: NhanO;
  bien: number;
  conI: string[];
  conJ: string[];
  soCap: number;
}

type Chon = { kieu: "con"; lo: string } | { kieu: "o"; i: number; j: number } | null;

/**
 * Kỳ tới đá con nào — bản đá của khối "Ngày Mai Ôm Sao" bên Dashboard.
 *
 * Bản đầu của khối này đúng số nhưng khó dùng: nên ôm / nên né là những dãy
 * số dài trong ngoặc vuông, và người vận hành nói thẳng "con đó đá với con nào
 * em hiểu không — làm dày, anh không biết nhìn sao". Câu họ cần trả lời chỉ có
 * một, và nó là câu hỏi về MỘT con: khách vừa báo đá con 27 với con 45, nhận
 * hay không?
 *
 * Nên trung tâm của khối giờ là bảng 100 con. Bấm một con thì cả bảng đổi
 * màu theo đúng câu hỏi đó — xanh là ghép với nó thì nên ôm, đỏ là nên né,
 * còn lại mờ đi. Mắt trả lời trước, chữ chỉ để xác nhận.
 *
 * Câu trả lời thật cho "ôm con nào" bên đá vẫn là: ôm hết, vì đá lời nhờ giá.
 * Ba ô tiền trên cùng nói điều đó; phần xanh đỏ là tinh chỉnh, và có ghi rõ.
 */
export default function DaKyToi({ draws, ky, region }: { draws: DrawHits[]; ky: KyDa[]; region: Region }) {
  const toast = useToast();
  const [chon, setChon] = useState<Chon>(null);
  const [go, setGo] = useState("");
  const [moDanhSach, setMoDanhSach] = useState(false);

  const tt = useMemo(() => khoKyToi(draws), [draws]);
  const tkt = useMemo(() => thongKeCapTheoThang(ky, region, TRAN), [ky, region]);

  const d = useMemo(() => {
    if (!tt || !tkt) return null;
    const bac: Record<string, number> = {};
    const nhom: string[][] = Array.from({ length: TRAN + 1 }, () => []);
    for (const lo of LOS) {
      bac[lo] = Math.min(TRAN, tt.kho[lo]);
      nhom[bac[lo]].push(lo);
    }
    const nhanO = new Map<string, { nhan: NhanO; bien: number }>();
    const o: OCuThe[] = tkt.bang.map((x) => {
      nhanO.set(`${x.i}-${x.j}`, { nhan: x.nhan, bien: x.bien });
      return {
        i: x.i, j: x.j, nhan: x.nhan, bien: x.bien,
        conI: nhom[x.i], conJ: nhom[x.j],
        soCap: x.i === x.j ? soVong(nhom[x.i].length) : nhom[x.i].length * nhom[x.j].length,
      };
    });
    const om = o.filter((x) => x.nhan === "om" && x.soCap > 0).sort((a, b) => b.bien - a.bien);
    const ne = o.filter((x) => x.nhan === "ne" && x.soCap > 0).sort((a, b) => a.bien - b.bien);
    return { bac, nhom, nhanO, om, ne };
  }, [tt, tkt]);

  if (!tt || !tkt || !d) return null;

  const chuan = bienDa(region);
  const tongCap = soVong(100);
  const thu = tongCap * GIA_DA[region];
  const traTB = tongCap * chuan.p * TRUNG_DA[region];

  const kyToi = (() => {
    const [y, m, n] = tt.ngayCuoi.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, n));
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  })();
  const treNgay = (() => {
    const n = new Date();
    const [y, m, k] = kyToi.split("-").map(Number);
    return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(y, m - 1, k)) / 86_400_000);
  })();

  /** Con `kia` ghép với con đang chọn thì thuộc nhãn nào. */
  const nhanVoi = (lo: string, kia: string): NhanO => {
    const a = d.bac[lo], b = d.bac[kia];
    return d.nhanO.get(`${Math.min(a, b)}-${Math.max(a, b)}`)?.nhan ?? "chua";
  };

  const conChon = chon?.kieu === "con" ? chon.lo : null;
  const ban = conChon
    ? {
        om: LOS.filter((l) => l !== conChon && nhanVoi(conChon, l) === "om"),
        ne: LOS.filter((l) => l !== conChon && nhanVoi(conChon, l) === "ne"),
      }
    : null;

  const copy = async (chu: string, bao: string) => {
    try {
      await navigator.clipboard.writeText(chu);
      toast.show("success", bao);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };
  const chuTheoNgay = d.nhom.map((ds, i) => `${tenNgay(i)} (${ds.length} con): ${ds.join(" ")}`).join("\n");
  const chuNe = d.ne.map((x) => `NÉ ${tenNgay(x.i)} x ${tenNgay(x.j)}: [${x.conI.join(" ")}] x [${x.conJ.join(" ")}]`).join("\n");

  /** Màu một ô trên bảng, tuỳ đang chọn gì. */
  const mauO = (lo: string): React.CSSProperties => {
    const b = d.bac[lo];
    const goc = { background: `rgba(56,189,248,${(0.5 - b * 0.042).toFixed(3)})`, color: "#fff", borderColor: "transparent" };
    if (!chon) return goc;
    if (chon.kieu === "con") {
      if (lo === chon.lo) return { background: "#2563eb", color: "#fff", borderColor: "#fff" };
      const n = nhanVoi(chon.lo, lo);
      if (n === "om") return { background: XANH.nen, color: XANH.chu, borderColor: XANH.vien };
      if (n === "ne") return { background: DO.nen, color: DO.chu, borderColor: DO.vien };
      return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", borderColor: "transparent" };
    }
    if (b === chon.i) return { background: "#2563eb", color: "#fff", borderColor: "#9cc2ff" };
    if (b === chon.j) return { background: "#0d9488", color: "#fff", borderColor: "#7ff0e0" };
    return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", borderColor: "transparent" };
  };

  const bamCon = (lo: string) => {
    const moi = conChon === lo ? null : ({ kieu: "con", lo } as const);
    setChon(moi);
    setGo(moi ? lo : "");
  };

  return (
    <section className="plate rise rise-1">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">
            🌅 Kỳ Tới Đá Con Nào — {treNgay > 0 ? `kỳ kế sau ${dd(tt.ngayCuoi)}` : dd(kyToi)}
          </h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · bấm vào một con để xem nó đá với con nào thì nên ôm, con nào thì né
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {treNgay > 0 && (
          <div className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(220,38,38,0.12)] px-3 py-2 text-[0.74rem] leading-relaxed text-[#ffd9d9]">
            ⚠️ Kho còn thiếu <b>{treNgay}</b> kỳ — kỳ mới nhất đã có kết quả là <b>{dd(tt.ngayCuoi)}</b>. Bảng dưới
            tính theo hôm đó. Bấm <b>Cập nhật</b> bên Dashboard cho máy cào đủ rồi hãy dùng.
          </div>
        )}

        {/* Câu trả lời thẳng: ba ô tiền, một câu. */}
        <div className="grid grid-cols-3 gap-2">
          <OTien nhan="Ôm hết 4.950 cặp" gt={tien(thu)} phu="thu mỗi kỳ, 1 điểm/cặp" m="#34e6a8" />
          <OTien nhan="Chờ đợi trả" gt={tien(traTB)} phu={`${(chuan.p * 100).toFixed(2)}% cặp cùng về`} m="#ff6b78" />
          <OTien nhan="Chờ đợi lời" gt={"+" + tien(thu - traTB)} phu={`phần ăn ${pc(chuan.bien)}`} m="#ffd24a" />
        </div>
        <div className="text-[0.74rem] leading-relaxed text-[var(--text-secondary)] -mt-1">
          <b className="text-white">Bên đá thì ôm hết</b> — đá lời nhờ <b>giá</b>, không nhờ chọn con. Màu xanh đỏ dưới
          đây chỉ là <b>tinh chỉnh</b>: nhãn còn yếu, dùng để giảm bớt cặp xấu chứ đừng dồn tiền theo.
        </div>

        {/* ── Bảng 100 con ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--hairline)] bg-black/20 p-2.5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="eyebrow">Bấm một con — hoặc gõ</span>
            <input
              value={go}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                setGo(v);
                setChon(v.length === 2 ? { kieu: "con", lo: v } : null);
              }}
              inputMode="numeric"
              placeholder="vd 27"
              className="w-16 bg-black/30 border border-[var(--hairline)] rounded-lg px-2 py-1 text-white numeric text-sm text-center"
            />
            {chon && (
              <button
                onClick={() => { setChon(null); setGo(""); }}
                className="ml-auto px-2 py-1 rounded-lg text-[0.68rem] font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              >
                ✕ Bỏ chọn
              </button>
            )}
          </div>

          <div className="grid grid-cols-10 gap-1" data-bang-con>
            {LOS.map((lo) => (
              <button
                key={lo}
                onClick={() => bamCon(lo)}
                data-lo={lo}
                title={`Con ${lo} · ${tenNgay(d.bac[lo])}`}
                className="rounded-md border py-1 leading-none transition-colors"
                style={mauO(lo)}
              >
                <div className="numeric text-[0.78rem] font-extrabold">{lo}</div>
                <div className="text-[0.5rem] mt-0.5 opacity-80">{nhanNgan(d.bac[lo])}</div>
              </button>
            ))}
          </div>

          {/* Chú giải đổi theo thứ đang chọn, để màu nào cũng có tên. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[0.66rem] text-[var(--text-muted)]">
            {!chon && (
              <>
                <Cham m="rgba(56,189,248,0.5)" chu="mới = vừa ra" />
                <Cham m="rgba(56,189,248,0.25)" chu="5k = 5 kỳ chưa về" />
                <Cham m="rgba(56,189,248,0.08)" chu="10+ = khô lâu" />
              </>
            )}
            {chon?.kieu === "con" && (
              <>
                <Cham m="#2563eb" chu={`con đang chọn (${chon.lo})`} />
                <Cham m={XANH.nen} chu="đá với nó: nên ôm" />
                <Cham m={DO.nen} chu="đá với nó: nên né" />
                <Cham m="rgba(255,255,255,0.12)" chu="bình thường" />
              </>
            )}
            {chon?.kieu === "o" && (
              <>
                <Cham m="#2563eb" chu={`bộ ${tenNgay(chon.i)}`} />
                {chon.i !== chon.j && <Cham m="#0d9488" chu={`bộ ${tenNgay(chon.j)}`} />}
                <span>— mỗi con bộ này ghép với mỗi con bộ kia</span>
              </>
            )}
          </div>
        </div>

        {/* ── Kết quả của con đang chọn ───────────────────────────── */}
        {conChon && ban && (
          <div className="rounded-xl border border-[rgba(59,130,246,0.5)] bg-[rgba(37,99,235,0.1)] px-3 py-2.5 space-y-2" data-ket-qua-con>
            <div className="flex items-baseline gap-2">
              <span className="numeric text-2xl font-extrabold text-white leading-none">{conChon}</span>
              <span className="text-[0.78rem] text-[var(--text-secondary)]">
                đang ở ngày <b className="text-white">{tenNgay(d.bac[conChon])}</b>
              </span>
            </div>
            {ban.om.length === 0 && ban.ne.length === 0 ? (
              <div className="text-[0.76rem] text-[var(--text-secondary)]">
                Con này đá với con nào cũng <b className="text-white">bình thường</b> — cứ nhận như mọi cặp khác.
              </div>
            ) : (
              <>
                <HangVien tieuDe={`Đá với ${ban.om.length} con này thì NÊN ÔM`} ds={ban.om} kieu="om" bam={bamCon} />
                <HangVien tieuDe={`Đá với ${ban.ne.length} con này thì NÊN NÉ`} ds={ban.ne} kieu="ne" bam={bamCon} />
                <div className="text-[0.68rem] text-[var(--text-muted)]">
                  {99 - ban.om.length - ban.ne.length} con còn lại: bình thường.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Ô nên ôm / nên né, bằng viên số ─────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <KhoiO
            tieuDe="Nên ôm" ds={d.om} kieu="om" chon={chon}
            trong="Hiện không có cặp ngày nào đủ tiêu chuẩn NÊN ÔM."
            bam={(x) => { setGo(""); setChon(chon?.kieu === "o" && chon.i === x.i && chon.j === x.j ? null : { kieu: "o", i: x.i, j: x.j }); }}
          />
          <KhoiO
            tieuDe="Nên né" ds={d.ne} kieu="ne" chon={chon}
            trong="Hiện không có cặp ngày nào đủ tiêu chuẩn NÉ RA."
            bam={(x) => { setGo(""); setChon(chon?.kieu === "o" && chon.i === x.i && chon.j === x.j ? null : { kieu: "o", i: x.i, j: x.j }); }}
            nut={d.ne.length > 0 ? (
              <button onClick={() => copy(chuNe, "Đã copy danh sách cặp nên né")} className="text-[0.66rem] font-bold text-[#ffb4b4] hover:text-white">
                📋 copy
              </button>
            ) : null}
          />
        </div>

        {/* ── Dạng danh sách, để copy ─────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMoDanhSach((v) => !v)} className="text-[0.74rem] font-bold text-[#8fd0ff] hover:text-white">
              {moDanhSach ? "▾" : "▸"} Xem dạng danh sách — 100 con theo ngày
            </button>
            <button onClick={() => copy(chuTheoNgay, "Đã copy 100 con theo ngày")} className="text-[0.7rem] font-bold text-[#c2d4ea] hover:text-white">
              📋 Copy theo ngày
            </button>
          </div>
          {moDanhSach && (
            <div className="mt-2 space-y-1.5" data-danh-sach-ngay>
              {d.nhom.map((ds, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="shrink-0 w-[4.4rem] text-[0.72rem] font-bold text-white pt-0.5">
                    {tenNgay(i)} <span className="font-normal text-[var(--text-muted)]">({ds.length})</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ds.length === 0 && <span className="text-[0.72rem] text-[var(--text-muted)]">—</span>}
                    {ds.map((lo) => (
                      <button key={lo} onClick={() => bamCon(lo)} data-vien className="numeric text-[0.7rem] font-bold rounded px-1.5 py-0.5 bg-white/[0.08] text-[#dbe7f7] hover:bg-white/[0.18]">
                        {lo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OTien({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-2.5 py-2">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-base leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.6rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}

function Cham({ m, chu }: { m: string; chu: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: m }} />
      {chu}
    </span>
  );
}

function Vien({ lo, kieu, bam }: { lo: string; kieu: "om" | "ne" | "a" | "b"; bam?: (lo: string) => void }) {
  const m =
    kieu === "om" ? { background: "rgba(16,185,129,0.22)", color: "#7ff0c0", borderColor: "rgba(16,185,129,0.55)" }
    : kieu === "ne" ? { background: "rgba(239,68,68,0.2)", color: "#ffb4b4", borderColor: "rgba(248,113,113,0.55)" }
    : kieu === "a" ? { background: "rgba(37,99,235,0.3)", color: "#cfe0ff", borderColor: "rgba(96,165,250,0.6)" }
    : { background: "rgba(13,148,136,0.3)", color: "#c4f5ee", borderColor: "rgba(45,212,191,0.6)" };
  return (
    <button
      onClick={bam ? (e) => { e.stopPropagation(); bam(lo); } : undefined}
      data-vien
      className="numeric text-[0.72rem] font-bold rounded border px-1.5 py-0.5 leading-tight"
      style={m}
    >
      {lo}
    </button>
  );
}

function HangVien({ tieuDe, ds, kieu, bam }: { tieuDe: string; ds: string[]; kieu: "om" | "ne"; bam: (lo: string) => void }) {
  if (ds.length === 0) return null;
  return (
    <div>
      <div className="text-[0.72rem] font-bold mb-1" style={{ color: kieu === "om" ? "#7ff0c0" : "#ffb4b4" }}>{tieuDe}</div>
      <div className="flex flex-wrap gap-1">
        {ds.map((lo) => <Vien key={lo} lo={lo} kieu={kieu} bam={bam} />)}
      </div>
    </div>
  );
}

function KhoiO({
  tieuDe, ds, kieu, chon, bam, trong, nut,
}: {
  tieuDe: string; ds: OCuThe[]; kieu: "om" | "ne"; chon: Chon;
  bam: (x: OCuThe) => void; trong: string; nut?: React.ReactNode;
}) {
  const om = kieu === "om";
  return (
    <div
      className="rounded-xl border px-2.5 py-2.5"
      style={{
        background: om ? "rgba(16,185,129,0.08)" : "rgba(220,38,38,0.08)",
        borderColor: om ? "rgba(16,185,129,0.4)" : "rgba(248,113,113,0.4)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow" style={{ color: om ? "#7ff0c0" : "#ffb4b4" }}>
          {tieuDe} — {ds.length} cặp ngày
        </span>
        {nut}
      </div>
      {ds.length === 0 && <div className="text-[0.72rem] text-[var(--text-muted)]">{trong}</div>}
      <div className="space-y-2">
        {ds.map((x) => {
          const dang = chon?.kieu === "o" && chon.i === x.i && chon.j === x.j;
          return (
            <div
              key={`${x.i}-${x.j}`}
              role="button"
              tabIndex={0}
              onClick={() => bam(x)}
              onKeyDown={(e) => e.key === "Enter" && bam(x)}
              data-o-cap
              className="rounded-lg border px-2 py-2 cursor-pointer transition-colors"
              style={{
                borderColor: dang ? "#60a5fa" : "var(--hairline)",
                background: dang ? "rgba(37,99,235,0.18)" : "rgba(0,0,0,0.18)",
              }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-[0.76rem]">
                <b className="text-white">
                  {x.i === x.j ? `hai con cùng ${tenNgay(x.i)}` : `${tenNgay(x.i)} × ${tenNgay(x.j)}`}
                </b>
                <b className="numeric" style={{ color: om ? "#7ff0c0" : "#ff9d9d" }}>{pc(x.bien)}</b>
                <span className="text-[0.66rem] text-[var(--text-muted)]">{x.soCap.toLocaleString("vi-VN")} cặp</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {x.conI.map((lo) => <Vien key={lo} lo={lo} kieu="a" />)}
              </div>
              {x.i !== x.j && (
                <>
                  <div className="text-[0.66rem] text-[var(--text-muted)] my-1">× ghép với</div>
                  <div className="flex flex-wrap gap-1">
                    {x.conJ.map((lo) => <Vien key={lo} lo={lo} kieu="b" />)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {ds.length > 0 && (
        <div className="mt-1.5 text-[0.64rem] text-[var(--text-muted)]">Bấm một ô để bảng 100 con sáng lên đúng hai bộ đó.</div>
      )}
    </div>
  );
}
