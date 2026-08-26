"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import { provincePrefix } from "@/lib/provinces";
import {
  FEATURES,
  LOS,
  policyLimits,
  FLAT_WEIGHTS,
  play,
  summarise,
  train,
  type Draw,
  type DayResult,
  type RunSummary,
  type Weights,
} from "@/lib/sim-ai";
import { POSITIONS, STAKE_PRICE, WIN_PER_POINT } from "@/lib/exposure";
import { REGION_LABELS, type Region } from "@/lib/types";
import NeuralPanel from "./NeuralPanel";

const tr = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const pct = (x: number) => (x * 100).toFixed(2) + "%";

/** How hard the agent is told to care about losing days. */
const MUC_TIEU = [
  { key: 0, ten: "Chỉ tối đa LỜI", note: "Không quan tâm ngày lỗ" },
  { key: 3, ten: "Cân bằng lời / lỗ", note: "Vừa muốn lời vừa ngại lỗ" },
  { key: 10, ten: "Ưu tiên KHÔNG LỖ", note: "Tránh ngày cháy bằng mọi giá" },
] as const;

export default function SimAiPage({ region }: { region: Region }) {
  const toast = useToast();
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [von, setVon] = useState(200_000_000);
  const [base, setBase] = useState(77);
  const [soNgay, setSoNgay] = useState(30);
  const [mucTieu, setMucTieu] = useState<number>(3);
  const [dangHoc, setDangHoc] = useState(false);
  const [kq, setKq] = useState<{
    w: Weights;
    trainScore: number;
    ai: RunSummary;
    phang: RunSummary;
    days: DayResult[];
  } | null>(null);
  const [moNgay, setMoNgay] = useState<string | null>(null);

  useEffect(() => {
    setDraws(null);
    setKq(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => setDraws(d.draws ?? []))
      .catch(() => toast.show("error", "Không tải được lịch sử"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const price = STAKE_PRICE[region];

  /** The draw after the last one on record — the day these limits are for. */
  const ngayMai = useMemo(() => {
    if (!draws || draws.length === 0) return null;
    const [y, m, d] = draws[draws.length - 1].date.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + 1);
    const iso = t.toISOString().slice(0, 10);
    return { iso, hienThi: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
  }, [draws]);

  /** History it may learn from, and the untouched stretch it plays for real. */
  const { hoc, choi } = useMemo(() => {
    if (!draws || draws.length < 80) return { hoc: [], choi: [] };
    const cut = draws.length - soNgay;
    // The play run needs 30 draws of warm-up it can read but is not scored on.
    return { hoc: draws.slice(0, cut), choi: draws.slice(Math.max(0, cut - 30)) };
  }, [draws, soNgay]);

  function hocDi() {
    if (hoc.length < 60) return;
    setDangHoc(true);
    setTimeout(() => {
      try {
        const t = train(hoc, price, WIN_PER_POINT, base, von, {
          riskAversion: mucTieu,
          rounds: 300,
          restarts: 5,
        });
        const a = play(t.weights, choi, price, WIN_PER_POINT, base, von);
        const f = play(FLAT_WEIGHTS, choi, price, WIN_PER_POINT, base, von);
        setKq({
          w: t.weights,
          trainScore: t.trainScore,
          ai: summarise(a.days, a.broke, von),
          phang: summarise(f.days, f.broke, von),
          days: a.days,
        });
      } catch {
        toast.show("error", "Huấn luyện lỗi");
      } finally {
        setDangHoc(false);
      }
    }, 30);
  }

  /**
   * What the trained agent would accept on the next draw, and the ladder that
   * implies. The ladder answers "tăng giảm như nào" directly: bucket every lô
   * by how long it has been quiet, then read off what the agent chose.
   */
  const deXuat = useMemo(() => {
    if (!draws || draws.length === 0) return null;
    // Before any training this is the flat book — which is a real, usable
    // answer, not a placeholder. A page that shows nothing until a button is
    // pressed reads as broken to whoever opens it looking for tomorrow.
    const limits = policyLimits(kq?.w ?? FLAT_WEIGHTS, draws, base);

    const gapOf = (lo: string) => {
      for (let i = draws.length - 1, back = 0; i >= 0; i--, back++) {
        if ((draws[i].hits[lo] ?? 0) > 0) return back;
      }
      return 99;
    };

    const buckets = new Map<number, number[]>();
    for (const lo of LOS) {
      const g = Math.min(gapOf(lo), 9);
      const arr = buckets.get(g);
      if (arr) arr.push(limits[lo]);
      else buckets.set(g, [limits[lo]]);
    }

    const thang = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gap, vals]) => ({
        gap,
        soLo: vals.length,
        tb: Math.round(vals.reduce((x, y) => x + y, 0) / vals.length),
        min: Math.min(...vals),
        max: Math.max(...vals),
      }));

    const vals = LOS.map((lo) => limits[lo]);
    return {
      limits,
      thang,
      tong: vals.reduce((a, b) => a + b, 0),
      gapOf,
      daHoc: !!kq,
      // How many distinct levels the policy actually produced. One level means
      // the agent decided every lô deserves the same money — a conclusion, not
      // a setting, and worth saying out loud because on screen it looks exactly
      // like a hard-coded number.
      soMuc: new Set(vals).size,
      thap: Math.min(...vals),
      cao: Math.max(...vals),
    };
  }, [kq, draws, base]);

  async function copyDeXuat() {
    if (!deXuat) return;
    const chuoi = LOS.filter((lo) => deXuat.limits[lo] > 0)
      .map((lo) => `${lo}b${deXuat.limits[lo]}n`)
      .join(", ");
    try {
      await navigator.clipboard.writeText(`${provincePrefix(region)}: ${chuoi}`);
      toast.show("success", "Đã copy hạn mức AI đề xuất");
    } catch {
      toast.show("error", "Trình duyệt chặn copy");
    }
  }

  if (!draws) {
    return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Đang tải…</div>;
  }
  if (draws.length < 80) {
    return (
      <div className="plate p-10 text-center text-sm text-[var(--text-muted)]">
        Cần ít nhất 80 kỳ để huấn luyện. Hiện có {draws.length}.
      </div>
    );
  }

  return (
    <>
      <section className="plate rise rise-1 mb-4 md:mb-6">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🤖 SIM-AI — {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Cấp vốn cho AI, để nó tự quyết nhận bao nhiêu điểm mỗi lô, mỗi ngày
            </p>
          </div>
        </div>

        <div className="p-3 md:p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Vốn ban đầu" value={von} onChange={setVon} step={50_000_000} hint={tr(von)} />
            <Field label="Mức nhận cơ bản" value={base} onChange={setBase} step={10} hint={`AI được nhận 0 → ${base * 2} điểm mỗi lô`} />
            <Field label="Số ngày chơi thật" value={soNgay} onChange={setSoNgay} step={10} hint={`học trên ${hoc.length - 30} kỳ trước đó`} />
          </div>

          <div>
            <div className="eyebrow mb-1.5">Mục tiêu giao cho AI</div>
            <div className="flex flex-wrap gap-2">
              {MUC_TIEU.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMucTieu(m.key)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-colors ${
                    mucTieu === m.key
                      ? "bg-[#2563eb] text-white"
                      : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
                  }`}
                >
                  {m.ten}
                  <div className="font-normal opacity-70 text-[0.65rem]">{m.note}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={hocDi}
            disabled={dangHoc}
            className="btn-chrome px-5 py-2.5 rounded-lg text-sm disabled:opacity-40"
          >
            {dangHoc ? "🎓 AI đang học…" : "🎓 Cho AI học rồi chơi thử"}
          </button>

          <p className="text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
            AI học bằng thử–sai trên các kỳ cũ, giữ lại điều chỉnh nào làm nó giàu hơn. Sau đó nó
            chơi <strong>{soNgay} kỳ cuối mà nó chưa từng nhìn thấy</strong>, mang theo đúng số vốn
            anh cấp — hết vốn là dừng.
          </p>
        </div>
      </section>

      <NeuralPanel region={region} draws={draws} />

          {deXuat && (
            <section className="plate rise rise-4 mb-4 md:mb-6">
              <div className="plate-hd flex-wrap gap-2">
                <div>
                  <h2 className="plate-title">
                    🎯 NGÀY MAI {ngayMai?.hienThi ?? "—"} — AI Định Nhận Thế Này
                  </h2>
                  <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                    {REGION_LABELS[region]} · tổng {deXuat.tong.toLocaleString("vi-VN")} điểm ={" "}
                    {tr(deXuat.tong * price)} ·{" "}
                    {deXuat.daHoc ? "AI đã học xong" : "mức phẳng — bấm học để AI tự chỉnh"} ·
                    ô đậm hơn = nhận nhiều hơn
                  </p>
                </div>
                <button onClick={copyDeXuat} className="btn-ghost px-3 py-1.5 rounded-lg text-xs">
                  📋 Copy chuỗi
                </button>
              </div>
              <div
                className={`mx-3 md:mx-4 mt-3 rounded-lg border px-3 py-2 text-[0.75rem] leading-relaxed ${
                  deXuat.soMuc === 1
                    ? "border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] text-[#c9f4e0]"
                    : "border-[rgba(140,180,240,0.4)] bg-[rgba(77,166,255,0.1)] text-[#c9e4ff]"
                }`}
              >
                {deXuat.soMuc === 1 ? (
                  <>
                    <strong>AI chọn nhận ĐỀU cả 100 lô ({deXuat.thap}n mỗi con).</strong> Đây là
                    kết luận của nó chứ không phải mức cố định — nó thử đủ cách chia rồi mới bỏ.
                    {deXuat.daHoc && (
                      <>
                        {" "}
                        Muốn thấy nó chia khác nhau thì chọn mục tiêu{" "}
                        <strong>&ldquo;Chỉ tối đa LỜI&rdquo;</strong> rồi học lại — lúc đó nó chia
                        từ 0n tới 154n, nhưng chơi thật thì lỗ.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    AI chia thành <strong>{deXuat.soMuc} mức khác nhau</strong> — thấp nhất{" "}
                    <strong>{deXuat.thap}n</strong>, cao nhất <strong>{deXuat.cao}n</strong>.
                  </>
                )}
              </div>

              <div className="p-2 md:p-4 grid grid-cols-10 gap-1 md:gap-1.5">
                {LOS.map((lo) => {
                  const v = deXuat.limits[lo];
                  const heat = Math.min(1, v / (base * 2));
                  return (
                    <div
                      key={lo}
                      title={`Lô ${lo}: nhận tối đa ${v} điểm · chưa về ${deXuat.gapOf(lo)} ngày`}
                      className="rounded-md px-1 py-1.5 text-center leading-tight border"
                      style={{
                        background: `rgba(77,166,255,${(0.08 + heat * 0.55).toFixed(3)})`,
                        borderColor: `rgba(140,180,240,${(0.2 + heat * 0.45).toFixed(3)})`,
                      }}
                    >
                      <div className="numeric text-[0.7rem] md:text-sm font-bold text-white">
                        {lo}
                      </div>
                      <div className="numeric text-[0.5rem] md:text-[0.62rem] text-[#c9e4ff]">
                        {v}n
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

      {kq && (
        <>
          <section className="plate rise rise-2 mb-4 md:mb-6">
            <div className="plate-hd">
              <h2 className="plate-title">📈 AI Chơi {kq.ai.days} Ngày Thật</h2>
            </div>
            <div className="p-3 md:p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Vốn ban đầu" value={tr(kq.ai.start)} />
                <Stat
                  label="Vốn còn lại"
                  value={tr(kq.ai.end)}
                  tone={kq.ai.profit > 0 ? "good" : kq.ai.profit < 0 ? "bad" : "flat"}
                />
                <Stat
                  label="Lãi / lỗ"
                  value={(kq.ai.profit >= 0 ? "+" : "") + tr(kq.ai.profit)}
                  tone={kq.ai.profit > 0 ? "good" : kq.ai.profit < 0 ? "bad" : "flat"}
                  sub={pct(kq.ai.meanReturn) + " mỗi ngày"}
                />
                <Stat
                  label="Ngày lỗ"
                  value={`${kq.ai.lossDays}/${kq.ai.days}`}
                  tone={kq.ai.lossDays === 0 ? "good" : "bad"}
                  sub={`tệ nhất ${pct(kq.ai.worstDay)}`}
                />
              </div>

              {kq.ai.broke && (
                <div className="rounded-lg border border-[rgba(248,113,113,0.6)] bg-[rgba(220,38,38,0.18)] px-3 py-2.5 text-sm font-bold text-[#ffb4b4]">
                  💀 AI CHÁY VỐN sau {kq.ai.days} ngày
                </div>
              )}

              <Curve ai={kq.ai.curve} phang={kq.phang.curve} von={von} />

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="px-2 py-2 text-left font-bold">Ai chơi</th>
                      <th className="px-2 py-2 text-right font-bold">Vốn cuối</th>
                      <th className="px-2 py-2 text-right font-bold">Lãi/lỗ</th>
                      <th className="px-2 py-2 text-right font-bold">Ngày tệ nhất</th>
                      <th className="px-2 py-2 text-right font-bold">Ngày lỗ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <Row ten="🤖 AI đã học" s={kq.ai} />
                    <Row ten="⭐ Hạn mức phẳng (không học gì)" s={kq.phang} highlight />
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="plate rise rise-3 mb-4 md:mb-6">
            <div className="plate-hd">
              <div>
                <h2 className="plate-title">🧠 AI Đã Học Được Gì</h2>
                <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                  Trọng số càng gần 0 nghĩa là AI càng thấy đặc trưng đó vô dụng
                </p>
              </div>
            </div>
            <div className="p-3 md:p-4 space-y-2">
              {FEATURES.map((f, i) => {
                if (i === 0) return null; // bias: mức nền, không phải tín hiệu
                const v = kq.w[i];
                const w = Math.min(100, (Math.abs(v) / 3) * 100);
                return (
                  <div key={f} className="flex items-center gap-3 text-xs">
                    <span className="w-28 text-[var(--text-secondary)]">{f}</span>
                    <div className="flex-1 h-2 rounded-full bg-[rgba(255,255,255,0.07)] relative overflow-hidden">
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          width: `${Math.max(1.5, w / 2)}%`,
                          left: v >= 0 ? "50%" : `${50 - w / 2}%`,
                          background: Math.abs(v) < 0.5 ? "#64748b" : v > 0 ? "#10b981" : "#dc2626",
                        }}
                      />
                      <div className="absolute left-1/2 top-0 w-px h-full bg-[rgba(255,255,255,0.25)]" />
                    </div>
                    <span
                      className={`numeric w-14 text-right font-bold ${
                        Math.abs(v) < 0.5 ? "text-[var(--text-muted)]" : "text-white"
                      }`}
                    >
                      {v >= 0 ? "+" : ""}
                      {v.toFixed(2)}
                    </span>
                  </div>
                );
              })}

              <p className="text-[0.72rem] text-[var(--text-secondary)] leading-relaxed pt-2">
                Điểm khi học: <strong>{pct(kq.trainScore)}</strong> — so với{" "}
                <strong className={kq.ai.meanReturn >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"}>
                  {pct(kq.ai.meanReturn)}
                </strong>{" "}
                khi chơi thật.
                {Math.max(...kq.w.slice(1).map(Math.abs)) < 0.5 ? (
                  <>
                    <br />
                    <strong className="text-[#7ff0c0]">
                      AI tự bỏ hết đặc trưng lịch sử — nó tự tìm ra hạn mức phẳng.
                    </strong>{" "}
                    Không phải em áp đặt, chính nó học ra.
                  </>
                ) : (
                  <>
                    <br />
                    <strong className="text-[#ffd24a]">
                      AI bám vào lịch sử khá mạnh
                    </strong>{" "}
                    — nếu điểm khi chơi thật thấp hơn hẳn lúc học thì đó là học vẹt, không phải quy
                    luật.
                  </>
                )}
              </p>
            </div>
          </section>


          {/* Nhật ký từng ngày — mở ra là thấy từng lô */}
          <section className="plate rise rise-3 mb-4 md:mb-6">
            <div className="plate-hd">
              <div>
                <h2 className="plate-title">📅 Nhật Ký Từng Ngày</h2>
                <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                  Bấm vào một ngày để xem nhận con nào, bao nhiêu tiền, con nào về
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-3 py-2 text-left font-bold">Ngày</th>
                    <th className="px-2 py-2 text-right font-bold">Số lô nhận</th>
                    <th className="px-2 py-2 text-right font-bold">Tổng điểm</th>
                    <th className="px-2 py-2 text-right font-bold">Thu vào</th>
                    <th className="px-2 py-2 text-right font-bold">Trả ra</th>
                    <th className="px-2 py-2 text-right font-bold">Lãi/lỗ</th>
                    <th className="px-3 py-2 text-right font-bold">Vốn còn</th>
                  </tr>
                </thead>
                <tbody>
                  {kq.days.map((d) => {
                    const nhan = LOS.filter((lo) => (d.limits[lo] ?? 0) > 0);
                    const mo = moNgay === d.date;
                    return (
                      <Fragment key={d.date}>
                        <tr
                          onClick={() => setMoNgay(mo ? null : d.date)}
                          className={`border-t border-[var(--hairline)] cursor-pointer hover:bg-white/[0.06] ${
                            mo ? "bg-white/[0.07]" : ""
                          }`}
                        >
                          <td className="px-3 py-2 numeric text-white">
                            {mo ? "▾ " : "▸ "}
                            {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                            {nhan.length}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                            {d.points.toLocaleString("vi-VN")}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[#7ff0c0]">
                            {tr(d.taken)}
                          </td>
                          <td className="px-2 py-2 text-right numeric text-[#ff9d9d]">
                            {tr(d.payout)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right numeric font-bold ${
                              d.profit > 0 ? "text-[#7ff0c0]" : d.profit < 0 ? "text-[#ff9d9d]" : ""
                            }`}
                          >
                            {(d.profit >= 0 ? "+" : "") + tr(d.profit)}
                          </td>
                          <td className="px-3 py-2 text-right numeric text-white">
                            {tr(d.bankroll)}
                          </td>
                        </tr>

                        {mo && (
                          <tr className="bg-[rgba(0,0,0,0.25)]">
                            <td colSpan={7} className="px-3 py-3">
                              <div className="text-[0.7rem] text-[var(--text-muted)] mb-2">
                                {nhan.length} lô nhận cược · {Object.keys(d.hits).length} lô về ·
                                nền đỏ = lô về và phải trả tiền
                              </div>
                              <div className="grid grid-cols-10 gap-1">
                                {LOS.map((lo) => {
                                  const diem = d.limits[lo] ?? 0;
                                  const ve = d.hits[lo] ?? 0;
                                  const traLo = diem * WIN_PER_POINT * ve;
                                  const laiLo = diem * price - traLo;
                                  return (
                                    <div
                                      key={lo}
                                      title={`Lô ${lo}: nhận ${diem} điểm = ${tr(
                                        diem * price
                                      )}${ve ? ` · về ${ve} nháy, trả ${tr(traLo)}` : " · không về"}`}
                                      className={`rounded px-1 py-1 text-center leading-tight border ${
                                        diem === 0
                                          ? "bg-white/[0.03] border-[var(--hairline)] opacity-50"
                                          : ve > 0
                                          ? "bg-[rgba(220,38,38,0.25)] border-[rgba(248,113,113,0.5)]"
                                          : "bg-[rgba(16,185,129,0.16)] border-[rgba(16,185,129,0.4)]"
                                      }`}
                                    >
                                      <div className="numeric text-[0.68rem] font-bold text-white">
                                        {lo}
                                        {ve > 1 && (
                                          <span className="text-[#ffd24a]">×{ve}</span>
                                        )}
                                      </div>
                                      <div className="numeric text-[0.55rem] text-[var(--text-secondary)]">
                                        {diem === 0 ? "—" : `${diem}n`}
                                      </div>
                                      {diem > 0 && (
                                        <div
                                          className={`numeric text-[0.52rem] font-bold ${
                                            laiLo >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"
                                          }`}
                                        >
                                          {laiLo >= 0 ? "+" : ""}
                                          {tr(laiLo)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {deXuat && (
            <>
              <section className="plate rise rise-3 mb-4 md:mb-6">
                <div className="plate-hd">
                  <div>
                    <h2 className="plate-title">📊 AI Tăng Giảm Theo Số Ngày Chưa Về</h2>
                    <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                      Đây chính là bậc thang mà AI tự rút ra sau khi học
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left font-bold">Ngày chưa về</th>
                        <th className="px-2 py-2 text-right font-bold">Số lô</th>
                        <th className="px-2 py-2 text-right font-bold text-[#9fd0ff]">AI nhận (TB)</th>
                        <th className="px-2 py-2 text-right font-bold">Thấp–cao</th>
                        <th className="px-3 py-2 text-right font-bold">So với phẳng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deXuat.thang.map((r) => {
                        const lech = ((r.tb - base) / base) * 100;
                        return (
                          <tr key={r.gap} className="border-t border-[var(--hairline)]">
                            <td className="px-3 py-2 numeric text-white">
                              {r.gap === 9 ? "9+ ngày" : `${r.gap} ngày`}
                            </td>
                            <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                              {r.soLo}
                            </td>
                            <td className="px-2 py-2 text-right numeric font-bold text-[#9fd0ff]">
                              {r.tb}n
                            </td>
                            <td className="px-2 py-2 text-right numeric text-[var(--text-muted)]">
                              {r.min}–{r.max}
                            </td>
                            <td
                              className={`px-3 py-2 text-right numeric ${
                                Math.abs(lech) < 3
                                  ? "text-[var(--text-muted)]"
                                  : lech > 0
                                  ? "text-[#7ff0c0]"
                                  : "text-[#ff9d9d]"
                              }`}
                            >
                              {lech >= 0 ? "+" : ""}
                              {lech.toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="px-3 md:px-4 py-3 text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
                  Cột cuối gần 0% ở mọi dòng nghĩa là AI <strong>không tăng giảm theo ngày chưa
                  về</strong> — nó nhận đều. Còn nếu chênh lệch lớn thì đối chiếu với ô chơi thật ở
                  trên: học vẹt hay quy luật thật, con số đó nói hết.
                </p>
              </section>

            </>
          )}
        </>
      )}
    </>
  );
}

/** Bankroll over the played days, AI against flat. */
function Curve({ ai, phang, von }: { ai: number[]; phang: number[]; von: number }) {
  const all = [...ai, ...phang, von];
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const W = 600, H = 140;
  const path = (c: number[]) =>
    c
      .map((v, i) => `${i === 0 ? "M" : "L"} ${(i / Math.max(1, c.length - 1)) * W} ${H - ((v - lo) / span) * H}`)
      .join(" ");
  const y0 = H - ((von - lo) / span) * H;

  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.03)] p-3">
      <div className="flex gap-4 text-[0.65rem] mb-2">
        <span className="text-[#4da6ff]">━ AI đã học</span>
        <span className="text-[#7ff0c0]">━ Hạn mức phẳng</span>
        <span className="text-[var(--text-muted)]">┄ Vốn ban đầu</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }} preserveAspectRatio="none">
        <line x1="0" y1={y0} x2={W} y2={y0} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
        <path d={path(phang)} fill="none" stroke="#10b981" strokeWidth="2" />
        <path d={path(ai)} fill="none" stroke="#4da6ff" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[0.62rem] text-[var(--text-muted)] mt-1">
        <span>{tr(lo)}</span>
        <span>{tr(hi)}</span>
      </div>
    </div>
  );
}

function Row({ ten, s, highlight }: { ten: string; s: RunSummary; highlight?: boolean }) {
  return (
    <tr className={`border-t border-[var(--hairline)] ${highlight ? "bg-[rgba(16,185,129,0.1)]" : ""}`}>
      <td className="px-2 py-2 text-[0.8rem] font-bold text-white">{ten}</td>
      <td className="px-2 py-2 text-right numeric">{tr(s.end)}</td>
      <td
        className={`px-2 py-2 text-right numeric font-bold ${
          s.profit > 0 ? "text-[#7ff0c0]" : s.profit < 0 ? "text-[#ff9d9d]" : ""
        }`}
      >
        {(s.profit >= 0 ? "+" : "") + tr(s.profit)}
      </td>
      <td className={`px-2 py-2 text-right numeric ${s.worstDay < 0 ? "text-[#ff9d9d]" : ""}`}>
        {pct(s.worstDay)}
      </td>
      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
        {s.lossDays}/{s.days}
      </td>
    </tr>
  );
}

function Field({
  label, value, onChange, step, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; step: number; hint?: string;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-1">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        min={1}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
        className="numeric w-full px-3 py-2 rounded-lg text-sm bg-[rgba(255,255,255,0.06)] border border-[var(--hairline)] text-white"
      />
      {hint && <div className="text-[0.65rem] text-[var(--text-muted)] mt-1">{hint}</div>}
    </label>
  );
}

function Stat({
  label, value, tone = "flat", sub,
}: {
  label: string; value: string; tone?: "good" | "bad" | "flat"; sub?: string;
}) {
  const color = tone === "good" ? "text-[#7ff0c0]" : tone === "bad" ? "text-[#ff9d9d]" : "text-white";
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className={`numeric text-lg font-bold mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
