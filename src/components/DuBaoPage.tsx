"use client";

/**
 * Tab "🔮 Dự Báo" — khách 10/11/2026: "có quy luật của nó chưa, chơi như nào
 * là win, số dự báo và số ra, đánh như nào — cho hết trong tab đó".
 *
 * Dữ liệu: kho dài cào sẵn 3 năm (public/kho-dai/<miền>.json) gộp kho đang
 * chạy. 10 mô hình (bộ dự đoán cũ, chấm lại bằng giá đúng theo miền) chọn N
 * con cho từng kỳ chỉ bằng 60 kỳ trước đó; so với may rủi bằng 1.000 lần bốc
 * ngẫu nhiên. Có số dự báo kỳ tới, chuỗi gửi, và bảng "số dự báo – số ra"
 * từng kỳ. Chỉ đọc; không chạm tab nào khác.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DrawHits } from "@/lib/backtest";
import {
  CAC_MO_HINH, CAC_SO_CON, CUA_SO, KY_TOI_THIEU_THU, NGUONG_MAY_RUI, SO_CON_MAC_DINH, SO_MO_PHONG, TEN_THU, chayDuBao, chuoiDanh, docDiem, docTienTo, duBaoKyToi, gopDiToi, gopNhinLai, gopSo, khoaO, nhayCanDeLoi, nhayKyVong, oDangLoi, phanTichDuBao, sapXep, thuCuaNgay,
  type KyDuBao, type MoHinh, type TongKetMoHinh,
} from "@/lib/du-bao";
import { STAKE_PRICE, WIN_PER_POINT, POSITIONS } from "@/lib/exposure";
import { TIEN_TO_NHAN_MAC_DINH } from "@/lib/da-nhan";
import BotNhom2Panel from "./BotNhom2Panel";
import { docKhoDai, gopKho, type KhoDai } from "@/lib/tuan";
import { REGION_LABELS, type Region } from "@/lib/types";

const tien = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1_000_000_000) return `${s}${(a / 1_000_000_000).toFixed(2)}tỷ`;
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}tr`;
  return s + Math.round(a).toLocaleString("vi-VN") + "đ";
};
const dau = (n: number) => (n > 0 ? "+" : "") + tien(n);
const mau = (n: number) => (n > 0 ? "#7ff0c0" : n < 0 ? "#ff9d9d" : "#cbd5e1");
const so = (n: number) => n.toLocaleString("vi-VN");
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const ddmmyy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const thuCua = (d: string) => THU[new Date(d + "T00:00:00Z").getUTCDay()];

/** Nhớ kết quả chạy mô hình theo miền + kho, để đổi tab qua lại không phải chạy lại. */
const boNho = new Map<string, KyDuBao[]>();
const KHUC = 40;

