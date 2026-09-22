"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import { dungKy } from "@/lib/slot-stats";
import {
  GIA_DA, TRUNG_DA, apLuatTuDong, bangMacDinh, bienDa, chuanHoaBang, soTungKyTheoBang, soVong, thongKeDa, tinhVe,
  type BangDa,
} from "@/lib/da";
import DaBangTien from "./DaBangTien";
import DaBaoCaoThang from "./DaBaoCaoThang";
import DaCapNgay from "./DaCapNgay";
import DaChotLoi from "./DaChotLoi";
import DaKyToi from "./DaKyToi";
import DaTungKy from "./DaTungKy";
import ThuGon from "./ThuGon";
import { REGION_LABELS, type Region } from "@/lib/types";

const MIEN: Region[] = ["xsmn", "xsmt", "xsmb"];

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");

/**
 * Tab Số Đá — dựng theo đúng khuôn của Dashboard.
 *
 * Bản đầu chỉ có giá, máy tính vòng và một cái lưới màu; người vận hành xem
 * xong nói thẳng là "chưa có thống kê rõ ràng, bắt chước cái dash mà làm".
 * Dashboard trả lời ba câu bằng tiền, nên tab này giờ cũng trả lời đúng ba câu
 * đó cho đá: tháng này lời hay lỗ (Báo Cáo Tháng), từng kỳ ra sao (Từng Kỳ),
 * và cặp ngày nào đẹp (Cặp Ngày Nào Đẹp Nhất).
 *
 * Tất cả nằm trong tab này. Dashboard không bị đụng tới.
 */
