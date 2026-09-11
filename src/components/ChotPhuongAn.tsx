"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import type { Schedule } from "@/lib/limit-engine";
import { xepHangPhuongAn, type XepHangPA } from "@/lib/chan-o";
import type { Region } from "@/lib/types";

const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");

/**
 * Xếp hạng mọi phương án, để chốt một cái.
 *
 * Người vận hành đóng lại cả chuỗi bằng một câu rất gọn: "thử giúp em xem
 * phương án nào về lâu dài có lợi nhuận nhất, rồi anh em chốt phương án."
 *
 * Câu đó có sẵn một cái bẫy. Xếp mười phương án thì bao giờ cũng có một cái
 * đứng đầu, kể cả khi cả mười đều là tiếng ồn — và càng nhiều phương án đem
 * ra so, cái đứng đầu càng dễ chỉ là cái gặp may nhất. Nên bảng này trộn
 * thẳng năm phương án BỐC BỪA vào cùng danh sách, xếp chung một hạng. Bốc bừa
 * leo lên top thì bảng tự nó nói rằng chưa có gì để chốt.
 *
 * Và xếp theo TIỀN, không theo biên. Họ vừa hỏi đúng chỗ này — "biên cao là
 * nhận ít hơn lời nhiều hơn đúng không" — mà câu trả lời là không: chặn bớt
 * số thì mẫu số nhỏ lại nên biên dễ đẹp trong khi tiền teo đi.
 */
