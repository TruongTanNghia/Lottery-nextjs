"use client";

import { useMemo, useState } from "react";
import {
  DIP_TOI_THIEU, SO_O_DA, TRAN_DA, kiemThuDa, thongKeCapTheoThang, thongKeDa,
  type KyDa, type OCapDayDu,
} from "@/lib/da";
import { REGION_LABELS, type Region } from "@/lib/types";

const TRAN = TRAN_DA;

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  return `${s}${(a / 1_000_000).toFixed(1)}tr`;
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const tenNgay = (i: number) => (i === 0 ? "vừa ra" : i >= TRAN ? `${TRAN}+ kỳ` : `${i} kỳ`);
const tenCot = (i: number) => (i === 0 ? "vừa ra" : i >= TRAN ? `${TRAN}+` : `${i}`);
const tenCap = (o: { i: number; j: number }) =>
  o.i === o.j ? `hai con cùng ${tenNgay(o.i)}` : `${tenNgay(o.i)} + ${tenNgay(o.j)}`;

const NHAN = {
  om: { chu: "NÊN ÔM", mau: "#7ff0c0", nen: "rgba(16,185,129,0.16)", vien: "rgba(16,185,129,0.5)" },
  ne: { chu: "NÉ RA", mau: "#ff9d9d", nen: "rgba(220,38,38,0.16)", vien: "rgba(248,113,113,0.45)" },
  chua: { chu: "CHƯA CHẮC", mau: "#c2d4ea", nen: "rgba(255,255,255,0.07)", vien: "var(--hairline)" },
} as const;

type Loc = { kieu: "ngay"; ngay: number } | { kieu: "om" } | { kieu: "ne" };

/**
 * Cặp ngày nào đẹp nhất — cùng khuôn với "Ngày Nào Đẹp Nhất" bên Dashboard.
 *
 * Bên lô một nhóm là một bậc ngày; bên đá một nhóm là một CẶP bậc ngày, vì vé
 * đá ghép hai con. Từ vừa ra tới 10 là 11 bậc, ghép ra 66 ô. Mỗi ô một thẻ:
 * nhãn, chip từng tháng, dòng tiền — y như thẻ nhóm bên lô để đọc quen tay.
 *
 * 66 thẻ xếp dọc thì không ai đọc nổi, nên chọn một ngày rồi xem 11 thẻ ghép
 * với ngày đó; lưới màu ở trên để nhìn toàn cảnh và bấm nhảy tới.
 */