export default function SoDaPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setDraws(null);
    setLoi(null);
    fetch(`/api/history/hits?region=${region}`)
      .then((r) => r.json())
      .then((d) => !huy && setDraws((d.draws ?? []) as DrawHits[]))
      .catch(() => !huy && setLoi("Không tải được dữ liệu"));
    return () => { huy = true; };
  }, [region]);

  // Bảng tiền đá đã lưu của miền này. Mọi khối thống kê bên dưới tính theo nó.
  const [bang, setBang] = useState<BangDa | null>(null);
  const [luuLuc, setLuuLuc] = useState<string | null>(null);
  // Luật "ô dưới phần ăn theo giá thì chặn" — khách xin bật sẵn.
  const [tuDong, setTuDong] = useState(true);
  // Tăng mỗi lần lưu, để Báo Cáo Tháng (tự tải bảng của cả ba miền) biết mà tải lại.
  const [phienBan, setPhienBan] = useState(0);

  useEffect(() => {
    let huy = false;
    setBang(null);
    setLuuLuc(null);
    fetch(`/api/config/da?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (huy) return;
        setBang(chuanHoaBang(d?.data?.bang));
        setLuuLuc(typeof d?.data?.luuLuc === "string" ? d.data.luuLuc : null);
        setTuDong(d?.data?.tuDong !== false);
      })
      // Không đọc được bảng thì chạy bảng mặc định, chứ không để cả tab trắng.
      .catch(() => !huy && setBang(bangMacDinh()));
    return () => { huy = true; };
  }, [region]);

  const ky = useMemo(() => (draws ? dungKy(draws) : null), [draws]);
  // Bảng ĐANG HIỆU LỰC: bảng đã lưu, áp luật nếu công tắc bật. Mọi khối bên
  // dưới tính theo nó — cùng hàm thuần mà máy chủ dùng cho bot, nên không lệch.
  const hieuLuc = useMemo(() => {
    if (!ky || !bang) return null;
    return tuDong ? apLuatTuDong(bang, thongKeDa(ky, region)).bang : bang;
  }, [ky, region, bang, tuDong]);
  const rows = useMemo(() => (ky && hieuLuc ? soTungKyTheoBang(ky, region, hieuLuc) : null), [ky, region, hieuLuc]);
  const chuan = bienDa(region);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Đứng đầu tab, như "Ngày Mai Ôm Sao" đứng đầu Dashboard: câu người ta
          hỏi trước tiên là kỳ tới ôm con nào, thống kê để sau. */}
      <DieuHuong />

      {draws && ky && (
        <div id="da-kytoi" style={{ scrollMarginTop: 150 }}>
          <DaKyToi draws={draws} ky={ky} region={region} bang={hieuLuc ?? undefined} />
        </div>
      )}

      {draws && ky && bang && (
        <div id="da-bangtien" style={{ scrollMarginTop: 150 }}>
          <DaBangTien
            draws={draws}
            ky={ky}
            region={region}
            bang={bang}
            luuLuc={luuLuc}
            tuDong={tuDong}
            onLuu={(b, l, t) => {
              setBang(b);
              setLuuLuc(l);
              setTuDong(t);
              setPhienBan((v) => v + 1);
            }}
          />
        </div>
      )}

      {/* ── Giá và phần ăn ─────────────────────────────────────────── */}
      <section id="da-gia" style={{ scrollMarginTop: 150 }} className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🎲 Giá Đá &amp; Phần Ăn</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              Một vòng = hai con. Hai con cùng có mặt trong kỳ là trúng, đếm một lần.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[0.74rem]">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-1.5 pr-2 font-semibold">Miền</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">1 điểm</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Trúng</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Cả hai cùng về</th>
                  <th className="py-1.5 pr-2 font-semibold text-right">Trả TB</th>
                  <th className="py-1.5 font-semibold text-right">Phần ăn</th>
                </tr>
              </thead>
              <tbody>
                {MIEN.map((r) => {
                  const b = bienDa(r);
                  return (
                    <tr
                      key={r}
                      className="border-t border-[var(--hairline)]"
                      style={r === region ? { background: "rgba(59,130,246,0.1)" } : undefined}
                    >
                      <td className="py-1.5 pr-2">
                        <b className="text-white">{REGION_LABELS[r]}</b>
                        <div className="text-[0.64rem] text-[var(--text-muted)]">{b.giai} giải</div>
                      </td>
                      <td className="py-1.5 pr-2 text-right numeric">{tien(b.gia)}</td>
                      <td className="py-1.5 pr-2 text-right numeric">{tien(b.trung)}</td>
                      <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">
                        {(b.p * 100).toFixed(3)}%
                      </td>
                      <td className="py-1.5 pr-2 text-right numeric text-[var(--text-secondary)]">{tien(b.traTB)}</td>
                      <td className="py-1.5 text-right numeric font-bold" style={{ color: mau(b.bien) }}>
                        {pc(b.bien)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-[rgba(16,185,129,0.45)] bg-[rgba(16,185,129,0.1)] px-3 py-2.5 text-[0.76rem] leading-relaxed text-[var(--text-secondary)]">
            <b className="text-white">Đá khác lô ở chỗ quyết định.</b> Lô ăn theo <b>từng nháy</b>: con về hai
            nháy thì trả hai lần, nên ở giá 27.000đ phần ăn đúng bằng <b>0,00%</b>. Đá ăn theo <b>cặp</b>: hai
            con cùng có mặt là trúng, đếm một lần. Nên ở giá đang chạy, phần ăn{" "}
            <b style={{ color: mau(chuan.bien) }}>{pc(chuan.bien)}</b> là <b>dương thật</b>.
            <br />
            Giá hoà vốn của {REGION_LABELS[region]} là <b className="text-white">{tien(chuan.giaHoaVon)}</b> một
            điểm — đang bán <b className="text-white">{tien(chuan.gia)}</b>.
          </div>
        </div>
      </section>

      {/* ── Ba khối thống kê, cùng khuôn Dashboard ──────────────────── */}
      <div id="da-thang" style={{ scrollMarginTop: 150 }}>
        <DaBaoCaoThang phienBan={phienBan} />
      </div>

      {/* Khách: "xem tổng 3 miền của đá, kiểu giống bên lô, nhìn giao diện đó quen rồi". */}
      <div id="da-chotloi" style={{ scrollMarginTop: 150 }}>
        <DaChotLoi phienBan={phienBan} />
      </div>

      {loi && <p className="text-sm text-[#ff9d9d]">{loi}</p>}
      {(!ky || !rows) && !loi && (
        <section className="plate rise rise-3">
          <div className="p-4 text-sm text-[var(--text-muted)]">Đang tính…</div>
        </section>
      )}
      {ky && rows && (
        <div id="da-tungky" style={{ scrollMarginTop: 150 }}>
          <DaTungKy rows={rows} region={region} daCai={!!hieuLuc && Object.values(hieuLuc).some((v) => v !== 1)} />
        </div>
      )}
      {ky && (
        <div id="da-capngay" style={{ scrollMarginTop: 150 }}>
          <DaCapNgay ky={ky} region={region} />
        </div>
      )}

      {/* ── Máy tính vòng — công cụ tra, gập lại được ────────────────── */}
      <div id="da-vong" style={{ scrollMarginTop: 150 }}>
        <TinhVong region={region} />
      </div>
    </div>
  );
}

/**
 * Hàng nút nhảy giữa các phần của tab.
 *
 * Tab giờ có sáu khối xếp dọc, trên điện thoại là cuộn rất dài; người vận hành
 * than "khó dùng". Không cho dính trên đầu: trang đã có sẵn header và thanh tab
 * dính rồi, thêm thanh thứ ba thì màn hình chẳng còn chỗ cho nội dung.
 */
function DieuHuong() {
  const MUC: [string, string][] = [
    ["da-kytoi", "🌅 Kỳ tới đá con nào"],
    ["da-bangtien", "💰 Cài tiền từng ô"],
    ["da-gia", "🎲 Giá"],
    ["da-thang", "📅 Báo cáo tháng"],
    ["da-chotloi", "💰 Chốt lời sớm"],
    ["da-tungky", "📒 Từng kỳ"],
    ["da-capngay", "🎯 Cặp ngày"],
    ["da-vong", "🧮 Tính vòng"],
  ];
  return (
    <nav className="flex flex-wrap gap-1.5" data-da-dieu-huong>
      {MUC.map(([id, ten]) => (
        <button
          key={id}
          onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="px-2.5 py-1.5 rounded-full text-[0.72rem] font-bold bg-white/[0.07] border border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.15] hover:text-white transition-colors"
        >
          {ten}
        </button>
      ))}
    </nav>
  );
}

function TinhVong({ region }: { region: Region }) {
  // Mặc định đúng ví dụ khách đưa: đá 5 con ra 10 vòng.
  const [soCon, setSoCon] = useState(5);
  const [diem, setDiem] = useState(1);
  const [conVe, setConVe] = useState(2);
  const ve = useMemo(() => tinhVe(soCon, diem, conVe, region), [soCon, diem, conVe, region]);

  return (
    <ThuGon
      khoa="da-tinh-vong"
      moSan
      className="plate rise rise-3"
      tieuDe="🧮 Tính Vòng"
      phu={<>Đá <b>a</b> con thì có <b>a × (a − 1) ÷ 2</b> vòng · {REGION_LABELS[region]}</>}
    >
      <div className="p-3 md:p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { nhan: "Đá mấy con", gt: soCon, dat: setSoCon, min: 2, max: 40 },
            { nhan: "Mỗi vòng mấy điểm", gt: diem, dat: setDiem, min: 1, max: 1000 },
            { nhan: "Rồi mấy con về", gt: conVe, dat: setConVe, min: 0, max: 40 },
          ].map((x) => (
            <label key={x.nhan} className="block">
              <span className="eyebrow block mb-1">{x.nhan}</span>
              <input
                type="number"
                value={x.gt}
                min={x.min}
                max={x.max}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) x.dat(Math.max(x.min, Math.min(x.max, Math.floor(v))));
                }}
                className="w-full bg-black/25 border border-[var(--hairline)] rounded-lg px-2 py-1.5 text-white numeric text-sm"
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <O nhan="Số vòng" gt={String(ve.vong)} phu={`${ve.soCon} × ${ve.soCon - 1} ÷ 2`} m="#8fd0ff" />
          <O nhan="Khách đặt" gt={tien(ve.thu)} phu={`${ve.vong} vòng × ${diem} điểm`} m="#34e6a8" />
          <O nhan="Vòng trúng" gt={String(ve.vongTrung)} phu={`${ve.conVe} con về ghép được`} m="#ffd24a" />
          <O nhan="Mình phải trả" gt={tien(ve.tra)} phu={`${ve.vongTrung} vòng × ${tien(TRUNG_DA[region])}`} m="#ff6b78" />
        </div>

        <div
          className="rounded-lg border px-3 py-2.5 text-[0.78rem] leading-relaxed"
          style={{
            borderColor: ve.lai >= 0 ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
            background: ve.lai >= 0 ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.1)",
          }}
        >
          Vé này mình <b style={{ color: mau(ve.lai) }}>{ve.lai >= 0 ? "ăn" : "mất"} {tien(Math.abs(ve.lai))}</b>{" "}
          — thu <b>{tien(ve.thu)}</b>, trả <b>{tien(ve.tra)}</b>.
          {ve.conVe >= 2 && (
            <>
              {" "}Hoà vốn khi khách trúng dưới{" "}
              <b className="text-white">{((ve.vong * GIA_DA[region]) / TRUNG_DA[region]).toFixed(2)} vòng</b>.
            </>
          )}
        </div>

        <div>
          <div className="eyebrow mb-1.5">Tra nhanh — đá mấy con thì mấy vòng</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i + 2).map((a) => (
              <button
                key={a}
                onClick={() => setSoCon(a)}
                className={`rounded px-2 py-1 text-[0.7rem] border transition-colors ${
                  soCon === a
                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                    : "border-[var(--hairline)] bg-white/[0.04] text-[var(--text-secondary)] hover:bg-white/[0.1]"
                }`}
              >
                <b className="numeric">{a}</b> con · <b className="numeric">{soVong(a)}</b> vòng
              </button>
            ))}
          </div>
        </div>
      </div>
    </ThuGon>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-lg leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.64rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
