"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { docCuoc } from "@/lib/doc-cuoc";
import { STAKE_PRICE } from "@/lib/exposure";
import ThuGon from "./ThuGon";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const dd = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

const VIDU = `08/09
12b50n, 34b100n
56,78b200
90b1.500n`;

/**
 * Cửa để đưa sổ cược thật vào máy.
 *
 * Mọi con số lời/lỗ trên trang này từ trước tới nay đều là mô phỏng một cuốn
 * sổ đầy 100 lô, vì bảng `bets` chưa từng có dòng nào. Không phải người ta
 * không chịu đưa số — API nhận sổ đã nằm đó từ lâu — mà là chưa ai làm cái
 * cửa. Đây là cửa đó, và nó mở đúng chỗ người ta nhận cược: dán đoạn chat.
 *
 * Chỗ quan trọng nhất của màn hình này không phải ô dán, mà là phần khoe ra
 * những dòng KHÔNG đọc được. Một cái máy nhập sổ tiền mà im lặng nuốt mất vài
 * dòng thì tai hại hơn hẳn cái máy từ chối thẳng.
 */
export default function NhapSoCuoc({
  region,
  onSaved,
}: {
  region: Region;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [ngay, setNgay] = useState(() => new Date().toISOString().slice(0, 10));
  const [dangLuu, setDangLuu] = useState(false);
  const [moBoQua, setMoBoQua] = useState(false);
  const [kho, setKho] = useState<{ soNgay: number; tu: string; den: string } | null>(null);

  const gia = STAKE_PRICE[region];

  const docKho = useCallback(async () => {
    try {
      const r = await fetch(`/api/bets/bulk?region=${region}`).then((x) => x.json());
      const books: { date: string }[] = r.books ?? [];
      const ngays = books.map((b) => b.date).sort();
      setKho({
        soNgay: ngays.length,
        tu: ngays[0] ?? "",
        den: ngays[ngays.length - 1] ?? "",
      });
    } catch {
      setKho(null);
    }
  }, [region]);

  useEffect(() => {
    setText("");
    setKho(null);
    docKho();
  }, [region, docKho]);

  const kq = useMemo(() => (text.trim() ? docCuoc(text, ngay) : null), [text, ngay]);

  const luu = async () => {
    if (!kq || kq.ngays.length === 0) return;
    setDangLuu(true);
    try {
      const r = await fetch(`/api/bets/bulk?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: kq.ngays.map((n) => ({ date: n.date, points: n.points })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail ?? String(r.status));
      toast.show("success", `Đã lưu ${d.days} ngày · ${d.rows} dòng`);
      setText("");
      await docKho();
      onSaved?.();
    } catch (e) {
      toast.show("error", `Không lưu được — ${e instanceof Error ? e.message : "lỗi"}`);
    } finally {
      setDangLuu(false);
    }
  };

  const tongDiem = kq?.ngays.reduce((s, n) => s + n.tongDiem, 0) ?? 0;

  return (
    <ThuGon
      khoa="nhap-so-cuoc"
      moSan
      tieuDe="📥 Nhập Sổ Cược Thật"
      phu={`${REGION_LABELS[region]} · dán đoạn chat nhận cược vào, máy tự bóc ra số và điểm`}
      phai={
        kho && (
          <span
            className={`rounded px-2 py-0.5 text-[0.66rem] font-bold shrink-0 ${
              kho.soNgay === 0
                ? "bg-[rgba(245,158,11,0.18)] text-[#ffd24a]"
                : "bg-[rgba(16,185,129,0.16)] text-[#7ff0c0]"
            }`}
          >
            {kho.soNgay === 0 ? "CHƯA CÓ SỔ" : `${kho.soNgay} ngày`}
          </span>
        )
      }
    >
      <div className="p-3 md:p-4 space-y-3">
        {/* Vì sao màn hình này tồn tại — nói một lần, ngay đầu. */}
        {kho?.soNgay === 0 && (
          <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.1)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9b8]">
            Kho sổ cược đang <b>trống</b>. Nên mọi con số lời/lỗ trên trang này đang tính trên một
            cuốn sổ <b>mô phỏng nhận đủ 100 lô</b>, không phải sổ thật. Dán sổ vào đây thì các
            khối kia mới bám đúng tiền.
          </div>
        )}
        {kho && kho.soNgay > 0 && (
          <div className="text-[0.72rem] text-[var(--text-secondary)]">
            Kho đang có <b className="text-white">{kho.soNgay} ngày</b> — từ{" "}
            <b>{dd(kho.tu)}</b> tới <b>{dd(kho.den)}</b>. Dán lại một ngày đã có là{" "}
            <b>ghi đè</b> ngày đó, không cộng thêm.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Ngày mặc định</span>
          <input
            type="date"
            value={ngay}
            onChange={(e) => setNgay(e.target.value)}
            className="bg-white/[0.08] border border-[var(--hairline)] rounded-lg px-2 py-1 text-xs text-white"
          />
          <span className="text-[0.66rem] text-[var(--text-muted)]">
            dùng cho phần đứng trước mốc ngày đầu tiên trong đoạn dán
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={VIDU}
          className="w-full bg-black/25 border border-[var(--hairline)] rounded-lg px-3 py-2 text-[0.8rem] text-white font-mono leading-relaxed placeholder:text-[var(--text-muted)]"
        />

        <div className="text-[0.66rem] text-[var(--text-muted)] leading-relaxed">
          Hiểu được <b>12b50n</b>, <b>12,34,56b100</b>, <b>12 34 x 200</b>, <b>56=75</b>, và{" "}
          <b>1.000</b> nghĩa là một nghìn điểm. Dòng chỉ có ngày (<b>08/09</b>) thì cắt sang ngày
          mới, nên dán cả tháng một lượt được. Dòng nào có <b>đề</b>, <b>3 càng</b>, <b>xiên</b>,{" "}
          <b>đầu/đuôi</b> thì bỏ qua — sổ này chỉ ghi lô.
        </div>

        {kq && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
              <div className="text-[0.76rem] text-[var(--text-secondary)] mb-1.5">
                Đọc được <b className="text-[#7ff0c0]">{kq.soLuot} lượt</b> trong{" "}
                <b className="text-white">{kq.ngays.length} ngày</b> — tổng{" "}
                <b className="numeric text-white">{tongDiem.toLocaleString("vi-VN")} điểm</b> ={" "}
                <b className="numeric text-[#34e6a8]">{tien(tongDiem * gia)}</b>
              </div>
              {kq.ngays.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.72rem]">
                    <thead>
                      <tr className="text-left text-[var(--text-muted)]">
                        <th className="py-1 pr-2 font-semibold">Ngày</th>
                        <th className="py-1 pr-2 font-semibold text-right">Số lô</th>
                        <th className="py-1 pr-2 font-semibold text-right">Điểm</th>
                        <th className="py-1 font-semibold text-right">Tiền nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kq.ngays.map((n) => (
                        <tr key={n.date} className="border-t border-[var(--hairline)]">
                          <td className="py-1 pr-2 numeric text-white">{dd(n.date)}</td>
                          <td className="py-1 pr-2 text-right numeric">{n.soLo}</td>
                          <td className="py-1 pr-2 text-right numeric">
                            {n.tongDiem.toLocaleString("vi-VN")}
                          </td>
                          <td className="py-1 text-right numeric text-[#7ff0c0]">
                            {tien(n.tongDiem * gia)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Phần quan trọng nhất màn hình: cái gì KHÔNG vào được sổ. */}
            {kq.boQua.length > 0 && (
              <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.1)] px-3 py-2">
                <button
                  onClick={() => setMoBoQua((v) => !v)}
                  className="text-[0.74rem] font-bold text-[#ffd24a] flex items-center gap-1.5"
                >
                  <span className={`transition-transform ${moBoQua ? "rotate-90" : ""}`}>▶</span>
                  Không đưa vào sổ {kq.boQua.length} dòng — xem cho chắc
                </button>
                {moBoQua && (
                  <ul className="mt-1.5 space-y-1 text-[0.7rem] leading-relaxed">
                    {kq.boQua.slice(0, 40).map((x, i) => (
                      <li key={i} className="text-[var(--text-secondary)]">
                        <span className="font-mono text-white">{x.dong}</span>
                        <span className="text-[var(--text-muted)]"> — {x.vi}</span>
                      </li>
                    ))}
                    {kq.boQua.length > 40 && (
                      <li className="text-[var(--text-muted)]">
                        …và {kq.boQua.length - 40} dòng nữa
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={luu}
            disabled={dangLuu || !kq || kq.ngays.length === 0}
            className="btn btn-primary text-xs disabled:opacity-40"
          >
            {dangLuu ? "Đang lưu…" : `💾 Lưu ${kq?.ngays.length ?? 0} ngày vào sổ`}
          </button>
          {text && (
            <button
              onClick={() => setText("")}
              disabled={dangLuu}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
            >
              Xoá ô dán
            </button>
          )}
        </div>
      </div>
    </ThuGon>
  );
}