export default function ChotPhuongAn({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [cachDo, setCachDo] = useState<"bang" | "deu">("bang");

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setSched(null);
    Promise.allSettled([
      fetch(`/api/history/hits?region=${region}`).then((r) => r.json()),
      fetch(`/api/config/schedule?region=${region}`).then((r) => r.json()),
    ]).then(([h, c]) => {
      if (huy) return;
      setDraws(h.status === "fulfilled" ? (h.value.draws ?? []) : []);
      if (c.status === "fulfilled") setSched((c.value.data ?? c.value.schedule ?? c.value) as Schedule);
    });
    return () => { huy = true; };
  }, [region]);

  const kq: XepHangPA | null = useMemo(
    () => (draws ? xepHangPhuongAn(draws, region, cachDo === "bang" ? sched : null) : null),
    [draws, region, cachDo, sched]
  );

  if (!draws || !kq) {
    return (
      <section className="plate rise rise-1 mb-4 md:mb-6">
        <div className="plate-hd"><h2 className="plate-title">🏁 Chốt Phương Án</h2></div>
        <div className="p-4 text-sm text-[var(--text-muted)]">
          {draws ? "Chưa đủ kỳ để chấm." : "Đang tính…"}
        </div>
      </section>
    );
  }

  const nhat = kq.bang[0];
  const giuNguyen = kq.bang.find((x) => x.ten === "Giữ nguyên")!;
  const hangGiuNguyen = kq.bang.indexOf(giuNguyen) + 1;
  // Bốc bừa lọt vào ba hạng đầu là dấu hiệu rõ nhất rằng bảng này đang xếp
  // hạng may rủi chứ không xếp hạng cách chơi.
  const bocLotTop = kq.bocCaoNhat <= 3;
  const nhatLaBoc = nhat.laBocBua;

  return (
    <section className="plate rise rise-1 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🏁 Chốt Phương Án — Cái Nào Lời Nhất Về Lâu Dài</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {kq.bang.length} phương án chấm trên đúng cùng {kq.soKy} kỳ sau · {kq.kyAm} kỳ đầu
            chỉ để học, không tính điểm
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {/* Cái thước. Nói trước khi họ đọc bảng, vì họ vừa hỏi đúng chỗ này. */}
        <div className="rounded-lg border border-[rgba(59,130,246,0.4)] bg-[rgba(37,99,235,0.08)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
          <b className="text-white">Xếp theo TIỀN, không xếp theo biên.</b> Biên là phần trăm, mà
          chặn bớt số thì nhận ít đi nên biên rất dễ đẹp trong khi tiền lại teo:{" "}
          <b>10% của 100tr = 10tr</b>, thua <b>1% của 2 tỷ = 20tr</b>. Chọn theo biên cao nhất là
          chọn nhầm thước.
          <br />
          <b className="text-white">Có 5 phương án bốc bừa trộn vào bảng.</b> Chúng không nhìn gì
          cả, chặn ngẫu nhiên. Nếu chúng leo lên được top thì bảng này đang xếp hạng may rủi, chứ
          không xếp hạng cách chơi.
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">Chấm bằng</span>
          {[
            { k: "bang" as const, ten: "Bảng hạn mức thật", tat: !sched },
            { k: "deu" as const, ten: "100 điểm đều", tat: false },
          ].map((x) => (
            <button
              key={x.k}
              disabled={x.tat}
              onClick={() => setCachDo(x.k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 ${
                cachDo === x.k
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {x.ten}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.74rem]">
            <thead>
              <tr className="text-left text-[var(--text-muted)]">
                <th className="py-1.5 pr-1 font-semibold">#</th>
                <th className="py-1.5 pr-2 font-semibold">Phương án</th>
                <th className="py-1.5 pr-2 font-semibold text-right">Lời/lỗ</th>
                <th className="py-1.5 pr-2 font-semibold text-right">Biên</th>
                <th className="py-1.5 font-semibold text-right">Chặn</th>
              </tr>
            </thead>
            <tbody>
              {kq.bang.map((x, i) => (
                <tr
                  key={x.ten}
                  className="border-t border-[var(--hairline)] align-top"
                  style={
                    x.laBocBua
                      ? { background: "rgba(200,139,255,0.09)" }
                      : i === 0
                      ? { background: "rgba(16,185,129,0.1)" }
                      : undefined
                  }
                >
                  <td className="py-1.5 pr-1 numeric text-[var(--text-muted)]">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <b className={x.laBocBua ? "text-[#e0c2ff]" : "text-white"}>{x.ten}</b>
                    <div className="text-[0.66rem] text-[var(--text-muted)]">{x.moTa}</div>
                  </td>
                  <td
                    className="py-1.5 pr-2 text-right numeric font-bold"
                    style={{ color: mau(x.lai) }}
                  >
                    {tien(x.lai)}
                  </td>
                  <td className="py-1.5 pr-2 text-right numeric" style={{ color: mau(x.bien) }}>
                    {pc(x.bien)}
                  </td>
                  <td className="py-1.5 text-right numeric text-[var(--text-secondary)]">
                    {x.chanTB.toFixed(0)}/100
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Kết luận rút thẳng từ vị trí của bốc bừa, không phải từ cảm nhận. */}
        <div
          className="rounded-lg border px-3 py-2.5 text-[0.76rem] leading-relaxed"
          style={{
            borderColor: bocLotTop ? "rgba(248,113,113,0.45)" : "rgba(16,185,129,0.45)",
            background: bocLotTop ? "rgba(220,38,38,0.1)" : "rgba(16,185,129,0.1)",
          }}
        >
          <div className="font-extrabold mb-1 text-white">
            {nhatLaBoc
              ? "Đứng đầu bảng là một phương án BỐC BỪA"
              : bocLotTop
              ? `Bốc bừa lọt hạng ${kq.bocCaoNhat} — chưa có gì để chốt`
              : `Bốc bừa cao nhất mới hạng ${kq.bocCaoNhat} — đáng xem tiếp`}
          </div>
          <div className="text-[var(--text-secondary)]">
            Phương án đứng đầu là <b className="text-white">{nhat.ten}</b>, ra{" "}
            <b style={{ color: mau(nhat.lai) }}>{tien(nhat.lai)}</b>. Giữ nguyên như bây giờ đứng
            hạng <b>{hangGiuNguyen}/{kq.bang.length}</b> với{" "}
            <b style={{ color: mau(giuNguyen.lai) }}>{tien(giuNguyen.lai)}</b>. Năm phương án bốc
            bừa xếp hạng <b>{kq.hangBoc.join(", ")}</b>.
            <br />
            {nhatLaBoc ? (
              <>
                Chặn ngẫu nhiên đang ăn hơn mọi cách chọn có suy nghĩ. Bảng xếp hạng này không chốt
                được phương án nào.
              </>
            ) : bocLotTop ? (
              <>
                Có phương án bốc bừa đứng trên hoặc ngang những cách chọn có suy nghĩ. Nghĩa là
                khoảng cách giữa cái đứng đầu và phần còn lại nhỏ hơn cái may rủi vốn có — chốt
                theo bảng này là chốt theo cái gặp may nhất.
              </>
            ) : (
              <>
                Cả năm phương án bốc bừa đều xếp dưới, nên khoảng cách ở trên chưa giải thích được
                bằng may rủi. Chỗ này đáng chạy thêm vài tháng nữa rồi hãy chốt.
              </>
            )}
          </div>
        </div>

        <div className="text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
          Mọi phương án đều chỉ được nhìn quá khứ, và đều chỉ được chấm trên <b>{kq.soKy} kỳ sau</b>
          — {kq.kyAm} kỳ đầu chỉ để chúng học. Không cái nào được chấm trên chính quãng nó học ra,
          vì như thế thì cái nào cũng thắng. Bốc bừa chặn đúng bằng số con mà mấy phương án kia
          chặn, nên nó không được lợi hay thiệt chỉ vì ôm nhiều hay ít hơn.
        </div>
      </div>
    </section>
  );
}
