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

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tenNgay = (i: number) => (i === 0 ? "vừa ra" : i >= TRAN ? `${TRAN}+ kỳ` : `${i} kỳ`);
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

interface OCuThe {
  i: number;
  j: number;
  nhan: NhanO;
  bien: number;
  conI: string[];
  conJ: string[];
  soCap: number;
}

/**
 * Kỳ tới đá con nào — bản đá của khối "Ngày Mai Ôm Sao" bên Dashboard.
 *
 * Người vận hành xem ba khối thống kê xong nói đúng chỗ thiếu: "ôm con nào thì
 * em không nói, nhìn không biết ôm con nào". Bảng cặp ngày nói "vừa ra + 2 kỳ
 * thì đẹp" nhưng không ai nhận cược theo tên ô — người ta nhận theo CON SỐ.
 * Nên khối này dịch mọi thứ ra con số: ngay lúc này con nào đang ở ngày nào,
 * và ô NÊN ÔM / NÉ RA là bộ con nào ghép với bộ con nào.
 *
 * Câu trả lời thật cho "ôm con nào" bên đá là: ôm hết, vì đá lời nhờ giá chứ
 * không nhờ chọn cặp. Khối này nói thẳng điều đó trước, rồi mới tới danh sách
 * nên ôm mạnh / nên né — kèm lời nhắc rằng mấy nhãn ấy còn yếu.
 */
