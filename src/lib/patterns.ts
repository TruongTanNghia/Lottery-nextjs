import type { Draw } from "./sim-ai";

const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
const WIN_PER_POINT = 75_000;
const CUA_SO = 60;

export interface KetQuaCach {
  ten: string;
  moTa: string;
  veTram: number;
  chungTram: number;
  loiTram: number;
}

export interface KetQuaTim {
  soKyThu: number;
  chungTram: number;
  cach: KetQuaCach[];
  tot: KetQuaCach;
  xaoTB: number;
  xaoLech: number;
  xaoThap: number;
  xaoCao: number;
  pTram: number;
  coThat: boolean;
}

/**
 * Ranks all 100 lô for one draw, best-to-hold first.
 *
 * Ties are broken at random rather than by lô number. Sorting ties by name
 * quietly turns "hold what just landed" — where thirty lô share a gap of 0 —
 * into "hold the low numbers", and then the test measures the wrong thing.
 */
type Cach = (
  dem: Record<string, number>,
  gap: Record<string, number>,
  rnd: () => number
) => string[];

const xepNgau = (
  khoa: (lo: string) => number,
  rnd: () => number
): string[] =>
  LOS.map((lo) => [lo, khoa(lo), rnd()] as const)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map((x) => x[0]);

const CACH: { ten: string; moTa: string; f: Cach }[] = [
  {
    ten: "Lâu chưa về nhất",
    moTa: "ôm nặng con đã lâu không ra",
    f: (_d, gap, r) => xepNgau((lo) => -gap[lo], r),
  },
  {
    ten: "Ra ít nhất 60 kỳ",
    moTa: "ôm nặng con ra thưa",
    f: (dem, _g, r) => xepNgau((lo) => dem[lo], r),
  },
  {
    ten: "Ra nhiều nhất 60 kỳ",
    moTa: "ôm nặng con ra dày",
    f: (dem, _g, r) => xepNgau((lo) => -dem[lo], r),
  },
  {
    ten: "Vừa về hôm qua",
    moTa: "ôm nặng con mới ra",
    f: (_d, gap, r) => xepNgau((lo) => gap[lo], r),
  },
  {
    ten: "Số kép (00, 11, 22…)",
    moTa: "ôm nặng số kép",
    f: (_d, _g, r) => xepNgau((lo) => (lo[0] === lo[1] ? 0 : 1), r),
  },
  {
    ten: "Bốc bừa (đối chứng)",
    moTa: "không nhìn gì, bốc ngẫu nhiên",
    f: (_d, _g, r) => xepNgau(() => 0, r),
  },
];

/**
 * Hit rate of the 20 lô a method picks, measured only on draws it never saw.
 *
 * Every draw is scored against a ranking built from the 60 draws before it, so
 * nothing here is fitted to the answer — which is the whole point. A method
 * that looks brilliant on the history it was chosen from proves nothing.
 */
function chayCuonChieu(draws: Draw[], f: Cach, rnd: () => number): number {
  let luot = 0;
  let ky = 0;
  for (let i = CUA_SO; i < draws.length; i++) {
    const dem: Record<string, number> = {};
    const gap: Record<string, number> = {};
    for (const lo of LOS) {
      dem[lo] = 0;
      gap[lo] = CUA_SO;
    }
    for (let j = 0; j < CUA_SO; j++) {
      const d = draws[i - CUA_SO + j];
      for (const [lo, c] of Object.entries(d.hits)) {
        dem[lo] += c;
        gap[lo] = CUA_SO - 1 - j;
      }
    }
    for (const lo of f(dem, gap, rnd).slice(0, 20)) luot += draws[i].hits[lo] ?? 0;
    ky++;
  }
  return ky === 0 ? NaN : luot / ky / 20;
}

/** Same number of hits per draw, scattered over different lô. */
function xaoLai(draws: Draw[], rnd: () => number): Draw[] {
  return draws.map((d) => {
    let n = 0;
    for (const c of Object.values(d.hits)) n += c;
    const hits: Record<string, number> = {};
    for (let k = 0; k < n; k++) {
      const lo = LOS[Math.floor(rnd() * 100)];
      hits[lo] = (hits[lo] ?? 0) + 1;
    }
    return { date: d.date, hits };
  });
}

/**
 * Does any way of picking numbers actually beat the price?
 *
 * Two stages, and the second is the one that matters. First every method is
 * scored out of sample. Then the best of them is re-run against draws that have
 * been deliberately scrambled — same count of hits per draw, different lô. If
 * scrambled history produces the same edge just as often, the edge was never in
 * the numbers; it was in how many ways there are to look.
 */
export function timQuyLuat(
  draws: Draw[],
  price: number,
  soXao = 300,
  seed = 20260828
): KetQuaTim | null {
  if (draws.length < CUA_SO + 20) return null;

  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let tongLuot = 0;
  for (const d of draws) for (const c of Object.values(d.hits)) tongLuot += c;
  const chung = tongLuot / draws.length / 100;

  const loiCua = (ve: number) => ((price - ve * WIN_PER_POINT) / price) * 100;

  const cach: KetQuaCach[] = CACH.map((c) => {
    const ve = chayCuonChieu(draws, c.f, rnd);
    return {
      ten: c.ten,
      moTa: c.moTa,
      veTram: ve * 100,
      chungTram: chung * 100,
      loiTram: loiCua(ve),
    };
  });

  const tot = cach.reduce((a, b) => (b.loiTram > a.loiTram ? b : a));
  const fTot = CACH[cach.indexOf(tot)].f;

  const mau: number[] = [];
  for (let k = 0; k < soXao; k++) mau.push(loiCua(chayCuonChieu(xaoLai(draws, rnd), fTot, rnd)));
  mau.sort((a, b) => a - b);
  const tb = mau.reduce((a, b) => a + b, 0) / mau.length;
  const lech = Math.sqrt(mau.reduce((a, b) => a + (b - tb) ** 2, 0) / mau.length);
  const hon = mau.filter((x) => x >= tot.loiTram).length;
  const p = hon / mau.length;

  return {
    soKyThu: draws.length - CUA_SO,
    chungTram: chung * 100,
    cach,
    tot,
    xaoTB: tb,
    xaoLech: lech,
    xaoThap: mau[Math.floor(mau.length * 0.025)],
    xaoCao: mau[Math.floor(mau.length * 0.975)],
    pTram: p * 100,
    coThat: p < 0.05,
  };
}
