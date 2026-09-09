"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import type { Schedule } from "@/lib/limit-engine";
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
  const [sched, setSched] = useState<Schedule | null>(null);
  const [nguong, setNguong] = useState<number>(1);
  /** Chấm bằng bảng hạn mức thật, hay bằng 100 điểm đều cho dễ so. */
  const [cachDo, setCachDo] = useState<"bang" | "deu">("bang");
  const [moNhinLai, setMoNhinLai] = useState(false);
  const [moO, setMoO] = useState(false);

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

  const kq: DemoChanO | null = useMemo(
    () => (draws ? demoChanO(draws, region, nguong, cachDo === "bang" ? sched : null) : null),
    [draws, region, nguong, cachDo, sched]
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
          bốn cách chơi trên <b>đúng cùng {kq.soKy} kỳ</b>,{" "}
          {kq.theoBang ? (
            <>
              ôm theo <b>đúng bảng hạn mức đang cài</b> — tức đúng đồng tiền sổ này sẽ ăn hay mất
            </>
          ) : (
            <>cùng ôm 100 điểm mỗi lô</>
          )}{" "}
          — nên chênh lệch giữa chúng chỉ có thể do cách chọn ô mà ra.
        </div>

        {/* Hai cách chấm, vì hai câu hỏi khác nhau.
            Bảng thật trả lời "lợi nhuận MÌNH như nào" — sổ của họ không phẳng,
            tiền dồn hết vào mấy bậc nặng. 100 đều trả lời "cách chọn ô có giỏi
            không" — cùng một mức thì chênh lệch không lẫn với chuyện chia tiền. */}
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
              title={x.tat ? "Chưa tải được bảng hạn mức" : undefined}
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

        {/* Câu trả lời bằng TIỀN, đặt trên bảng.
            Người vận hành phản hồi thẳng là không đọc nổi bảng: cột nào hàng
            nào là gì, rồi rốt cuộc lời hay lỗ. Bảng sáu cột bốn hàng là để soi
            kỹ, nhưng thứ phải thấy trước khi soi là một câu bằng tiền. */}
        <div className="grid grid-cols-3 gap-2">
          <TraLoi nhan="Không chặn gì" gt={tien(tA.lai)} phu="cứ nhận hết như bây giờ" mau={mau(tA.lai)} />
          <TraLoi nhan="Chặn theo ô" gt={tien(tB.lai)} phu="cách khách đề xuất" mau={mau(tB.lai)} dam />
          <TraLoi
            nhan="Chặn nhắm mắt"
            gt={tien(tC.lai)}
            phu={`bốc bừa, cũng ${tC.chanTB.toFixed(0)} con mỗi kỳ`}
            mau={mau(tC.lai)}
          />
        </div>

        {/* Ô giữa để một mình thì người ta chỉ đọc mỗi nó. Cột "chặn nhắm mắt"
            đứng ngay cạnh và câu này ở ngay dưới là để con số đó không bao giờ
            được đọc tách khỏi thứ dùng để so nó. */}
        <div className="text-[0.74rem] leading-relaxed text-[var(--text-secondary)] -mt-1">
          Chặn theo ô{" "}
          <b style={{ color: mau(tB.lai - tA.lai) }}>
            {tB.lai - tA.lai >= 0 ? "ăn thêm" : "mất thêm"} {tien(Math.abs(tB.lai - tA.lai))}
          </b>{" "}
          so với không chặn gì — nhưng chặn <b>nhắm mắt</b> cũng{" "}
          <b style={{ color: mau(tC.lai - tA.lai) }}>
            {tC.lai - tA.lai >= 0 ? "ăn thêm" : "mất thêm"} {tien(Math.abs(tC.lai - tA.lai))}
          </b>
          . Hai con số này phải đọc cùng nhau.
        </div>

        {/* Đúng thao tác ngoài đời, nên đứng trước mọi thứ khác.
            Khách chốt lại ý: "chặn HẾT các số lỗ ở các ô hiện tại". Đó là mở
            thẻ ra hôm nay, chép danh sách con lỗ, chặn, rồi để đó mà chạy —
            danh sách đứng yên. Khác hẳn nhánh chạy thật bên dưới, nơi máy tính
            lại mỗi kỳ và nhận lại ngay khi một con hết lỗ. */}
        <ChotDanhSach chot={kq.chot} />

        {/* "Ở kỳ thứ 10 bắt đầu bỏ thì nó NHƯ NÀO" — câu đó hỏi về cả quãng
            đường, không hỏi một con số cuối. Một con số cuối giấu mất chuyện
            ba đường bám nhau suốt rồi tách ra đúng mấy kỳ chót. */}
        <div>
          <div className="eyebrow mb-1.5">Tiền dồn qua từng kỳ — {kq.soKy} kỳ</div>
          <DuongSo
            ngay={kq.ngay}
            duong={[
              { ten: "Không chặn gì", don: tA.don, mau: "#8fd0ff" },
              { ten: "Chặn theo ô", don: tB.don, mau: "#ffd24a" },
              { ten: "Chặn nhắm mắt", don: tC.don, mau: "#c98bff" },
            ]}
          />
        </div>

        <div>
          <div className="eyebrow mb-1.5">
            Chạy thật — mỗi kỳ máy chỉ được nhìn những kỳ trước nó
          </div>
          <Bang nhanh={kq.that} goc={tA.bien} />

          {/* Chú giải nằm ngay dưới bảng và luôn hiện. Giấu lời giải thích sau
              một cái nút là lặp lại đúng cái lỗi đang phải sửa. */}
          <div className="mt-2 rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2.5 text-[0.7rem] leading-relaxed">
            <div className="eyebrow mb-1.5">Bốn hàng là bốn cách chơi</div>
            <ul className="space-y-1 text-[var(--text-secondary)]">
              <li>
                <b className="text-white">Bây giờ</b> — nhận hết 100 con, không chặn con nào.{" "}
                <i>Đây là mốc để so.</i>
              </li>
              <li>
                <b className="text-white">Cách khách</b> — chặn những ô đã từng lỗ.
              </li>
              <li>
                <b className="text-white">Bốc bừa</b> — chặn <b>ngẫu nhiên</b>, đúng bằng số ô cách
                khách chặn. Để biết &ldquo;biết chọn&rdquo; có hơn &ldquo;nhắm mắt&rdquo; không.
              </li>
              <li>
                <b className="text-white">Đảo ngược</b> — chặn ô đã từng <b>lời</b>, tức làm ngược
                lại. Nếu máy đọc được ô xấu thật thì bỏ ô tốt phải tệ hẳn đi.
              </li>
            </ul>
            <div className="eyebrow mt-2.5 mb-1.5">Sáu cột là gì</div>
            <ul className="space-y-1 text-[var(--text-secondary)]">
              <li>
                <b className="text-white">Biên</b> — nhận vào 100đ thì giữ lại được mấy đồng. 0% là
                huề vốn, âm là lỗ.
              </li>
              <li>
                <b className="text-white">Hơn/kém</b> — so với hàng &ldquo;Bây giờ&rdquo;.{" "}
                <i>Đây là cột trả lời thẳng.</i>
              </li>
              <li>
                <b className="text-white">Lời/lỗ</b> — quy ra tiền thật của cả {kq.soKy} kỳ.
              </li>
              <li>
                <b className="text-white">Chặn</b> — mỗi kỳ bỏ mấy con trong 100 con.
              </li>
              <li>
                <b className="text-white">Kỳ lỗ</b> — trong {kq.soKy} kỳ, bao nhiêu kỳ bị âm.
              </li>
            </ul>
          </div>

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

/**
 * Chốt danh sách một lần rồi chạy tiếp — đúng thao tác ngoài đời.
 *
 * Thứ tự trình bày là cố ý và ngược với bản năng: nửa đầu (chỗ danh sách được
 * học ra) đứng trước để thấy nó đẹp cỡ nào, rồi mới tới nửa sau. Đặt ngược lại
 * thì người đọc chỉ thấy một con số nhạt nhẽo mà không hiểu vì sao ý tưởng này
 * lại hấp dẫn đến thế ngay từ đầu.
 */
function ChotDanhSach({ chot }: { chot: DemoChanO["chot"] }) {
  const { nhinLai, khongChan, chanTheoDS, bocBua, khoangBoc, giuPhe } = chot;
  const hon = chanTheoDS.lai - khongChan.lai;
  const honBoc = chanTheoDS.lai - bocBua.lai;
  const tyLeGiu = giuPhe.xet ? (giuPhe.vanLo / giuPhe.xet) * 100 : 0;
  const vuot = chanTheoDS.bien > khoangBoc.cao;

  return (
    <div className="rounded-lg border border-[rgba(59,130,246,0.4)] bg-[rgba(37,99,235,0.08)] px-3 py-3 space-y-2.5">
      <div>
        <div className="font-extrabold text-white text-[0.86rem]">
          📋 Chốt danh sách một lần rồi chạy tiếp
        </div>
        <div className="text-[0.7rem] text-[var(--text-muted)] mt-0.5 leading-relaxed">
          Đúng thao tác ngoài đời: mở thẻ ra, chép hết các con đang lỗ, chặn, rồi để đó mà chạy —
          danh sách không đổi nữa. Học trên <b>{chot.kyHoc} kỳ đầu</b> ra{" "}
          <b>{chot.soO.toLocaleString("vi-VN")} ô</b> phải chặn, rồi đem chạy{" "}
          <b>{chot.kyThi} kỳ sau</b> — quãng mà danh sách chưa từng nhìn thấy.
        </div>
      </div>

      <div className="rounded-lg border border-[rgba(251,191,36,0.4)] bg-[rgba(245,158,11,0.1)] px-2.5 py-2 text-[0.74rem] leading-relaxed text-[#ffe9b8]">
        Trên <b>{chot.kyHoc} kỳ đầu</b> — tức chính chỗ danh sách được rút ra — nó ăn{" "}
        <b style={{ color: mau(nhinLai.lai) }}>{tien(nhinLai.lai)}</b> ({pc(nhinLai.bien)}). Đây là
        lý do ý tưởng này nhìn rất được. Nhưng đó là chấm bài khi đã biết đáp án.
      </div>

      <div className="eyebrow">Rồi chạy {chot.kyThi} kỳ sau — bài thi thật</div>
      <div className="grid grid-cols-3 gap-2">
        <TraLoi nhan="Không chặn gì" gt={tien(khongChan.lai)} phu="cứ nhận hết" mau={mau(khongChan.lai)} />
        <TraLoi
          nhan="Chặn theo danh sách"
          gt={tien(chanTheoDS.lai)}
          phu="danh sách chốt, không đổi"
          mau={mau(chanTheoDS.lai)}
          dam
        />
        <TraLoi
          nhan="Chặn nhắm mắt"
          gt={tien(bocBua.lai)}
          phu={`bốc bừa, cũng ${bocBua.chanTB.toFixed(0)} con mỗi kỳ`}
          mau={mau(bocBua.lai)}
        />
      </div>

      <div className="text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
        Chặn theo danh sách{" "}
        <b style={{ color: mau(hon) }}>
          {hon >= 0 ? "ăn thêm" : "mất thêm"} {tien(Math.abs(hon))}
        </b>{" "}
        so với không chặn, và{" "}
        <b style={{ color: mau(honBoc) }}>
          {honBoc >= 0 ? "hơn" : "kém"} chặn nhắm mắt {tien(Math.abs(honBoc))}
        </b>
        . Bốc bừa 25 lượt rải từ <b>{pc(khoangBoc.thap)}</b> tới <b>{pc(khoangBoc.cao)}</b>, mà
        danh sách ra <b style={{ color: mau(chanTheoDS.bien) }}>{pc(chanTheoDS.bien)}</b> —{" "}
        {vuot ? "nằm cao hơn cả 25 lượt, chỗ này đáng theo dõi." : "vẫn nằm trong khoảng đó."}
      </div>

      {/* Con số quyết định: danh sách chỉ đáng chặn nếu ô lỗ hôm nay còn lỗ ngày mai. */}
      <div className="rounded-lg border border-[var(--hairline)] bg-black/20 px-2.5 py-2 text-[0.74rem] leading-relaxed">
        <div className="eyebrow mb-1">Danh sách đó có bền không</div>
        <span className="text-[var(--text-secondary)]">
          Trong <b className="text-white">{giuPhe.xet.toLocaleString("vi-VN")} ô</b> bị chặn vì lỗ ở
          nửa đầu, sang nửa sau chỉ còn{" "}
          <b className="numeric" style={{ color: tyLeGiu > 60 ? "#7ff0c0" : "#ffd24a" }}>
            {giuPhe.vanLo.toLocaleString("vi-VN")} ô ({tyLeGiu.toFixed(0)}%)
          </b>{" "}
          là vẫn lỗ.{" "}
          {tyLeGiu < 60
            ? "Gần một nửa lật phe — tức danh sách đang chép lại quá khứ chứ chưa đọc được tính nết con số."
            : "Tỷ lệ này cao hơn tung đồng xu, đáng xem tiếp."}
        </span>
      </div>
    </div>
  );
}

/**
 * Ba đường tiền dồn chồng lên nhau, cùng một trục.
 *
 * Vẽ chung một trục là chủ ý: ba đường riêng ba khung thì mắt tự co giãn từng
 * cái rồi thấy đường nào cũng "có xu hướng". Chồng lên nhau thì thấy ngay
 * chúng quấn lấy nhau, và khoảng cách cuối cùng nhỏ đến mức nào so với chính
 * cái biên độ mà một đường tự dao động trên đường đi.
 */
function DuongSo({
  ngay,
  duong,
}: {
  ngay: string[];
  duong: { ten: string; don: number[]; mau: string }[];
}) {
  const n = ngay.length;
  if (n < 2) return null;
  const tatCa = duong.flatMap((d) => d.don);
  const lo = Math.min(0, ...tatCa);
  const hi = Math.max(0, ...tatCa);
  const span = hi - lo || 1;
  const W = 100, H = 34;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const zero = y(0);
  const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28 md:h-36">
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="rgba(255,255,255,0.3)" strokeWidth="0.25" />
        {duong.map((d) => (
          <path
            key={d.ten}
            d={d.don.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ")}
            fill="none"
            stroke={d.mau}
            strokeWidth="0.7"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[0.62rem] text-[var(--text-muted)] numeric px-0.5 mt-0.5">
        <span>{dd(ngay[0])}</span>
        <span>đường ngang = hoà vốn</span>
        <span>{dd(ngay[n - 1])}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[0.66rem]">
        {duong.map((d) => (
          <span key={d.ten} className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: d.mau }} />
            <span className="text-[var(--text-secondary)]">{d.ten}</span>
            <b className="numeric" style={{ color: mau(d.don[n - 1]) }}>
              {tien(d.don[n - 1])}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ba ô tiền đứng trên bảng — đọc xong ba ô này là biết kết quả, khỏi soi bảng. */
function TraLoi({
  nhan,
  gt,
  phu,
  mau: m,
  dam,
}: {
  nhan: string;
  gt: string;
  phu: string;
  mau: string;
  dam?: boolean;
}) {
  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{
        borderColor: dam ? m + "88" : "var(--hairline)",
        background: dam ? m + "14" : "rgba(255,255,255,0.04)",
      }}
    >
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-base leading-none" style={{ color: m }}>
        {gt}
      </div>
      <div className="text-[0.62rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
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