export default function DaCapNgay({ ky, region }: { ky: KyDa[]; region: Region }) {
  const [loc, setLoc] = useState<Loc>({ kieu: "ngay", ngay: 0 });

  const tk = useMemo(() => thongKeDa(ky, region, TRAN), [ky, region]);
  const tkt = useMemo(() => thongKeCapTheoThang(ky, region, TRAN), [ky, region]);
  const kt = useMemo(() => kiemThuDa(ky, region, TRAN), [ky, region]);

  if (!tk || !tkt) return null;

  const the = tkt.bang.filter((o) =>
    loc.kieu === "ngay" ? o.i === loc.ngay || o.j === loc.ngay : o.nhan === loc.kieu
  );
  const tenThangChay = Number(tkt.thangDangChay.slice(5));

  return (
    <section className="plate rise rise-3">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🎯 Cặp Ngày Nào Đẹp Nhất</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · ghép hai con theo số kỳ chưa về, từ vừa ra tới {TRAN}+ · {SO_O_DA} ô
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.78rem] leading-relaxed">
          <b className="text-white">Mình là người ôm số</b>: cặp nào <b>không cùng về</b> thì mình ăn trọn
          tiền, cặp nào <b>cả hai cùng về</b> thì mình trả. Nên ô nào cùng về <b>ÍT hơn</b> mức chung thì
          ôm ô đó có lời hơn.
          <br />
          Đo trên <b className="text-[var(--text-secondary)]">{tk.soKy} kỳ</b>,{" "}
          <b className="text-[var(--text-secondary)]">{tk.tong.dip.toLocaleString("vi-VN")} cặp</b>. Mức chung:{" "}
          <b className="text-[var(--text-secondary)]">{(tk.chuan.p * 100).toFixed(2)}%</b> số cặp cả hai cùng về
          — đo thật ra <b className="text-white">{(tk.tong.tyLe * 100).toFixed(2)}%</b>. Phần ăn cả sổ{" "}
          <b style={{ color: mau(tk.tong.bien) }}>{pc(tk.tong.bien)}</b> (theo giá là {pc(tk.chuan.bien)}).
          <br />
          Đang có <b className="text-[#7ff0c0]">{tkt.soOm} ô NÊN ÔM</b> (lời ở mọi tháng đủ lẫn cả quãng) và{" "}
          <b className="text-[#ff9d9d]">{tkt.soNe} ô NÉ RA</b> (lỗ ở mọi tháng đủ).
        </div>

        <Luoi bang={tkt.bang} chon={loc.kieu === "ngay" ? loc.ngay : -1} bam={(n) => setLoc({ kieu: "ngay", ngay: n })} />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">Xem thẻ</span>
          {Array.from({ length: TRAN + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => setLoc({ kieu: "ngay", ngay: i })}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                loc.kieu === "ngay" && loc.ngay === i
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {tenCot(i)}
            </button>
          ))}
          <button
            onClick={() => setLoc({ kieu: "om" })}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
              loc.kieu === "om" ? "bg-[#059669] text-white" : "bg-[rgba(16,185,129,0.15)] text-[#7ff0c0] hover:bg-[rgba(16,185,129,0.25)]"
            }`}
          >
            Nên ôm ({tkt.soOm})
          </button>
          <button
            onClick={() => setLoc({ kieu: "ne" })}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
              loc.kieu === "ne" ? "bg-[#dc2626] text-white" : "bg-[rgba(220,38,38,0.15)] text-[#ff9d9d] hover:bg-[rgba(220,38,38,0.25)]"
            }`}
          >
            Né ra ({tkt.soNe})
          </button>
        </div>

        <div className="eyebrow text-[var(--text-muted)]">
          {loc.kieu === "ngay"
            ? `Con ${tenNgay(loc.ngay)} ghép với từng ngày — ${the.length} ô`
            : loc.kieu === "om"
            ? `Những ô đang gắn nhãn NÊN ÔM — ${the.length} ô`
            : `Những ô đang gắn nhãn NÉ RA — ${the.length} ô`}
        </div>

        <div className="space-y-1.5">
          {the.length === 0 && (
            <div className="text-[0.76rem] text-[var(--text-muted)]">Không có ô nào ở nhãn này.</div>
          )}
          {the.map((o) => (
            <The key={`${o.i}-${o.j}`} o={o} thangChay={tkt.thangDangChay} chuanP={tk.chuan.p} soKy={tk.soKy} />
          ))}
        </div>

        {kt && (
          <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
            <div className="eyebrow mb-1 text-[#ffd24a]">Chọn ô theo bảng trên có ăn thật không?</div>
            Bảng trên nói cái đã xảy ra. Muốn biết nó có dùng được không thì phải chọn ô bằng{" "}
            <b>{kt.kyHoc} kỳ đầu</b>, rồi đem đúng mấy ô đó chơi <b>{kt.kyThi} kỳ sau</b> — những kỳ lúc chọn
            chưa hề nhìn thấy:
            <ul className="mt-1 space-y-0.5">
              <li>
                • Chỉ ôm <b>{kt.soOChon}/{kt.soO} ô có lời ở nửa đầu</b>:{" "}
                <b style={{ color: mau(kt.bienChon) }}>{pc(kt.bienChon)}</b> ({kt.laiChon >= 0 ? "+" : ""}
                {tien(kt.laiChon)})
              </li>
              <li>
                • Cứ ôm đều <b>mọi ô</b>: <b style={{ color: mau(kt.bienTatCa) }}>{pc(kt.bienTatCa)}</b> (
                {kt.laiTatCa >= 0 ? "+" : ""}{tien(kt.laiTatCa)})
              </li>
            </ul>
            <div className="mt-1">
              {kt.bienChon > kt.bienTatCa + 1
                ? "Chọn ô cho phần ăn cao hơn ôm đều ở nửa sau — đáng theo dõi thêm, nhưng nhớ là ôm ít ô hơn thì tiền về cũng ít hơn."
                : "Chọn ô không hơn gì ôm đều ở nửa sau. Phần ăn của đá đến từ GIÁ, không đến từ việc chọn cặp ngày — ô đẹp ở nửa đầu không giữ được sang nửa sau."}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function The({ o, thangChay, chuanP, soKy }: { o: OCapDayDu; thangChay: string; chuanP: number; soKy: number }) {
  const n = NHAN[o.nhan];
  const itCap = o.dip < DIP_TOI_THIEU * 6;
  return (
    <div className="rounded-lg border px-3 py-2" style={{ background: n.nen, borderColor: n.vien }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold text-white text-[0.9rem]">{tenCap(o)}</span>
        <span className="rounded px-1.5 py-0.5 text-[0.66rem] font-bold tracking-wide" style={{ color: n.mau, background: "rgba(0,0,0,0.28)" }}>
          {n.chu}
        </span>
        {itCap && (
          <span
            className="rounded px-1.5 py-0.5 text-[0.66rem] font-bold text-[#ffd24a]"
            style={{ background: "rgba(0,0,0,0.28)" }}
            title="Ít cặp rơi vào ô này — con số rất dễ là may rủi"
          >
            ⚠ ÍT CẶP
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {o.theoThang.map((t) => {
          const chay = t.thang === thangChay;
          return (
            <span
              key={t.thang}
              title={`${t.dip.toLocaleString("vi-VN")} cặp trong tháng này, ${t.caHai.toLocaleString("vi-VN")} cặp cả hai cùng về`}
              className={`numeric text-[0.68rem] rounded px-1.5 py-0.5 border ${chay ? "font-bold" : ""} ${
                t.bien == null
                  ? "border-[rgba(251,191,36,0.45)] text-[#ffd24a] bg-[rgba(245,158,11,0.1)]"
                  : t.bien > 0
                  ? "border-[rgba(16,185,129,0.4)] text-[#7ff0c0] bg-[rgba(16,185,129,0.1)]"
                  : "border-[rgba(248,113,113,0.4)] text-[#ff9d9d] bg-[rgba(220,38,38,0.1)]"
              }`}
            >
              {chay ? "THÁNG " : "T"}{Number(t.thang.slice(5))}{" "}
              {t.bien == null ? `ít cặp (${t.dip})` : pc(t.bien)}
            </span>
          );
        })}
      </div>

      <div className="text-[0.72rem] mt-1.5 leading-relaxed text-[var(--text-secondary)]">
        Ôm <b>1 điểm</b> mỗi cặp ô này (cả {soKy} kỳ): thu <b className="text-[#7ff0c0]">{tien(o.thu)}</b>, trả{" "}
        <b className="text-[#ff9d9d]">{tien(o.tra)}</b> →{" "}
        <b style={{ color: mau(o.lai) }}>{o.lai >= 0 ? "lời" : "lỗ"} {tien(Math.abs(o.lai))}</b> ({pc(o.bien)})
      </div>
      <div className="text-[0.66rem] text-[var(--text-muted)] mt-0.5 numeric">
        {o.dip.toLocaleString("vi-VN")} cặp · cả hai cùng về {(o.tyLe * 100).toFixed(2)}% (mức chung{" "}
        {(chuanP * 100).toFixed(2)}%)
      </div>
    </div>
  );
}

/** Lưới toàn cảnh: mỗi ô là phần ăn của một cặp ngày. Bấm hàng/cột để lọc thẻ. */
function Luoi({ bang, chon, bam }: { bang: OCapDayDu[]; chon: number; bam: (n: number) => void }) {
  const m = new Map(bang.map((x) => [`${x.i}-${x.j}`, x]));
  const nen = (bien: number) => {
    const d = Math.max(-8, Math.min(8, bien)) / 8;
    return d >= 0 ? `rgba(16,185,129,${(0.08 + d * 0.32).toFixed(3)})` : `rgba(220,38,38,${(0.08 + -d * 0.32).toFixed(3)})`;
  };
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-[0.62rem] border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="text-[var(--text-muted)] font-semibold px-1">ngày</th>
              {Array.from({ length: TRAN + 1 }, (_, j) => (
                <th key={j} className="px-0.5">
                  <button onClick={() => bam(j)} className={`numeric font-semibold px-1 rounded ${chon === j ? "text-white bg-[#2563eb]" : "text-[var(--text-muted)]"}`}>
                    {tenCot(j)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TRAN + 1 }, (_, i) => (
              <tr key={i}>
                <th className="text-right px-0.5">
                  <button onClick={() => bam(i)} className={`numeric font-semibold px-1 rounded ${chon === i ? "text-white bg-[#2563eb]" : "text-[var(--text-muted)]"}`}>
                    {tenCot(i)}
                  </button>
                </th>
                {Array.from({ length: TRAN + 1 }, (_, j) => {
                  if (j < i) return <td key={j} />;
                  const o = m.get(`${i}-${j}`);
                  if (!o) return <td key={j} className="text-[var(--text-muted)] text-center">·</td>;
                  const sang = chon === i || chon === j;
                  return (
                    <td key={j}>
                      <div
                        title={`${tenCap(o)} · ${o.dip.toLocaleString("vi-VN")} cặp · ${NHAN[o.nhan].chu}`}
                        className="rounded px-1 py-1 numeric font-bold text-center"
                        style={{
                          background: nen(o.bien),
                          color: mau(o.bien),
                          opacity: chon < 0 || sang ? 1 : 0.4,
                          outline: o.nhan === "om" ? "1.5px solid #34e6a8" : o.nhan === "ne" ? "1.5px solid #ff6b78" : "none",
                        }}
                      >
                        {o.bien >= 0 ? "+" : "−"}{Math.abs(o.bien).toFixed(1)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[0.66rem] text-[var(--text-muted)] leading-relaxed">
        Toàn cảnh {SO_O_DA} ô — số trong ô là phần ăn (%). Viền xanh là NÊN ÔM, viền đỏ là NÉ RA. Bấm tên ngày
        để xem thẻ chi tiết của ngày đó ở dưới.
      </div>
    </div>
  );
}
