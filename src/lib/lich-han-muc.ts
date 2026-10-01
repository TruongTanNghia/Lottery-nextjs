/**
 * Lịch hạn mức lô — phần THUẦN. Không đụng DB, nên trình duyệt, máy chủ, bot
 * và các bộ chạy lại (backtest) cùng gọi đúng MỘT bản.
 *
 * Bảng có 24 ô, mỗi ô đứng riêng:
 *   • 20 ô "n ngày chưa về", n = 0…19. Ô 0 là lô vừa về kỳ gần nhất mà chưa
 *     thành chuỗi;
 *   • 1 ô "20+" cho lô khô từ 20 ngày trở lên;
 *   • 3 ô "về liên tiếp 2 / 3 / 4 kỳ".
 * Số trong ô là điểm nhận. 0 là CHẶN.
 *
 * Luật của module này: Ô NÀO CŨNG PHẢI CÓ SỐ CỦA RIÊNG NÓ. Không còn chuyện
 * "ô trống thì lấy tạm ô khác". Lý do là đúng cái lỗi đã xảy ra:
 *
 *   Bản lưu Miền Nam chỉ có ô "liên tiếp 2" — nút Hạn mức phẳng xoá cả ba ô
 *   liên tiếp, khách gõ lại mỗi ô 2. Màn hình vẽ ô thiếu thành số 0, còn máy
 *   gặp ô thiếu thì lấy ô "ngày 0", lúc đó đang là 100. Khách thấy "3 ngày →
 *   0" mà lô về liên tiếp 3 kỳ vẫn được nhận 100n: "liên tiếp 3 ngày em chặn
 *   về 0, sao máy lại không chặn". Rồi chốt: "ô nào cài về 0 máy tự hiểu là
 *   đang chặn — làm rõ từng ô riêng biệt".
 *
 * Nên bản lưu thiếu ô nào thì ô đó là 0 — đúng con số màn hình đã hiện cho
 * khách suốt thời gian qua — và `thieu` kể tên ô đó ra để màn hình nói rõ,
 * chứ không lặng lẽ đổi.
 */

/** Số ô ngày: 0…19. Từ 20 ngày trở lên dùng ô "20+" (`min_limit`). */
export const SCHEDULE_SLOTS = 20;
/** Chuỗi dài nhất có ô riêng. Về tới kỳ thứ 5 liên tiếp thì đếm lại từ 1 (như lô vừa về). */
export const CHUOI_TOI_DA = 4;
/** Trần cho một ô — chặn số gõ nhầm kiểu dính thêm vài chữ số. */
export const MUC_TOI_DA = 100_000;

export interface Schedule {
  /** Ô "n ngày chưa về", n = 0…SCHEDULE_SLOTS−1. */
  base: Record<number, number>;
  /** Ô "20+": lô khô từ SCHEDULE_SLOTS ngày trở lên. Tên cũ giữ nguyên vì bản lưu đang dùng. */
  min_limit: number;
  /** Ô "về liên tiếp n kỳ", n = 2…CHUOI_TOI_DA. */
  consecutive: Record<number, number>;
  /** Luôn bằng CHUOI_TOI_DA. Còn trong kiểu vì bản lưu và các bộ chạy lại đọc nó. */
  consecutive_reset_after: number;
}

/** Một ô của bảng. */
export type OLich = { loai: "ngay"; so: number } | { loai: "tren" } | { loai: "chuoi"; so: number };

export const khoaO = (o: OLich): string => (o.loai === "tren" ? "tren" : `${o.loai}:${o.so}`);

export function tenO(o: OLich): string {
  if (o.loai === "tren") return `${SCHEDULE_SLOTS}+ ngày`;
  if (o.loai === "chuoi") return `liên tiếp ${o.so} kỳ`;
  return o.so === 0 ? "ngày 0 (vừa về)" : `ngày ${o.so}`;
}

/** Cả 24 ô, theo thứ tự đọc trên màn hình: ngày 0…19, 20+, liên tiếp 2…4. */
export function moiO(): OLich[] {
  const out: OLich[] = [];
  for (let d = 0; d < SCHEDULE_SLOTS; d++) out.push({ loai: "ngay", so: d });
  out.push({ loai: "tren" });
  for (let n = 2; n <= CHUOI_TOI_DA; n++) out.push({ loai: "chuoi", so: n });
  return out;
}