export default function DuBaoPage({ region }: { region: Region }) {
  const [draws, setDraws] = useState<DrawHits[] | null>(null);
  const [kho, setKho] = useState<{ capNhat: string; soKy: number } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [kyDuBao, setKyDuBao] = useState<KyDuBao[] | null>(null);
  const [tienDo, setTienDo] = useState<{ da: number; tong: number } | null>(null);
  const [n, setN] = useState<number>(SO_CON_MAC_DINH);
  const [mh, setMh] = useState<MoHinh>("tongHop");
  // Điểm / tiền tố của khung "Gộp số" — khung BOT GỬI (khách 20/11: "cho bot gửi phần này thôi").
  const [tienTo, setTienTo] = useState(TIEN_TO_NHAN_MAC_DINH[region]);
  const [diemNhap, setDiemNhap] = useState("1");
  // Điểm / tiền tố riêng của khung "Số dự báo kỳ tới" — CHỈ THAM KHẢO ("phần dưới mình tham khảo thôi, bot đừng gửi"),
  // tách khỏi khung Gộp số để gõ ở dưới không làm đổi tiền bot gửi.
  const [tienToTk, setTienToTk] = useState(TIEN_TO_NHAN_MAC_DINH[region]);
  const [diemTkNhap, setDiemTkNhap] = useState("1");
  const [xemHet, setXemHet] = useState(false);
  const [daCopy, setDaCopy] = useState(false);

  useEffect(() => {
    let huy = false;
    setDraws(null); setKho(null); setLoi(null); setKyDuBao(null); setTienDo(null); setXemHet(false);
    (async () => {
      try {
        const [rDai, rMoi] = await Promise.all([fetch(`/kho-dai/${region}.json`, { cache: "no-store" }), fetch(`/api/history/hits?region=${region}`, { cache: "no-store" })]);
        if (!rMoi.ok) throw new Error(`kho đang chạy trả ${rMoi.status}`);
        const moi = ((await rMoi.json()).draws ?? []) as DrawHits[];
        let dai: DrawHits[] = [];
        if (rDai.ok) {
          const k = (await rDai.json()) as KhoDai;
          dai = docKhoDai(k);
          if (!huy) setKho({ capNhat: k.capNhat, soKy: dai.length });
        } else if (!huy) setKho({ capNhat: "", soKy: 0 });
        if (!huy) setDraws(gopKho(dai, moi));
      } catch (e) {
        if (!huy) setLoi(e instanceof Error ? e.message : "lỗi không rõ");
      }
    })();
    return () => { huy = true; };
  }, [region]);

  // Chạy 10 mô hình cho từng kỳ, từng khúc 40 kỳ để màn hình không treo.
  useEffect(() => {
    if (!draws) return;
    const sap = sapXep(draws);
    const khoa = `${region}:${sap.length}:${sap[sap.length - 1]?.date ?? ""}`;
    const nho = boNho.get(khoa);
    if (nho) { setKyDuBao(nho); setTienDo(null); return; }
    let huy = false;
    const out: KyDuBao[] = [];
    const tong = Math.max(0, sap.length - CUA_SO);
    let i = CUA_SO;
    setTienDo({ da: 0, tong });
    const buoc = () => {
      if (huy) return;
      const den = Math.min(sap.length, i + KHUC);
      out.push(...chayDuBao(sap, region, i, den));
      i = den;
      if (i < sap.length) { setTienDo({ da: out.length, tong }); setTimeout(buoc, 0); }
      else { boNho.set(khoa, out); setKyDuBao(out); setTienDo(null); }
    };
    const t = setTimeout(buoc, 0);
    return () => { huy = true; clearTimeout(t); };
  }, [draws, region]);

  const sap = useMemo(() => (draws ? sapXep(draws) : null), [draws]);
  const theoNgay = useMemo(() => new Map((sap ?? []).map((d) => [d.date, d])), [sap]);
  const kyToi = useMemo(() => (sap ? duBaoKyToi(sap, region) : null), [sap, region]);
  const pt = useMemo(() => (kyDuBao && sap ? phanTichDuBao(kyDuBao, sap, n, region, 20261110, kyToi?.date ?? null) : null), [kyDuBao, sap, n, region, kyToi]);
  const chonMh = pt?.moHinh.find((m) => m.moHinh === mh) ?? null;
  const vuot = pt ? pt.moHinh.filter((m) => m.vuot) : [];
  const trangThai = !pt ? "" : vuot.length === 0 ? "khong" : "co";
  const gia = STAKE_PRICE[region], can = nhayCanDeLoi(n, region), kv = nhayKyVong(n, region);
  const chonToi = kyToi ? kyToi.chon[mh].slice(0, n) : [];
  const tt = docTienTo(tienTo), dd = docDiem(diemNhap), diem = dd.diem;
  const ttTk = docTienTo(tienToTk), ddTk = docDiem(diemTkNhap), diemTk = ddTk.diem;
  const chuoi = chuoiDanh(chonToi, ttTk.tienTo, diemTk);
  /** Con được bao nhiêu mô hình chọn cho kỳ tới (đồng thuận). */
  const dongThuan = useMemo(() => {
    const m = new Map<string, number>();
    if (kyToi) for (const x of CAC_MO_HINH) for (const lo of kyToi.chon[x.khoa].slice(0, n)) m.set(lo, (m.get(lo) ?? 0) + 1);
    return m;
  }, [kyToi, n]);
  const dongThuanCao = [...dongThuan.entries()].filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const copy = async () => {
    try { await navigator.clipboard.writeText(chuoi); setDaCopy(true); setTimeout(() => setDaCopy(false), 1500); } catch { /* không có clipboard */ }
  };

  // Ô chọn (mô hình × thứ) — khách 16/11: "chọn hết các ô đang lời thì được tầm bao nhiêu số; bấm cho mình chọn".
  // Khách 20/11: "vào lại máy lại reset như cũ", "ô tiền em cài máy lưu giùm", "ô nào em chọn thì bot gửi" →
  // ô chọn, số con, điểm, tiền tố, lọc đều LƯU TRÊN MÁY CHỦ theo miền (/api/config/dubao); bot gửi nhóm 2 đọc đúng bộ này.
  const [oChon, setOChon] = useState<Set<string>>(new Set());
  const [tuMh, setTuMh] = useState(1);
  const [daCopyGop, setDaCopyGop] = useState(false);
  const [daTai, setDaTai] = useState(false);
  const [luuTT, setLuuTT] = useState<{ tt: "dang" | "da" | "loi"; luc?: string | null } | null>(null);
  const daLuu = useRef("");
  const choLuu = useRef<{ region: Region; body: string; hen: ReturnType<typeof setTimeout> } | null>(null);
  const regionNay = useRef(region);
  regionNay.current = region;
  const thanLuu = (rg: Region, o: Set<string>, soCon: number, diem: number, tt: string, tu: number, diemTk: number | null, ttTk: string) =>
    JSON.stringify({ o: [...o].sort(), soCon, diem, tienTo: tt === TIEN_TO_NHAN_MAC_DINH[rg] ? null : tt, tu, diemTk, tienToTk: ttTk === TIEN_TO_NHAN_MAC_DINH[rg] ? null : ttTk });
  const guiLuu = async (rg: Region, body: string) => {
    if (rg === regionNay.current) setLuuTT({ tt: "dang" });
    try {
      const r = await fetch(`/api/config/dubao?region=${rg}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (rg === regionNay.current) { daLuu.current = body; setLuuTT({ tt: "da", luc: j?.data?.luuLuc ?? null }); }
    } catch {
      if (rg === regionNay.current) setLuuTT({ tt: "loi" });
    }
  };
  // Đổi miền: lưu ngay phần đang chờ của miền cũ, rồi tải cài đặt của miền mới.
  useEffect(() => {
    if (choLuu.current) { clearTimeout(choLuu.current.hen); void guiLuu(choLuu.current.region, choLuu.current.body); choLuu.current = null; }
    let huy = false;
    setDaTai(false); setLuuTT(null);
    (async () => {
      let cd = { o: [] as string[], soCon: SO_CON_MAC_DINH, diem: 1, tienTo: null as string | null, tu: 1, diemTk: null as number | null, tienToTk: null as string | null, luuLuc: null as string | null };
      try {
        const r = await fetch(`/api/config/dubao?region=${region}`, { cache: "no-store" });
        if (r.ok) cd = { ...cd, ...((await r.json())?.data ?? {}) };
      } catch { /* không tải được: dùng mặc định, vẫn cho lưu */ }
      if (huy) return;
      const tt = cd.tienTo ?? TIEN_TO_NHAN_MAC_DINH[region];
      // Bản lưu trước khi tách khung tham khảo: chưa có điểm/tiền tố riêng → lấy như khung Gộp số.
      const ttTk = cd.tienToTk ?? tt, dTk = cd.diemTk ?? cd.diem;
      const o = new Set(cd.o);
      setOChon(o); setN(cd.soCon); setDiemNhap(String(cd.diem)); setTienTo(tt); setTuMh(cd.tu); setDiemTkNhap(String(dTk)); setTienToTk(ttTk);
      daLuu.current = thanLuu(region, o, cd.soCon, cd.diem, tt, cd.tu, dTk, ttTk);
      setLuuTT(cd.luuLuc ? { tt: "da", luc: cd.luuLuc } : null);
      setDaTai(true);
    })();
    return () => { huy = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);
  // Mỗi lần đổi: chờ 0,7 giây không đổi nữa thì lưu (điểm gõ bậy thì chưa lưu).
  useEffect(() => {
    if (!daTai) return;
    const d = docDiem(diemNhap);
    if (d.loi) return;
    const dTk = docDiem(diemTkNhap);
    const body = thanLuu(region, oChon, n, d.diem, tienTo, tuMh, dTk.loi ? null : dTk.diem, tienToTk);
    if (body === daLuu.current) { if (choLuu.current) { clearTimeout(choLuu.current.hen); choLuu.current = null; } return; }
    if (choLuu.current) clearTimeout(choLuu.current.hen);
    const rg = region;
    choLuu.current = { region: rg, body, hen: setTimeout(() => { choLuu.current = null; void guiLuu(rg, body); }, 700) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daTai, oChon, n, diemNhap, tienTo, tuMh, diemTkNhap, tienToTk]);
  const doiO = (f: (s: Set<string>) => Set<string>) => setOChon(f(new Set(oChon)));
  const batO = (m: MoHinh, t: number) => doiO((s) => { const k = khoaO(m, t); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  /** Bấm tên cột: chọn đúng các ô đang lời của cột; bấm lần nữa (đã chọn đủ) thì bỏ cả cột. */
  const chonCot = (t: number, epChon = false) => {
    if (!pt) return;
    const loi = oDangLoi(pt.theoThu.bang, t);
    doiO((s) => {
      const duRoi = loi.length > 0 && loi.every((m) => s.has(khoaO(m, t)));
      for (const m of CAC_MO_HINH) s.delete(khoaO(m.khoa, t));
      if (epChon || !duRoi) for (const m of loi) s.add(khoaO(m, t));
      return s;
    });
  };
  const thuToi = kyToi ? thuCuaNgay(kyToi.date) : null;
  const mhChonToi: MoHinh[] = thuToi === null ? [] : CAC_MO_HINH.map((m) => m.khoa).filter((k) => oChon.has(khoaO(k, thuToi)));
  const tuHieuLuc = Math.max(1, Math.min(tuMh, Math.max(1, mhChonToi.length)));
  const gop = kyToi ? gopSo(mhChonToi.map((m) => [m, kyToi.chon[m].slice(0, n)]), tuHieuLuc) : [];
  const chuoiGop = chuoiDanh(gop.map((g) => g.lo), tt.tienTo, diem);
  const gopNL = useMemo(() => (pt && oChon.size ? gopNhinLai(pt.moHinh, oChon, tuHieuLuc, region, theoNgay) : null), [pt, oChon, tuHieuLuc, region, theoNgay]);
  const gopDT = useMemo(() => (pt ? gopDiToi(pt.moHinh, tuHieuLuc, region, theoNgay) : null), [pt, tuHieuLuc, region, theoNgay]);
  const copyGop = async () => {
    try { await navigator.clipboard.writeText(chuoiGop); setDaCopyGop(true); setTimeout(() => setDaCopyGop(false), 1500); } catch { /* không có clipboard */ }
  };
  const gioLuu = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  };
  /** Dòng "đã lưu": khách 20/11 sợ vào lại bị reset — nói rõ đã lưu lúc nào; khung Gộp số thì nói bot gửi đúng khung này. */
  const dongLuuCua = (khungBot: boolean) => (
    <div className="text-[0.68rem] leading-snug" {...(khungBot ? { "data-dubao-luu": !daTai ? "tai" : luuTT?.tt ?? "chua" } : { "data-dubao-luu-tk": !daTai ? "tai" : luuTT?.tt ?? "chua" })} style={{ color: luuTT?.tt === "loi" ? "#ffd24a" : "#a5b4fc" }}>
      {!daTai
        ? "Đang tải cài đặt đã lưu…"
        : luuTT?.tt === "dang"
          ? "☁ Đang lưu…"
          : luuTT?.tt === "loi"
            ? "⚠ Lưu không được (mạng?) — đổi lại một ô hay số bất kỳ để lưu lại."
            : luuTT?.tt === "da"
              ? khungBot
                ? `☁ Đã lưu lúc ${gioLuu(luuTT.luc)} — vào lại vẫn giữ ô chọn, số con, điểm. Bot gửi nhóm 2 gửi đúng khung Gộp số này.`
                : `☁ Đã lưu lúc ${gioLuu(luuTT.luc)}. Khung này chỉ để tham khảo, bot KHÔNG gửi.`
              : khungBot
                ? "☁ Ô chọn, số con, điểm, tiền tố, lọc: đổi là tự lưu theo miền."
                : "☁ Điểm, tiền tố khung này: đổi là tự lưu; chỉ để tham khảo, bot không gửi."}
    </div>
  );
  const dongLuu = dongLuuCua(true), dongLuuTk = dongLuuCua(false);

  return (
    <div className="space-y-4 md:space-y-6" data-dubao>
      <section className="plate rise rise-1">
        <div className="plate-hd">
          <div>
            <h2 className="plate-title">🔮 Dự Báo — có quy luật không, chơi sao là win · {REGION_LABELS[region]}</h2>
            <p className="text-[0.7rem] text-[var(--text-muted)] mt-0.5">
              {CAC_MO_HINH.length} mô hình chọn số (bộ dự đoán cũ, chấm lại bằng giá đúng {so(gia)}/điểm, {so(WIN_PER_POINT)}/nháy) cho từng kỳ trong 3 năm, mỗi kỳ chỉ dùng {CUA_SO} kỳ trước đó.
              Mỗi mô hình so với may rủi: bốc ngẫu nhiên cùng số con {so(SO_MO_PHONG)} lần cho đúng các kỳ ấy, xem bao nhiêu lần ngẫu nhiên cũng ăn bằng hoặc hơn. Dưới {pct(NGUONG_MAY_RUI)} mới gọi là có dấu hiệu.
            </p>
          </div>
        </div>
        <div className="p-3 md:p-4 space-y-3">
          {loi && <p className="text-sm text-[#ff9d9d]">Không tải được dữ liệu: {loi}</p>}
          {!sap && !loi && <p className="text-sm text-[var(--text-muted)]">Đang gom 3 năm kết quả…</p>}
          {sap && tienDo && (
            <div className="space-y-1" data-dubao-tien-do>
              <p className="text-sm text-[var(--text-secondary)]">Đang cho {CAC_MO_HINH.length} mô hình chấm từng kỳ… <b className="text-white numeric">{so(tienDo.da)}/{so(tienDo.tong)}</b></p>
              <div className="h-1.5 rounded bg-white/[0.08]"><div className="h-full rounded bg-[#7c3aed]" style={{ width: `${tienDo.tong ? (100 * tienDo.da) / tienDo.tong : 0}%` }} /></div>
            </div>
          )}
          {sap && pt && (
            <>
              <div className="text-[0.72rem] text-[var(--text-secondary)]" data-dubao-kho={sap.length} data-dubao-so-ky={pt.soKy}>
                Dữ liệu: <b className="text-white numeric">{so(sap.length)}</b> kỳ, chấm được <b className="text-white numeric">{so(pt.soKy)}</b> kỳ ({ddmmyy(pt.tuNgay)} → {ddmmyy(pt.denNgay)}, {CUA_SO} kỳ đầu để mô hình học).{" "}
                {kho && kho.soKy > 0 ? `Kho dài cào sẵn ${so(kho.soKy)} kỳ (cập nhật ${ddmmyy(kho.capNhat)}) gộp kho đang chạy.` : "Chưa có kho dài, đang dùng kho đang chạy."}
              </div>

              <div className="flex flex-wrap items-center gap-1.5" data-dubao-n>
                <span className="eyebrow">Đánh mỗi kỳ</span>
                {CAC_SO_CON.map((k) => (
                  <button key={k} onClick={() => setN(k)} data-dubao-n-chon={k} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${n === k ? "bg-[#7c3aed] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{k} con × 1 điểm</button>
                ))}
              </div>

              <div className="rounded-xl border-2 px-4 py-3 text-[0.82rem] leading-relaxed" data-dubao-ket-luan={trangThai} style={{ borderColor: trangThai === "co" ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.55)", background: trangThai === "co" ? "rgba(245,158,11,0.10)" : "rgba(16,185,129,0.10)" }}>
                <b className="text-white">{trangThai === "co" ? "⚠ Có mô hình nổi lên, nhưng chưa đủ tin." : "Kết luận: chưa có quy luật nào để đánh là win. Lời lỗ từng kỳ là may rủi."}</b>
                <div className="mt-1 text-[var(--text-secondary)]">{pt.ketLuan}</div>
              </div>

              <div className="rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-4 py-3 text-[0.78rem] leading-relaxed space-y-1.5" data-dubao-cach-choi>
                <div className="eyebrow">Chơi như nào là win</div>
                <div className="text-[var(--text-secondary)]">
                  Mỗi con 1 điểm giá <b className="text-white numeric">{so(gia)}</b>, trúng 1 nháy ăn <b className="text-white numeric">{so(WIN_PER_POINT)}</b>. Một kỳ xổ {POSITIONS[region]} giải lô, nên {n} con bất kỳ trung bình về{" "}
                  <b className="text-white numeric">{kv.toFixed(1).replace(".", ",")}</b> nháy, tức thu lại đúng tiền xác: <b className="text-white">kỳ vọng tròn 0</b> dù chọn con nào.
                </div>
                <table className="text-[0.72rem]">
                  <tbody>
                    <tr><td className="pr-3 text-[var(--text-muted)]">Tiền xác mỗi kỳ</td><td className="numeric text-white">{so(n * gia)}đ</td></tr>
                    <tr><td className="pr-3 text-[var(--text-muted)]">Kỳ lời khi</td><td className="numeric text-white">về từ <b>{can}</b> nháy trở lên (= +{so(can * WIN_PER_POINT - n * gia)}đ)</td></tr>
                    <tr><td className="pr-3 text-[var(--text-muted)]">Kỳ lỗ khi</td><td className="numeric text-white">về {can - 1} nháy trở xuống (0 nháy = −{so(n * gia)}đ)</td></tr>
                  </tbody>
                </table>
                <div className="text-[var(--text-secondary)]">
                  Muốn "win" thật thì phải có mô hình đoán trúng hơn {kv.toFixed(1).replace(".", ",")} nháy mỗi kỳ một cách đều, qua hàng trăm kỳ. Bảng dưới kiểm đúng chuyện đó trên {so(pt.soKy)} kỳ.
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[0.72rem]" data-dubao-bang-mh>
                  <thead>
                    <tr className="text-[var(--text-muted)] text-left">
                      <th className="py-1 pr-2">Mô hình</th><th className="py-1 pr-2">Lãi {so(pt.soKy)} kỳ</th><th className="py-1 pr-2">% xác</th><th className="py-1 pr-2">Nháy TB</th><th className="py-1 pr-2">Kỳ ăn / thua</th><th className="py-1 pr-2">Thua liền</th><th className="py-1 pr-2">May rủi đuổi kịp</th><th className="py-1">Kết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pt.moHinh.map((m) => (
                      <tr key={m.moHinh} data-dubao-mh={m.moHinh} data-dubao-vuot={m.vuot ? "1" : "0"} data-dubao-lai={m.lai} onClick={() => setMh(m.moHinh)} className={`border-t border-[var(--hairline)] cursor-pointer ${mh === m.moHinh ? "bg-[#7c3aed]/20" : "hover:bg-white/[0.04]"}`}>
                        <td className="py-1.5 pr-2"><b className="text-white">{m.ten}</b><div className="text-[0.62rem] text-[var(--text-muted)]">{m.moTa}</div></td>
                        <td className="py-1.5 pr-2 numeric" style={{ color: mau(m.lai) }}>{dau(m.lai)}</td>
                        <td className="py-1.5 pr-2 numeric" style={{ color: mau(m.lai) }}>{(m.tiLe * 100).toFixed(1).replace(".", ",")}%</td>
                        <td className="py-1.5 pr-2 numeric">{m.nhayTB.toFixed(2).replace(".", ",")} <span className="text-[var(--text-muted)]">/ {m.nhayKyVong.toFixed(1).replace(".", ",")}</span></td>
                        <td className="py-1.5 pr-2 numeric">{m.kyAn} / {m.kyThua}</td>
                        <td className="py-1.5 pr-2 numeric">{m.chuoiThua} kỳ</td>
                        <td className="py-1.5 pr-2 numeric">{pct(m.mayRui)}</td>
                        <td className="py-1.5 font-bold" style={{ color: m.vuot ? "#ffd24a" : "#cbd5e1" }}>{m.vuot ? "⚠ nổi lên" : "may rủi"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.68rem] text-[var(--text-muted)]">
                "Nháy TB / kỳ vọng": trung bình nháy mô hình trúng mỗi kỳ, so với may rủi {kv.toFixed(1).replace(".", ",")}. Bốc ngẫu nhiên {n} con cho đúng {so(pt.soKy)} kỳ này ra từ {tien(pt.mayRui.thap)} đến {tien(pt.mayRui.cao)} (90% số lần), trung bình {dau(pt.mayRui.tb)}. Bấm vào một mô hình để xem số dự báo và từng kỳ của nó.
              </p>

              <div className="rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-3 py-3 space-y-2" data-dubao-thu data-dubao-thu-ket={pt.theoThu.diToi.vuot ? "co" : "khong"}>
                <div className="eyebrow">Theo thứ: mô hình nào ăn thứ mấy, ngày nào chơi mô hình nào</div>
                <p className="text-[0.76rem] leading-relaxed text-[var(--text-secondary)]" data-dubao-thu-ket-luan>{pt.theoThu.ketLuan}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <O nhan="Chơi thật: chọn mô hình theo thứ, đi tới" gt={dau(pt.theoThu.diToi.lai)} phu={`${pt.theoThu.diToi.kyAn} ăn / ${pt.theoThu.diToi.kyThua} thua trong ${so(pt.theoThu.diToi.soKy)} kỳ · may rủi đuổi kịp ${pct(pt.theoThu.diToi.mayRui)}`} m={mau(pt.theoThu.diToi.lai)} />
                  <O nhan="Nhìn lại: biết trước rồi chọn" gt={dau(pt.theoThu.laiNhinLai)} phu="chọn sau khi đã biết kết quả 3 năm, chỉ là mốc trên, không đánh được" m="#cbd5e1" />
                  <div data-dubao-thu-ky-toi-so={kyToi && pt.theoThu.kyToi ? [...kyToi.chon[pt.theoThu.kyToi.moHinh].slice(0, n)].sort().join(" ") : ""}>
                    <O
                      nhan="Kỳ tới cách này sẽ chơi"
                      gt={pt.theoThu.kyToi ? `${TEN_THU[pt.theoThu.kyToi.thu]} · ${pt.theoThu.kyToi.ten}` : "—"}
                      phu={
                        pt.theoThu.kyToi && kyToi
                          ? `${ddmmyy(pt.theoThu.kyToi.date)} · ô lời nhất ở ${TEN_THU[pt.theoThu.kyToi.thu]} tính đến hôm nay · số: ${[...kyToi.chon[pt.theoThu.kyToi.moHinh].slice(0, n)].sort().join(" ")}. Chỉ để tham khảo — bot gửi theo các ô anh chọn ở khung Gộp số bên dưới.`
                          : ""
                      }
                      m="#c4b5fd"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.68rem]" data-dubao-bang-thu>
                    <thead>
                      <tr className="text-[var(--text-muted)] text-left">
                        <th className="py-1 pr-2">Lãi theo thứ</th>
                        {[1, 2, 3, 4, 5, 6, 0].map((t) => (
                          <th key={t} className="py-1 pr-1 numeric">
                            <button onClick={() => chonCot(t)} data-dubao-thu-cot-chon={t} title={`Chọn hết ô đang lời ở ${TEN_THU[t]}`} className={`px-1.5 py-0.5 rounded font-bold ${t === thuToi ? "bg-[#7c3aed] text-white" : "bg-white/[0.08] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>
                              {TEN_THU[t]}{t === thuToi ? " · kỳ tới" : ""}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pt.theoThu.bang.map((b) => (
                        <tr key={b.moHinh} data-dubao-thu-mh={b.moHinh} className={`border-t border-[var(--hairline)] ${mh === b.moHinh ? "bg-[#7c3aed]/20" : ""}`}>
                          <td className="py-1 pr-2 text-white whitespace-nowrap">{b.ten}</td>
                          {[1, 2, 3, 4, 5, 6, 0].map((t) => {
                            const o = b.thu[t], tot = pt.theoThu.nhinLai.find((x) => x.thu === t)?.moHinh === b.moHinh, chon = oChon.has(khoaO(b.moHinh, t));
                            return (
                              <td key={t} data-dubao-thu-o={o.lai} data-dubao-thu-cot={t} data-dubao-thu-chon={chon ? "1" : "0"} onClick={() => o.soKy && batO(b.moHinh, t)}
                                className={`py-1 px-1 numeric whitespace-nowrap cursor-pointer select-none rounded ${tot ? "font-extrabold" : ""} ${chon ? "bg-[#7c3aed]/45 ring-1 ring-[#c4b5fd]" : "hover:bg-white/[0.06]"}`}
                                style={{ color: chon ? "#ffffff" : mau(o.lai) }} title={`${o.kyAn} ăn / ${o.kyThua} thua / ${o.soKy} kỳ · bấm để ${chon ? "bỏ" : "chọn"}`}>
                                {o.soKy ? (chon ? "✓" : "") + (tot ? "★" : "") + dau(o.lai) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[0.66rem] text-[var(--text-muted)]">
                  ★ = mô hình ăn nhất ở thứ đó khi nhìn lại cả 3 năm. "Đi tới" = đến mỗi kỳ chỉ dùng các kỳ trước đó, chọn mô hình đang ăn nhất ở thứ đó (mỗi thứ phải đủ {KY_TOI_THIEU_THU} kỳ, chưa đủ thì dùng tổng hợp); đó là cách anh sẽ chơi thật nên mới đem so may rủi.
                  {pt.theoThu.diToi.soLanDung.length ? ` Đi tới đã dùng: ${pt.theoThu.diToi.soLanDung.map((d) => `${d.ten} ${d.soKy} kỳ`).join(", ")}.` : ""}
                </p>

                {kyToi && thuToi !== null && (
                  <div className="rounded-xl border border-[#7c3aed]/60 bg-[#7c3aed]/10 px-3 py-3 space-y-2" data-dubao-gop data-dubao-gop-so-con={gop.length} data-dubao-gop-so-mh={mhChonToi.length}>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="eyebrow">Gộp số từ các ô đã chọn · kỳ tới</span>
                      <b className="text-white text-[0.8rem]">{TEN_THU[thuToi]} {ddmmyy(kyToi.date)}</b>
                      <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded bg-[#10b981]/25 text-[#7ff0c0]" data-dubao-gop-bot>📤 Bot nhóm 2 gửi khung này</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => chonCot(thuToi, true)} data-dubao-gop-chon-het className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#7c3aed] text-white">Chọn hết ô đang lời ở {TEN_THU[thuToi]}</button>
                      <button onClick={() => doiO(() => new Set())} data-dubao-gop-bo-het className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">Bỏ chọn hết</button>
                    </div>
                    {dongLuu}
                    {mhChonToi.length === 0 ? (
                      <p className="text-[0.74rem] text-[var(--text-secondary)]" data-dubao-gop-trong>
                        Chưa chọn ô nào ở cột {TEN_THU[thuToi]}. Kỳ tới là {TEN_THU[thuToi]} nên chỉ ô cột {TEN_THU[thuToi]} được tính; ô các cột khác máy nhớ sẵn cho các ngày đó.
                        Bấm từng ô trong bảng để chọn, hoặc bấm tên cột để chọn hết ô đang lời của cột.
                      </p>
                    ) : (
                      <>
                        <div className="text-[0.76rem] text-[var(--text-secondary)]" data-dubao-gop-tom-tat>
                          Đang lấy <b className="text-white">{mhChonToi.length}</b> mô hình: {mhChonToi.map((m) => CAC_MO_HINH.find((x) => x.khoa === m)!.ten).join(", ")}. Mỗi mô hình {n} con, gộp lại được{" "}
                          <b className="text-white numeric text-[0.95rem]">{gop.length} con</b>{tuHieuLuc > 1 ? ` (chỉ lấy con được từ ${tuHieuLuc} mô hình trở lên)` : ""}.
                        </div>
                        {mhChonToi.length > 1 && (
                          <div className="flex flex-wrap items-center gap-1.5" data-dubao-gop-tu>
                            <span className="eyebrow">Lấy con được từ</span>
                            {Array.from({ length: Math.min(5, mhChonToi.length) }, (_, i) => i + 1).map((k) => (
                              <button key={k} onClick={() => setTuMh(k)} data-dubao-gop-tu-chon={k} className={`px-2 py-1 rounded-lg text-[0.7rem] font-bold ${tuHieuLuc === k ? "bg-[#7c3aed] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{k} mô hình</button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5" data-dubao-gop-con-ds>
                          {gop.map((g) => (
                            <span key={g.lo} data-dubao-gop-con={g.lo} data-dubao-gop-con-mh={g.moHinh.length} className="relative inline-flex items-center justify-center min-w-[2.2rem] px-1.5 py-1 rounded-lg bg-white/[0.10] text-white font-extrabold numeric text-[0.8rem]" title={g.moHinh.map((m) => CAC_MO_HINH.find((x) => x.khoa === m)!.ten).join(", ")}>
                              {g.lo}<span className="absolute -top-1.5 -right-1.5 text-[0.52rem] px-1 rounded bg-[#7c3aed] text-white numeric">{g.moHinh.length}</span>
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">Điểm mỗi con</span>
                            <input value={diemNhap} onChange={(e) => setDiemNhap(e.target.value)} inputMode="numeric" data-dubao-gop-diem className="w-20 px-2 py-1 rounded-lg bg-white/[0.08] text-white text-sm font-bold numeric border border-[var(--hairline)]" />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">Tiền tố đài (2d, mn, mb)</span>
                            <input value={tienTo} onChange={(e) => setTienTo(e.target.value)} placeholder="để trống nếu không cần" data-dubao-gop-tien-to className="w-36 px-2 py-1 rounded-lg bg-white/[0.08] text-white text-sm numeric border border-[var(--hairline)]" />
                          </label>
                        </div>
                        {(dd.loi || tt.loi) && <div className="text-[0.72rem] text-[#ffd24a]" data-dubao-gop-loi-nhap>{dd.loi ?? ""}{dd.loi && tt.loi ? " " : ""}{tt.loi ?? ""}</div>}
                        <div className="text-[0.64rem] text-[var(--text-muted)]">Điểm ở đây là điểm bot gửi. Tiền tố ở đây chỉ cho nút Copy; bot gửi bằng chữ đầu đã thử với bot nhận (Mn 2d / Mt 2d / Mb).</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="flex-1 min-w-[12rem] px-2 py-1 rounded-lg bg-black/30 text-[#e2e8f0] text-xs break-all" data-dubao-gop-chuoi>{chuoiGop}</code>
                          <button onClick={copyGop} data-dubao-gop-copy className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#7c3aed] text-white">{daCopyGop ? "Đã copy" : "Copy"}</button>
                        </div>
                        <div className="text-[0.74rem] text-[var(--text-secondary)]" data-dubao-gop-tien data-dubao-gop-xac={gop.length * diem * gia}>
                          <b className="text-white">Đánh như nào:</b> {gop.length} con × {so(diem)} điểm, xác <b className="text-white numeric">{so(gop.length * diem * gia)}đ</b>. Về từ {nhayCanDeLoi(gop.length, region)} nháy mới lời;
                          may rủi cho {gop.length} con trung bình {nhayKyVong(gop.length, region).toFixed(1).replace(".", ",")} nháy, tức kỳ vọng vẫn tròn 0.
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {gopNL && gopNL.soKyDanh > 0 && (
                        <O nhan="Nhìn lại: đúng các ô anh đang chọn" gt={dau(gopNL.lai)} phu={`${gopNL.kyAn} ăn / ${gopNL.kyThua} thua trong ${so(gopNL.soKyDanh)} kỳ cùng thứ · TB ${gopNL.conTB.toFixed(1).replace(".", ",")} con · 1 điểm. Ô chọn vì thấy đang lời nên số này luôn đẹp hơn thật.`} m="#cbd5e1" />
                      )}
                      {gopDT && (
                        <div data-dubao-gop-di-toi data-dubao-gop-di-toi-lai={gopDT.lai} data-dubao-gop-di-toi-vuot={gopDT.vuot ? "1" : "0"}>
                          <O nhan="Chơi thật: thứ nào cũng chọn hết ô đang lời" gt={dau(gopDT.lai)} phu={`${gopDT.kyAn} ăn / ${gopDT.kyThua} thua trong ${so(gopDT.soKyDanh)} kỳ · TB ${gopDT.conTB.toFixed(1).replace(".", ",")} con · thua sâu ${tien(gopDT.thuaSauNhat)} · may rủi đuổi kịp ${pct(gopDT.mayRui)}`} m={mau(gopDT.lai)} />
                        </div>
                      )}
                    </div>
                    {gopDT && (
                      <p className="text-[0.7rem] leading-relaxed text-[var(--text-muted)]" data-dubao-gop-ket-luan>
                        "Chơi thật" = đến mỗi kỳ chỉ dùng các kỳ trước, chọn hết ô đang lời ở thứ đó (đủ {KY_TOI_THIEU_THU} kỳ), gộp số{tuHieuLuc > 1 ? ` lấy con được từ ${tuHieuLuc} mô hình` : ""} rồi đánh 1 điểm mỗi con; so với bốc ngẫu nhiên đúng chừng ấy con mỗi kỳ.{" "}
                        {gopDT.vuot
                          ? `Kiểu này đang nổi lên (may rủi đuổi kịp ${pct(gopDT.mayRui)}), nhưng anh có ${CAC_SO_CON.length} mức số con × ${Math.min(5, Math.max(1, mhChonToi.length))} mức lọc để bấm thử, thử nhiều kiểu thì thế nào cũng có kiểu lọt ngưỡng; giữ nguyên một kiểu, theo dõi thêm 60 kỳ rồi mới tin.`
                          : `Kiểu này không hơn bốc đại cùng số con: ô đang lời hôm nay không giữ được lời về sau.`}
                      </p>
                    )}
                  </div>
                )}
                <BotNhom2Panel />
              </div>

              {chonMh && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5" data-dubao-mh-dang-xem={mh}>
                    <span className="eyebrow">Đang xem</span>
                    {CAC_MO_HINH.map((m) => (
                      <button key={m.khoa} onClick={() => setMh(m.khoa)} data-dubao-mh-chon={m.khoa} className={`px-2 py-1 rounded-lg text-[0.68rem] font-bold ${mh === m.khoa ? "bg-[#7c3aed] text-white" : "bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]"}`}>{m.ten}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" data-dubao-tom-tat>
                    <O nhan={`Lãi ${so(chonMh.soKy)} kỳ`} gt={dau(chonMh.lai)} phu={`${(chonMh.tiLe * 100).toFixed(1).replace(".", ",")}% tiền xác ${tien(chonMh.tongXac)}`} m={mau(chonMh.lai)} />
                    <O nhan="Kỳ ăn / thua" gt={`${chonMh.kyAn} / ${chonMh.kyThua}`} phu={`${chonMh.kyHoa} kỳ hoà · TB ${dau(chonMh.laiTBKy)} mỗi kỳ`} m="#8fd0ff" />
                    <O nhan="Nháy TB mỗi kỳ" gt={chonMh.nhayTB.toFixed(2).replace(".", ",")} phu={`may rủi ${chonMh.nhayKyVong.toFixed(1).replace(".", ",")} · cần ${can} mới lời`} m={chonMh.nhayTB > chonMh.nhayKyVong ? "#7ff0c0" : "#ff9d9d"} />
                    <O nhan="Thua sâu nhất" gt={tien(chonMh.thuaSauNhat)} phu={`thua liền ${chonMh.chuoiThua} kỳ · ăn liền ${chonMh.chuoiAn} kỳ`} m="#ff9d9d" />
                  </div>
                  <DuongTien ky={chonMh.ky} />

                  {kyToi && (
                    <div className="rounded-xl border border-[#7c3aed]/60 bg-[#7c3aed]/10 px-4 py-3 space-y-2" data-dubao-ky-toi={kyToi.date}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="eyebrow">Số dự báo kỳ tới</span>
                        <span className="text-[0.78rem] text-white font-bold">{thuCua(kyToi.date)} {ddmmyy(kyToi.date)}</span>
                        <span className="text-[0.62rem] font-bold px-1.5 py-0.5 rounded bg-white/[0.10] text-[#cbd5e1]" data-dubao-ky-toi-tham-khao>👀 Chỉ tham khảo — bot không gửi</span>
                        <span className="text-[0.66rem] text-[var(--text-muted)]">theo "{chonMh.ten}", từ {CUA_SO} kỳ đến {ddmm(pt.denNgay)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5" data-dubao-chon-toi>
                        {chonToi.map((lo) => (
                          <span key={lo} data-dubao-con={lo} className="relative inline-flex items-center justify-center min-w-[2.3rem] px-2 py-1 rounded-lg bg-white/[0.10] text-white font-extrabold numeric text-sm">
                            {lo}<span className="absolute -top-1.5 -right-1.5 text-[0.55rem] px-1 rounded bg-[#7c3aed] text-white numeric" title={`${dongThuan.get(lo) ?? 0}/${CAC_MO_HINH.length} mô hình cùng chọn`}>{dongThuan.get(lo) ?? 0}</span>
                          </span>
                        ))}
                      </div>
                      <div className="text-[0.7rem] text-[var(--text-secondary)]">
                        Số nhỏ góc phải = bao nhiêu trong {CAC_MO_HINH.length} mô hình cùng chọn con đó.{" "}
                        {dongThuanCao.length ? <>Được từ 4 mô hình trở lên: <b className="text-white numeric">{dongThuanCao.map(([lo, c]) => `${lo} (${c})`).join(", ")}</b>.</> : "Không con nào được từ 4 mô hình trở lên."}
                      </div>
                      {dongLuuTk}
                      <div className="flex flex-wrap items-end gap-2" data-dubao-o-nhap>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">Điểm mỗi con</span>
                          <input value={diemTkNhap} onChange={(e) => setDiemTkNhap(e.target.value)} inputMode="numeric" data-dubao-diem className="w-20 px-2 py-1 rounded-lg bg-white/[0.08] text-white text-sm font-bold numeric border border-[var(--hairline)]" />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">Tiền tố đài (2d, mn, mb)</span>
                          <input value={tienToTk} onChange={(e) => setTienToTk(e.target.value)} placeholder="để trống nếu không cần" data-dubao-tien-to className="w-36 px-2 py-1 rounded-lg bg-white/[0.08] text-white text-sm numeric border border-[var(--hairline)]" />
                        </label>
                      </div>
                      {(ddTk.loi || ttTk.loi) && (
                        <div className="text-[0.72rem] text-[#ffd24a]" data-dubao-loi-nhap>{ddTk.loi ?? ""}{ddTk.loi && ttTk.loi ? " " : ""}{ttTk.loi ?? ""}</div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <code className="flex-1 min-w-[12rem] px-2 py-1 rounded-lg bg-black/30 text-[#e2e8f0] text-xs break-all" data-dubao-chuoi>{chuoi}</code>
                        <button onClick={copy} data-dubao-copy className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#7c3aed] text-white">{daCopy ? "Đã copy" : "Copy"}</button>
                      </div>
                      <div className="text-[0.74rem] text-[var(--text-secondary)]" data-dubao-danh-sao data-dubao-xac={n * diemTk * gia}>
                        <b className="text-white">Đánh như nào:</b> {n} con trên, mỗi con <b className="text-white numeric">{so(diemTk)}</b> điểm, xác <b className="text-white numeric">{so(n * diemTk * gia)}đ</b>.
                        Về {can} nháy mới lời (+{so((can * WIN_PER_POINT - n * gia) * diemTk)}đ), về 0 nháy mất {so(n * diemTk * gia)}đ.
                      </div>
                      <div className="text-[0.72rem] text-[var(--text-secondary)]" data-dubao-gap data-dubao-gap-lai={chonMh.lai * diemTk} data-dubao-gap-sut={chonMh.thuaSauNhat * diemTk}>
                        Nếu {so(chonMh.soKy)} kỳ qua đánh "{chonMh.ten}" {so(diemTk)} điểm mỗi con: lãi <b className="numeric" style={{ color: mau(chonMh.lai) }}>{dau(chonMh.lai * diemTk)}</b>,
                        có lúc thua sâu <b className="numeric text-[#ff9d9d]">{tien(chonMh.thuaSauNhat * diemTk)}</b>, thua liền {chonMh.chuoiThua} kỳ. Gấp điểm thì tiền ăn và tiền thua cùng gấp lên, may rủi không đổi.
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="eyebrow">Số dự báo và số ra từng kỳ</span>
                    <button onClick={() => setXemHet((v) => !v)} data-dubao-xem-het className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/[0.09] text-[#c2d4ea] hover:bg-white/[0.16]">{xemHet ? "Chỉ 30 kỳ gần nhất" : `Xem hết ${so(chonMh.soKy)} kỳ`}</button>
                  </div>
                  <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
                    <table className="w-full text-[0.7rem]" data-dubao-bang-ky>
                      <thead><tr className="text-[var(--text-muted)] text-left"><th className="py-1 pr-2">Kỳ</th><th className="py-1 pr-2">Số dự báo (xanh = về)</th><th className="py-1 pr-2">Số ra</th><th className="py-1 pr-2">Nháy</th><th className="py-1">Lãi</th></tr></thead>
                      <tbody>
                        {[...chonMh.ky].reverse().slice(0, xemHet ? undefined : 30).map((k) => {
                          const d = theoNgay.get(k.date);
                          const ve = d ? Object.keys(d.hits).filter((lo) => Number(d.hits[lo]) > 0).sort() : [];
                          const trung = new Map(k.trung.map((t) => [t.lo, t.nhay]));
                          return (
                            <tr key={k.date} data-dubao-ky={k.date} data-dubao-ky-lai={k.lai} data-dubao-ky-nhay={k.soNhay} className="border-t border-[var(--hairline)] align-top">
                              <td className="py-1.5 pr-2 numeric text-white whitespace-nowrap">{thuCua(k.date)} {ddmm(k.date)}</td>
                              <td className="py-1.5 pr-2">
                                <div className="flex flex-wrap gap-1 max-w-[14rem]">
                                  {k.chon.map((lo) => (
                                    <span key={lo} data-dubao-du-bao={lo} data-dubao-trung={trung.has(lo) ? "1" : "0"} className={`px-1.5 py-0.5 rounded numeric font-bold ${trung.has(lo) ? "bg-[#10b981]/35 text-[#7ff0c0]" : "bg-white/[0.07] text-[#94a3b8]"}`}>
                                      {lo}{(trung.get(lo) ?? 0) > 1 ? `×${trung.get(lo)}` : ""}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-1.5 pr-2 numeric text-[0.64rem] text-[var(--text-muted)] leading-snug min-w-[9rem] max-w-[14rem]">
                                {ve.map((lo) => <span key={lo} className={trung.has(lo) ? "text-[#7ff0c0] font-bold" : ""}>{lo}{Number(d!.hits[lo]) > 1 ? `×${d!.hits[lo]}` : ""} </span>)}
                              </td>
                              <td className="py-1.5 pr-2 numeric" style={{ color: k.soNhay >= can ? "#7ff0c0" : "#cbd5e1" }}>{k.soNhay}</td>
                              <td className="py-1.5 numeric whitespace-nowrap" style={{ color: mau(k.lai) }}>{dau(k.lai)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Đường tiền cộng dồn của mô hình đang xem: trên 0 là đang lời, dưới 0 là lỗ. */
function DuongTien({ ky }: { ky: TongKetMoHinh["ky"] }) {
  if (ky.length < 2) return null;
  const W = 320, H = 70, P = 4;
  const cong: number[] = []; let s = 0;
  for (const k of ky) { s += k.lai; cong.push(s); }
  const lo = Math.min(0, ...cong), hi = Math.max(0, ...cong), kho = hi - lo || 1;
  const x = (i: number) => P + (i / (cong.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + ((hi - v) / kho) * (H - 2 * P);
  const diem = cong.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const cuoi = cong[cong.length - 1];
  return (
    <div className="space-y-1" data-dubao-duong={Math.round(cuoi)}>
      <span className="eyebrow">Tiền cộng dồn qua {so(ky.length)} kỳ ({ddmm(ky[0].date)} → {ddmm(ky[ky.length - 1].date)})</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px] rounded-lg bg-white/[0.03] border border-[var(--hairline)]" preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="rgba(203,213,225,0.45)" strokeDasharray="3 3" strokeWidth="1" />
        <polyline points={diem} fill="none" stroke={cuoi >= 0 ? "#7ff0c0" : "#ff9d9d"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[0.62rem] text-[var(--text-muted)] numeric"><span>cao nhất {dau(hi)}</span><span>cuối {dau(cuoi)}</span><span>thấp nhất {dau(lo)}</span></div>
    </div>
  );
}

function O({ nhan, gt, phu, m }: { nhan: string; gt: string; phu: string; m: string }) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-white/[0.03] px-3 py-2">
      <div className="text-[0.62rem] uppercase tracking-wider text-[var(--text-muted)]">{nhan}</div>
      <div className="text-lg font-extrabold numeric" style={{ color: m }}>{gt}</div>
      <div className="text-[0.66rem] text-[var(--text-secondary)] leading-snug">{phu}</div>
    </div>
  );
}
