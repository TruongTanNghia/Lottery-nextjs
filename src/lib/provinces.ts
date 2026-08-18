/**
 * The bookie's own province shorthand, in the bookie's own order.
 *
 * A bet string on its own says nothing about which provinces it covers, so
 * whoever receives it has to ask. Prefixing the list — "st tv ag ...: 01b10n,
 * ..." — makes the message self-contained.
 *
 * The codes are theirs, not ours: they are what the people on the other end
 * of the message already read, so they are copied verbatim rather than
 * generated from our province names. The `province` field ties each code back
 * to the name in lottery_results, which is what makes the list checkable.
 */
import type { Region } from "@/lib/types";

export interface ProvinceCode {
  code: string;
  /** Exactly as stored in lottery_results.province. */
  province: string;
}

export const PROVINCE_CODES: Record<Region, ProvinceCode[]> = {
  xsmn: [
    { code: "st", province: "Sóc Trăng" },
    { code: "tv", province: "Trà Vinh" },
    { code: "ag", province: "An Giang" },
    { code: "bduong", province: "Bình Dương" },
    { code: "cm", province: "Cà Mau" },
    { code: "dn", province: "Đồng Nai" },
    { code: "bp", province: "Bình Phước" },
    { code: "dt", province: "Đồng Tháp" },
    { code: "ct", province: "Cần Thơ" },
    { code: "bt", province: "Bến Tre" },
    { code: "tg", province: "Tiền Giang" },
    { code: "dlat", province: "Đà Lạt" },
    { code: "la", province: "Long An" },
    { code: "vl", province: "Vĩnh Long" },
    { code: "bth", province: "Bình Thuận" },
    { code: "blieu", province: "Bạc Liêu" },
    { code: "tn", province: "Tây Ninh" },
    { code: "kg", province: "Kiên Giang" },
    { code: "tp", province: "TP HCM" },
    { code: "vt", province: "Vũng Tàu" },
    { code: "hg", province: "Hậu Giang" },
  ],
  xsmt: [
    { code: "dnang", province: "Đà Nẵng" },
    { code: "pyen", province: "Phú Yên" },
    { code: "nthuan", province: "Ninh Thuận" },
    { code: "tth", province: "Thừa Thiên Huế" },
    { code: "dnong", province: "Đắc Nông" },
    { code: "qtri", province: "Quảng Trị" },
    { code: "ktum", province: "Kon Tum" },
    { code: "qbinh", province: "Quảng Bình" },
    { code: "bdinh", province: "Bình Định" },
    { code: "qngai", province: "Quảng Ngãi" },
    { code: "qnam", province: "Quảng Nam" },
    { code: "dlak", province: "Đắc Lắc" },
    { code: "glai", province: "Gia Lai" },
    // "khoa", not "kkhoa" — the bookie corrected this one after seeing the
    // first output; it is what the receiving end actually reads.
    { code: "khoa", province: "Khánh Hòa" },
  ],
  // One draw, no province list to spell out.
  xsmb: [{ code: "mb", province: "Mien Bac" }],
};

/** "st tv ag bduong ... hg" — what goes before the colon. */
export function provincePrefix(region: Region): string {
  return PROVINCE_CODES[region].map((p) => p.code).join(" ");
}
