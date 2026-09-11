/**
 * "Chặn theo từng ô" — đề xuất của khách, đo thẳng xem có hơn cách đang chạy không.
 *
 * Khách nói rõ ý: hiện tại app chặn theo cả nhóm, cả bậc "1 kỳ chưa về" là 100
 * con như nhau. Họ muốn nhỏ hơn một bậc — mỗi Ô là một cặp (con số, bậc ngày).
 * Con 09 ở ngày 1 từng thua thì bỏ, nhưng chính con 09 ở ngày 2 không thua thì
 * vẫn ôm. "Kiểu tối ưu lợi nhuận cho mình á."
 *
 * Câu hỏi họ đặt ra là câu đúng — "làm thử demo xem nó có hiệu quả hơn bây giờ
 * không" — nên chỗ này phải trả lời được nó, chứ không phải chỉ trình bày cho
 * đẹp. Muốn trả lời thì phải có ba thứ mà một bảng kết quả đơn thuần không có:
 *
 * 1. Chơi thật thì máy chỉ được nhìn quá khứ. Chọn ô lỗ trên chính quãng mình
 *    đem ra chấm là chấm bài khi đã biết đáp án — kiểu gì cũng đẹp.
 * 2. Phải có đối chứng bốc bừa, chặn đúng bằng ngần ấy ô nhưng chọn ngẫu nhiên.
 *    Chặn bớt lô thì cả thu lẫn chi đều nhỏ lại; nếu bốc bừa cũng ra con số như
 *    vậy thì cái "biết chọn" chẳng đóng góp gì.
 * 3. Phải có phép thử đảo ngược: chặn đúng những ô đang LỜI. Nếu đọc được ô nào
 *    xấu thật thì bỏ ô tốt phải thấy tệ hẳn đi. Nếu bỏ ô tốt cũng ra kết quả
 *    ngang bỏ ô xấu, thì cái đang đọc được là tiếng ồn.
 *
 * Bốn nhánh chạy trên đúng cùng những kỳ, cùng mức 100 điểm mỗi lô, nên chênh
 * lệch giữa chúng chỉ có thể đến từ cách chọn ô.
 */
import { LOS } from "./backtest";
import type { DrawHits } from "./backtest";
import { STAKE_PRICE, WIN_PER_POINT } from "./exposure";
import { dungKy, type BacKey, type Ky } from "./slot-stats";
import { mucCho } from "./backtest";
import type { Schedule } from "./limit-engine";
import type { Region } from "./db";

/** Mỗi lô ôm ngần này điểm ở mọi nhánh, để bốn nhánh so được với nhau. */
const DIEM = 100;
/** Bốc bừa chạy ngần này lượt rồi lấy khoảng, một lượt thì chưa nói lên gì. */
const SO_LUOT_BOC = 25;

export interface ONhanh {
  ten: string;
  giaiThich: string;
  thu: number;
  bu: number;
  lai: number;
  bien: number;
  kyLo: number;
  /** Số ô bị chặn trung bình mỗi kỳ, trên 100. */
  chanTB: number;
  /**
   * Tiền dồn sau mỗi kỳ, từ kỳ đầu tới kỳ đó.
   *
   * Người vận hành hỏi "151 kỳ, ở kỳ thứ 10 bắt đầu bỏ thì nó NHƯ NÀO" — họ
   * muốn thấy nó chạy, không phải một con số cuối. Một con số cuối giấu mất
   * chuyện hai cách chơi bám nhau suốt rồi tách ra đúng vài kỳ cuối.
   */
  don: number[];
}

export interface OLo {
  lo: string;
  bac: BacKey;
  dip: number;
  nhay: number;
  lai: number;
  bien: number;
}

export interface KhoangBoc {
  tb: number;
  thap: number;
  cao: number;
}

