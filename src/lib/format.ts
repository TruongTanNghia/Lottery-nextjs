export function formatVND(amount: number | null | undefined): string {
  if (amount === 0 || amount === undefined || amount === null) return "0đ";
  const abs = Math.abs(amount);
  const sign = amount >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toLocaleString("vi-VN")}đ`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
