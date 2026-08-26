"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import {
  backtest,
  backtestReal,
  LOS,
  NO_LIMIT,
  SHAPE_STRATEGIES,
  STRATEGIES,
  type Book,
  type Draw,
} from "@/lib/strategy-lab";
import { POSITIONS, STAKE_PRICE, WIN_PER_POINT, margin } from "@/lib/exposure";
import { REGION_LABELS, type Region } from "@/lib/types";
import LayoffCalculator from "./LayoffCalculator";
import BulkImport from "./BulkImport";

const pct = (x: number) => (x * 100).toFixed(2) + "%";

/** Anything inside this band of zero is noise, not an edge. */
const NOISE = 0.005;

function tone(x: number, invert = false): string {
  if (Math.abs(x) < NOISE) return "text-[var(--text-secondary)]";
  const good = invert ? x < 0 : x > 0;
  return good ? "text-[#7ff0c0]" : "text-[#ff9d9d]";
}

export default function StrategyLab({ region }: { region: Region }) {
  const toast = useToast();
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  /** Real books when they exist; a flat hypothetical book otherwise. */
  const [dungSoThat, setDungSoThat] = useState(true);
  const [nap, setNap] = useState(0);
  /** Hits per draw as the data actually holds them, not as assumed. */
  const [lanTrung, setLanTrung] = useState<number | null>(null);
  const [split, setSplit] = useState(0.66);
  const [seeking, setSeeking] = useState(false);
  const [hunt, setHunt] = useState<{ tries: number; train: number; test: number } | null>(null);

  useEffect(() => {
    setDraws(null);
    setHunt(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        setDraws(d.draws ?? []);
        setLanTrung(typeof d.hitsPerDraw === "number" ? d.hitsPerDraw : null);
      })
      .catch(() => toast.show("error", "Không tải được lịch sử"));

    fetch(`/api/bets/bulk?region=${region}`)
      .then((r) => r.json())
      .then((d) => setBooks(d.books ?? []))
      .catch(() => setBooks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, nap]);

  const price = STAKE_PRICE[region];

  /** Draws that have a book AND a result — the only ones a real run can use. */
  const coSoThat = useMemo(() => {
    if (!draws) return 0;
    const d = new Set(draws.map((x) => x.date));
    return books.filter((b) => d.has(b.date)).length;
  }, [draws, books]);

  const theoSoThat = dungSoThat && coSoThat >= 20;

  const { train, test, rows, realRows } = useMemo(() => {
    if (!draws || draws.length < 40) return { train: [], test: [], rows: [], realRows: [] };
    const cut = Math.floor(draws.length * split);
    const train = draws.slice(0, cut);
    // Overlaps by 10 draws purely as warm-up history the score ignores.
    const test = draws.slice(Math.max(0, cut - 10));

    const rows = [...STRATEGIES, ...SHAPE_STRATEGIES].map((s) => ({
      s,
      a: backtest(s, train, price, WIN_PER_POINT),
      b: backtest(s, test, price, WIN_PER_POINT),
    }));

    // On real books the cap has to sit near what customers actually staked,
    // or every rule turns into "accept everything" and they all tie.
    const mucTB = books.length
      ? books.reduce(
          (s, b) => s + Object.values(b.points).reduce((a, v) => a + v, 0) / 100,
          0
        ) / books.length
      : 100;

    const realRows = theoSoThat
      ? [NO_LIMIT, ...STRATEGIES, ...SHAPE_STRATEGIES].map((s) => ({
          s,
          r: backtestReal(s, draws, books, price, WIN_PER_POINT, Math.max(1, Math.round(mucTB))),
        }))
      : [];

    return { train, test, rows, realRows };
  }, [draws, split, price, books, theoSoThat]);

  /**
   * Tries a pile of random limit tables, keeps whichever wins on the training
   * draws, then scores that winner on draws it never saw.
   *
   * This is exactly the "chạy nhiều lần để tìm phương án tối ưu" idea, run
   * honestly. The search always finds something that looks superb on history;
   * the second number is what it is actually worth.
   */
  function huntRandom(tries: number) {
    if (!draws || train.length < 20) return;
    setSeeking(true);

    // Deferred so the button paints its busy state before the loop blocks.
    setTimeout(() => {
      let seed = 20260823 + tries;
      const rnd = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const score = (limits: Record<string, number>, set: Draw[]) => {
        let sum = 0, n = 0;
        for (const d of set) {
          const taken = LOS.reduce((s, lo) => s + limits[lo], 0) * price;
          if (taken <= 0) continue;
          let payout = 0;
          for (const [lo, c] of Object.entries(d.hits)) payout += limits[lo] * WIN_PER_POINT * c;
          sum += (taken - payout) / taken;
          n++;
        }
        return n ? sum / n : 0;
      };

      let best: Record<string, number> | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < tries; i++) {
        const limits = Object.fromEntries(LOS.map((lo) => [lo, Math.floor(rnd() * 200) + 1]));
        const v = score(limits, train);
        if (v > bestScore) { bestScore = v; best = limits; }
      }

      setHunt({ tries, train: bestScore, test: best ? score(best, test.slice(10)) : 0 });
      setSeeking(false);
    }, 30);
  }

  const m = margin(region);

  if (!draws) {
    return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Đang tải lịch sử…</div>;
  }
  if (draws.length < 40) {
    return (
      <div className="plate p-10 text-center text-sm text-[var(--text-muted)]">
        Cần ít nhất 40 kỳ để thử. Hiện có {draws.length}.
      </div>
    );
  }

  return (
    <>
      {/* Nếu số lần trúng lệch khỏi mức đúng thì MỌI con số dưới đây đều sai —
          phải nói ra trước, không để người dùng tự đoán. */}
      {lanTrung !== null && Math.abs(lanTrung - POSITIONS[region]) > 0.5 && (
        <section className="mb-4 rounded-xl border border-[rgba(248,113,113,0.6)] bg-[rgba(220,38,38,0.18)] px-4 py-3">
          <div className="text-sm font-bold text-[#ffb4b4]">
            🔴 SỐ LIỆU ĐANG SAI — đang đếm {lanTrung.toFixed(1)} lần trúng/kỳ, đáng lẽ{" "}
            {POSITIONS[region]}
          </div>
          <div className="text-[0.75rem] text-[#ffd9d9] mt-1 leading-relaxed">
            Nghĩa là app đang tính <strong>tất cả đài</strong> chứ không phải 2 đài. Kỳ vọng phải
            trả thành{" "}
            <strong>{Math.round((lanTrung / 100) * WIN_PER_POINT).toLocaleString("vi-VN")}đ</strong>{" "}
            trong khi chỉ thu {STAKE_PRICE[region].toLocaleString("vi-VN")}đ → biên{" "}
            <strong>
              {(
                ((STAKE_PRICE[region] - (lanTrung / 100) * WIN_PER_POINT) /
                  STAKE_PRICE[region]) *
                100
              ).toFixed(2)}
              %
            </strong>{" "}
            — nên cách nào cũng LUÔN THUA.
            <br />
            <strong>
              Sửa: vào Dashboard → thẻ 📻 Đài Tính Kết Quả → bật &ldquo;Bỏ bớt đài&rdquo;.
            </strong>{" "}
            Mọi con số dưới đây chỉ đúng sau khi bật.
          </div>
        </section>
      )}

      <section className="plate rise rise-1 mb-4 md:mb-6">
        <div className="plate-hd flex-wrap gap-2">
          <div>
            <h2 className="plate-title">🔬 Phòng Thử Chiến Thuật — {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Mỗi cách đặt hạn mức được chấm trên những kỳ nó CHƯA TỪNG thấy
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">Chia dữ liệu</span>
            {[0.5, 0.66, 0.8].map((v) => (
              <button
                key={v}
                onClick={() => setSplit(v)}
                className={`numeric px-2.5 py-1 rounded font-bold ${
                  split === v ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea]"
                }`}
              >
                {Math.round(v * 100)}/{Math.round((1 - v) * 100)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 md:p-4 text-[0.75rem] text-[var(--text-secondary)] leading-relaxed">
          Dữ liệu: <strong className="numeric">{draws.length}</strong> kỳ thật.{" "}
          <strong className="numeric">{train.length}</strong> kỳ đầu để dò ra chiến thuật,{" "}
          <strong className="numeric">{Math.max(0, test.length - 10)}</strong> kỳ sau để chấm điểm —
          chiến thuật <em>không được nhìn</em> mấy kỳ sau này.
          <br />
          Biên lợi nhuận hiện tại: <strong className={tone(m)}>{pct(m)}</strong>. Cột đáng đọc nhất
          là <strong>DỮ LIỆU MỚI</strong> — cột kia chiến thuật nào cũng đẹp được.
        </div>
      </section>

      {/* Đặt trước bảng chiến thuật: đây là thứ DUY NHẤT tạo ra lời, phần
          dưới chỉ chứng minh những thứ không tạo ra lời. */}
      <LayoffCalculator region={region} />

      <BulkImport region={region} onImported={() => setNap((n) => n + 1)} />

      {/* Chạy trên sổ cược THẬT — chỉ hiện khi đã có đủ dữ liệu */}
      {coSoThat >= 20 ? (
        <section className="plate rise rise-2 mb-4 md:mb-6">
          <div className="plate-hd flex-wrap gap-2">
            <div>
              <h2 className="plate-title">💵 Chạy Trên Sổ Cược THẬT</h2>
              <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                {coSoThat} kỳ có cả sổ cược lẫn kết quả — lãi/lỗ bằng tiền thật
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#c2d4ea] cursor-pointer">
              <input
                type="checkbox"
                checked={dungSoThat}
                onChange={(e) => setDungSoThat(e.target.checked)}
                className="accent-emerald-500"
              />
              Dùng sổ thật
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-3 py-2 text-left font-bold">Nếu đã dùng cách này</th>
                  <th className="px-2 py-2 text-right font-bold text-[#9fd0ff]">Lãi/lỗ<br />tiền thật</th>
                  <th className="px-2 py-2 text-right font-bold">Biên</th>
                  <th className="px-2 py-2 text-right font-bold">Ngày<br />tệ nhất</th>
                  <th className="px-2 py-2 text-right font-bold">Ngày lỗ</th>
                  <th className="px-3 py-2 text-right font-bold">Từ chối</th>
                </tr>
              </thead>
              <tbody>
                {realRows.map(({ s, r }) => (
                  <tr
                    key={s.key}
                    className={`border-t border-[var(--hairline)] ${
                      s.key === "none" ? "bg-[rgba(255,255,255,0.05)]" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-bold text-white text-[0.8rem]">
                        {s.key === "none" && "📌 "}
                        {s.name}
                      </div>
                      <div className="text-[0.65rem] text-[var(--text-muted)]">{s.note}</div>
                    </td>
                    <td
                      className={`px-2 py-2 text-right numeric font-bold ${
                        r.profitVnd > 0 ? "text-[#7ff0c0]" : r.profitVnd < 0 ? "text-[#ff9d9d]" : ""
                      }`}
                    >
                      {(r.profitVnd < 0 ? "−" : "+") +
                        Math.abs(Math.round(r.profitVnd)).toLocaleString("vi-VN") +
                        "đ"}
                    </td>
                    <td className={`px-2 py-2 text-right numeric ${tone(r.avg)}`}>{pct(r.avg)}</td>
                    <td className={`px-2 py-2 text-right numeric ${tone(r.worst)}`}>
                      {pct(r.worst)}
                    </td>
                    <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                      {(r.lossRate * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-right numeric text-[var(--text-muted)]">
                      {Math.round(r.refused).toLocaleString("vi-VN")} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 md:px-4 py-3 text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
            Dòng <strong>📌 Nhận hết</strong> là những gì đã xảy ra thật. Các dòng dưới là{" "}
            <em>&ldquo;nếu hồi đó đã chặn theo cách này&rdquo;</em> — hạn mức chỉ là trần, khách
            đánh dưới trần thì nhận đủ, vượt thì từ chối phần dư.
          </p>
        </section>
      ) : (
        <section className="plate p-5 md:p-6 mb-4 md:mb-6">
          <h3 className="chrome text-base mb-1">💵 Chạy Trên Sổ Cược Thật</h3>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Mình đã có <strong className="text-white">{draws.length} kỳ kết quả</strong>, nhưng mới{" "}
            <strong className="text-white">{coSoThat} kỳ có sổ cược</strong>. Cần ít nhất{" "}
            <strong>20 kỳ</strong> để chạy được.
            <br />
            <br />
            Dán tin nhắn cược cũ vào ô <strong>📚 Nạp Sổ Cược Cũ</strong> ở trên — càng nhiều ngày
            càng chắc. Có đủ rồi thì bảng này tự hiện, và nó sẽ nói bằng{" "}
            <strong>tiền thật của anh</strong>, không phải phần trăm giả định.
          </p>
        </section>
      )}

      <section className="plate rise rise-2 mb-4 md:mb-6">
        <div className="plate-hd">
          <h2 className="plate-title">📋 Kết Quả</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-3 py-2 text-left font-bold">Chiến thuật</th>
                <th className="px-2 py-2 text-right font-bold">Kỳ cũ<br />(dò ra)</th>
                <th className="px-2 py-2 text-right font-bold text-[#9fd0ff]">Kỳ mới<br />(thật)</th>
                <th className="px-2 py-2 text-right font-bold">Ngày<br />tệ nhất</th>
                <th className="px-3 py-2 text-right font-bold">Ngày lỗ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, a, b }, i) => (
                <tr
                  key={s.key}
                  data-group={i === STRATEGIES.length ? "shape" : undefined}
                  className={`border-t border-[var(--hairline)] ${
                    s.key === "flat" ? "bg-[rgba(16,185,129,0.09)]" : "hover:bg-white/[0.05]"
                  } ${i === STRATEGIES.length ? "border-t-2 border-t-[rgba(140,180,240,0.35)]" : ""}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-bold text-white text-[0.8rem]">
                      {s.key === "flat" && "⭐ "}
                      {s.name}
                    </div>
                    <div className="text-[0.65rem] text-[var(--text-muted)]">{s.note}</div>
                  </td>
                  <td className={`px-2 py-2 text-right numeric ${tone(a.avg)}`}>{pct(a.avg)}</td>
                  <td className={`px-2 py-2 text-right numeric font-bold ${tone(b.avg)}`}>
                    {pct(b.avg)}
                  </td>
                  <td className={`px-2 py-2 text-right numeric ${tone(b.worst)}`}>{pct(b.worst)}</td>
                  <td className="px-3 py-2 text-right numeric text-[var(--text-secondary)]">
                    {(b.lossRate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 md:px-4 py-3 text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
          Chênh lệch dưới {pct(NOISE)} là nhiễu, không phải lợi thế — hiện màu xám.
        </p>
      </section>

      <section className="plate rise rise-3 mb-4 md:mb-6">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🎲 Dò Tự Động</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Thử hàng nghìn bảng hạn mức, giữ cái lời nhất trên kỳ cũ, rồi đem ra kỳ mới
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[1000, 5000, 20000].map((n) => (
              <button
                key={n}
                onClick={() => huntRandom(n)}
                disabled={seeking}
                className="btn-chrome px-4 py-2 rounded-lg text-xs disabled:opacity-40"
              >
                {seeking ? "Đang dò…" : `Thử ${n.toLocaleString("vi-VN")} phương án`}
              </button>
            ))}
          </div>

          {hunt && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
                <div className="eyebrow">Phương án tốt nhất trên KỲ CŨ</div>
                <div className="numeric text-xl font-bold text-[#7ff0c0] mt-0.5">
                  {pct(hunt.train)}
                </div>
                <div className="text-[0.65rem] text-[var(--text-muted)] mt-1">
                  dò từ {hunt.tries.toLocaleString("vi-VN")} phương án — luôn tìm được cái đẹp
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(248,113,113,0.4)] bg-[rgba(220,38,38,0.12)] px-3 py-2.5">
                <div className="eyebrow">Chính nó, trên KỲ MỚI</div>
                <div className={`numeric text-xl font-bold mt-0.5 ${tone(hunt.test)}`}>
                  {pct(hunt.test)}
                </div>
                <div className="text-[0.65rem] text-[var(--text-muted)] mt-1">
                  đây mới là thứ nhận được khi dùng thật
                </div>
              </div>
            </div>
          )}

          <p className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
            Bấm vài lần với số lượng khác nhau. Càng thử nhiều thì cột trái càng đẹp — vì càng dễ
            tìm ra một bảng tình cờ khớp với những gì đã xảy ra. Cột phải thì lúc dương lúc âm
            quanh 0, và đó chính là câu trả lời.
          </p>
        </div>
      </section>
    </>
  );
}
