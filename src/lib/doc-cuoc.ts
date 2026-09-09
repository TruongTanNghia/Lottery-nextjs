/**
 * Bóc sổ cược ra từ đoạn chat dán vào.
 *
 * Bảng `bets` trống suốt từ đầu không phải vì khách không chịu đưa số — API
 * nhận sổ đã có sẵn từ lâu — mà vì không có cái cửa nào để đưa vào. Người ta
 * nhận cược qua Telegram, nên cửa phải mở đúng chỗ đó: dán nguyên đoạn chat.
 *
 * Nguyên tắc xuyên suốt: thà bỏ qua còn hơn đoán. Đây là sổ tiền, một dòng
 * đọc sai là sai cả tháng báo cáo. Nên chỗ nào không chắc thì không nhận, và
 * mọi dòng bị bỏ đều phải trả về nguyên văn để người ta tự nhìn — im lặng nuốt
 * mất một dòng còn tệ hơn từ chối cả đoạn.
 */

/** Một lượt bắt được: mấy con này, mỗi con ngần này điểm. */
export interface LuotDoc {
  raw: string;
  los: string[];
  diem: number;
}

export interface NgayDoc {
  date: string;
  points: Record<string, number>;
  soLo: number;
  tongDiem: number;
  luot: LuotDoc[];
}

export interface KetQuaDoc {
  ngays: NgayDoc[];
  /** Dòng không hiểu, giữ nguyên văn kèm lý do — bắt buộc phải hiện ra. */
  boQua: { dong: string; vi: string }[];
  soLuot: number;
}

/**
 * Kiểu cược khác lô thì tuyệt đối không được nhận.
 *
 * Sổ này chỉ ghi lô. Một dòng đề "de 12b100n" mà bị đọc thành lô 12 thì báo
 * cáo lệch mà không ai biết vì sao — nguy hơn hẳn việc bỏ sót nó.
 */
const KIEU_KHAC =
  /(^|[^a-zà-ỹ])(đề|de|dd|3c|3 càng|bacang|ba càng|xc|xiu chu|xỉu chủ|dau|đầu|duoi|đuôi|lo xien|lô xiên|xien|xiên|dt|đá thẳng|da thang)([^a-zà-ỹ]|$)/i;

/** Ngày đứng một mình trên dòng: "08/09", "8/9/2026", "Ngày 08-09", "2026-09-08". */
const CHI_NGAY =
  /^(?:ngày|ngay|n\.|date)?\s*[:\-]?\s*(\d{4})-(\d{2})-(\d{2})\s*$|^(?:ngày|ngay|n\.|date)?\s*[:\-]?\s*(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\s*$/i;

/**
 * Một lượt cược: một hoặc nhiều lô hai chữ số, rồi tới điểm.
 *
 * Chấp nhận "12b50n", "12,34,56b100", "12 34 x 200", "12=50". Bắt buộc phải
 * có dấu ngăn giữa danh sách lô và số điểm — không có thì "1250" là lô hay là
 * điểm cũng không biết, mà đoán ở đây là đoán tiền.
 */
const LUOT = /((?:\d{2}[\s,.;\-\/·+]+)*\d{2})\s*(?:b|x|\*|=|:)\s*(\d[\d.,]*)\s*(?:n|nghìn|ng|k|đ|d)?/gi;

const hai = (n: number) => String(n).padStart(2, "0");

/** "1.000" và "1,000" đều là một nghìn — sổ này không dùng số lẻ. */
function docDiem(raw: string): number {
  const n = Number(raw.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function docNgay(dong: string, namMacDinh: number): string | null {
  const m = CHI_NGAY.exec(dong.trim());
  if (!m) return null;
  if (m[1]) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = Number(m[4]);
  const th = Number(m[5]);
  if (d < 1 || d > 31 || th < 1 || th > 12) return null;
  let nam = m[6] ? Number(m[6]) : namMacDinh;
  if (nam < 100) nam += 2000;
  return `${nam}-${hai(th)}-${hai(d)}`;
}

/**
 * Bóc cả đoạn chat.
 *
 * `ngayMacDinh` là ngày cho những dòng đứng trước bất kỳ mốc ngày nào — dán
 * một ngày lẻ thì cả đoạn thuộc về nó, dán cả tháng thì mấy dòng ngày trong
 * đoạn tự cắt ra.
 */
export function docCuoc(text: string, ngayMacDinh: string): KetQuaDoc {
  const nam = Number(ngayMacDinh.slice(0, 4)) || new Date().getFullYear();
  const theoNgay = new Map<string, NgayDoc>();
  const boQua: KetQuaDoc["boQua"] = [];
  let hienTai = ngayMacDinh;
  let soLuot = 0;

  const lay = (d: string): NgayDoc => {
    let n = theoNgay.get(d);
    if (!n) theoNgay.set(d, (n = { date: d, points: {}, soLo: 0, tongDiem: 0, luot: [] }));
    return n;
  };

  for (const goc of text.split(/\r?\n/)) {
    const dong = goc.trim();
    if (!dong) continue;

    const ngay = docNgay(dong, nam);
    if (ngay) {
      hienTai = ngay;
      continue;
    }

    if (KIEU_KHAC.test(dong)) {
      boQua.push({ dong, vi: "có vẻ là kiểu cược khác lô — sổ này chỉ ghi lô" });
      continue;
    }

    LUOT.lastIndex = 0;
    let m: RegExpExecArray | null;
    let batDuoc = 0;
    while ((m = LUOT.exec(dong)) !== null) {
      const los = (m[1].match(/\d{2}/g) ?? []).filter((x) => /^\d{2}$/.test(x));
      const diem = docDiem(m[2]);
      if (!los.length || !Number.isFinite(diem) || diem <= 0) continue;

      const n = lay(hienTai);
      for (const lo of los) n.points[lo] = (n.points[lo] ?? 0) + diem;
      n.luot.push({ raw: m[0].trim(), los, diem });
      batDuoc++;
      soLuot++;
    }

    if (!batDuoc) boQua.push({ dong, vi: "không thấy cặp lô + điểm nào" });
  }

  const ngays = [...theoNgay.values()]
    .map((n) => {
      const lo = Object.keys(n.points);
      return {
        ...n,
        soLo: lo.length,
        tongDiem: lo.reduce((s, l) => s + n.points[l], 0),
      };
    })
    .filter((n) => n.soLo > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { ngays, boQua, soLuot };
}