/** Bảng dùng khi miền chưa từng lưu gì — đủ 24 ô, đúng những con số bảng gốc vẫn cho ra. */
export function lichMacDinh(): Schedule {
  const dau = [200, 180, 160, 140, 120, 100, 80, 60, 40, 20];
  const base: Record<number, number> = {};
  for (let d = 0; d < SCHEDULE_SLOTS; d++) base[d] = dau[d] ?? 10;
  return { base, min_limit: 10, consecutive: { 2: 150, 3: 100, 4: 50 }, consecutive_reset_after: CHUOI_TOI_DA };
}

/** Số điểm hợp lệ (nguyên, 0…MUC_TOI_DA), hoặc null nếu thứ đưa vào không phải một con số. */
function soHopLe(v: unknown): number | null {
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(MUC_TOI_DA, Math.max(0, Math.round(n)));
}

/**
 * Dọn một lịch đọc từ ngoài vào (bản lưu, hay thứ trình duyệt gửi lên): đủ 24
 * ô, số nguyên không âm. Ô không có số hợp lệ thì là 0 — tức chặn — và được
 * kể trong `thieu`. Khoá lạ (ô không có trên màn hình) bị bỏ, để không tồn
 * tại ô "tàng hình" nào quyết định tiền.
 *
 * Không phải object (chưa lưu gì) thì trả bảng mặc định, `thieu` rỗng.
 */
export function chuanHoaLich(raw: unknown): { lich: Schedule; thieu: OLich[] } {
  if (!raw || typeof raw !== "object") return { lich: lichMacDinh(), thieu: [] };
  const o = raw as Record<string, unknown>;
  const b = o.base && typeof o.base === "object" ? (o.base as Record<string, unknown>) : {};
  const c = o.consecutive && typeof o.consecutive === "object" ? (o.consecutive as Record<string, unknown>) : {};
  const thieu: OLich[] = [];
  const lay = (v: unknown, oL: OLich): number => {
    const n = soHopLe(v);
    if (n === null) {
      thieu.push(oL);
      return 0;
    }
    return n;
  };
  const base: Record<number, number> = {};
  for (let d = 0; d < SCHEDULE_SLOTS; d++) base[d] = lay(b[String(d)], { loai: "ngay", so: d });
  const min_limit = lay(o.min_limit, { loai: "tren" });
  const consecutive: Record<number, number> = {};
  for (let n = 2; n <= CHUOI_TOI_DA; n++) consecutive[n] = lay(c[String(n)], { loai: "chuoi", so: n });
  return { lich: { base, min_limit, consecutive, consecutive_reset_after: CHUOI_TOI_DA }, thieu };
}

/**
 * Lô đang ở trạng thái này thì thuộc ô nào. Đúng MỘT ô, không có đường lùi:
 *   • vừa về kỳ gần nhất VÀ đang là kỳ thứ 2, 3, 4 liên tiếp → ô liên tiếp;
 *   • còn lại → ô ngày theo số ngày chưa về (0…19), từ 20 trở lên → ô "20+".
 * Chuỗi chỉ tồn tại khi lô về ở kỳ gần nhất, nên `ngày > 0` thì không còn
 * chuỗi nào dù con số chuỗi có ghi gì.
 */
export function oCua(daysSinceLast: number, consecutiveDays: number): OLich {
  const ngay = Number.isFinite(daysSinceLast) ? Math.max(0, Math.floor(daysSinceLast)) : SCHEDULE_SLOTS;
  const chuoi = Number.isFinite(consecutiveDays) ? Math.floor(consecutiveDays) : 0;
  if (ngay === 0 && chuoi >= 2 && chuoi <= CHUOI_TOI_DA) return { loai: "chuoi", so: chuoi };
  if (ngay >= SCHEDULE_SLOTS) return { loai: "tren" };
  return { loai: "ngay", so: ngay };
}

