"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REGION_LABELS, type Region } from "@/lib/types";
import {
  CHUOI_TOI_DA,
  MUC_TOI_DA,
  SCHEDULE_SLOTS,
  chuanHoaLich,
  datO,
  docO,
  khoaO,
  lichMacDinh,
  moiO,
  tenO,
  type OLich,
  type Schedule,
} from "@/lib/lich-han-muc";

/** 20 ô ngày rồi tới ô "20+" — đúng thứ tự đọc. */
const O_NGAY = moiO().filter((o) => o.loai !== "chuoi");
const O_CHUOI = moiO().filter((o) => o.loai === "chuoi");
const TONG_O = moiO().length;

/**
 * Nhãn in NGAY TRÊN từng ô. Bảng cũ để nhãn một hàng, ô nhập một hàng khác; khi
 * bảng lên 20 ô thì hai hàng xuống dòng lệch nhau — ô nhập của "ngày 0" nằm
 * sát chữ "Max", ô dưới chữ "2" thật ra là ngày 4. Nhãn dính vào ô thì không
 * còn cách nào lệch.
 */
const nhanO = (o: OLich) =>
  o.loai === "tren"
    ? `${SCHEDULE_SLOTS}+ ngày`
    : o.loai === "chuoi"
    ? `${o.so} kỳ liền`
    : o.so === 0
    ? "0 · vừa về"
    : `${o.so} ngày`;

/** Gõ gì cũng ra một số điểm hợp lệ: nguyên, không âm, có trần. Bỏ trống là 0. */
const soNhap = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(MUC_TOI_DA, Math.max(0, n)) : 0;
};

