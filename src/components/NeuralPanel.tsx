"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { provincePrefix } from "@/lib/provinces";
import {
  evaluate,
  limitsFrom,
  LOOKBACK,
  LOS,
  makeNet,
  N_INPUT,
  trainNet,
  type Draw,
  type TrainLog,
} from "@/lib/neural";
import { STAKE_PRICE, WIN_PER_POINT } from "@/lib/exposure";
import type { Region } from "@/lib/types";

const pct = (x: number) => (x * 100).toFixed(2) + "%";
const WARM = 25;

/**
 * The strongest version of "let it learn from the data itself".
 *
 * No hand-picked signals: the network is shown the last 20 draws of every lô
 * exactly as they happened and trained by backpropagation. Three separate
 * stretches of draws — learn, watch, and one it never touches until the end —
 * so the last number is the only one that means anything.
 */
export default function NeuralPanel({ region, draws }: { region: Region; draws: Draw[] }) {
  const toast = useToast();
  const [base, setBase] = useState(125);
  const [dangHoc, setDangHoc] = useState(false);
  const [kq, setKq] = useState<{
    log: TrainLog[];
    bestEpoch: number;
    hoc: number;
    kiem: number;
    thi: { mean: number; worst: number; lossRate: number };
    limits: Record<string, number>;
  } | null>(null);

  const price = STAKE_PRICE[region];
  const n = draws.length;
  const HOC = draws.slice(0, n - 80);
  const VAL = draws.slice(n - 80 - WARM, n - 50);
  const THI = draws.slice(n - 50 - WARM, n);

  function hoc() {
    setDangHoc(true);
    setTimeout(() => {
      try {
        const net = makeNet(12, 777);
        const t = trainNet(net, HOC, VAL, price, WIN_PER_POINT, base, 25, 25, WARM);
        const best = t.log.find((l) => l.epoch === t.bestEpoch);
        setKq({
          log: t.log,
          bestEpoch: t.bestEpoch,
          hoc: best?.train ?? 0,
          kiem: best?.valid ?? 0,
          thi: evaluate(t.bestNet, THI, price, WIN_PER_POINT, base, WARM),
          limits: limitsFrom(t.bestNet, draws, base),
        });
      } catch {
        toast.show("error", "Huấn luyện lỗi");
      } finally {
        setDangHoc(false);
      }
    }, 30);
  }

  async function copyLimits() {
    if (!kq) return;
    const chuoi = LOS.map((lo) => `${lo}b${kq.limits[lo]}n`).join(", ");
    try {
      await navigator.clipboard.writeText(`${provincePrefix(region)}: ${chuoi}`);
      toast.show("success", "Đã copy hạn mức mạng nơ-ron đề xuất");
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  if (n < 140) {
    return (
      <section className="plate p-6 mb-4 md:mb-6 text-sm text-[var(--text-muted)]">
        Mạng nơ-ron cần ít nhất 140 kỳ để chia đủ 3 khung. Hiện có {n}.
      </section>
    );
  }

  return (
    <section className="plate rise rise-2 mb-4 md:mb-6">
      <div className="plate-hd flex-wrap gap-2">
        <div>
          <h2 className="plate-title">🧠 Mạng Nơ-Ron Học Từ Dữ Liệu Thô</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            Không đặc trưng do người chọn — mạng tự nhìn {LOOKBACK} kỳ gần nhất của từng lô
          </p>
        </div>
        <button onClick={hoc} disabled={dangHoc} className="btn-chrome px-4 py-2 rounded-lg text-xs disabled:opacity-40">
          {dangHoc ? "🧠 Đang học…" : "🧠 Huấn luyện mạng"}
        </button>
      </div>

      <div className="p-3 md:p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="eyebrow mb-1">Mức nhận cơ bản</div>
            <input
              type="number"
              value={base}
              step={25}
              min={1}
              onChange={(e) => setBase(Math.max(1, Number(e.target.value)))}
              className="numeric w-full px-3 py-2 rounded-lg text-sm bg-[rgba(255,255,255,0.06)] border border-[var(--hairline)] text-white"
            />
            <div className="text-[0.65rem] text-[var(--text-muted)] mt-1">
              mạng được nhận {Math.round(base * 0.02)} → {base * 2} điểm mỗi lô
            </div>
          </label>
          <div className="text-[0.72rem] text-[var(--text-secondary)] leading-relaxed self-end">
            Kiến trúc: <strong className="numeric">{N_INPUT}</strong> đầu vào →{" "}
            <strong className="numeric">12</strong> nơ-ron ẩn (tanh) → 1 đầu ra.
            <br />
            Chia <strong>{HOC.length - WARM}</strong> kỳ học ·{" "}
            <strong>{VAL.length - WARM}</strong> kỳ theo dõi ·{" "}
            <strong>{THI.length - WARM}</strong> kỳ THI THẬT — ba khung không chồng nhau.
          </div>
        </div>

        {kq && (
          <>
            <LearnCurve log={kq.log} best={kq.bestEpoch} />

            <div className="grid grid-cols-3 gap-3">
              <Box label="Trên kỳ HỌC" value={pct(kq.hoc)} tone={kq.hoc > 0.005 ? "good" : "flat"} />
              <Box label="Trên kỳ THEO DÕI" value={pct(kq.kiem)} tone={kq.kiem > 0.005 ? "good" : "flat"} />
              <Box
                label="THI THẬT — chưa từng thấy"
                value={pct(kq.thi.mean)}
                tone={Math.abs(kq.thi.mean) < 0.005 ? "flat" : kq.thi.mean > 0 ? "good" : "bad"}
                sub={`${(kq.thi.lossRate * 100).toFixed(0)}% ngày lỗ · tệ nhất ${pct(kq.thi.worst)}`}
                big
              />
            </div>

            <div className="rounded-lg border border-[rgba(140,180,240,0.4)] bg-[rgba(77,166,255,0.1)] px-3 py-2.5 text-[0.78rem] text-[#c9e4ff] leading-relaxed">
              Mạng học được <strong>{pct(kq.hoc)}</strong> trên kỳ đã thấy, giữ được{" "}
              <strong>{pct(kq.kiem)}</strong> trên kỳ theo dõi — nhưng khi thi thật trên{" "}
              {THI.length - WARM} kỳ chưa từng chạm tới thì ra <strong>{pct(kq.thi.mean)}</strong>,
              kèm <strong>{(kq.thi.lossRate * 100).toFixed(0)}% ngày lỗ</strong>.
              <br />
              <span className="text-[var(--text-muted)]">
                Khoảng cách giữa cột đầu và cột cuối chính là phần mạng học thuộc lòng chứ không
                phải quy luật.
              </span>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="eyebrow">Mạng đề xuất cho kỳ tới</div>
                <button onClick={copyLimits} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">
                  📋 Copy chuỗi
                </button>
              </div>
              <div className="grid grid-cols-10 gap-1 md:gap-1.5">
                {LOS.map((lo) => {
                  const v = kq.limits[lo];
                  const heat = Math.min(1, v / (base * 2));
                  return (
                    <div
                      key={lo}
                      title={`Lô ${lo}: ${v} điểm`}
                      className="rounded-md px-1 py-1.5 text-center leading-tight border"
                      style={{
                        background: `rgba(139,92,246,${(0.08 + heat * 0.55).toFixed(3)})`,
                        borderColor: `rgba(167,139,250,${(0.2 + heat * 0.45).toFixed(3)})`,
                      }}
                    >
                      <div className="numeric text-[0.7rem] md:text-sm font-bold text-white">{lo}</div>
                      <div className="numeric text-[0.5rem] md:text-[0.62rem] text-[#ddd0ff]">{v}n</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Train against validation, epoch by epoch — where memorising shows up. */
function LearnCurve({ log, best }: { log: TrainLog[]; best: number }) {
  const vals = log.flatMap((l) => [l.train, l.valid]);
  const lo = Math.min(0, ...vals), hi = Math.max(0.01, ...vals);
  const span = hi - lo || 1;
  const W = 600, H = 130;
  const path = (pick: (l: TrainLog) => number) =>
    log
      .map((l, i) => `${i === 0 ? "M" : "L"} ${(i / Math.max(1, log.length - 1)) * W} ${H - ((pick(l) - lo) / span) * H}`)
      .join(" ");
  const zero = H - ((0 - lo) / span) * H;
  const bx = ((best - 1) / Math.max(1, log.length - 1)) * W;

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.03)] p-3">
      <div className="flex gap-4 text-[0.65rem] mb-2">
        <span className="text-[#ffd24a]">━ Kỳ học</span>
        <span className="text-[#4da6ff]">━ Kỳ theo dõi</span>
        <span className="text-[var(--text-muted)]">┄ Hoà vốn</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }} preserveAspectRatio="none">
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
        <line x1={bx} y1="0" x2={bx} y2={H} stroke="rgba(255,255,255,0.18)" />
        <path d={path((l) => l.train)} fill="none" stroke="#f59e0b" strokeWidth="2" />
        <path d={path((l) => l.valid)} fill="none" stroke="#4da6ff" strokeWidth="2" />
      </svg>
      <div className="text-[0.62rem] text-[var(--text-muted)] mt-1">
        Vạch dọc = vòng học tốt nhất theo kỳ theo dõi (epoch {best}) — nơi lẽ ra phải dừng
      </div>
    </div>
  );
}

function Box({
  label, value, tone, sub, big,
}: {
  label: string; value: string; tone: "good" | "bad" | "flat"; sub?: string; big?: boolean;
}) {
  const color = tone === "good" ? "text-[#7ff0c0]" : tone === "bad" ? "text-[#ff9d9d]" : "text-white";
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        big
          ? "border-[rgba(140,180,240,0.5)] bg-[rgba(77,166,255,0.1)]"
          : "border-[var(--hairline)] bg-[rgba(255,255,255,0.04)]"
      }`}
    >
      <div className="eyebrow">{label}</div>
      <div className={`numeric font-bold mt-0.5 ${big ? "text-xl" : "text-lg"} ${color}`}>{value}</div>
      {sub && <div className="text-[0.62rem] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
