"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./Toast";
import {
  analyseBook,
  fairPrice,
  margin,
  parseBetString,
  payoutForMargin,
  priceForMargin,
  STAKE_PRICE,
  WIN_PER_POINT,
  hitsPerDraw,
  POSITIONS,
} from "@/lib/exposure";
import { REGION_LABELS, type Region } from "@/lib/types";

const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

function vnd(n: number): string {
  const sign = n < 0 ? "−" : "";
  return sign + Math.abs(Math.round(n)).toLocaleString("vi-VN") + "đ";
}

/** 2.700.000 → "2,7tr" — the whole board has to fit on a phone. */
function short(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}tr`;
  if (a >= 1_000) return `${sign}${Math.round(a / 1_000)}k`;
  return `${sign}${Math.round(a)}`;
}

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function ExposurePage({ region }: { region: Region }) {
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const [hasDraw, setHasDraw] = useState(false);
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDirty(false);
    fetch(`/api/bets?region=${region}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setPoints(d.points ?? {});
        setDrawn(d.drawn ?? {});
        setHasDraw(!!d.hasDraw);
      })
      .catch(() => toast.show("error", "Không tải được sổ cược"))
      .finally(() => setLoading(false));
  }, [region, date, toast]);

  const book = useMemo(() => analyseBook({ points, region }), [points, region]);

  /** What actually happened, once the draw is in. */
  const settled = useMemo(() => {
    if (!hasDraw) return null;
    const payout = LOS.reduce(
      (s, lo) => s + (points[lo] ?? 0) * WIN_PER_POINT * (drawn[lo] ?? 0),
      0
    );
    return { payout, net: book.taken - payout };
  }, [hasDraw, drawn, points, book.taken]);

  function applyPaste() {
    const { points: p, entries, hasDe, bad } = parseBetString(paste);
    if (entries === 0) {
      toast.show("error", "Không đọc được mã cược nào trong đoạn vừa dán");
      return;
    }
    // Adds to what is already there: a day's book arrives in several messages.
    setPoints((prev) => {
      const next = { ...prev };
      for (const [lo, v] of Object.entries(p)) next[lo] = (next[lo] ?? 0) + v;
      return next;
    });
    setDirty(true);
    setPaste("");
    toast.show(
      bad.length ? "info" : "success",
      `Đã cộng ${entries} lô` +
        (bad.length ? ` · bỏ qua ${bad.length} mã lạ: ${bad.slice(0, 3).join(", ")}` : "") +
        (hasDe ? " · phần đề CHƯA được tính" : "")
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bets?region=${region}&date=${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDirty(false);
      toast.show("success", "Đã lưu sổ cược");
    } catch (err) {
      toast.show("error", `Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  const m = margin(region);
  const worst = book.riskiest.filter((l) => l.points > 0).slice(0, 8);
  // Scale the heat map by the biggest single-lô exposure on the book.
  const maxHit = Math.max(...book.perLo.map((l) => l.perHit), 1);

  return (
    <>
      {/* ── Cảnh báo biên lợi nhuận ─────────────────────────────── */}
      <section
        className={`mb-4 rounded-xl border px-4 py-3 ${
          m <= 0
            ? "bg-[rgba(220,38,38,0.16)] border-[rgba(248,113,113,0.55)]"
            : "bg-[rgba(16,185,129,0.13)] border-[rgba(16,185,129,0.45)]"
        }`}
      >
        <div className={`text-sm font-bold ${m <= 0 ? "text-[#ffb4b4]" : "text-[#7ff0c0]"}`}>
          {m <= 0
            ? `🔴 Biên lợi nhuận ${(m * 100).toFixed(2)}% — ván cược công bằng, dài hạn không lãi`
            : `🟢 Biên lợi nhuận ${(m * 100).toFixed(2)}%`}
        </div>
        <div className="text-[0.72rem] text-[var(--text-muted)] mt-1 leading-relaxed">
          {REGION_LABELS[region]}: {POSITIONS[region]} vị trí giải/kỳ → 1 lô về trung bình{" "}
          <strong>{hitsPerDraw(region).toFixed(2)}</strong> lần → kỳ vọng phải trả{" "}
          <strong>{vnd(fairPrice(region))}</strong>/điểm, đang thu{" "}
          <strong>{vnd(STAKE_PRICE[region])}</strong>/điểm.
          <br />
          Muốn biên 3%: thu <strong>{vnd(priceForMargin(region, 0.03))}</strong> — hoặc giữ giá,
          hạ trả trúng còn <strong>{vnd(payoutForMargin(region, 0.03))}</strong>.
        </div>
      </section>

      {/* ── Nhập sổ cược ────────────────────────────────────────── */}
      <section className="plate rise rise-1 mb-4 md:mb-6">
        <div className="plate-hd flex-wrap gap-2">
          <div>
            <h2 className="plate-title">📥 Sổ Cược Đã Nhận</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Dán nguyên tin nhắn khách gửi — máy tự đọc
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="numeric px-3 py-1.5 rounded-lg text-xs bg-white/[0.09] border border-[var(--hairline)] text-white"
            />
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="btn-chrome px-4 py-2 rounded-lg text-xs disabled:opacity-40"
            >
              {saving ? "Đang lưu…" : dirty ? "Lưu sổ" : "Đã lưu"}
            </button>
          </div>
        </div>

        <div className="p-3 md:p-4 space-y-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder="27b50n, 51b30n, 08b10n …   (dán cả tiền tố tỉnh cũng được)"
            className="numeric w-full px-3 py-2 rounded-lg text-xs bg-[rgba(255,255,255,0.05)] border border-[var(--hairline)] text-white placeholder:text-[var(--text-muted)]"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={applyPaste} disabled={!paste.trim()} className="btn-chrome px-4 py-2 rounded-lg text-xs disabled:opacity-40">
              ➕ Cộng vào sổ
            </button>
            <button
              onClick={() => {
                if (book.totalPoints > 0 && !confirm("Xoá sạch sổ cược ngày này?")) return;
                setPoints({});
                setDirty(true);
              }}
              className="btn-ghost px-3 py-2 rounded-lg text-xs"
            >
              🗑 Xoá sổ
            </button>
            {dirty && (
              <span className="self-center text-[0.65rem] text-[#ffd24a]">chưa lưu</span>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">Đang tải…</div>
      ) : book.totalPoints === 0 ? (
        <div className="plate p-10 text-center text-sm text-[var(--text-muted)]">
          Chưa có cược nào cho ngày này. Dán tin nhắn khách vào ô trên.
        </div>
      ) : (
        <>
          {/* ── Tổng quan ───────────────────────────────────────── */}
          <section className="plate rise rise-2 mb-4 md:mb-6">
            <div className="plate-hd">
              <h2 className="plate-title">💰 Vị Thế Ngày {date.slice(8, 10)}/{date.slice(5, 7)}</h2>
            </div>
            <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Tổng điểm nhận" value={book.totalPoints.toLocaleString("vi-VN")} />
              <Stat label="Tiền thu vào" value={vnd(book.taken)} tone="good" />
              <Stat label="Kỳ vọng phải trả" value={vnd(book.expectedPayout)} />
              <Stat
                label="Lãi kỳ vọng"
                value={vnd(book.expectedProfit)}
                tone={book.expectedProfit > 0 ? "good" : book.expectedProfit < 0 ? "bad" : "flat"}
              />
            </div>
            <div className="px-3 md:px-4 pb-4 text-[0.7rem] text-[var(--text-muted)] leading-relaxed">
              Nếu <strong>mọi lô đều về đúng 1 nháy</strong> thì phải trả{" "}
              <strong className="text-[#ffb4b4]">{vnd(book.worstCaseAllOnce)}</strong> — đây là trần
              tuyệt đối, thực tế chỉ khoảng {(hitsPerDraw(region) * 100).toFixed(0)}% số lô về.
              <br />
              Độ dồn cược: <strong>{(book.concentration * 100).toFixed(1)}%</strong>{" "}
              {book.concentration > 0.05
                ? "— đang dồn vào ít số, một con nổ là đau"
                : "— trải khá đều, rủi ro phân tán"}
            </div>
          </section>

          {/* ── Kết quả thật, nếu đã xổ ─────────────────────────── */}
          {settled && (
            <section className="plate rise rise-2 mb-4 md:mb-6">
              <div className="plate-hd">
                <h2 className="plate-title">🎯 Kết Quả Thật</h2>
              </div>
              <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                <Stat label="Thu vào" value={vnd(book.taken)} />
                <Stat label="Đã trả ra" value={vnd(settled.payout)} tone="bad" />
                <Stat
                  label={settled.net >= 0 ? "LÃI" : "LỖ"}
                  value={vnd(settled.net)}
                  tone={settled.net >= 0 ? "good" : "bad"}
                />
              </div>
            </section>
          )}

          {/* ── Lô nguy hiểm nhất ───────────────────────────────── */}
          <section className="plate rise rise-3 mb-4 md:mb-6">
            <div className="plate-hd">
              <div>
                <h2 className="plate-title">⚠️ Lô Nguy Hiểm Nhất</h2>
                <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                  Nếu con này về, ngày hôm nay kết thúc ở đâu
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-3 py-2 text-left font-bold">Lô</th>
                    <th className="px-2 py-2 text-right font-bold">Điểm</th>
                    <th className="px-2 py-2 text-right font-bold">% sổ</th>
                    <th className="px-2 py-2 text-right font-bold">Trả 1 nháy</th>
                    <th className="px-2 py-2 text-right font-bold">Về 1 nháy</th>
                    <th className="px-3 py-2 text-right font-bold">Về 2 nháy</th>
                  </tr>
                </thead>
                <tbody>
                  {worst.map((l) => (
                    <tr key={l.lo} className="border-t border-[var(--hairline)] hover:bg-white/[0.06]">
                      <td className="px-3 py-2">
                        <span className="numeric text-base font-bold text-white">{l.lo}</span>
                        {(drawn[l.lo] ?? 0) > 0 && (
                          <span className="ml-1.5 text-[0.6rem] text-[#34e6a8]">
                            đã về {drawn[l.lo]}×
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right numeric">{l.points}</td>
                      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                        {(l.share * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-right numeric text-[var(--text-secondary)]">
                        {vnd(l.perHit)}
                      </td>
                      <td className={`px-2 py-2 text-right numeric font-bold ${l.netIfOnce < 0 ? "text-[#ff9d9d]" : "text-[#7ff0c0]"}`}>
                        {vnd(l.netIfOnce)}
                      </td>
                      <td className={`px-3 py-2 text-right numeric font-bold ${l.netIfTwice < 0 ? "text-[#ff9d9d]" : "text-[#7ff0c0]"}`}>
                        {vnd(l.netIfTwice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Bản đồ 100 ô ────────────────────────────────────── */}
          <section className="plate rise rise-4 mb-4 md:mb-6">
            <div className="plate-hd">
              <div>
                <h2 className="plate-title">🗺 Bản Đồ Rủi Ro 100 Lô</h2>
                <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
                  Càng đỏ càng nhiều tiền · số dưới là lãi/lỗ nếu con đó về 1 nháy
                </p>
              </div>
            </div>
            <div className="p-2 md:p-4 grid grid-cols-10 gap-1 md:gap-1.5">
              {LOS.map((lo) => {
                const l = book.perLo[Number(lo)];
                const heat = l.perHit / maxHit;
                const hit = (drawn[lo] ?? 0) > 0;
                return (
                  <div
                    key={lo}
                    title={`Lô ${lo} · ${l.points} điểm · về 1 nháy → ${vnd(l.netIfOnce)}`}
                    className={`rounded-md px-1 py-1.5 text-center leading-tight border ${
                      hit ? "ring-2 ring-[#34e6a8]" : ""
                    }`}
                    style={{
                      background:
                        l.points > 0
                          ? `rgba(220,38,38,${(0.12 + heat * 0.6).toFixed(3)})`
                          : "rgba(255,255,255,0.03)",
                      borderColor:
                        l.points > 0 ? `rgba(248,113,113,${(0.25 + heat * 0.5).toFixed(3)})` : "var(--hairline)",
                    }}
                  >
                    <div className="numeric text-[0.7rem] md:text-sm font-bold text-white">{lo}</div>
                    <div className="numeric text-[0.5rem] md:text-[0.6rem] text-[var(--text-muted)]">
                      {l.points > 0 ? `${l.points}đ` : "—"}
                    </div>
                    {l.points > 0 && (
                      <div className="numeric text-[0.5rem] md:text-[0.6rem] font-bold text-[#ffb4b4]">
                        {short(l.netIfOnce)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="px-3 md:px-4 pb-4 text-[0.65rem] text-[var(--text-muted)]">
              Viền xanh = lô đã về trong kỳ này. Ô trắng = chưa nhận cược, về cũng không mất gì.
            </p>
          </section>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "flat";
}) {
  const color =
    tone === "good" ? "text-[#7ff0c0]" : tone === "bad" ? "text-[#ff9d9d]" : "text-white";
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className={`numeric text-base md:text-lg font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
