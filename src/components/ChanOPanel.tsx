"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { demoChanO, type DemoChanO, type ONhanh } from "@/lib/chan-o";
import { tenBac } from "@/lib/slot-stats";
import type { Region } from "@/lib/types";

const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");

const NGUONG = [1, 2, 3, 5] as const;

/**
 * Đo thẳng đề xuất của khách: chặn theo từng ô (con số × bậc ngày).
 *
 * Khách hỏi đúng câu cần hỏi — "làm thử demo xem nó có hiệu quả hơn bây giờ
 * không". Nên khối này không trình bày ý tưởng, nó chấm điểm ý tưởng, và chấm
 * bằng ba thứ mà một bảng kết quả thường thiếu: chơi thật chỉ được nhìn quá
 * khứ, có đối chứng bốc bừa chặn đúng bằng ngần ấy ô, và có phép thử đảo ngược
 * chặn ô đang lời. Nếu bốn nhánh xấp xỉ nhau thì câu trả lời đã rõ, và nó rõ
 * ngay trên màn hình chứ không cần ai giải thích.
 */
export default function ChanOPanel({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [nguong, setNguong] = useState<number>(1);
  const [moNhinLai, setMoNhinLai] = useState(false);
  const [moO, setMoO] = useState(false);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws(d.draws ?? []))
      .catch(() => !huy && setDraws([]));
    return () => { huy = true; };
  }, [region]);

  const kq: DemoChanO | null = useMemo(
    () => (draws ? demoChanO(draws, region, nguong) : null),
    [draws, region, nguong]
  );

  if (!draws) {
    return (
      <section className="plate rise rise-2 mb-4 md:mb-6">
        <div className="plate-hd"><h2 className="plate-title">🧪 Thử Chặn Từng Ô</h2></div>
        <div className="p-4 text-sm text-[var(--text-muted)]">Đang tính…</div>
      </section>
    );
  }

  if (!kq) {
    return (
      <section className="plate rise rise-2 mb-4 md:mb-6">
        <div className="plate-hd"><h2 className="plate-title">🧪 Thử Chặn Từng Ô</h2></div>
        <div className="p-4 text-sm text-[var(--text-muted)]">
          Chưa đủ kỳ để chấm — cần ít nhất 70 kỳ trong kho.
        </div>
      </section>
    );
  }

  const [tA, tB, tC, tD] = kq.that;
  const hon = tB.bien - tA.bien;
  // Ba trạng thái, không phải hai. Rơi xuống DƯỚI khoảng bốc bừa cũng là "nằm
  // ngoài khoảng", nhưng ngoài về phía tệ hơn — gộp nó chung với "vượt lên
  // trên" thì bảng sẽ tô xanh đúng lúc cách chơi đang thua cả bốc bừa.
  const vuot = tB.bien > kq.khoangBoc.cao;
  const duoiHan = tB.bien < kq.khoangBoc.thap;
  const lechDao = Math.abs(tB.bien - tD.bien);
  const tyLeDoiPhe = kq.doiPhe.xet ? (kq.doiPhe.doi / kq.doiPhe.xet) * 100 : 0;

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">🧪 Thử Chặn Từng Ô — Đề Xuất Của Khách</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Cùng một con, ngày 1 thì bỏ mà ngày 2 vẫn ôm · {kq.soO.toLocaleString("vi-VN")} ô ·{" "}
            {kq.soKy} kỳ
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-4">
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
          Bây giờ máy chặn theo <b>cả nhóm</b>{" "}
          — cả bậc &ldquo;1 kỳ chưa về&rdquo; là 100 con như nhau. Khách muốn nhỏ hơn một bậc: mỗi <b>ô</b> là một cặp <b>con số × bậc ngày</b>. Con 09
          ở ngày 1 từng thua thì bỏ, nhưng chính con 09 ở ngày 2 không thua thì vẫn ôm. Dưới đây là
          bốn cách chơi trên <b>đúng cùng {kq.soKy} kỳ</b>, cùng ôm 100 điểm mỗi lô — nên chênh lệch
          giữa chúng chỉ có thể do cách chọn ô mà ra.
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">Ô phải có ít nhất</span>
          {NGUONG.map((n) => (
            <button
              key={n}
              onClick={() => setNguong(n)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                nguong === n ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {n} dịp
            </button>
          ))}
          <span className="text-[0.68rem] text-[var(--text-muted)]">mới dám chặn</span>
        </div>

        <div>
          <div className="eyebrow mb-1.5">
            Chạy thật — mỗi kỳ máy chỉ được nhìn những kỳ trước nó
          </div>
          <Bang nhanh={kq.that} goc={tA.bien} />
          <div className="mt-1.5 text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
            Bốc bừa chạy 25 lượt, ra từ <b style={{ color: mau(kq.khoangBoc.thap) }}>{pc(kq.khoangBoc.thap)}</b> tới{" "}
            <b style={{ color: mau(kq.khoangBoc.cao) }}>{pc(kq.khoangBoc.cao)}</b> (trung bình{" "}
            <b>{pc(kq.khoangBoc.tb)}</b>). Muốn nói cách chọn ô có giá trị thì nó phải vượt hẳn ra
            ngoài khoảng đó.
          </div>
        </div>

        {/* Câu trả lời cho đúng câu khách hỏi, đặt ngay dưới bảng chứ không giấu ở cuối. */}
        <div
          className="rounded-lg border px-3 py-2.5 text-[0.76rem] leading-relaxed"
          style={{
            borderColor: vuot ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
            background: vuot ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
          }}
        >
          <div className="font-extrabold mb-1 text-white">
            {vuot
              ? "Có vượt khoảng bốc bừa — đáng theo dõi thêm"
              : duoiHan
                ? "Tệ hơn cả 25 lượt bốc bừa"
                : "Chưa hơn được bốc bừa"}
          </div>
          <div className="text-[var(--text-secondary)]">
            Cách khách ra <b style={{ color: mau(tB.bien) }}>{pc(tB.bien)}</b>, cách đang chạy ra{" "}
            <b style={{ color: mau(tA.bien) }}>{pc(tA.bien)}</b> — chênh{" "}
            <b style={{ color: mau(hon) }}>{pc(hon)}</b>. Bốc bừa chặn đúng bằng ngần ấy ô ra{" "}
            <b style={{ color: mau(tC.bien) }}>{pc(tC.bien)}</b>.{" "}
            {vuot
              ? "Con số của cách khách nằm cao hơn cả 25 lượt bốc bừa — chỗ này đáng theo dõi thêm."
              : duoiHan
                ? "Con số của cách khách còn thấp hơn cả 25 lượt bốc bừa, tức chặn có chọn còn kém chặn nhắm mắt."
                : "Con số của cách khách nằm lọt trong khoảng mà bốc bừa cũng ra được, nên phần hơn kém này chưa tách được khỏi may rủi."}{" "}
            Và phép thử đảo ngược: chặn đúng những ô đang <b>lời</b> ra{" "}
            <b style={{ color: mau(tD.bien) }}>{pc(tD.bien)}</b>, lệch{" "}
            <b>{lechDao.toFixed(2)}%</b> so với chặn ô lỗ
            {tD.bien > tB.bien
              ? " — tức bỏ ô TỐT lại ăn hơn bỏ ô xấu, đúng chiều ngược với điều đang mong."
              : lechDao < 1
                ? " — bỏ ô tốt và bỏ ô xấu cho ra kết quả gần như nhau, tức cái máy đang đọc chưa phân biệt được tốt xấu."
                : "."}
          </div>
        </div>

        {/* Vì sao lại ra thế — bằng cỡ mẫu, không bằng lời khuyên. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <O
            nhan="Mỗi ô gom được"
            gt={kq.dipTB.toFixed(1) + " dịp"}
            phu={`${kq.soO.toLocaleString("vi-VN")} ô chia nhau ${kq.soKy} kỳ`}
          />
          <O
            nhan="Sai số mỗi ô"
            gt={"±" + kq.saiSoO.toFixed(0) + "%"}
            phu="chỉ do may rủi, chưa tính gì khác"
            canh
          />
          <O
            nhan="Ô đổi phe"
            gt={tyLeDoiPhe.toFixed(0) + "%"}
            phu={`${kq.doiPhe.doi}/${kq.doiPhe.xet} ô nửa đầu lỗ thì nửa sau lời, và ngược lại`}
            canh
          />
        </div>

        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.72rem] leading-relaxed text-[var(--text-secondary)]">
          Ba con số trên giải thích kết quả. Mỗi ô chỉ gom được{" "}
          <b>{kq.dipTB.toFixed(1)} dịp</b>, mà một ô ngần ấy dịp thì biên của nó đã tự dao động{" "}
          <b>±{kq.saiSoO.toFixed(0)}%</b> chỉ vì may rủi — nên một ô đang hiện −20% và một ô đang
          hiện +20% rất có thể là cùng một thứ. Đúng như vậy:{" "}
          <b>{tyLeDoiPhe.toFixed(0)}%</b> số ô lật phe giữa nửa đầu và nửa sau. Danh sách ô xấu học
          hôm nay gần như tung đồng xu cho ngày mai.
        </div>

        <div>
          <button
            onClick={() => setMoNhinLai((v) => !v)}
            className="text-[0.72rem] font-bold text-[#8fd0ff] hover:text-white"
          >
            {moNhinLai ? "▾" : "▸"} Nhìn lại — chấm bài khi đã biết đáp án
          </button>
          {moNhinLai && (
            <div className="mt-2">
              <div className="rounded-lg border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.1)] px-3 py-2 text-[0.72rem] leading-relaxed text-[#ffe9b8] mb-2">
                ⚠️ Bảng này học ô lỗ trên chính {kq.soKy} kỳ rồi đem chấm lại cũng {kq.soKy} kỳ đó —
                tức là biết trước kết quả rồi mới đặt. Nó luôn đẹp, và đây là lý do phải có bảng
                &ldquo;chạy thật&rdquo; ở trên. Để đây cho thấy đẹp giả nó đẹp cỡ nào.
              </div>
              <Bang nhanh={kq.nhinLai} goc={kq.nhinLai[0].bien} />
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => setMoO((v) => !v)}
            className="text-[0.72rem] font-bold text-[#8fd0ff] hover:text-white"
          >
            {moO ? "▾" : "▸"} Xem 10 ô lỗ nặng nhất — thứ máy đang nhìn vào
          </button>
          {moO && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[0.72rem]">
                <thead>
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="py-1 pr-2 font-semibold">Ô</th>
                    <th className="py-1 pr-2 font-semibold text-right">Dịp</th>
                    <th className="py-1 pr-2 font-semibold text-right">Về</th>
                    <th className="py-1 pr-2 font-semibold text-right">Biên</th>
                    <th className="py-1 font-semibold text-right">Lỗ</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.oLoNhat.map((o) => (
                    <tr key={o.lo + o.bac} className="border-t border-[var(--hairline)]">
                      <td className="py-1 pr-2">
                        <b className="numeric text-white">{o.lo}</b>{" "}
                        <span className="text-[var(--text-muted)]">· {tenBac(o.bac)}</span>
                      </td>
                      <td className="py-1 pr-2 text-right numeric">{o.dip}</td>
                      <td className="py-1 pr-2 text-right numeric">{o.nhay}</td>
                      <td className="py-1 pr-2 text-right numeric" style={{ color: mau(o.bien) }}>
                        {pc(o.bien)}
                      </td>
                      <td className="py-1 text-right numeric" style={{ color: mau(o.lai) }}>
                        {tien(o.lai)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5 text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
                Đọc cột &ldquo;Dịp&rdquo; trước cột &ldquo;Lỗ&rdquo;. Ô lỗ nặng nhất bảng cũng chỉ
                có ngần ấy dịp — chưa đủ để nói con đó xấu, mới chỉ đủ để nói nó đã xui.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Bang({ nhanh, goc }: { nhanh: ONhanh[]; goc: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.74rem]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1.5 pr-2 font-semibold">Cách chơi</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Biên</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Hơn/kém</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Lời/lỗ</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Chặn</th>
            <th className="py-1.5 font-semibold text-right">Kỳ lỗ</th>
          </tr>
        </thead>
        <tbody>
          {nhanh.map((n) => {
            const chenh = n.bien - goc;
            return (
              <tr key={n.ten} className="border-t border-[var(--hairline)] align-top">
                <td className="py-1.5 pr-2">
                  <b className="text-white">{n.ten}</b>
                  <div className="text-[0.66rem] text-[var(--text-muted)]">{n.giaiThich}</div>
                </td>
                <td className="py-1.5 pr-2 text-right numeric font-bold" style={{ color: mau(n.bien) }}>
                  {pc(n.bien)}
                </td>
                <td className="py-1.5 pr-2 text-right numeric" style={{ color: mau(chenh) }}>
                  {Math.abs(chenh) < 0.005 ? "—" : pc(chenh)}
                </td>
                <td className="py-1.5 pr-2 text-right numeric" style={{ color: mau(n.lai) }}>
                  {tien(n.lai)}
                </td>
                <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">
                  {n.chanTB.toFixed(0)}/100
                </td>
                <td className="py-1.5 text-right numeric text-[var(--text-secondary)]">{n.kyLo}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function O({ nhan, gt, phu, canh }: { nhan: string; gt: string; phu: string; canh?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div
        className="numeric font-extrabold text-lg leading-none"
        style={{ color: canh ? "#ffd24a" : "#8fd0ff" }}
      >
        {gt}
      </div>
      <div className="text-[0.64rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
