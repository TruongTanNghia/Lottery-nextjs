"use client";

import { useMemo, useState } from "react";
import { POSITIONS, STAKE_PRICE, WIN_PER_POINT } from "@/lib/exposure";
import { useToast } from "./Toast";
import { REGION_LABELS, type LimitItem, type Region } from "@/lib/types";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};

/** Tên nhóm theo cách người ta gọi ngoài đời, không phải theo chỉ số mảng. */
function tenNhom(l: LimitItem): string {
  if (l.consecutive_days >= 2) return `về liên tiếp ${Math.min(4, l.consecutive_days)} kỳ`;
  if (l.days_since_last === 0) return "vừa về";
  return `${l.days_since_last} kỳ chưa về`;
}

/**
 * "Ngày mai ôm sao" — kỳ tới nhận con nào, mỗi con bao nhiêu.
 *
 * Người vận hành nói đúng chỗ thiếu: "ngày hôm nay ra thì tính được, còn ngày
 * mai ôm sao thì chưa có". Mọi khối khác trên trang đều nhìn về phía sau — dò
 * lại, báo cáo tháng, nhóm nào từng lời. Không khối nào trả lời câu họ phải
 * quyết mỗi tối trước khi mở sổ.
 *
 * Số ở đây không phải mô phỏng: nó là hạn mức mà bảng đang cài sẽ sinh ra cho
 * kỳ tới, dựa trên tình trạng từng lô sau kỳ mới nhất — đúng cái sẽ nhận thật.
 */