export interface DemoChanO {
  region: Region;
  soKy: number;
  /** Ngày của từng kỳ, cùng thứ tự với `don` trong mỗi nhánh. */
  ngay: string[];
  /** Đang chấm bằng bảng hạn mức thật hay bằng 100 điểm đều. */
  theoBang: boolean;
  /** Tổng số ô có ít nhất một dịp. */
  soO: number;
  /** Trung bình mỗi ô gom được bao nhiêu dịp — cái quyết định tin được hay không. */
  dipTB: number;
  /**
   * Sai số của biên từng ô, tính theo cỡ mẫu trung bình.
   *
   * Một ô có 8 dịp thì biên của nó dao động cỡ ±47% chỉ vì may rủi. Con số này
   * nói thẳng: ô đang hiện −20% và ô đang hiện +20% có thể là cùng một thứ.
   */
  saiSoO: number;
  /** Học và chơi cùng một quãng — đẹp giả. */
  nhinLai: ONhanh[];
  /** Mỗi kỳ máy chỉ biết những kỳ trước nó — con số thật. */
  that: ONhanh[];
  /** Khoảng của nhánh bốc bừa khi chạy thật, để biết chênh lệch bao nhiêu mới đáng kể. */
  khoangBoc: KhoangBoc;
  /** Khoảng bốc bừa khớp đúng số ô mà luật "lần trước" chặn — đối chứng riêng cho nó. */
  khoangBocLanTruoc: KhoangBoc;
  /** Những ô lỗ nặng nhất trên cả quãng — để thấy cái máy đang nhìn vào là gì. */
  oLoNhat: OLo[];
  /** Bao nhiêu ô đổi phe giữa nửa đầu và nửa sau: lỗ thành lời, lời thành lỗ. */
  doiPhe: { xet: number; doi: number };
  /** Làm đúng thao tác thật: chốt danh sách một lần rồi chạy tiếp. */
  chot: ChotMotLan;
}

/**
 * "Chặn hết các số lỗ ở các ô hiện tại" — đúng thao tác người ta sẽ làm.
 *
 * Khác hẳn nhánh chạy thật ở trên. Trên kia máy tính lại mỗi kỳ, một con vừa
 * hết lỗ là được nhận lại ngay. Còn ngoài đời thì người ta mở thẻ ra hôm nay,
 * chép lấy danh sách con lỗ, chặn, rồi để đó mà chạy — danh sách đứng yên.
 *
 * Nên phải đo riêng: học danh sách trên nửa đầu, khoá lại, chơi nửa sau. Nửa
 * sau là quãng mà danh sách chưa từng nhìn thấy, nên nó là bài thi thật.
 */
export interface ChotMotLan {
  kyHoc: number;
  kyThi: number;
  /** Số ô vào danh sách chặn. */
  soO: number;
  /** Chấm chính nửa đầu bằng danh sách học từ nửa đầu — đẹp giả, để đối chiếu. */
  nhinLai: ONhanh;
  khongChan: ONhanh;
  chanTheoDS: ONhanh;
  bocBua: ONhanh;
  khoangBoc: KhoangBoc;
  /**
   * Trong những ô đã bị đưa vào danh sách vì lỗ, sang nửa sau bao nhiêu ô còn lỗ.
   *
   * Đây là con số quyết định. Danh sách chỉ đáng chặn nếu ô lỗ hôm nay còn lỗ
   * ngày mai; nếu tỷ lệ này quanh một nửa thì cái danh sách đang chép lại quá
   * khứ chứ không đọc được tính nết con số.
   */
  giuPhe: { xet: number; vanLo: number };
}

const khoaO = (lo: string, bac: BacKey) => `${lo}|${bac}`;

interface Dem {
  dip: number;
  nhay: number;
}

/** Lời/lỗ của một ô nếu ôm DIEM điểm mỗi dịp. */
const laiO = (d: Dem, gia: number) => d.dip * DIEM * gia - d.nhay * DIEM * WIN_PER_POINT;

