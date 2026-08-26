/**
 * A real neural network, trained by real backpropagation.
 *
 * The earlier agent was handed five features somebody chose by hand. This one
 * is shown the raw thing instead: for every lô, the last 20 draws exactly as
 * they happened, plus a few counts. If there is structure in that pattern, a
 * hidden layer will find it — that is what hidden layers are for.
 *
 * The gradient is exact, not estimated. Profit per point is
 *
 *     f = Σ Lᵢ(giá − trả·kᵢ) / Σ Lᵢ
 *
 * and every limit Lᵢ is a smooth function of the network output, so the whole
 * thing differentiates cleanly back to the weights.
 *
 * Worth knowing before reading the results: the EXPECTED value of that
 * gradient is zero at every single weight, because 0,36 × 75.000 is exactly
 * 27.000. Whatever slope training follows is built entirely out of which
 * numbers happened to land during the training draws. The validation curve is
 * where that shows up.
 */

export interface Draw {
  date: string;
  hits: Record<string, number>;
}

export const LOS = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

/** How many past draws the network sees per lô, raw. */
export const LOOKBACK = 20;
export const N_INPUT = LOOKBACK + 4;

/** Raw recent history plus a few counts, all centred near zero. */
export function inputsFor(history: Draw[], lo: string): number[] {
  const x: number[] = [];
  for (let k = LOOKBACK; k >= 1; k--) {
    const d = history[history.length - k];
    x.push(d ? Math.min(2, d.hits[lo] ?? 0) - 0.36 : 0);
  }

  let gap = history.length;
  for (let i = history.length - 1, back = 0; i >= 0; i--, back++) {
    if ((history[i].hits[lo] ?? 0) > 0) { gap = back; break; }
  }
  const count = (n: number) => history.slice(-n).reduce((s, d) => s + (d.hits[lo] ?? 0), 0);

  x.push((Math.min(gap, 15) - 3) / 3);
  x.push((count(7) - 2.5) / 2.5);
  x.push((count(30) - 10.8) / 10.8);
  x.push(lo[0] === lo[1] ? 1 : 0);
  return x;
}

export interface Net {
  /** hidden × input */
  w1: number[][];
  b1: number[];
  /** hidden */
  w2: number[];
  b2: number;
  hidden: number;
}