export default function NgayMai({
  limits,
  region,
  latestDate,
}: {
  limits: LimitItem[];
  region: Region;
  /** Kỳ mới nhất đã có kết quả — kỳ tới là ngày sau đó. */
  latestDate: string | null;
}) {
  const toast = useToast();
  const [xepTheo, setXepTheo] = useState<"so" | "tien">("so");

  const gia = STAKE_PRICE[region];

  const ngayMai = useMemo(() => {
    if (!latestDate) return null;
    const [y, m, d] = latestDate.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  }, [latestDate]);

  // Hạn mức được tính từ kỳ mới nhất trong kho. Nếu kho đang thiếu vài kỳ — đã
  // xảy ra một lần, cào đứng im 21 ngày — thì mỗi con vẫn mang tình trạng của
  // hôm cào cuối, và bảng này sẽ sai. Nói ra, đừng để người ta ôm theo số cũ.
  const treNgay = useMemo(() => {
    if (!ngayMai) return 0;
    const homNay = new Date();
    const hn = Date.UTC(homNay.getFullYear(), homNay.getMonth(), homNay.getDate());
    const [y, m, d] = ngayMai.split("-").map(Number);
    return Math.round((hn - Date.UTC(y, m - 1, d)) / 86_400_000);
  }, [ngayMai]);

  const tk = useMemo(() => {
    const nhan = limits.filter((l) => l.current_limit > 0);
    const chan = limits.filter((l) => l.current_limit <= 0);
    const diem = nhan.reduce((s, l) => s + l.current_limit, 0);
    const thu = diem * gia;
    // Mỗi kỳ có đúng bấy nhiêu lượt lô về, nên tiền phải trả trung bình là con
    // số biết trước — không phải dự đoán.
    const buTB = (POSITIONS[region] / 100) * diem * WIN_PER_POINT;
    const nangNhat = nhan.reduce(
      (a, l) => Math.max(a, l.current_limit * WIN_PER_POINT),
      0
    );
    const mucs = [...new Set(nhan.map((l) => l.current_limit))].sort((a, b) => b - a);
    return { nhan, chan, diem, thu, buTB, nangNhat, mucs };
  }, [limits, gia, region]);

  // Gom theo MỨC TIỀN, không theo tình trạng. Gom theo tình trạng thì "22 kỳ
  // chưa về", "23 kỳ", "27 kỳ"… mỗi thứ một thẻ riêng dù cùng nhận 15n — hai
  // chục thẻ nói đúng một điều. Người ta cần biết tiền chia làm mấy mức và mỗi
  // mức gồm những con ở tình trạng nào.
  const nhom = useMemo(() => {
    const m = new Map<number, LimitItem[]>();
    for (const l of limits) {
      const a = m.get(l.current_limit);
      if (a) a.push(l);
      else m.set(l.current_limit, [l]);
    }
    return [...m.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([muc, los]) => {
        const kho = los.filter((l) => l.consecutive_days < 2 && l.days_since_last > 0)
          .map((l) => l.days_since_last).sort((a, b) => a - b);
        const phan: string[] = [];
        if (los.some((l) => l.consecutive_days < 2 && l.days_since_last === 0)) phan.push("vừa về");
        const lt = los.filter((l) => l.consecutive_days >= 2).map((l) => Math.min(4, l.consecutive_days));
        if (lt.length) {
          const a = Math.min(...lt), b = Math.max(...lt);
          phan.push(a === b ? `về liên tiếp ${a} kỳ` : `về liên tiếp ${a}–${b} kỳ`);
        }
        if (kho.length) {
          const a = kho[0], b = kho[kho.length - 1];
          phan.push(a === b ? `${a} kỳ chưa về` : `${a}–${b} kỳ chưa về`);
        }
        return { muc, los, mo: phan.join(", ") };
      });
  }, [limits]);

  const danhSach = useMemo(() => {
    const ds = [...limits];
    if (xepTheo === "tien") ds.sort((a, b) => b.current_limit - a.current_limit || a.lo_number.localeCompare(b.lo_number));
    else ds.sort((a, b) => a.lo_number.localeCompare(b.lo_number));
    return ds;
  }, [limits, xepTheo]);

  const chuoi = useMemo(
    () =>
      tk.nhan
        .slice()
        .sort((a, b) => a.lo_number.localeCompare(b.lo_number))
        .map((l) => `${l.lo_number}b${l.current_limit}n`)
        .join(", "),
    [tk.nhan]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chuoi);
      toast.show("success", `Đã copy ${tk.nhan.length} lô`);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };

  if (limits.length === 0) return null;

  return (
    <section className="plate rise rise-1 mb-4 md:mb-6">
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">
            🌅 Ngày Mai Ôm Sao
            {ngayMai &&
              (treNgay > 0
                ? ` — kỳ kế sau ${latestDate!.slice(8, 10)}/${latestDate!.slice(5, 7)}`
                : ` — ${ngayMai.slice(8, 10)}/${ngayMai.slice(5, 7)}`)}
          </h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · mức nhận từng con cho kỳ tới, theo đúng bảng hạn mức đang cài
          </p>
        </div>
        <button onClick={copy} className="btn btn-primary text-xs shrink-0">
          📋 Copy {tk.nhan.length} lô
        </button>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        {treNgay > 0 && (
          <div className="rounded-lg border border-[rgba(248,113,113,0.45)] bg-[rgba(220,38,38,0.12)] px-3 py-2 text-[0.74rem] leading-relaxed text-[#ffd9d9]">
            ⚠️ Kho còn thiếu <b>{treNgay}</b> kỳ — kỳ mới nhất đã có kết quả là{" "}
            <b>{latestDate}</b>. Mấy mức dưới đây tính theo tình trạng của hôm đó, chưa phải hôm
            nay. Bấm <b>Cập nhật</b> cho nó cào đủ rồi hãy ôm theo.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <O nhan="Nhận vào" gt={tien(tk.thu)} phu={`${tk.diem.toLocaleString("vi-VN")} điểm`} mau="#34e6a8" />
          <O nhan="Phải trả (trung bình)" gt={tien(tk.buTB)} phu={`${POSITIONS[region]} lượt lô về mỗi kỳ`} mau="#ff6b78" />
          <O
            nhan="Số lô nhận"
            gt={`${tk.nhan.length}/100`}
            phu={tk.chan.length ? `${tk.chan.length} con chặn` : "không chặn con nào"}
            mau="#8fd0ff"
          />
          <O
            nhan="Con nặng nhất nếu về"
            gt={tien(tk.nangNhat)}
            phu="một nháy"
            mau="#ffd24a"
          />
        </div>

        {/* Con này quyết định đêm nay ngủ được hay không, nên nói thẳng bằng tiền. */}
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2 text-[0.74rem] leading-relaxed text-[var(--text-secondary)]">
          Kỳ tới nhận <b>{tien(tk.thu)}</b>, trung bình phải trả <b>{tien(tk.buTB)}</b> — chênh nhau{" "}
          <b className={tk.thu - tk.buTB >= 0 ? "text-[#7ff0c0]" : "text-[#ff9d9d]"}>
            {tk.thu - tk.buTB >= 0 ? "+" : "−"}
            {tien(Math.abs(tk.thu - tk.buTB))}
          </b>
          . Nhưng đó là mức trung bình: hôm nào mấy con nặng cùng về thì mất nhiều hơn hẳn, con
          nặng nhất một nháy đã là <b className="text-[#ffd24a]">{tien(tk.nangNhat)}</b>.
        </div>

        <div>
          <div className="eyebrow mb-1.5">Tiền chia theo mức</div>
          <div className="flex flex-wrap gap-1.5">
            {nhom.map((g) => (
              <span
                key={g.muc}
                title={g.los.map((l) => l.lo_number).join(" ")}
                className={`rounded px-2 py-1 text-[0.7rem] border ${
                  g.muc > 0
                    ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] text-[#c9f4e0]"
                    : "border-[rgba(248,113,113,0.4)] bg-[rgba(220,38,38,0.1)] text-[#ffd9d9]"
                }`}
              >
                <b className="numeric">{g.muc > 0 ? `${g.muc}n` : "chặn"}</b> ·{" "}
                <b className="numeric">{g.los.length} con</b> ·{" "}
                <span className="text-[var(--text-muted)]">{g.mo}</span> ·{" "}
                <b className="numeric">{tien(g.muc * g.los.length * gia)}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">Xếp theo</span>
          {[
            { k: "so" as const, ten: "Số thứ tự" },
            { k: "tien" as const, ten: "Tiền nhiều → ít" },
          ].map((x) => (
            <button
              key={x.k}
              onClick={() => setXepTheo(x.k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                xepTheo === x.k
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              {x.ten}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1">
          {danhSach.map((l) => {
            const dam = tk.mucs.length > 1 ? tk.mucs.indexOf(l.current_limit) / (tk.mucs.length - 1) : 0;
            return (
              <div
                key={l.lo_number}
                title={`Lô ${l.lo_number} · ${tenNhom(l)} · nhận ${l.current_limit}n = ${tien(
                  l.current_limit * gia
                )}${l.current_limit > 0 ? ` · về một nháy trả ${tien(l.current_limit * WIN_PER_POINT)}` : ""}`}
                className={`rounded px-1 py-1 text-center leading-tight border ${
                  l.current_limit <= 0
                    ? "bg-white/[0.03] border-[var(--hairline)] opacity-45"
                    : "border-[rgba(16,185,129,0.4)]"
                }`}
                style={
                  l.current_limit > 0
                    ? { background: `rgba(16,185,129,${(0.06 + (1 - dam) * 0.22).toFixed(3)})` }
                    : undefined
                }
              >
                <div className="numeric text-[0.7rem] font-bold text-white">{l.lo_number}</div>
                <div className="numeric text-[0.58rem] text-[var(--text-secondary)]">
                  {l.current_limit > 0 ? `${l.current_limit}n` : "chặn"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[0.68rem] text-[var(--text-muted)] leading-relaxed">
          Ô đậm hơn = nhận nhiều tiền hơn. Rê chuột vào ô để xem con đó đang ở tình trạng nào và
          nếu về một nháy thì phải trả bao nhiêu. Đổi bảng hạn mức ở trên là bảng này đổi theo ngay.
        </div>
      </div>
    </section>
  );
}

function O({ nhan, gt, phu, mau }: { nhan: string; gt: string; phu?: string; mau: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg md:text-xl leading-none" style={{ color: mau }}>
        {gt}
      </div>
      {phu && <div className="text-[0.64rem] text-[var(--text-muted)] mt-1">{phu}</div>}
    </div>
  );
}
