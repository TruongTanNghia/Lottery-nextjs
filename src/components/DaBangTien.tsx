"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import {
  CAP_TOI_THIEU_LUAT, DIEM_DA_TOI_DA, DIP_TOI_THIEU, GIA_DA, HAU_TO_CHAN_DA, SO_O_DA, TRAN_DA, TRUNG_DA, apLuatTuDong, bangMacDinh, bienDa,
  capBiChan, chiaKhoiChanDa, khoKyToi, khoaCap, nhomVong, soVong, thongKeCapTheoThang, thongKeDa,
  type BangDa, type KyDa, type OCapDayDu,
} from "@/lib/da";
import { provincePrefix } from "@/lib/provinces";
import { useToast } from "./Toast";
import { REGION_LABELS, type Region } from "@/lib/types";

const TRAN = TRAN_DA;
const SO_CUNG = TRAN + 1;
const SO_CHEO = SO_O_DA - SO_CUNG;

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const pc = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const so = (n: number) => n.toLocaleString("vi-VN");

/** Khách gọi các bậc là "ngày 1, ngày 2…"; bậc 0 là con vừa ra, bậc 10 gom cả 10 trở lên. */
const tenNgay = (i: number) => (i === 0 ? "Vừa ra" : i >= TRAN ? `Ngày ${TRAN}+` : `Ngày ${i}`);
const tenNgayThuong = (i: number) => (i === 0 ? "vừa ra" : i >= TRAN ? `ngày ${TRAN}+` : `ngày ${i}`);
const tenO = (i: number, j: number) =>
  i === j ? `${tenNgay(i)} đá với nhau` : `${tenNgay(i)} đá chéo ${tenNgayThuong(j)}`;

const NHAN = {
  om: { chu: "NÊN ÔM", mau: "#7ff0c0" },
  ne: { chu: "NÉ RA", mau: "#ff9d9d" },
  chua: { chu: "CHƯA CHẮC", mau: "#c2d4ea" },
} as const;

type Nhom = "cung" | "cheo";

/**
 * Bảng tiền đá — bản đá của "Bảng Hạn Mức 100 Lô" bên Dashboard.
 *
 * Khách duyệt khung rồi xin: "tách riêng từng ô để em cài tiền vào được — ngày
 * 1 đá với nhau, ngày 2 đá với nhau… ngày này đá chéo ngày kia cho tất cả 10
 * ngày, hiện rõ thống kê chi tiết". Nên mỗi ô ở đây là một dòng có ô nhập điểm
 * riêng, thống kê của chính nó nằm ngay bên dưới, và chia đúng hai nhóm khách
 * kể: các ô cùng ngày và các ô đá chéo (16 bậc → 16 + 120 ô).
 *
 * Rồi khách nhìn lưới màu và chốt: "cứ đỏ là chặn — thêm bật/tắt chặn các ô
 * đỏ". Đó là công tắc CHẶN CÁC Ô ĐỎ ở đầu bảng: bật thì ô nào phần ăn đo được
 * âm bị chặn, bất kể điểm đã cài; tắt thì bảng chạy đúng số cài tay. Lưới
 * ngay dưới công tắc là để "cài tiền hoặc chặn ở dưới bảng này": bấm ô nào
 * thì nhảy tới dòng cài tiền của ô đó.
 *
 * Sửa xong phải bấm Lưu thì các khối thống kê của tab (và bot /chanlq) mới
 * tính theo bảng mới — số đang gõ dở không được lẳng lặng đổi báo cáo. Thanh
 * tổng ở trên thì tính theo số đang gõ, để thấy trước rồi mới quyết.
 */