/** Số đang cài ở một ô. Lịch chưa chuẩn hoá mà thiếu ô thì vẫn là 0, cùng luật với `chuanHoaLich`. */
export function docO(lich: Schedule, o: OLich): number {
  const v = o.loai === "tren" ? lich.min_limit : o.loai === "chuoi" ? lich.consecutive?.[o.so] : lich.base?.[o.so];
  return soHopLe(v) ?? 0;
}

/** Hạn mức theo lịch của một lô — đây là chỗ DUY NHẤT trả lời câu đó. */
export function mucTheoLich(lich: Schedule, daysSinceLast: number, consecutiveDays: number): number {
  return docO(lich, oCua(daysSinceLast, consecutiveDays));
}

/** Bản sao của lịch với một ô đổi số. */
export function datO(lich: Schedule, o: OLich, muc: number): Schedule {
  const moi = chuanHoaLich(lich).lich;
  const v = soHopLe(muc) ?? 0;
  if (o.loai === "tren") moi.min_limit = v;
  else if (o.loai === "chuoi") moi.consecutive[o.so] = v;
  else moi.base[o.so] = v;
  return moi;
}

/** Những ô đang để 0 — tức đang chặn. */
export const oDangChan = (lich: Schedule): OLich[] => moiO().filter((o) => docO(lich, o) <= 0);

// ─────────────────────────────────────────────────────────────────────────────
// Trạng thái từng lô, dựng lại từ lịch sử
// ─────────────────────────────────────────────────────────────────────────────

export interface TrangThaiLo {
  /** Ngày về gần nhất, null nếu chưa từng về trong kho. */
  last: string | null;
  /** Số ngày lịch từ lần về gần nhất tới kỳ mới nhất (0 = về ở kỳ mới nhất). */
  days: number;
  /** Đang là kỳ thứ mấy liên tiếp (0 nếu kỳ mới nhất không về). */
  consec: number;
}

// Toàn bộ tính bằng UTC. Dựng ngày theo giờ máy rồi đọc lại bằng toISOString()
// thì ở UTC+7 lệch mất một ngày — từng làm mọi chuỗi sập về 1.
const ngayTruoc = (d: string): string => {
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

const cachNgay = (sau: string, truoc: string): number => {
  const [y1, m1, d1] = sau.split("-").map(Number);
  const [y2, m2, d2] = truoc.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000));
};

/**
 * Trạng thái của 100 lô sau kỳ mới nhất, chạy lại từ kỳ đầu tiên trong kho.
 *
 * Hàm thuần của lịch sử: cùng một bộ kết quả thì luôn ra cùng một trạng thái,
 * bất kể ai gọi, gọi mấy lần hay theo thứ tự nào. Bảng 100 lô, bot và phần ghi
 * lo_status đều đi qua đây, nên không còn hai con số "liên tiếp" khác nhau cho
 * cùng một lô.
 *
 * Luật: về ở kỳ này mà cũng về ở ngày liền trước thì chuỗi +1, không thì chuỗi
 * là 1; quá CHUOI_TOI_DA thì đếm lại từ 1; trượt một kỳ là chuỗi về 0.
 */
export function dungTrangThai(rows: Iterable<{ date: string; lo_number: string }>): {
  ngayCuoi: string | null;
  lo: Map<string, TrangThaiLo>;
} {
  const theoNgay = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = theoNgay.get(r.date);
    if (!s) theoNgay.set(r.date, (s = new Set<string>()));
    s.add(r.lo_number);
  }
  const cacNgay = [...theoNgay.keys()].sort();

  const lo = new Map<string, TrangThaiLo>();
  for (let i = 0; i < 100; i++) lo.set(String(i).padStart(2, "0"), { last: null, days: 0, consec: 0 });

  for (const ngay of cacNgay) {
    const ve = theoNgay.get(ngay)!;
    const homTruoc = ngayTruoc(ngay);
    for (const [so, st] of lo) {
      if (ve.has(so)) {
        st.consec = st.last === homTruoc ? st.consec + 1 : 1;
        if (st.consec > CHUOI_TOI_DA) st.consec = 1;
        st.days = 0;
        st.last = ngay;
      } else {
        st.days = st.last ? cachNgay(ngay, st.last) : st.days + 1;
        st.consec = 0;
      }
    }
  }
  return { ngayCuoi: cacNgay.length ? cacNgay[cacNgay.length - 1] : null, lo };
}
