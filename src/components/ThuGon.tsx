"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Khối gập lại được, nhớ trạng thái theo từng máy.
 *
 * Mấy khối cài đặt — bảng đài, giải tính là về, đang theo dõi — cài một lần
 * rồi để đó hàng tháng, nhưng chúng dài và nằm chắn giữa những chỗ phải xem
 * mỗi ngày. Người vận hành nói thẳng: giữ nguyên nhưng cho ẩn đi.
 *
 * Trạng thái nằm ở localStorage nên mở ra lần sau vẫn y như lúc đóng máy, và
 * nó là chuyện của riêng từng máy — không đụng tới cài đặt chung của sổ.
 * localStorage có thể ném lỗi ở chế độ ẩn danh nên đọc ghi đều bọc try.
 */
export default function ThuGon({
  khoa,
  tieuDe,
  phu,
  phai,
  moSan = false,
  className = "plate rise rise-2 mb-4 md:mb-6",
  children,
}: {
  /** Khoá lưu trạng thái — đổi khoá là quên trạng thái cũ. */
  khoa: string;
  tieuDe: ReactNode;
  phu?: ReactNode;
  /** Thứ đứng bên phải tiêu đề, ví dụ con số đếm. */
  phai?: ReactNode;
  moSan?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [mo, setMo] = useState(moSan);
  // Đọc ở effect chứ không phải lúc dựng state: server không có localStorage,
  // lệch nhau là React kêu hydration mismatch.
  const [daDoc, setDaDoc] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`thugon:${khoa}`);
      if (v !== null) setMo(v === "1");
    } catch {
      /* trình duyệt chặn lưu — cứ dùng mặc định */
    }
    setDaDoc(true);
  }, [khoa]);

  const bat = () => {
    const v = !mo;
    setMo(v);
    try {
      localStorage.setItem(`thugon:${khoa}`, v ? "1" : "0");
    } catch {
      /* không lưu được thì thôi, vẫn gập được trong phiên này */
    }
  };

  return (
    <section className={className}>
      <div className="plate-hd">
        <button
          onClick={bat}
          aria-expanded={mo}
          className="flex items-start gap-2 text-left flex-1 min-w-0 group"
        >
          <span
            className={`text-[var(--text-muted)] group-hover:text-white transition-transform mt-0.5 shrink-0 ${
              mo ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          <span className="min-w-0">
            <span className="plate-title block">{tieuDe}</span>
            {phu && (
              <span className="text-[0.7rem] text-[var(--text-muted)] mt-0.5 block">{phu}</span>
            )}
          </span>
        </button>
        {phai}
        <button
          onClick={bat}
          className="text-[0.68rem] font-bold text-[var(--text-muted)] hover:text-white shrink-0 px-1.5 py-0.5 rounded bg-white/[0.06]"
        >
          {mo ? "Thu gọn" : "Mở ra"}
        </button>
      </div>
      {/* Chờ đọc xong localStorage rồi mới vẽ ruột, tránh nháy một cái khi
          khối đang đóng lại bung ra rồi đóng lại. */}
      {daDoc && mo && children}
    </section>
  );
}
