"use client";

import { lyDoCua, type Draw, type Tier, type Weights } from "@/lib/sim-ai";

const WIN = 75_000;

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};

/**
 * The note behind one number on one day: why it was held at that level, and
 * what that decision cost or earned.
 *
 * Written as sentences rather than a stat block because the question it answers
 * is asked out loud — "tại sao con này, tại sao nó lỗ" — and a row of numbers
 * does not answer that. The last paragraph deliberately says whether the reason
 * was worth anything, since the honest answer is usually no and hiding that
 * would make the panel a machine for inventing confidence.
 */
export default function LoReason({
  lo,
  ngay,
  diem,
  ve,
  price,
  w,
  history,
  tiers,
  base,
  onClose,
}: {
  lo: string;
  ngay: string;
  diem: number;
  ve: number;
  price: number;
  w: Weights;
  history: Draw[];
  tiers?: Tier[];
  base: number;
  onClose: () => void;
}) {
  const ly = lyDoCua(w, history, lo, tiers, base);
  const thu = diem * price;
  const tra = diem * WIN * ve;
  const lai = thu - tra;

  // "0 ngày chưa về" là câu không ai nói. Gap là số kỳ kể từ lần về gần nhất,
  // nên 0 nghĩa là nó vừa về ngay kỳ trước.
  const khoTrong =
    ly.gap === 0 ? "vừa về ngay kỳ trước" :
    ly.gap === 1 ? "về cách đây 1 kỳ" :
    `đã ${ly.gap} kỳ chưa về`;

  const bacSo = tiers
    ? (() => {
        let k = 0;
        for (let i = 0; i < tiers.length; i++) {
          k += tiers[i].soLo;
          if (ly.hang <= k) return i + 1;
        }
        return tiers.length;
      })()
    : null;

  return (
    <div className="rounded-lg border border-[rgba(96,165,250,0.45)] bg-[rgba(37,99,235,0.12)] px-3 py-2.5 mb-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[0.82rem] font-bold text-white">
          Lô {lo} · ngày {ngay.slice(8, 10)}/{ngay.slice(5, 7)}
        </div>
        <button
          onClick={onClose}
          className="text-[0.7rem] text-[var(--text-muted)] hover:text-white shrink-0"
        >
          ✕ đóng
        </button>
      </div>

      <div>
        <div className="eyebrow text-[#a9c9ff]">Vì sao ôm mức này</div>
        <p className="text-[0.78rem] leading-relaxed text-[#dceaff]">
          Trước ngày đó, lô {lo} <b>{khoTrong}</b>, về{" "}
          <b>{ly.ve7} lượt trong 7 kỳ</b> gần nhất và <b>{ly.ve30} lượt trong 30 kỳ</b>
          {ly.kep && <>, lại là <b>số kép</b></>}
          {ly.chuoi > 0 && <>, đang có <b>chuỗi {ly.chuoi} kỳ</b> về liên tiếp</>}.{" "}
          {tiers ? (
            <>
              Chấm theo mấy điều đó thì nó đứng <b>hạng {ly.hang}/100</b>, rơi vào{" "}
              <b>bậc {bacSo}</b> — nên mức là <b>{diem}n</b>.
            </>
          ) : (
            <>
              AI chấm nó <b>hạng {ly.hang}/100</b> và cho nhận <b>{diem}n</b>.
            </>
          )}
        </p>
        {!tiers && ly.gop.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ly.gop.map((g) => (
              <span
                key={g.ten}
                className={`numeric text-[0.66rem] rounded px-1.5 py-0.5 border ${
                  g.day > 0
                    ? "bg-[rgba(16,185,129,0.14)] border-[rgba(16,185,129,0.4)] text-[#c9f4e0]"
                    : "bg-[rgba(220,38,38,0.18)] border-[rgba(248,113,113,0.4)] text-[#ffd9d9]"
                }`}
              >
                {g.ten} ({g.giaTri}) {g.day > 0 ? "kéo lên" : "kéo xuống"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="eyebrow text-[#a9c9ff]">Rồi ngày đó ra sao</div>
        <p className="text-[0.78rem] leading-relaxed text-[#dceaff]">
          {ve === 0 ? (
            <>
              Không về nháy nào. Thu vào <b>{diem}n × {tien(price)} = {tien(thu)}</b>, không
              phải trả đồng nào →{" "}
              <b className="text-[#7ff0c0]">ăn trọn {tien(lai)}</b>.
            </>
          ) : (
            <>
              Về <b>{ve} nháy</b>. Thu vào <b>{diem}n × {tien(price)} = {tien(thu)}</b>, phải trả{" "}
              <b>{diem}n × 75.000đ × {ve} = {tien(tra)}</b> →{" "}
              <b className={lai >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"}>
                {lai >= 0 ? "lời" : "lỗ"} {tien(Math.abs(lai))}
              </b>
              .{" "}
              {diem > 0 && (
                <>
                  Mỗi điểm thu vào {tien(price)} mà mỗi nháy về phải trả 75.000đ, nên con
                  này chỉ cần về là <b>mất gấp {(WIN / price).toFixed(1)} lần</b> tiền thu
                  của chính nó
                  {ve > 1 && <>, mà nó về tận {ve} nháy</>}.
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="text-[0.72rem] leading-relaxed text-[#a9c9ff] border-t border-[rgba(96,165,250,0.25)] pt-1.5">
        {ve > 0 && diem > 0 ? (
          <>
            Lưu ý: <b>{ly.gap === 0 ? "vừa về hôm trước không làm nó khó về lại" : `${ly.gap} kỳ chưa về không làm nó ít về hơn`}</b>.
            Bấm ô “Có Quy Luật Ẩn Không?” ở trên là thấy — mấy cách chọn này không cách nào
            hơn được bốc bừa. Nên con này lỗ không phải vì chọn sai, mà vì ôm nặng thì
            trúng là đau.
          </>
        ) : (
          <>
            Lưu ý: hôm nay ăn không có nghĩa là chọn đúng. Cũng con số đó, cũng lý do đó,
            hôm khác về 2 nháy là mất {tien(diem * WIN * 2 - thu)}.
          </>
        )}
      </div>
    </div>
  );
}