/** Đếm dịp và nháy cho từng ô, trên những kỳ được đưa vào. */
function demO(ky: Ky[]): Map<string, Dem> {
  const m = new Map<string, Dem>();
  for (const k of ky) {
    for (const l of LOS) {
      const key = khoaO(l, k.bac[l]);
      const d = m.get(key);
      if (d) {
        d.dip++;
        d.nhay += k.ve[l];
      } else {
        m.set(key, { dip: 1, nhay: k.ve[l] });
      }
    }
  }
  return m;
}

/**
 * Chốt sổ một nhánh: mỗi kỳ nhận những lô mà `nhan` cho qua.
 *
 * `diem` quyết định mỗi lô ôm bao nhiêu điểm. Để 100 đều thì bốn nhánh so
 * được với nhau sòng phẳng; đưa bảng hạn mức thật vào thì ra đúng đồng tiền
 * người ta sẽ ăn hay mất.
 */
function chotSo(
  ky: Ky[],
  gia: number,
  ten: string,
  giaiThich: string,
  nhan: (k: Ky, lo: string, i: number) => boolean,
  diem: (k: Ky, lo: string) => number
): ONhanh {
  let thu = 0;
  let bu = 0;
  let kyLo = 0;
  let chanTong = 0;
  const don: number[] = [];

  for (let i = 0; i < ky.length; i++) {
    const k = ky[i];
    let t = 0;
    let b = 0;
    let chan = 0;
    for (const l of LOS) {
      if (!nhan(k, l, i)) {
        chan++;
        continue;
      }
      const d = diem(k, l);
      t += d * gia;
      b += d * WIN_PER_POINT * k.ve[l];
    }
    thu += t;
    bu += b;
    chanTong += chan;
    if (t - b < 0) kyLo++;
    don.push(thu - bu);
  }

  return {
    ten,
    giaiThich,
    thu,
    bu,
    lai: thu - bu,
    bien: thu > 0 ? ((thu - bu) / thu) * 100 : 0,
    kyLo,
    chanTB: ky.length ? chanTong / ky.length : 0,
    don,
  };
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống, để chạy lại ra đúng kết quả cũ. */
function rng(hat: number) {
  let s = hat >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

/**
 * Nhánh bốc bừa: mỗi kỳ chặn ĐÚNG bằng số ô nhánh khách chặn, nhưng chọn lô
 * ngẫu nhiên. Bằng số thì phần "thu nhỏ lại vì ôm ít hơn" giống hệt nhau, chênh
 * lệch còn lại mới thật sự là công của việc chọn đúng ô.
 */
function bocBua(
  ky: Ky[],
  gia: number,
  soChan: number[],
  hat: number,
  diem: (k: Ky, lo: string) => number
): ONhanh {
  const r = rng(hat);
  const chanTheoKy: Set<string>[] = ky.map((_, i) => {
    const con = [...LOS];
    // Fisher–Yates, chỉ xáo đủ phần đầu cần lấy.
    const n = Math.min(soChan[i] ?? 0, con.length);
    for (let j = 0; j < n; j++) {
      const k = j + Math.floor(r() * (con.length - j));
      [con[j], con[k]] = [con[k], con[j]];
    }
    return new Set(con.slice(0, n));
  });
  return chotSo(ky, gia, "Bốc bừa", "chặn ngẫu nhiên, đúng bằng số ô cách khách chặn",
    (_k, lo, i) => !chanTheoKy[i].has(lo), diem);
}

/**
 * Chạy cả demo.
 *
 * `toiThieu` là số dịp một ô phải có thì máy mới dám tin nó. Để 1 thì một lần
 * thua đã đủ bị chặn, đúng như câu "số nào vào ngày 1 thua là mình chặn"; nâng
 * lên thì máy khó tin hơn nhưng chặn được ít ô hơn.
 */
export function demoChanO(
  draws: DrawHits[],
  region: Region,
  toiThieu = 1,
  /**
   * Bảng hạn mức thật. Bỏ trống thì mọi lô ôm 100 điểm đều.
   *
   * Người vận hành hỏi "lợi nhuận MÌNH như nào" — sổ của họ không phẳng, tiền
   * dồn hết vào mấy bậc nặng. Nên phải chấm được cả hai kiểu: 100 đều để so
   * bốn cách chơi sòng phẳng, và bảng thật để ra đúng đồng tiền.
   */
  schedule?: Schedule | null
): DemoChanO | null {
  const ky = dungKy(draws);
  if (ky.length < 40) return null;

  const gia = STAKE_PRICE[region];
  // Đọc kho/chuoi thô chứ không đọc bậc: bậc đã gộp 19 kỳ khô trở lên vào một
  // rọ, còn bảng thật vẫn phân biệt 19 với 25.
  const diem: (k: Ky, lo: string) => number = schedule
    ? (k, lo) => mucCho(schedule, k.kho[lo], k.chuoi[lo])
    : () => DIEM;

  // ── Nhìn lại: học trên chính quãng đem ra chấm ───────────────────────────
  const toanBo = demO(ky);
  const xau = new Set<string>();
  const tot = new Set<string>();
  for (const [key, d] of toanBo) {
    if (d.dip < toiThieu) continue;
    const l = laiO(d, gia);
    if (l < 0) xau.add(key);
    else if (l > 0) tot.add(key);
  }

  const nlA = chotSo(ky, gia, "Bây giờ", "nhận hết, không chặn ô nào", () => true, diem);
  const nlB = chotSo(ky, gia, "Cách khách", "chặn ô đang lỗ",
    (k, lo) => !xau.has(khoaO(lo, k.bac[lo])), diem);
  const nlD = chotSo(ky, gia, "Đảo ngược", "chặn ô đang lời — phép thử",
    (k, lo) => !tot.has(khoaO(lo, k.bac[lo])), diem);
  const soChanNL = ky.map((k) => LOS.filter((lo) => xau.has(khoaO(lo, k.bac[lo]))).length);
  const nlC = bocBua(ky, gia, soChanNL, 20260909, diem);

  // ── Chạy thật: mỗi kỳ chỉ được nhìn những kỳ trước nó ────────────────────
  // Đây đúng cái khách mô tả — "máy tự bỏ số đó đi" — và cũng chính là cách
  // duy nhất đo được mà không mượn thông tin của tương lai.
  const acc = new Map<string, Dem>();
  const chanXau: Set<string>[] = [];
  const chanTot: Set<string>[] = [];
  // Luật "lần trước": nhớ đúng một chuyện — lần gần nhất con này ở ô này, nó
  // có về không. Khách nói thẳng bằng ví dụ: "các số nào lỗ ở ô vừa về thì lần
  // sau nó vừa về nữa không nhận." Đó không phải cộng dồn cả lịch sử của ô mà
  // là nhìn đúng lần liền trước, nên phải đo riêng.
  const lanTruocVe = new Map<string, boolean>();
  const chanLanTruoc: Set<string>[] = [];

  for (const k of ky) {
    const cx = new Set<string>();
    const ct = new Set<string>();
    const cl = new Set<string>();
    for (const l of LOS) {
      const key = khoaO(l, k.bac[l]);
      if (lanTruocVe.get(key) === true) cl.add(l);
      const d = acc.get(key);
      if (!d || d.dip < toiThieu) continue;
      const lai = laiO(d, gia);
      if (lai < 0) cx.add(l);
      else if (lai > 0) ct.add(l);
    }
    chanXau.push(cx);
    chanTot.push(ct);
    chanLanTruoc.push(cl);

    // Chỉ sau khi đã quyết xong, kỳ này mới trở thành quá khứ.
    for (const l of LOS) {
      const key = khoaO(l, k.bac[l]);
      const d = acc.get(key);
      if (d) {
        d.dip++;
        d.nhay += k.ve[l];
      } else {
        acc.set(key, { dip: 1, nhay: k.ve[l] });
      }
      // Về một nháy trở lên là kỳ đó mình mất tiền ở con này.
      lanTruocVe.set(key, k.ve[l] > 0);
    }
  }

  const tA = chotSo(ky, gia, "Bây giờ", "nhận hết, không chặn ô nào", () => true, diem);
  const tB = chotSo(ky, gia, "Cách khách", "chặn ô đã lỗ ở những kỳ trước",
    (_k, lo, i) => !chanXau[i].has(lo), diem);
  const tD = chotSo(ky, gia, "Đảo ngược", "chặn ô đã lời ở những kỳ trước — phép thử",
    (_k, lo, i) => !chanTot[i].has(lo), diem);
  const tE = chotSo(ky, gia, "Lần trước lỗ thì bỏ",
    "lần gần nhất con này ở ô này mà về thì lần này không nhận",
    (_k, lo, i) => !chanLanTruoc[i].has(lo), diem);
  const soChanThat = chanXau.map((s) => s.size);
  const soChanE = chanLanTruoc.map((s) => s.size);
  const luotE: ONhanh[] = [];
  for (let i = 0; i < SO_LUOT_BOC; i++) luotE.push(bocBua(ky, gia, soChanE, 4241 + i * 15_485_863, diem));
  const bienE = luotE.map((x) => x.bien).sort((a, b) => a - b);

  const luot: ONhanh[] = [];
  for (let i = 0; i < SO_LUOT_BOC; i++) luot.push(bocBua(ky, gia, soChanThat, 7919 + i * 104_729, diem));
  const biens = luot.map((x) => x.bien).sort((a, b) => a - b);
  const khoangBoc: KhoangBoc = {
    tb: biens.reduce((s, x) => s + x, 0) / biens.length,
    thap: biens[0],
    cao: biens[biens.length - 1],
  };
  // Lượt nằm giữa làm đại diện để bảng có một dòng, khoảng đầy đủ nằm ngay dưới.
  const tC = [...luot].sort((a, b) => a.bien - b.bien)[Math.floor(luot.length / 2)];

  // ── Ô có tin được không: cỡ mẫu và sai số ────────────────────────────────
  let dipTong = 0;
  for (const d of toanBo.values()) dipTong += d.dip;
  const soO = toanBo.size;
  const dipTB = soO ? dipTong / soO : 0;
  const p = (region === "xsmb" ? 27 : 36) / 100;
  const saiSoO = dipTB > 0
    ? (Math.sqrt((p * (1 - p)) / dipTB) * WIN_PER_POINT / gia) * 100
    : 0;

  const oLoNhat: OLo[] = [...toanBo.entries()]
    .map(([key, d]) => {
      const [lo, bac] = key.split("|");
      return {
        lo,
        bac,
        dip: d.dip,
        nhay: d.nhay,
        lai: laiO(d, gia),
        bien: d.dip ? ((gia - (d.nhay / d.dip) * WIN_PER_POINT) / gia) * 100 : 0,
      };
    })
    .sort((a, b) => a.lai - b.lai)
    .slice(0, 10);

  // ── Ô có giữ phe không: nửa đầu lỗ thì nửa sau còn lỗ chứ? ───────────────
  // Nếu ô lỗ là tính nết thật của con số thì nó phải bền. Nếu nó lật phe gần
  // như tung đồng xu thì danh sách ô xấu học hôm nay chẳng nói gì về ngày mai.
  const giua = Math.floor(ky.length / 2);
  const dau = demO(ky.slice(0, giua));
  const sau = demO(ky.slice(giua));
  let xet = 0;
  let doi = 0;
  for (const [key, d1] of dau) {
    const d2 = sau.get(key);
    if (!d2 || d1.dip < toiThieu || d2.dip < toiThieu) continue;
    const a = laiO(d1, gia);
    const b = laiO(d2, gia);
    if (a === 0 || b === 0) continue;
    xet++;
    if (a < 0 !== b < 0) doi++;
  }

  // ── Chốt danh sách một lần rồi chạy tiếp ────────────────────────────────
  const giuaC = Math.floor(ky.length / 2);
  const kyHoc = ky.slice(0, giuaC);
  const kyThi = ky.slice(giuaC);
  const hoc = demO(kyHoc);
  const dsChan = new Set<string>();
  for (const [key, d] of hoc) {
    if (d.dip >= toiThieu && laiO(d, gia) < 0) dsChan.add(key);
  }
  const khongChan = chotSo(kyThi, gia, "Không chặn gì", "nhận hết ở nửa sau", () => true, diem);
  const chanTheoDS = chotSo(kyThi, gia, "Chặn theo danh sách", "danh sách chốt từ nửa đầu, không đổi",
    (k, lo) => !dsChan.has(khoaO(lo, k.bac[lo])), diem);
  const nhinLaiChot = chotSo(kyHoc, gia, "Nửa đầu", "chấm lại chính quãng đã học",
    (k, lo) => !dsChan.has(khoaO(lo, k.bac[lo])), diem);
  const soChanThi = kyThi.map((k) => LOS.filter((lo) => dsChan.has(khoaO(lo, k.bac[lo]))).length);
  const luotC: ONhanh[] = [];
  for (let i = 0; i < SO_LUOT_BOC; i++) luotC.push(bocBua(kyThi, gia, soChanThi, 31337 + i * 65_537, diem));
  const bienC = luotC.map((x) => x.bien).sort((a, b) => a - b);

  const thi = demO(kyThi);
  let xetC = 0;
  let vanLo = 0;
  for (const key of dsChan) {
    const d = thi.get(key);
    if (!d || d.dip < toiThieu) continue;
    xetC++;
    if (laiO(d, gia) < 0) vanLo++;
  }

  return {
    region,
    soKy: ky.length,
    chot: {
      kyHoc: kyHoc.length,
      kyThi: kyThi.length,
      soO: dsChan.size,
      nhinLai: nhinLaiChot,
      khongChan,
      chanTheoDS,
      bocBua: [...luotC].sort((a, b) => a.bien - b.bien)[Math.floor(luotC.length / 2)],
      khoangBoc: {
        tb: bienC.reduce((s2, x) => s2 + x, 0) / bienC.length,
        thap: bienC[0],
        cao: bienC[bienC.length - 1],
      },
      giuPhe: { xet: xetC, vanLo },
    },
    ngay: ky.map((k) => k.date),
    theoBang: !!schedule,
    soO,
    dipTB,
    saiSoO,
    nhinLai: [nlA, nlB, nlC, nlD],
    that: [tA, tB, tC, tD, tE],
    khoangBocLanTruoc: {
      tb: bienE.reduce((s2, x) => s2 + x, 0) / bienE.length,
      thap: bienE[0],
      cao: bienE[bienE.length - 1],
    },
    khoangBoc,
    oLoNhat,
    doiPhe: { xet, doi },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Xếp hạng phương án
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Xem phương án nào về lâu dài có lợi nhuận nhất, rồi anh em chốt phương án."
 *
 * Đây là câu hỏi cuối của cả chuỗi, và nó có một cái bẫy nằm sẵn trong chính
 * cách hỏi. Xếp mười phương án rồi lấy cái đứng đầu thì bao giờ cũng có một
 * cái đứng đầu — kể cả khi cả mười đều là tiếng ồn. Càng nhiều phương án đem
 * ra so, cái đứng đầu càng dễ chỉ là cái gặp may nhất.
 *
 * Nên bảng này trộn thẳng mấy phương án BỐC BỪA vào cùng danh sách, xếp chung
 * một hạng. Nếu bốc bừa leo lên được top thì bảng xếp hạng tự nó nói rằng
 * không có gì để chốt — không cần ai phải giải thích.
 *
 * Và xếp theo TIỀN chứ không theo biên. Người vận hành vừa hỏi đúng chỗ này:
 * "biên cao là nhận ít hơn, lời nhiều hơn đúng không?" — không đúng. Biên là
 * phần trăm, chặn bớt số thì mẫu số nhỏ lại nên biên dễ đẹp trong khi tiền
 * teo đi. 10% của 100tr thua 1% của 2 tỷ.
 */
export interface PhuongAn {
  ten: string;
  moTa: string;
  /** Phương án đối chứng — trộn chung để xem nó xếp hạng mấy. */
  laBocBua: boolean;
  lai: number;
  bien: number;
  thu: number;
  chanTB: number;
  kyLo: number;
  don: number[];
}

export interface XepHangPA {
  /** Số kỳ thật sự đem ra chấm — nửa sau. */
  soKy: number;
  /** Số kỳ nửa đầu, chỉ dùng để mấy phương án ấm bộ nhớ và học danh sách. */
  kyAm: number;
  ngay: string[];
  theoBang: boolean;
  /** Đã xếp theo tiền, nhiều nhất đứng đầu. */
  bang: PhuongAn[];
  /** Hạng của mấy phương án bốc bừa, đếm từ 1. */
  hangBoc: number[];
  /** Hạng tốt nhất mà bốc bừa với tới được. */
  bocCaoNhat: number;
}

/** Số phương án bốc bừa trộn vào cho biết mặt bằng may rủi. */
const SO_PA_BOC = 5;
/** Một bậc phải gom đủ ngần này lượt lô thì mới dám tin biên của nó. */
const MAU_BAC = 60;

/**
 * Chạy mọi phương án trên cùng một quãng, rồi xếp hạng theo tiền.
 *
 * Mọi phương án đều chỉ được nhìn quá khứ. Không cái nào được chấm trên chính
 * quãng nó học ra, vì như thế thì cái nào cũng thắng.
 */
export function xepHangPhuongAn(
  draws: DrawHits[],
  region: Region,
  schedule?: Schedule | null,
  toiThieu = 1
): XepHangPA | null {
  const ky = dungKy(draws);
  if (ky.length < 40) return null;

  const gia = STAKE_PRICE[region];
  const diem: (k: Ky, lo: string) => number = schedule
    ? (k, lo) => mucCho(schedule, k.kho[lo], k.chuoi[lo])
    : () => DIEM;

  // Ba bộ nhớ chạy song song, tất cả chỉ cập nhật SAU khi kỳ đó đã quyết xong.
  const acc = new Map<string, Dem>();
  const lanTruocVe = new Map<string, boolean>();
  const accBac = new Map<string, { lo: number; nhay: number }>();

  const chanO: Set<string>[] = [];
  const chanLan: Set<string>[] = [];
  const chanBac: Set<string>[] = [];

  for (const k of ky) {
    const cO = new Set<string>();
    const cL = new Set<string>();
    const cB = new Set<string>();
    for (const l of LOS) {
      const key = khoaO(l, k.bac[l]);

      if (lanTruocVe.get(key) === true) cL.add(l);

      const d = acc.get(key);
      if (d && d.dip >= toiThieu && laiO(d, gia) < 0) cO.add(l);

      // Chọn nhóm biên cao: chỉ ôm bậc mà quá khứ cho thấy đang ăn. Bậc chưa
      // đủ mẫu thì cứ ôm — không đủ cơ sở để từ chối cũng là một kết luận.
      const b = accBac.get(k.bac[l]);
      if (b && b.lo >= MAU_BAC) {
        const bien = (gia - (b.nhay / b.lo) * WIN_PER_POINT) / gia;
        if (bien <= 0) cB.add(l);
      }
    }
    chanO.push(cO);
    chanLan.push(cL);
    chanBac.push(cB);

    for (const l of LOS) {
      const key = khoaO(l, k.bac[l]);
      const d = acc.get(key);
      if (d) {
        d.dip++;
        d.nhay += k.ve[l];
      } else {
        acc.set(key, { dip: 1, nhay: k.ve[l] });
      }
      lanTruocVe.set(key, k.ve[l] > 0);

      const b = accBac.get(k.bac[l]);
      if (b) {
        b.lo++;
        b.nhay += k.ve[l];
      } else {
        accBac.set(k.bac[l], { lo: 1, nhay: k.ve[l] });
      }
    }
  }

  // Chốt danh sách một lần: học nửa đầu, khoá lại, dùng cho cả quãng sau.
  const giua = Math.floor(ky.length / 2);
  const hoc = demO(ky.slice(0, giua));
  const dsChot = new Set<string>();
  for (const [key, d] of hoc) if (d.dip >= toiThieu && laiO(d, gia) < 0) dsChot.add(key);

  const pa = (n: ONhanh, moTa: string, laBocBua = false): PhuongAn => ({
    ten: n.ten,
    moTa,
    laBocBua,
    lai: n.lai,
    bien: n.bien,
    thu: n.thu,
    chanTB: n.chanTB,
    kyLo: n.kyLo,
    don: n.don,
  });

  // MỌI phương án đều chỉ được chấm trên NỬA SAU.
  //
  // Phải như vậy vì "chốt danh sách một lần" học danh sách từ nửa đầu — chấm
  // nó trên cả quãng là chấm luôn cái nửa nó đã biết đáp án, và nó sẽ leo lên
  // đầu bảng với mấy tỷ ảo. Đúng cái bẫy mà cả khối này sinh ra để cảnh báo.
  // Mấy phương án còn lại vốn đã chỉ nhìn quá khứ, nên cắt nửa sau không thiệt
  // gì cho chúng: nửa đầu vẫn chạy đủ để bộ nhớ của chúng ấm lên.
  const cham = ky.slice(giua);
  const oset = (a: Set<string>[]) => (_k: Ky, lo: string, i: number) => !a[i + giua].has(lo);
  const soO = chanO.map((s) => s.size).slice(giua);
  const soLan = chanLan.map((s) => s.size).slice(giua);
  const soBac = chanBac.map((s) => s.size).slice(giua);

  const ds: PhuongAn[] = [
    pa(
      chotSo(cham, gia, "Giữ nguyên", "", () => true, diem),
      "nhận hết như bây giờ, không chặn con nào"
    ),
    pa(
      chotSo(cham, gia, "Chặn ô đang lỗ", "", oset(chanO), diem),
      "cộng dồn cả lịch sử của ô, đang lỗ thì bỏ"
    ),
    pa(
      chotSo(cham, gia, "Lần trước lỗ thì bỏ", "", oset(chanLan), diem),
      "chỉ nhìn lần gần nhất con đó ở ô đó"
    ),
    pa(
      chotSo(cham, gia, "Chốt danh sách một lần", "",
        (k, lo) => !dsChot.has(khoaO(lo, k.bac[lo])), diem),
      "chép danh sách từ nửa đầu rồi khoá, không đổi nữa"
    ),
    pa(
      chotSo(cham, gia, "Chọn nhóm biên cao", "", oset(chanBac), diem),
      "chỉ ôm những bậc ngày mà quá khứ cho thấy đang ăn"
    ),
  ];

  // Bốc bừa bám theo mức chặn của mấy phương án kia, để nó không bị thiệt hay
  // lợi chỉ vì ôm nhiều hay ít hơn.
  const mau = [soO, soLan, soBac, soO, soLan];
  for (let i = 0; i < SO_PA_BOC; i++) {
    const n = bocBua(cham, gia, mau[i % mau.length], 90210 + i * 2_654_435_761, diem);
    ds.push({ ...pa(n, "chặn ngẫu nhiên, không nhìn gì cả", true), ten: `Bốc bừa #${i + 1}` });
  }

  const bang = [...ds].sort((a, b) => b.lai - a.lai);
  const hangBoc = bang
    .map((x, i) => (x.laBocBua ? i + 1 : 0))
    .filter((x) => x > 0);

  return {
    soKy: cham.length,
    kyAm: giua,
    ngay: cham.map((k) => k.date),
    theoBang: !!schedule,
    bang,
    hangBoc,
    bocCaoNhat: Math.min(...hangBoc),
  };
}