export function makeNet(hidden: number, seed = 12345): Net {
  let s = seed;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Xavier-ish: keeps the first forward pass inside tanh's useful range.
  const scale = Math.sqrt(1 / N_INPUT);
  return {
    w1: Array.from({ length: hidden }, () =>
      Array.from({ length: N_INPUT }, () => (rnd() * 2 - 1) * scale)
    ),
    b1: new Array(hidden).fill(0),
    w2: Array.from({ length: hidden }, () => (rnd() * 2 - 1) * 0.3),
    b2: 0,
    hidden,
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/**
 * Smallest share of base the network may accept on a lô.
 *
 * Not a style choice. Profit is measured per point taken, so letting the
 * network drive every limit to zero leaves that ratio dividing by nothing —
 * the first run printed profits of 9.455% and −29.682% purely from a
 * vanishing denominator. A floor keeps the book real and the number readable.
 */
const FLOOR = 0.02;
const SPAN = 2 - FLOOR;

/** Multiplier on base: FLOOR … 2. */
const squash = (z: number) => FLOOR + SPAN * sigmoid(z);

interface Forward {
  h: number[];
  z: number;
  /** Multiplier on base, already floored. */
  out: number;
  /** The bare sigmoid, kept because the derivative needs it. */
  sig: number;
}

function forward(net: Net, x: number[]): Forward {
  const h = new Array(net.hidden);
  for (let j = 0; j < net.hidden; j++) {
    let a = net.b1[j];
    const row = net.w1[j];
    for (let i = 0; i < x.length; i++) a += row[i] * x[i];
    h[j] = Math.tanh(a);
  }
  let z = net.b2;
  for (let j = 0; j < net.hidden; j++) z += net.w2[j] * h[j];
  return { h, z, out: squash(z), sig: sigmoid(z) };
}

/** Points to accept on each lô: 0 … 2×base. */
export function limitsFrom(net: Net, history: Draw[], base: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lo of LOS) out[lo] = Math.round(base * forward(net, inputsFor(history, lo)).out);
  return out;
}

/** Profit as a share of money taken, over a run of draws. */
export function evaluate(
  net: Net,
  draws: Draw[],
  price: number,
  win: number,
  base: number,
  warmup = LOOKBACK + 5
): { mean: number; worst: number; lossRate: number } {
  const rets: number[] = [];
  for (let t = warmup; t < draws.length; t++) {
    const hist = draws.slice(0, t);
    let S = 0, N = 0;
    for (const lo of LOS) {
      const L = base * forward(net, inputsFor(hist, lo)).out;
      S += L;
      N += L * (price - win * (draws[t].hits[lo] ?? 0));
    }
    // Divided by price as well as by points: N/S alone is đồng per point, and
    // reporting that as a percentage is how a 27.000đ margin turned into
    // "2.700.000%". The ratio wanted here is profit over money taken.
    if (S > 0) rets.push(N / (S * price));
  }
  if (rets.length === 0) return { mean: 0, worst: 0, lossRate: 0 };
  return {
    mean: rets.reduce((a, b) => a + b, 0) / rets.length,
    worst: Math.min(...rets),
    lossRate: rets.filter((r) => r < 0).length / rets.length,
  };
}

export interface TrainLog {
  epoch: number;
  train: number;
  valid: number;
}

export interface TrainOut {
  net: Net;
  log: TrainLog[];
  /** Epoch whose validation score was best — where training should have stopped. */
  bestEpoch: number;
  bestNet: Net;
}

const clone = (n: Net): Net => ({
  w1: n.w1.map((r) => [...r]),
  b1: [...n.b1],
  w2: [...n.w2],
  b2: n.b2,
  hidden: n.hidden,
});

/**
 * Gradient ascent on profit per point, with a validation split watched
 * throughout.
 *
 * Keeping the best-on-validation network is standard practice and it matters
 * here: without it the reported result would be whatever the last epoch
 * happened to memorise.
 */
export function trainNet(
  net: Net,
  train: Draw[],
  valid: Draw[],
  price: number,
  win: number,
  base: number,
  epochs: number,
  lr: number,
  warmup = LOOKBACK + 5
): TrainOut {
  const log: TrainLog[] = [];
  let best = clone(net);
  let bestScore = -Infinity;
  let bestEpoch = 0;

  for (let e = 1; e <= epochs; e++) {
    for (let t = warmup; t < train.length; t++) {
      const hist = train.slice(0, t);
      const hits = train[t].hits;

      // Forward pass over all 100 lô, keeping what backprop needs.
      const cache: { x: number[]; f: Forward; L: number; margin: number }[] = [];
      let S = 0, N = 0;
      for (const lo of LOS) {
        const x = inputsFor(hist, lo);
        const f = forward(net, x);
        const L = base * f.out;
        const margin = price - win * (hits[lo] ?? 0);
        S += L;
        N += L * margin;
        cache.push({ x, f, L, margin });
      }
      if (S <= 0) continue;
      const profit = N / (S * price);

      // d(profit)/dL = (margin − profit) / S, then through sigmoid and tanh.
      const gW1 = net.w1.map((r) => new Array(r.length).fill(0));
      const gB1 = new Array(net.hidden).fill(0);
      const gW2 = new Array(net.hidden).fill(0);
      let gB2 = 0;

      for (const c of cache) {
        const dL = (c.margin / price - profit) / S;
        const dOut = dL * base;
        const dz = dOut * SPAN * c.f.sig * (1 - c.f.sig);

        gB2 += dz;
        for (let j = 0; j < net.hidden; j++) {
          gW2[j] += dz * c.f.h[j];
          const dh = dz * net.w2[j] * (1 - c.f.h[j] * c.f.h[j]);
          gB1[j] += dh;
          for (let i = 0; i < c.x.length; i++) gW1[j][i] += dh * c.x[i];
        }
      }

      // Clip: one lucky draw can otherwise throw the weights somewhere the
      // next thousand draws never bring them back from.
      let norm = gB2 * gB2;
      for (let j = 0; j < net.hidden; j++) {
        norm += gW2[j] * gW2[j] + gB1[j] * gB1[j];
        for (let i = 0; i < N_INPUT; i++) norm += gW1[j][i] * gW1[j][i];
      }
      const scale = norm > 1 ? 1 / Math.sqrt(norm) : 1;
      const step = lr * scale;

      net.b2 += step * gB2;
      for (let j = 0; j < net.hidden; j++) {
        net.w2[j] += step * gW2[j];
        net.b1[j] += step * gB1[j];
        for (let i = 0; i < N_INPUT; i++) net.w1[j][i] += step * gW1[j][i];
      }
    }

    const tr = evaluate(net, train, price, win, base, warmup).mean;
    const va = evaluate(net, valid, price, win, base, warmup).mean;
    log.push({ epoch: e, train: tr, valid: va });

    if (va > bestScore) { bestScore = va; best = clone(net); bestEpoch = e; }
  }

  return { net, log, bestEpoch, bestNet: best };
}
