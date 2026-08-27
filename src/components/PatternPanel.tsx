"use client";

import { useState } from "react";
import { timQuyLuat, type KetQuaTim } from "@/lib/patterns";
import type { Draw } from "@/lib/sim-ai";

const so = (n: number, d = 2) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);

/**
 * Runs the pattern hunt in front of the operator instead of reporting it.
 *
 * The claim "there is no exploitable pattern" is the single most expensive
 * thing to get wrong here, so it should not rest on anyone's word. Every
 * number below is computed in the browser from the same history the rest of
 * the page uses, and the shuffle test is included precisely because a table of
 * six methods will always have a best row — the question is whether that row
 * beats scrambled history.
 */
export default function PatternPanel({
  draws,
  price,
}: {
  draws: Draw[] | null;
  price: number;
}) {
  const [kq, setKq] = useState<KetQuaTim | null>(null);
  const [dangChay, setDangChay] = useState(false);

  const chay = () => {
    if (!draws) return;
    setDangChay(true);
    setKq(null);
    // Nhường một nhịp cho trình duyệt vẽ chữ "đang chạy" trước khi khoá luồng.
    setTimeout(() => {
      setKq(timQuyLuat(draws, price, 300));
      setDangChay(false);
    }, 40);
  };

  return (
    <section className="plate rise rise-3 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🔍 Có Quy Luật Ẩn Không?</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Thử 6 cách chọn số trên những kỳ chưa từng nhìn thấy, rồi kiểm lại bằng
            kết quả xáo bừa
          </p>
        </div>
        <button
          onClick={chay}
          disabled={!draws || dangChay}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {dangChay ? "⏳ Đang chạy…" : "🔍 Kiểm tra"}
        </button>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {!kq && !dangChay && (
          <p className="text-[0.78rem] leading-relaxed text-[var(--text-secondary)]">
            Mỗi cách chọn ra 20 lô để ôm nặng. Điểm mấu chốt: bảng xếp hạng của mỗi kỳ
            chỉ được nhìn <b>60 kỳ trước đó</b>, rồi mới đem chấm với kỳ ngay sau — kỳ
            mà lúc chọn chưa hề thấy. Có <b>“bốc bừa”</b> làm đối chứng: cách nào không
            hơn được nó thì cách đó vô dụng.
          </p>
        )}

        {kq && (
          <>
            <div className="text-[0.72rem] text-[var(--text-muted)]">
              Thử trên <b className="text-white">{kq.soKyThu} kỳ</b> chưa từng nhìn thấy ·
              mức chung mỗi lô về <b className="text-white">{kq.chungTram.toFixed(0)}%</b> số kỳ ·
              ôm nhóm nào về dưới mức chung thì lời
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-2 py-2 text-left font-bold">Cách chọn 20 lô</th>
                    <th className="px-2 py-2 text-right font-bold">Nhóm đó về</th>
                    <th className="px-2 py-2 text-right font-bold">Lệch mức chung</th>
                    <th className="px-2 py-2 text-right font-bold">Ôm nhóm này lời</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.cach.map((c) => {
                    const doiChung = c.ten.includes("đối chứng");
                    return (
                      <tr
                        key={c.ten}
                        className={`border-t border-[var(--hairline)] ${
                          doiChung ? "bg-white/[0.04]" : ""
                        }`}
                      >
                        <td className="px-2 py-2">
                          <span className="text-white font-semibold">{c.ten}</span>
                          <span className="text-[0.66rem] text-[var(--text-muted)]"> — {c.moTa}</span>
                        </td>
                        <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                          {c.veTram.toFixed(2)}%
                        </td>
                        <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                          {so(c.veTram - c.chungTram)}
                        </td>
                        <td
                          className={`px-2 py-2 text-right numeric font-bold ${
                            c.loiTram > 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                          }`}
                        >
                          {so(c.loiTram)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${
                kq.coThat
                  ? "border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.1)]"
                  : "border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)]"
              }`}
            >
              <div className="eyebrow text-[#ffe0a8]">
                Phép kiểm quyết định — xáo bừa 300 lần
              </div>
              <p className="text-[0.78rem] leading-relaxed text-[#ffe9c4]">
                Sáu cách thì kiểu gì cũng có một cách đứng đầu, kể cả khi không cách nào
                biết gì. Ở đây đứng đầu là <b>{kq.tot.ten}</b> với {so(kq.tot.loiTram)}%.
                Nên em xáo lại kết quả xổ — giữ nguyên mỗi kỳ đúng bấy nhiêu lượt về, chỉ
                đổi con nào trúng — rồi chạy lại đúng cách đó 300 lần:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[0.72rem]">
                <div>
                  <div className="text-[var(--text-muted)]">Xáo bừa trung bình</div>
                  <div className="numeric font-bold text-white">{so(kq.xaoTB)}%</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Khoảng thường gặp</div>
                  <div className="numeric font-bold text-white">
                    {so(kq.xaoThap, 1)}% ↔ {so(kq.xaoCao, 1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Kết quả thật</div>
                  <div className="numeric font-bold text-[#ffd24a]">{so(kq.tot.loiTram)}%</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Xáo ăn bằng hoặc hơn</div>
                  <div className="numeric font-bold text-white">{kq.pTram.toFixed(1)}%</div>
                </div>
              </div>
              <p className="text-[0.78rem] leading-relaxed font-bold text-[#ffe9c4]">
                {kq.coThat ? (
                  <>
                    ✅ Kết quả thật nằm ngoài đám xáo (chỉ {kq.pTram.toFixed(1)}% số lần xáo
                    theo kịp). Cách này đáng theo đuổi — nên chạy lại sau vài tuần dữ liệu
                    mới để chắc.
                  </>
                ) : (
                  <>
                    ❌ Xáo bừa cũng ra được chừng đó trong {kq.pTram.toFixed(1)}% số lần — quá
                    thường để gọi là quy luật. Nghĩa là {so(kq.tot.loiTram)}% kia không đến từ
                    con số, nó đến từ việc mình thử nhiều cách rồi giữ lại cách may nhất.
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