/** "ngày 1–3, 5, 8–19, 20+ · liên tiếp 3, 4" — gọn để đọc được trên điện thoại. */
function tomTat(os: OLich[]): string {
  const ngay = os.filter((o): o is { loai: "ngay"; so: number } => o.loai === "ngay").map((o) => o.so);
  const khuc: string[] = [];
  for (let i = 0; i < ngay.length; i++) {
    let j = i;
    while (j + 1 < ngay.length && ngay[j + 1] === ngay[j] + 1) j++;
    khuc.push(j > i ? `${ngay[i]}–${ngay[j]}` : String(ngay[i]));
    i = j;
  }
  if (os.some((o) => o.loai === "tren")) khuc.push(`${SCHEDULE_SLOTS}+`);
  const chuoi = os.filter((o): o is { loai: "chuoi"; so: number } => o.loai === "chuoi").map((o) => o.so);
  return [khuc.length ? `ngày ${khuc.join(", ")}` : "", chuoi.length ? `liên tiếp ${chuoi.join(", ")}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export default function ScheduleEditor({
  region,
  onSaved,
}: {
  region: Region;
  onSaved: () => void;
}) {
  /** Bảng đang gõ. null = chưa tải xong — KHÔNG vẽ số tạm, vì số tạm bấm Lưu là ghi thật. */
  const [lich, setLich] = useState<Schedule | null>(null);
  /** Bản máy chủ đang giữ, để biết ô nào đã sửa mà chưa lưu. */
  const [daLuu, setDaLuu] = useState<Schedule | null>(null);
  /** Ô mà bản lưu không có số (máy đang tính là 0). */
  const [thieu, setThieu] = useState<{ khoa: string; ten: string }[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [lanTai, setLanTai] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const mienDangXem = useRef(region);
  mienDangXem.current = region;

  // Re-fetch on region change: each region keeps its own limits now. Bảng của
  // miền cũ bị gỡ NGAY, không để nằm lại dưới nhãn miền mới trong lúc chờ tải:
  // bấm Lưu đúng lúc đó là ghi bảng Miền Nam vào Miền Bắc.
  useEffect(() => {
    let huy = false;
    setLich(null);
    setDaLuu(null);
    setThieu([]);
    setLoi(null);
    fetch(`/api/config/schedule?region=${region}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (huy) return;
        if (!d.data) throw new Error("máy chủ không trả bảng");
        const l = chuanHoaLich(d.data).lich;
        setLich(l);
        setDaLuu(l);
        setThieu(Array.isArray(d.thieu) ? d.thieu : []);
      })
      .catch((e) => {
        if (!huy) setLoi(e instanceof Error ? e.message : "lỗi không rõ");
      });
    return () => {
      huy = true;
    };
  }, [region, lanTai]);

  const doi = useMemo(
    () => (lich && daLuu ? moiO().filter((o) => docO(lich, o) !== docO(daLuu, o)) : []),
    [lich, daLuu]
  );
  const dirty = doi.length > 0;
  // Bản lưu thiếu ô thì cũng cho bấm Lưu, để ghi lại đủ 24 ô.
  const canLuu = dirty || thieu.length > 0;

  const dat = (o: OLich, muc: number) => setLich((s) => (s ? datO(s, o, muc) : s));

  /**
   * Sets every cell to the same number.
   *
   * The stepped table spreads limits 8 → 200, and that 25× gap is where all
   * the risk lives: at a zero-margin price the day's payout is a fixed number
   * only when the book is flat, so an uneven table buys volatility and returns
   * nothing for it. Measured over 100.000 draws on the real table: worst day
   * −124,7 triệu and 49% of days in the red, against 0đ either way when flat.
   *
   * Cả 24 ô, kể cả ba ô liên tiếp và ô 20+. Bản trước XOÁ ba ô liên tiếp để lô
   * về liên tiếp "tự lấy theo ô ngày 0"; màn hình lại vẽ ô bị xoá thành số 0.
   * Khách thấy 0, tưởng đang chặn, mà máy vẫn nhận theo ô ngày 0 — đúng cái lỗi
   * "cài 0 mà máy không chặn". Giờ ô nào cũng được ghi thẳng mức phẳng, thấy
   * sao máy tính vậy.
   *
   * Caps only what may be accepted — the book still ends up wherever customers
   * put their money, which is what the exposure page is for.
   */
  function flatten() {
    if (!lich) return;
    const ngay = O_NGAY.filter((o) => o.loai === "ngay").map((o) => docO(lich, o));
    const avg = Math.round(ngay.reduce((a, b) => a + b, 0) / ngay.length) || lich.min_limit;
    const input = window.prompt(
      `Đặt TẤT CẢ ${TONG_O} ô về cùng một mức (${SCHEDULE_SLOTS} ô ngày, ô ${SCHEDULE_SLOTS}+ và ${O_CHUOI.length} ô liên tiếp).

` +
        `Mức trung bình các ô ngày hiện tại là ${avg} điểm.
` +
        `Nhập mức muốn dùng cho mọi lô:`,
      String(avg)
    );
    if (input === null) return;
    const muc = soNhap(input);
    setLich((prev) => {
      if (!prev) return prev;
      let moi = prev;
      for (const o of moiO()) moi = datO(moi, o, muc);
      return moi;
    });
  }

  async function save() {
    if (!lich || saving) return;
    const mien = region;
    setSaving(true);
    try {
      const res = await fetch(`/api/config/schedule?region=${mien}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lich),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      // Đổi miền trong lúc đang lưu: bản trả về là của miền cũ, không được đổ vào bảng miền mới.
      if (mienDangXem.current !== mien) return;
      // Hiện đúng bản máy vừa ghi, không phải bản mình tưởng là đã gửi.
      const l = chuanHoaLich(d.data ?? lich).lich;
      setLich(l);
      setDaLuu(l);
      setThieu([]);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved();
    } catch (err) {
      alert(`Lỗi lưu: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (!confirm("Khôi phục schedule mặc định?")) return;
    setLich(lichMacDinh());
  }

  const tieuDe = (
    <h3 className="text-sm font-semibold text-slate-300">
      📋 Hạn Mức Theo Số Ngày Chưa Về{" "}
      <span className="px-2 py-0.5 rounded bg-[#2563eb] text-white text-xs font-bold">{REGION_LABELS[region]}</span>{" "}
      <span className="text-xs text-slate-500 font-normal">(click số để sửa)</span>
    </h3>
  );

  if (loi) {
    return (
      <div className="p-4 md:p-6" data-lich data-lich-loi>
        {tieuDe}
        <div className="mt-3 rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2.5 text-sm text-[#ffd0d0]">
          Không tải được bảng hạn mức ({loi}). Chưa có số nào được hiện để tránh sửa nhầm trên bảng không phải của máy.{" "}
          <button onClick={() => setLanTai((n) => n + 1)} className="underline font-bold text-white">
            Tải lại
          </button>
        </div>
      </div>
    );
  }

  if (!lich || !daLuu) {
    return (
      <div className="p-4 md:p-6" data-lich data-lich-dang-tai>
        {tieuDe}
        <p className="mt-3 text-sm text-slate-500">Đang tải bảng hạn mức…</p>
      </div>
    );
  }

  const dangChan = moiO().filter((o) => docO(lich, o) <= 0);

  return (
    <div className="p-4 md:p-6" data-lich={region}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {tieuDe}
        <div className="flex gap-1.5">
          <button
            onClick={flatten}
            title="Đặt mọi ô bằng nhau — sổ đều thì tiền phải trả là con số cố định"
            className="px-3 py-1.5 text-xs bg-[rgba(16,185,129,0.15)] border border-[rgba(16,185,129,0.4)] text-[#7ff0c0] hover:bg-[rgba(16,185,129,0.25)] rounded font-semibold"
          >
            ⚖️ Hạn mức phẳng
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06] rounded"
          >
            ↺ Mặc định
          </button>
          <button
            onClick={save}
            disabled={!canLuu || saving}
            data-lich-luu
            className={`px-3 py-1.5 text-xs rounded font-semibold transition-all ${
              canLuu
                ? "bg-emerald-600 text-white shadow-[0_2px_12px_rgba(16,185,129,0.35)] animate-pulse"
                : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
          >
            {saving ? "⏳ Đang lưu..." : savedFlash ? "✅ Đã lưu" : "💾 Lưu"}
          </button>
        </div>
      </div>

      {thieu.length > 0 && (
        <div
          data-lich-thieu
          className="mb-3 rounded-lg border border-[#f87171]/60 bg-[#dc2626]/10 px-3 py-2.5 text-[0.76rem] leading-relaxed text-[#ffe1e1]"
        >
          <b>⚠ {thieu.length} ô trong bản đã lưu không có số:</b> {thieu.map((t) => t.ten).join(", ")}.
          <br />
          Màn hình trước đây vẫn vẽ các ô này là 0, nhưng máy lại tính theo ô khác (ô liên tiếp lấy số của ô ngày 0, ô ngày lấy
          số của ô {SCHEDULE_SLOTS}+) — nên có lô nằm ở ô ghi 0 mà vẫn được nhận. Từ bản này máy tính đúng{" "}
          <b>0 = chặn</b> cho các ô đó, như đang hiện. Muốn nhận thì gõ số vào ô. Bấm <b>Lưu</b> để ghi lại đủ {TONG_O} ô.
        </div>
      )}

      <div className="text-[0.72rem] text-slate-400 mb-1.5">
        <b className="text-slate-200">Lô chưa về</b> — mỗi ô là một mức riêng (điểm), đếm theo số ngày từ lần về gần nhất tới kỳ mới nhất.
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-11 gap-1.5" data-lich-ngay>
        {O_NGAY.map((o) => (
          <O key={khoaO(o)} o={o} lich={lich} daLuu={daLuu} dat={dat} />
        ))}
      </div>

      <div className="mt-3 px-3 py-2.5 rounded bg-amber-500/[0.06] border border-amber-500/[0.18]">
        <strong className="block text-xs text-amber-500 mb-1.5">Lô về liên tiếp — mức riêng, không phải trần:</strong>
        <div className="grid grid-cols-3 gap-1.5 max-w-xs" data-lich-chuoi>
          {O_CHUOI.map((o) => (
            <O key={khoaO(o)} o={o} lich={lich} daLuu={daLuu} dat={dat} />
          ))}
        </div>
        <p className="mt-1.5 text-[0.68rem] leading-snug text-slate-400">
          Lô về ở kỳ mới nhất và đang là kỳ thứ 2, 3, {CHUOI_TOI_DA} liên tiếp thì lấy số ở ô này, <b>không</b> lấy ô “0 · vừa về”.
          Về tới kỳ thứ {CHUOI_TOI_DA + 1} liên tiếp thì đếm lại từ đầu, tính như lô vừa về.
        </p>
      </div>

      <div
        data-lich-dang-chan={dangChan.length}
        className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[0.74rem] leading-relaxed text-slate-300"
      >
        Ô nào để <b className="text-white">0</b> là máy <b className="text-[#ff9d9d]">CHẶN</b> — không nhận lô đang ở ô đó, và lô đó
        vào danh sách chặn. Đang chặn{" "}
        <b className="text-white">
          {dangChan.length}/{TONG_O} ô
        </b>
        {dangChan.length > 0 && <>: {tomTat(dangChan)}</>}.
      </div>

      {canLuu && (
        <div
          data-lich-chua-luu
          className="mt-3 rounded-lg border border-amber-400/70 bg-amber-500/15 px-3 py-2.5 flex flex-wrap items-center gap-2"
        >
          <span className="flex-1 min-w-[180px] text-[0.76rem] leading-snug text-amber-100">
            {dirty ? (
              <>
                <b>⚠ CHƯA lưu</b> — máy vẫn đang tính theo bản cũ. Đã sửa {doi.length} ô:{" "}
                {doi
                  .slice(0, 6)
                  .map((o) => `${tenO(o)} ${docO(daLuu, o)} → ${docO(lich, o)}`)
                  .join(" · ")}
                {doi.length > 6 && ` … và ${doi.length - 6} ô nữa`}.
              </>
            ) : (
              // Chưa sửa gì, chỉ là bản lưu thiếu ô: máy ĐÃ tính các ô đó là 0, Lưu chỉ để ghi lại cho đủ.
              <>
                <b>Bản đã lưu còn thiếu {thieu.length} ô</b> — máy đang tính các ô đó là 0. Bấm Lưu để ghi lại đủ {TONG_O} ô.
              </>
            )}
          </span>
          {dirty && (
            <button
              onClick={() => setLich(daLuu)}
              data-lich-bo
              className="px-3 py-1.5 text-xs rounded border border-white/20 text-slate-200 hover:bg-white/10"
            >
              Bỏ sửa
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            data-lich-luu-duoi
            className="px-4 py-1.5 text-xs rounded font-extrabold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "⏳ Đang lưu..." : "💾 Lưu"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Một ô: nhãn của nó, số của nó, và máy đang nhận hay chặn — cả ba nằm trong cùng một khung. */
function O({
  o,
  lich,
  daLuu,
  dat,
}: {
  o: OLich;
  lich: Schedule;
  daLuu: Schedule;
  dat: (o: OLich, muc: number) => void;
}) {
  const v = docO(lich, o);
  const chan = v <= 0;
  const sua = v !== docO(daLuu, o);
  return (
    <label
      data-o-lich={khoaO(o)}
      data-o-chan={chan ? "1" : "0"}
      data-o-sua={sua ? "1" : "0"}
      title={`${tenO(o)}: ${chan ? "0 — máy CHẶN, không nhận lô đang ở ô này" : `nhận ${v} điểm`}${sua ? " (chưa lưu)" : ""}`}
      className="block rounded-md border px-1 pt-1 pb-1 text-center cursor-text"
      style={{
        borderColor: sua ? "rgba(251,191,36,0.9)" : chan ? "rgba(248,113,113,0.55)" : "#1f2937",
        background: chan ? "rgba(220,38,38,0.10)" : "#0f1623",
      }}
    >
      <span className="block text-[0.6rem] leading-tight font-semibold text-slate-400 whitespace-nowrap">{nhanO(o)}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MUC_TOI_DA}
        value={v}
        onChange={(e) => dat(o, soNhap(e.target.value))}
        onFocus={(e) => e.target.select()}
        // Lăn chuột khi con trỏ đang ở ô số là trình duyệt tự cộng/trừ số đó — sửa tiền mà không ai gõ.
        onWheel={(e) => e.currentTarget.blur()}
        data-o-nhap={khoaO(o)}
        className="w-full bg-transparent text-center text-sm font-mono font-bold py-0.5 focus:outline-none"
        style={{ color: chan ? "#ff9d9d" : "#f1f5f9" }}
      />
      <span
        className="block text-[0.55rem] font-extrabold tracking-wide leading-none"
        style={{ color: chan ? "#ff6b78" : "#34d399" }}
      >
        {chan ? "CHẶN" : "nhận"}
      </span>
    </label>
  );
}