export default function DaBangTien({
  draws, ky, region, bang, luuLuc, tuDong, onLuu,
}: {
  draws: DrawHits[];
  ky: KyDa[];
  region: Region;
  bang: BangDa;
  luuLuc: string | null;
  tuDong: boolean;
  onLuu: (bang: BangDa, luuLuc: string | null, tuDong: boolean) => void;
}) {
  const toast = useToast();
  const [nhap, setNhap] = useState<BangDa>(bang);
  const [tuDongNhap, setTuDongNhap] = useState(tuDong);
  const [nhom, setNhom] = useState<Nhom>("cung");
  /** Đá chéo: đang xem ngày nào ghép với các ngày khác. -1 = mọi ô chéo. */
  const [ngay, setNgay] = useState(0);
  const [datHet, setDatHet] = useState("1");
  /** Chuỗi chặn: cho phép một cặp nằm trong nhiều vòng (ngắn) hay không (dài hơn). */
  const [khongLap, setKhongLap] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);

  useEffect(() => setNhap(bang), [bang]);
  useEffect(() => setTuDongNhap(tuDong), [tuDong]);

  const tk = useMemo(() => thongKeDa(ky, region, TRAN), [ky, region]);
  const tkt = useMemo(() => thongKeCapTheoThang(ky, region, TRAN), [ky, region]);
  const tt = useMemo(() => khoKyToi(draws), [draws]);

  // Bảng ĐANG GÕ sau khi áp luật — đây mới là thứ sẽ có hiệu lực nếu bấm Lưu.
  const luat = useMemo(() => (tuDongNhap ? apLuatTuDong(nhap, tk, TRAN) : null), [tuDongNhap, nhap, tk]);
  const hieuLuc = luat ? luat.bang : nhap;

  /** Kỳ tới mỗi ô có bao nhiêu cặp — biết chắc, vì bậc ngày của 100 con đã định. */
  const capKyToi = useMemo(() => {
    const m = new Map<string, number>();
    if (!tt) return m;
    const dem = Array.from({ length: TRAN + 1 }, () => 0);
    for (const v of Object.values(tt.kho)) dem[Math.min(TRAN, v)]++;
    for (let i = 0; i <= TRAN; i++)
      for (let j = i; j <= TRAN; j++) m.set(khoaCap(i, j), i === j ? soVong(dem[i]) : dem[i] * dem[j]);
    return m;
  }, [tt]);

  const tong = useMemo(() => {
    if (!tkt) return null;
    let thu = 0, tra = 0, mo = 0, chan = 0, thuKyToi = 0, capChanKyToi = 0;
    for (const o of tkt.bang) {
      const k = khoaCap(o.i, o.j);
      const d = hieuLuc[k] ?? 0;
      if (d > 0) mo++;
      else {
        chan++;
        capChanKyToi += capKyToi.get(k) ?? 0;
      }
      thu += o.thu * d;
      tra += o.tra * d;
      thuKyToi += (capKyToi.get(k) ?? 0) * d * GIA_DA[region];
    }
    return { thu, tra, lai: thu - tra, pct: thu > 0 ? ((thu - tra) / thu) * 100 : 0, mo, chan, thuKyToi, capChanKyToi };
  }, [tkt, hieuLuc, capKyToi, region]);

  // Chuỗi chặn đá kỳ tới — y hệt thứ bot trả cho /chanlq, chỉ khác là không
  // cắt khúc: copy trên web thì dán vào đâu là việc của người dán.
  const lenhChan = useMemo(() => {
    if (!tt) return null;
    const cap = capBiChan(tt.kho, hieuLuc, TRAN);
    // Gom vòng như bot, để chuỗi copy trên web và chuỗi bot trả là một.
    const nhom = nhomVong(cap, khongLap);
    const chuoi = chiaKhoiChanDa(provincePrefix(region), nhom, Number.POSITIVE_INFINITY, region)[0] ?? "";
    return { cap, nhom, soVong: nhom.filter((n) => n.length > 2).length, chuoi };
  }, [tt, hieuLuc, region, khongLap]);

  if (!tk || !tkt || !tong) return null;

  const gia = GIA_DA[region];
  const chuan = bienDa(region);
  const soKy = ky.length;
  const doiO = Object.keys(nhap).filter((k) => nhap[k] !== bang[k]).length;
  const doiLuat = tuDongNhap !== tuDong;
  const doi = doiO + (doiLuat ? 1 : 0);
  const luatChan = new Set(luat?.chan ?? []);

  const hien = tkt.bang.filter((o) =>
    nhom === "cung" ? o.i === o.j : o.i !== o.j && (ngay < 0 || o.i === ngay || o.j === ngay)
  );

  const dat = (k: string, v: number) =>
    setNhap((b) => ({ ...b, [k]: Math.max(0, Math.min(DIEM_DA_TOI_DA, Math.round(v))) }));

  const datNhieu = (ds: OCapDayDu[], v: number) =>
    setNhap((b) => {
      const moi = { ...b };
      for (const o of ds) moi[khoaCap(o.i, o.j)] = Math.max(0, Math.min(DIEM_DA_TOI_DA, Math.round(v)));
      return moi;
    });

  const luu = async () => {
    setDangLuu(true);
    try {
      const r = await fetch(`/api/config/da?region=${region}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bang: nhap, tuDong: tuDongNhap }),
      });
      const d = await r.json();
      if (!r.ok || d.status !== "success") throw new Error(d.detail ?? "Lưu không được");
      onLuu(d.data.bang as BangDa, d.data.luuLuc as string | null, d.data.tuDong !== false);
      toast.show("success", `Đã lưu bảng tiền đá ${REGION_LABELS[region]} — thống kê bên dưới và bot /chanlq tính theo bảng mới`);
    } catch (e) {
      toast.show("error", e instanceof Error ? e.message : "Lưu không được");
    } finally {
      setDangLuu(false);
    }
  };

  const copy = async () => {
    if (!lenhChan || !lenhChan.chuoi) return;
    try {
      await navigator.clipboard.writeText(lenhChan.chuoi);
      toast.show("success", `Đã copy lệnh chặn ${so(lenhChan.cap.length)} cặp đá`);
    } catch {
      toast.show("error", "Trình duyệt không cho copy — bấm giữ để chép tay");
    }
  };

  const vDatHet = Number(datHet);
  const datHetOk = datHet.trim() !== "" && Number.isFinite(vDatHet) && vDatHet >= 0;

  return (
    <section className="plate rise rise-1" data-da-bang-tien>
      <div className="plate-hd">
        <div>
          <h2 className="plate-title">💰 Bảng Tiền Đá — Cài Riêng Từng Ô</h2>
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
            {REGION_LABELS[region]} · {SO_CUNG} ô cùng ngày + {SO_CHEO} ô đá chéo (vừa ra → {TRAN}+) · 1 điểm = {tien(gia)} ·{" "}
            {luuLuc ? `lưu lần cuối ${new Date(luuLuc).toLocaleString("vi-VN")}` : "chưa lưu lần nào"}
          </p>
        </div>
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2.5 text-[0.76rem] leading-relaxed text-[var(--text-secondary)]">
          Mỗi ô là một <b className="text-white">cặp ngày</b>: hai con của vé đá đang ở ngày nào thì vé rơi vào ô đó.
          Số gõ vào là <b className="text-white">số điểm nhận cho mỗi cặp</b> của ô — gõ <b className="text-white">0 là chặn</b>,
          không nhận cặp nào của ô đó. Thống kê dưới mỗi ô tính như thể khách đánh <b>kín mức</b> đã cài.
        </div>

        {/* ── Luật tự chặn — đúng câu khách chốt ───────────────────── */}
        <div
          className="rounded-lg border px-3 py-2.5"
          data-luat-tu-dong={tuDongNhap ? "bat" : "tat"}
          style={{
            borderColor: tuDongNhap ? "rgba(16,185,129,0.5)" : "var(--hairline)",
            background: tuDongNhap ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTuDongNhap((v) => !v)}
              data-bat-luat
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-colors ${
                tuDongNhap
                  ? "bg-[#059669] border-[#34e6a8] text-white"
                  : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.14]"
              }`}
            >
              {tuDongNhap ? "✅ Chặn các ô đỏ: ĐANG BẬT" : "⭕ Chặn các ô đỏ: ĐANG TẮT"}
            </button>
            <span className="text-[0.74rem] text-[var(--text-secondary)]">
              Ô nào <b className="text-[#ff9d9d]">đỏ</b> trên lưới (phần ăn đo được <b className="text-white">âm</b>) là{" "}
              <b className="text-white">chặn</b>; xanh thì nhận theo điểm đã cài
            </span>
          </div>
          <div className="text-[0.72rem] leading-relaxed text-[var(--text-secondary)] mt-1.5" data-luat-ket-qua>
            {tuDongNhap ? (
              <>
                Đang chặn theo luật <b className="text-[#ff9d9d]">{luat?.chan.length ?? 0} ô đỏ</b> trên {soKy} kỳ, bỏ qua ô
                dưới {so(CAP_TOI_THIEU_LUAT)} cặp. Màu đỏ tự tính lại mỗi khi có kỳ mới, nên ô chặn hôm nay có thể đổi ngày
                mai. Ô bị chặn vẫn giữ số điểm đã cài để lúc tắt thì dùng lại.{" "}
                <b className="text-white">Muốn khác đi:</b> tắt công tắc rồi cài tay từng ô.
              </>
            ) : (
              <>Đang tắt — bảng chạy đúng số cài tay từng ô bên dưới, không tự chặn gì.</>
            )}
          </div>
        </div>

        {/* ── Lưới 136 ô: cài tiền hoặc chặn "ở dưới bảng này" ─────── */}
        <LuoiTien
          bang={tkt.bang}
          nhap={nhap}
          hieuLuc={hieuLuc}
          luatChan={luatChan}
          bam={(i, j) => {
            if (i === j) setNhom("cung");
            else {
              setNhom("cheo");
              setNgay(i);
            }
            setTimeout(() => document.querySelector(`[data-o-tien="${khoaCap(i, j)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
          }}
        />

        {/* ── Thanh tổng: tính theo số ĐANG GÕ, đã áp luật ─────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-bang-tong>
          <OTong nhan="Ô đang mở / chặn" gt={`${tong.mo} / ${tong.chan}`} phu={`trên ${SO_O_DA} ô`} m="#8fd0ff" />
          <OTong
            nhan="Kỳ tới nhận tối đa"
            gt={tien(tong.thuKyToi)}
            phu={tt ? `chặn ${so(tong.capChanKyToi)} cặp · theo kỳ ${tt.ngayCuoi.slice(8, 10)}/${tt.ngayCuoi.slice(5, 7)}` : ""}
            m="#34e6a8"
          />
          <OTong nhan={`Dò lại ${soKy} kỳ`} gt={dau(tong.lai)} phu={`thu ${tien(tong.thu)} · trả ${tien(tong.tra)}`} m={mau(tong.lai)} />
          <OTong nhan="Phần ăn của bảng" gt={pc(tong.pct)} phu={`theo giá là ${pc(chuan.bien)}`} m={mau(tong.pct)} />
        </div>

        {/* ── Lưu ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
          style={{
            borderColor: doi > 0 ? "rgba(251,191,36,0.55)" : "var(--hairline)",
            background: doi > 0 ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)",
          }}
        >
          <span className="text-[0.74rem] text-[var(--text-secondary)] flex-1 min-w-[160px]" data-bang-trang-thai>
            {doi > 0 ? (
              <>
                <b className="text-[#ffd24a]">
                  Đã sửa {doiO > 0 ? `${doiO} ô` : ""}{doiO > 0 && doiLuat ? " và " : ""}{doiLuat ? "công tắc luật" : ""}, chưa lưu.
                </b>{" "}
                Bốn ô tổng ở trên đã tính theo số mới; các khối thống kê bên dưới và bot chỉ đổi sau khi bấm Lưu.
              </>
            ) : (
              <>Bảng đang khớp với bản đã lưu. Thống kê bên dưới và bot /chanlq đang tính theo đúng bảng này.</>
            )}
          </span>
          <button
            onClick={() => { setNhap(bang); setTuDongNhap(tuDong); }}
            disabled={doi === 0 || dangLuu}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16] disabled:opacity-40"
          >
            Bỏ thay đổi
          </button>
          <button
            onClick={luu}
            disabled={doi === 0 || dangLuu}
            data-bang-luu
            className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-[#059669] text-white hover:bg-[#047857] disabled:opacity-40"
          >
            {dangLuu ? "Đang lưu…" : "💾 Lưu bảng tiền"}
          </button>
        </div>

        {/* ── Lệnh chặn đá kỳ tới — cùng chuỗi với bot ─────────────── */}
        {lenhChan && (
          <div className="rounded-lg border border-[var(--hairline)] bg-black/20 px-3 py-2.5" data-lenh-chan>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">Lệnh chặn đá kỳ tới</span>
              <span className="text-[0.72rem] text-[var(--text-secondary)]">
                <b className="text-white" data-lenh-so-cap>{so(lenhChan.cap.length)} cặp</b> theo bảng đang gõ
                {lenhChan.cap.length > 0 && (
                  <> — gom thành <b className="text-white">{lenhChan.soVong} vòng</b> + {so(lenhChan.nhom.length - lenhChan.soVong)} cặp lẻ, {so(lenhChan.chuoi.length)} ký tự</>
                )}
                {doi > 0 && <span className="text-[#ffd24a]"> (chưa lưu — bot vẫn trả theo bản đã lưu)</span>}
              </span>
              {/* Nút chứ không phải checkbox: CSS toàn cục bỏ appearance của input nên ô tick tàng hình. */}
              <button
                onClick={() => setKhongLap((v) => !v)}
                data-lenh-khong-lap
                title="Bật thì không cặp nào bị ghi trong hai vòng — chuỗi dài hơn"
                className={`px-2 py-1 rounded-lg text-[0.7rem] font-bold border transition-colors ${
                  khongLap ? "bg-[#7c3aed] border-[#c4b5fd] text-white" : "bg-white/[0.07] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.14]"
                }`}
              >
                {khongLap ? "🔁 Không lặp cặp: BẬT" : "🔁 Không lặp cặp: tắt"}
              </button>
              <button
                onClick={copy}
                disabled={lenhChan.cap.length === 0}
                data-lenh-copy
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-40"
              >
                📋 Copy
              </button>
            </div>
            <div className="text-[0.66rem] text-[var(--text-muted)] mt-1">
              Trên Telegram gõ <code className="text-[#c2d4ea]">/chanlq {region === "xsmn" ? "mn" : region === "xsmt" ? "mt" : "mb"}</code>{" "}
              là ra đúng chuỗi này (bot tự cắt khúc nếu dài; gõ <code className="text-[#c2d4ea]">/chanlq</code> không là ra cả 3 miền).
              Mỗi mẩu <code className="text-[#c2d4ea]">a b c{HAU_TO_CHAN_DA[region]}</code> là một vòng: chặn mọi cặp trong đó. Dòng
              đầu <code className="text-[#c2d4ea]">/chanloai</code> là lệnh của phần mềm ghi cược — dán nguyên cả hai dòng.
            </div>
            {lenhChan.cap.length > 0 && (
              <code className="block mt-1.5 text-[0.66rem] leading-snug text-[#c2d4ea] break-all max-h-16 overflow-hidden whitespace-pre-wrap" data-lenh-xem>
                {lenhChan.chuoi.length > 260 ? lenhChan.chuoi.slice(0, 260) + " …" : lenhChan.chuoi}
              </code>
            )}
          </div>
        )}

        {/* ── Hai nhóm, đúng như khách kể ─────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["cung", "Cùng ngày đá với nhau", `${SO_CUNG} ô`],
              ["cheo", "Ngày này đá chéo ngày kia", `${SO_CHEO} ô`],
            ] as [Nhom, string, string][]
          ).map(([k, ten, phu]) => (
            <button
              key={k}
              onClick={() => setNhom(k)}
              data-bang-nhom={k}
              className={`rounded-lg px-2 py-2 text-left border transition-colors ${
                nhom === k
                  ? "bg-[#2563eb] border-[#9cc2ff] text-white"
                  : "bg-white/[0.05] border-[var(--hairline)] text-[#c2d4ea] hover:bg-white/[0.1]"
              }`}
            >
              <div className="text-[0.8rem] font-extrabold leading-tight">{ten}</div>
              <div className="text-[0.66rem] opacity-80">{phu}</div>
            </button>
          ))}
        </div>

        {nhom === "cheo" && (
          <div className="flex flex-wrap items-center gap-1.5" data-bang-chon-ngay>
            <span className="eyebrow">Xem ngày</span>
            {Array.from({ length: TRAN + 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => setNgay(i)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                  ngay === i ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
                }`}
              >
                {i === 0 ? "vừa ra" : i >= TRAN ? `${TRAN}+` : i}
              </button>
            ))}
            <button
              onClick={() => setNgay(-1)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                ngay < 0 ? "bg-[#2563eb] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
              }`}
            >
              Cả {SO_CHEO} ô
            </button>
          </div>
        )}

        {/* ── Cài nhanh cho các ô đang hiện ───────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-[var(--text-secondary)]">
          <span className="eyebrow">Cài nhanh {hien.length} ô đang hiện</span>
          <input
            value={datHet}
            onChange={(e) => setDatHet(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            aria-label="Số điểm cài cho các ô đang hiện"
            className="w-16 bg-black/30 border border-[var(--hairline)] rounded-lg px-2 py-1 text-white numeric text-sm text-center"
          />
          <button
            onClick={() => datHetOk && datNhieu(hien, vDatHet)}
            disabled={!datHetOk}
            data-bang-dat-het
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16] disabled:opacity-40"
          >
            Đặt hết = {datHetOk ? so(vDatHet) : "?"} điểm
          </button>
          <button
            onClick={() => datNhieu(tkt.bang.filter((o) => o.nhan === "ne"), 0)}
            disabled={tkt.soNe === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[rgba(220,38,38,0.15)] text-[#ff9d9d] hover:bg-[rgba(220,38,38,0.25)] disabled:opacity-40"
          >
            Chặn {tkt.soNe} ô NÉ RA
          </button>
          <button
            onClick={() => setNhap(bangMacDinh(TRAN))}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"
          >
            Cả {SO_O_DA} ô về 1 điểm
          </button>
        </div>

        <div className="eyebrow text-[var(--text-muted)]">
          {nhom === "cung"
            ? `Hai con cùng một ngày đá với nhau — ${SO_CUNG} ô`
            : ngay < 0
            ? `Mọi ô đá chéo — ${SO_CHEO} ô`
            : `${tenNgay(ngay)} đá chéo với từng ngày khác — ${hien.length} ô`}
        </div>

        <div className="space-y-1.5">
          {hien.map((o) => {
            const k = khoaCap(o.i, o.j);
            return (
              <DongO
                key={k}
                o={o}
                diem={nhap[k] ?? 0}
                daLuu={bang[k] ?? 0}
                luatChan={luatChan.has(k)}
                nguong={chuan.bien}
                dat={(v) => dat(k, v)}
                capKyToi={capKyToi.get(k) ?? 0}
                soKy={soKy}
                gia={gia}
                trung={TRUNG_DA[region]}
                chuanP={chuan.p}
                thangChay={tkt.thangDangChay}
              />
            );
          })}
        </div>

        <div className="rounded-lg border border-[rgba(251,191,36,0.45)] bg-[rgba(245,158,11,0.09)] px-3 py-2.5 text-[0.74rem] leading-relaxed text-[#ffe9c4]">
          <b>Đọc bảng này thế nào.</b> Lời/lỗ của từng ô là <b>chuyện đã xảy ra</b> trên {soKy} kỳ, không phải lời hứa
          cho kỳ tới: bài thử ở khối <b>Cặp Ngày Nào Đẹp Nhất</b> cho thấy ô đẹp ở nửa đầu không giữ được sang nửa sau.
          Riêng ô <b>Dò lại {soKy} kỳ</b> khi luật đang bật là <b>nhìn lại đáp án</b>: luật chọn ô lỗ bằng chính {soKy} kỳ
          này rồi dò lại trên đúng {soKy} kỳ đó, nên con số đẹp hơn thật. Đá lời nhờ <b>giá</b> ({pc(chuan.bien)} mỗi cặp,
          ô nào cũng vậy); chặn bớt ô thì nhận ít tiền hơn chứ phần ăn thật không cao lên. Máy chưa có sổ đá thật nên mọi
          con số ở đây là dò lại theo kết quả xổ, chưa phải tiền trong túi.
        </div>
      </div>
    </section>
  );
}

function DongO({
  o, diem, daLuu, luatChan, nguong, dat, capKyToi, soKy, gia, trung, chuanP, thangChay,
}: {
  o: OCapDayDu;
  diem: number;
  daLuu: number;
  /** Luật tự chặn đang đè lên ô này (điểm cài > 0 nhưng hiệu lực là 0). */
  luatChan: boolean;
  nguong: number;
  dat: (v: number) => void;
  capKyToi: number;
  soKy: number;
  gia: number;
  trung: number;
  chuanP: number;
  thangChay: string;
}) {
  const n = NHAN[o.nhan];
  const chan = diem <= 0 || luatChan;
  const sua = diem !== daLuu;
  const itCap = o.dip < DIP_TOI_THIEU * 6;
  const k = khoaCap(o.i, o.j);

  return (
    <div
      data-o-tien={k}
      data-o-chan={chan ? (luatChan ? "luat" : "tay") : "mo"}
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: sua ? "rgba(251,191,36,0.7)" : chan ? "rgba(248,113,113,0.45)" : "var(--hairline)",
        background: chan ? "rgba(220,38,38,0.08)" : "rgba(255,255,255,0.035)",
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-white text-[0.88rem]">{tenO(o.i, o.j)}</span>
            <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wide" style={{ color: n.mau, background: "rgba(0,0,0,0.28)" }}>
              {n.chu}
            </span>
            {itCap && (
              <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold text-[#ffd24a]" style={{ background: "rgba(0,0,0,0.28)" }}>
                ⚠ ÍT CẶP
              </span>
            )}
            {luatChan ? (
              <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold text-[#ff9d9d]" style={{ background: "rgba(0,0,0,0.28)" }}>
                Ô ĐỎ · {pc(o.bien)} — CHẶN
              </span>
            ) : chan ? (
              <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-bold text-[#ff9d9d]" style={{ background: "rgba(0,0,0,0.28)" }}>
                ĐANG CHẶN
              </span>
            ) : null}
          </div>
          <div className="text-[0.68rem] text-[var(--text-muted)] mt-0.5 numeric">
            Kỳ tới ô này có <b className="text-[var(--text-secondary)]">{so(capKyToi)} cặp</b>
            {!chan && capKyToi > 0 && (
              <> → nhận tối đa <b className="text-[#7ff0c0]">{tien(capKyToi * diem * gia)}</b></>
            )}
            {luatChan && <> → <b className="text-[#ff9d9d]">không nhận</b> (ô đỏ đang bị chặn dù cài {so(diem)} điểm)</>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1">
            <button
              onClick={() => dat(diem - 1)}
              aria-label={`Giảm điểm ô ${tenO(o.i, o.j)}`}
              className="w-7 h-8 rounded-lg bg-white/[0.09] text-white font-bold hover:bg-white/[0.18]"
            >
              −
            </button>
            <input
              value={String(diem)}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                dat(v === "" ? 0 : Number(v));
              }}
              inputMode="numeric"
              data-o-diem={k}
              aria-label={`Số điểm mỗi cặp ô ${tenO(o.i, o.j)}`}
              className="w-16 h-8 bg-black/40 border border-[var(--hairline)] rounded-lg px-1 text-white numeric text-sm font-bold text-center"
              style={luatChan ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
            />
            <button
              onClick={() => dat(diem + 1)}
              aria-label={`Tăng điểm ô ${tenO(o.i, o.j)}`}
              className="w-7 h-8 rounded-lg bg-white/[0.09] text-white font-bold hover:bg-white/[0.18]"
            >
              +
            </button>
          </div>
          <div className="text-[0.62rem] text-[var(--text-muted)] mt-0.5 numeric">
            {diem <= 0 ? "0 điểm = chặn" : `điểm/cặp · ${tien(diem * gia)}`}
            {sua && <span className="text-[#ffd24a]"> · đã lưu {so(daLuu)}</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {o.theoThang.map((t) => {
          const chay = t.thang === thangChay;
          return (
            <span
              key={t.thang}
              title={`${so(t.dip)} cặp trong tháng này, ${so(t.caHai)} cặp cả hai cùng về`}
              className={`numeric text-[0.66rem] rounded px-1.5 py-0.5 border ${chay ? "font-bold" : ""} ${
                t.bien == null
                  ? "border-[rgba(251,191,36,0.45)] text-[#ffd24a] bg-[rgba(245,158,11,0.1)]"
                  : t.bien > 0
                  ? "border-[rgba(16,185,129,0.4)] text-[#7ff0c0] bg-[rgba(16,185,129,0.1)]"
                  : "border-[rgba(248,113,113,0.4)] text-[#ff9d9d] bg-[rgba(220,38,38,0.1)]"
              }`}
            >
              {chay ? "THÁNG " : "T"}{Number(t.thang.slice(5))}{" "}
              {t.bien == null ? `ít cặp (${t.dip})` : pc(t.bien)}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-0.5 mt-1.5 text-[0.7rem] text-[var(--text-secondary)] numeric">
        <div>Đã qua: <b className="text-white">{so(o.dip)} cặp</b> / {soKy} kỳ</div>
        <div>TB mỗi kỳ: <b className="text-white">{(o.dip / Math.max(1, soKy)).toFixed(1)} cặp</b></div>
        <div>Cả hai cùng về: <b className="text-white">{so(o.caHai)} cặp</b></div>
        <div>
          Tỷ lệ: <b style={{ color: mau(chuanP - o.tyLe) }}>{(o.tyLe * 100).toFixed(2)}%</b>{" "}
          <span className="text-[var(--text-muted)]">(chung {(chuanP * 100).toFixed(2)}%)</span>
        </div>
      </div>

      <div className="text-[0.72rem] mt-1 leading-relaxed text-[var(--text-secondary)]" data-o-ket-qua={k}>
        {chan ? (
          <>
            Đang chặn nên không thu không trả. Nếu mở <b>1 điểm</b>: thu <b>{tien(o.thu)}</b>, trả <b>{tien(o.tra)}</b> →{" "}
            <b style={{ color: mau(o.lai) }}>{o.lai >= 0 ? "lời" : "lỗ"} {tien(Math.abs(o.lai))}</b> ({pc(o.bien)}).
          </>
        ) : (
          <>
            Ôm <b className="text-white">{so(diem)} điểm</b> mỗi cặp, cả {soKy} kỳ: thu{" "}
            <b className="text-[#7ff0c0]">{tien(o.dip * diem * gia)}</b>, trả{" "}
            <b className="text-[#ff9d9d]">{tien(o.caHai * diem * trung)}</b> →{" "}
            <b style={{ color: mau(o.lai) }}>
              {o.lai >= 0 ? "lời" : "lỗ"} {tien(Math.abs(o.lai * diem))}
            </b>{" "}
            (phần ăn {pc(o.bien)})
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Lưới toàn cảnh có thể bấm: mỗi ô là một cặp ngày, nền đỏ/xanh theo phần ăn
 * đo được, chữ là số điểm đang cài (✕ = đang chặn). Bấm ô nào thì nhảy tới
 * dòng cài tiền của ô đó — khách xin "cài tiền hoặc chặn ở dưới bảng này".
 */
function LuoiTien({
  bang, nhap, hieuLuc, luatChan, bam,
}: {
  bang: OCapDayDu[];
  nhap: BangDa;
  hieuLuc: BangDa;
  luatChan: Set<string>;
  bam: (i: number, j: number) => void;
}) {
  const m = new Map(bang.map((x) => [khoaCap(x.i, x.j), x]));
  const tenCot = (i: number) => (i === 0 ? "vr" : i >= TRAN ? `${TRAN}+` : `${i}`);
  const nen = (bien: number) => {
    const d = Math.max(-8, Math.min(8, bien)) / 8;
    return d >= 0 ? `rgba(16,185,129,${(0.1 + d * 0.35).toFixed(3)})` : `rgba(220,38,38,${(0.12 + -d * 0.4).toFixed(3)})`;
  };
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-black/20 p-2" data-luoi-tien>
      <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
        <span className="eyebrow">Lưới {SO_O_DA} ô — bấm ô để cài tiền hoặc chặn</span>
        <span className="text-[0.62rem] text-[var(--text-muted)]">nền đỏ = phần ăn âm · số trong ô = điểm đang cài · ✕ = đang chặn</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[0.58rem] border-separate" style={{ borderSpacing: "1.5px" }}>
          <thead>
            <tr>
              <th className="text-[var(--text-muted)] font-semibold px-0.5">ngày</th>
              {Array.from({ length: TRAN + 1 }, (_, j) => (
                <th key={j} className="numeric font-semibold text-[var(--text-muted)] px-0.5">{tenCot(j)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TRAN + 1 }, (_, i) => (
              <tr key={i}>
                <th className="numeric font-semibold text-[var(--text-muted)] text-right px-0.5">{tenCot(i)}</th>
                {Array.from({ length: TRAN + 1 }, (_, j) => {
                  if (j < i) return <td key={j} />;
                  const k = khoaCap(i, j);
                  const o = m.get(k);
                  const diem = hieuLuc[k] ?? 0;
                  const chan = diem <= 0;
                  return (
                    <td key={j} className="p-0">
                      <button
                        onClick={() => bam(i, j)}
                        data-luoi-o={k}
                        data-luoi-chan={chan ? "1" : "0"}
                        title={`${k}: cài ${nhap[k] ?? 0} điểm${luatChan.has(k) ? " — ô đỏ, đang bị chặn" : chan ? " — chặn tay" : ""}${o ? ` · phần ăn ${pc(o.bien)} · ${so(o.dip)} cặp` : " · chưa có cặp"}`}
                        className="w-6 h-6 rounded numeric font-bold leading-none"
                        style={{
                          background: o ? nen(o.bien) : "rgba(255,255,255,0.05)",
                          color: chan ? "#ffb4b4" : "#fff",
                          outline: luatChan.has(k) ? "1.5px solid #ff6b78" : chan ? "1.5px dashed #ff9d9d" : "none",
                          outlineOffset: "-1.5px",
                        }}
                      >
                        {chan ? "✕" : nhap[k] >= 100 ? "99+" : nhap[k]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OTong({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.04] px-3 py-2">
      <div className="eyebrow mb-1">{nhan}</div>
      <div className="numeric font-extrabold text-[1.05rem] leading-none" style={{ color: m }}>{gt}</div>
      <div className="text-[0.62rem] text-[var(--text-muted)] mt-1 leading-snug">{phu}</div>
    </div>
  );
}