export default function DaKyToi({ draws, ky, region }: { draws: DrawHits[]; ky: KyDa[]; region: Region }) {
  const toast = useToast();
  const [tra, setTra] = useState("");

  const tt = useMemo(() => khoKyToi(draws), [draws]);
  const tkt = useMemo(() => thongKeCapTheoThang(ky, region, TRAN), [ky, region]);

  const d = useMemo(() => {
    if (!tt || !tkt) return null;
    const nhom: string[][] = Array.from({ length: TRAN + 1 }, () => []);
    for (const lo of Object.keys(tt.kho).sort()) nhom[Math.min(TRAN, tt.kho[lo])].push(lo);
    const o: OCuThe[] = tkt.bang.map((x) => ({
      i: x.i,
      j: x.j,
      nhan: x.nhan,
      bien: x.bien,
      conI: nhom[x.i],
      conJ: nhom[x.j],
      soCap: x.i === x.j ? soVong(nhom[x.i].length) : nhom[x.i].length * nhom[x.j].length,
    }));
    const om = o.filter((x) => x.nhan === "om" && x.soCap > 0).sort((a, b) => b.bien - a.bien);
    const ne = o.filter((x) => x.nhan === "ne" && x.soCap > 0).sort((a, b) => a.bien - b.bien);
    return { nhom, o, om, ne, capNe: ne.reduce((s, x) => s + x.soCap, 0) };
  }, [tt, tkt]);

  if (!tt || !tkt || !d) return null;

  const chuan = bienDa(region);
  const tongCap = soVong(100);
  const thu = tongCap * GIA_DA[region];
  const traTB = tongCap * chuan.p * TRUNG_DA[region];

  const kyToi = (() => {
    const [y, m, dd2] = tt.ngayCuoi.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, dd2));
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  })();
  const treNgay = (() => {
    const n = new Date();
    const [y, m, dd2] = kyToi.split("-").map(Number);
    return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(y, m - 1, dd2)) / 86_400_000);
  })();

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

  // Tra một con: nó đang ở ngày nào, ghép với ai thì thuộc ô nào.
  const con = /^\d{2}$/.test(tra) ? tra : null;
  const ngayCon = con ? Math.min(TRAN, tt.kho[con]) : -1;
  const ghep = con
    ? d.o
        .filter((x) => x.i === ngayCon || x.j === ngayCon)
        .map((x) => {
          const kia = x.i === ngayCon ? x.j : x.i;
          return { ...x, kia, ban: d.nhom[kia].filter((l) => l !== con) };
        })
        .filter((x) => x.ban.length > 0)
    : [];

  return (
    <section className="plate rise rise-1">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">
            🌅 Kỳ Tới Đá Con Nào — {treNgay > 0 ? `kỳ kế sau ${dd(tt.ngayCuoi)}` : dd(kyToi)}
          </h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · từng con đang ở ngày nào, ghép với con nào thì nên ôm, con nào thì né
          </p>
        </div>
        <button onClick={() => copy(chuTheoNgay, "Đã copy 100 con theo ngày")} className="btn btn-primary text-xs shrink-0">
          📋 Copy theo ngày
        </button>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {treNgay > 0 && (
          <div className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(220,38,38,0.12)] px-3 py-2 text-[0.74rem] leading-relaxed text-[#ffd9d9]">
            ⚠️ Kho còn thiếu <b>{treNgay}</b> kỳ — kỳ mới nhất đã có kết quả là <b>{dd(tt.ngayCuoi)}</b>. Con nào
            đang ở ngày nào dưới đây là tính theo hôm đó, chưa phải hôm nay. Bấm <b>Cập nhật</b> bên Dashboard
            cho máy cào đủ rồi hãy dùng.
          </div>
        )}

        {/* Câu trả lời thẳng, đứng trước mọi danh sách. */}
        <div className="rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] px-3 py-2.5 text-[0.78rem] leading-relaxed text-[var(--text-secondary)]">
          <b className="text-white">Ôm con nào? — Bên đá thì ôm hết.</b> Đá lời nhờ <b>giá</b> ({pc(chuan.bien)}),
          không nhờ chọn con: cặp nào ghép từ 100 con cũng có phần ăn như nhau. Ôm đủ {tongCap.toLocaleString("vi-VN")}{" "}
          cặp mỗi cặp 1 điểm thì kỳ tới thu <b className="text-[#7ff0c0]">{tien(thu)}</b>, chờ đợi trả{" "}
          <b className="text-[#ff9d9d]">{tien(traTB)}</b>, chờ đợi lời <b className="text-[#7ff0c0]">{tien(thu - traTB)}</b>.
          <br />
          Danh sách dưới đây là phần <b>tinh chỉnh</b>: lịch sử cho thấy vài ô đẹp hơn, vài ô xấu hơn mức chung.
          Nhãn còn yếu (xem phép kiểm cuối khối Cặp Ngày), nên dùng để <b>giảm bớt</b> chứ đừng dùng để dồn tiền.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <DanhSach
            tieuDe={`Nên ôm — ${d.om.length} ô`}
            mau="#7ff0c0"
            nen="rgba(16,185,129,0.12)"
            vien="rgba(16,185,129,0.45)"
            ds={d.om}
            trong="Hiện không có ô nào đủ tiêu chuẩn NÊN ÔM."
          />
          <DanhSach
            tieuDe={`Nên né — ${d.ne.length} ô · ${d.capNe.toLocaleString("vi-VN")} cặp`}
            mau="#ff9d9d"
            nen="rgba(220,38,38,0.12)"
            vien="rgba(248,113,113,0.45)"
            ds={d.ne}
            trong="Hiện không có ô nào đủ tiêu chuẩn NÉ RA."
            nut={d.ne.length > 0 ? <button onClick={() => copy(chuNe, "Đã copy danh sách cặp nên né")} className="text-[0.66rem] font-bold text-[#ffb4b4] hover:text-white">📋 copy</button> : null}
          />
        </div>

        {/* Tra một con */}
        <div className="rounded-lg border border-[rgba(59,130,246,0.45)] bg-[rgba(37,99,235,0.08)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Tra một con</span>
            <input
              value={tra}
              onChange={(e) => setTra(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              placeholder="vd 27"
              className="w-20 bg-black/25 border border-[var(--hairline)] rounded-lg px-2 py-1 text-white numeric text-sm"
            />
            {con && (
              <span className="text-[0.76rem] text-[var(--text-secondary)]">
                Con <b className="text-white numeric">{con}</b> đang ở ngày <b className="text-white">{tenNgay(ngayCon)}</b>
              </span>
            )}
          </div>
          {con && (
            <div className="mt-2 space-y-1">
              {ghep.map((x) => (
                <div key={`${x.i}-${x.j}`} className="text-[0.72rem] leading-relaxed">
                  <span
                    className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold mr-1.5"
                    style={{
                      color: x.nhan === "om" ? "#7ff0c0" : x.nhan === "ne" ? "#ff9d9d" : "#c2d4ea",
                      background: "rgba(0,0,0,0.3)",
                    }}
                  >
                    {x.nhan === "om" ? "NÊN ÔM" : x.nhan === "ne" ? "NÉ RA" : "BÌNH THƯỜNG"}
                  </span>
                  <span className="text-[var(--text-muted)]">ghép với con {tenNgay(x.kia)} ({pc(x.bien)}):</span>{" "}
                  <span className="numeric text-[var(--text-secondary)]">{x.ban.join(" ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 100 con theo ngày */}
        <div>
          <div className="eyebrow mb-1.5">100 con đang ở ngày nào</div>
          <div className="space-y-1">
            {d.nhom.map((ds, i) => (
              <div key={i} className="flex gap-2 text-[0.74rem] leading-relaxed">
                <span className="shrink-0 w-[4.6rem] font-bold text-white">
                  {tenNgay(i)} <span className="font-normal text-[var(--text-muted)]">({ds.length})</span>
                </span>
                <span className="numeric text-[var(--text-secondary)] break-words">
                  {ds.length ? ds.join(" ") : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DanhSach({
  tieuDe, mau, nen, vien, ds, trong, nut,
}: {
  tieuDe: string; mau: string; nen: string; vien: string; ds: OCuThe[]; trong: string; nut?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ background: nen, borderColor: vien }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="eyebrow" style={{ color: mau }}>{tieuDe}</span>
        {nut}
      </div>
      {ds.length === 0 && <div className="text-[0.72rem] text-[var(--text-muted)]">{trong}</div>}
      <div className="space-y-1.5">
        {ds.map((x) => (
          <div key={`${x.i}-${x.j}`} className="text-[0.72rem] leading-relaxed">
            <b className="text-white">
              {x.i === x.j ? `hai con cùng ${tenNgay(x.i)}` : `${tenNgay(x.i)} + ${tenNgay(x.j)}`}
            </b>{" "}
            <span style={{ color: mau }}>{pc(x.bien)}</span>{" "}
            <span className="text-[var(--text-muted)]">· {x.soCap.toLocaleString("vi-VN")} cặp</span>
            <div className="numeric text-[var(--text-secondary)]">
              [{x.conI.join(" ")}]{x.i !== x.j && <> × [{x.conJ.join(" ")}]</>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
