/**
 * 戦法カードの見た目(木肌ヒーローの色・ミニ盤に置く駒)だけを持つマッピング。
 * 将棋の定跡データや戦法マスタ(src/data/strategies.ts)そのものではなく、
 * 純粋に表示用なのでドメイン型(Strategy)には含めていない。
 *
 * アイコンは「その戦法を象徴する駒の配置」をミニ盤(9×9)で描く。
 * 以前は「飛」「角」の一文字だけで、四間飛車も中飛車も同じ「飛」に見えて
 * 区別がつかなかった。飛車がどの筋にいるか・玉がどこに囲うかを描けば、
 * 戦法の違いがひと目で分かる。
 */
import type { StrategyId } from "../../domain/types";

export interface IconPiece {
  /** 筋(1〜9)。先手側から見た表記(9が左端)。 */
  file: number;
  /** 段(1〜9)。9が手前(先手側)。 */
  rank: number;
  /** 駒の文字。 */
  glyph: string;
  /** 主役の駒(飛・角など)。色を強めて目立たせる。 */
  accent?: boolean;
}

export interface StrategyVisual {
  /** ヒーロー背景色(mockup.html の wood カラーを踏襲)。 */
  heroColor: string;
  /** ミニ盤に置く駒。 */
  pieces: IconPiece[];
  /** 強調する筋(飛車を振った筋など)。薄く帯を引く。 */
  accentFile?: number;
}

const DEFAULT_VISUAL: StrategyVisual = {
  heroColor: "#E3C07E",
  pieces: [{ file: 5, rank: 9, glyph: "玉" }],
};

const VISUALS: Record<string, StrategyVisual> = {
  // ── 振り飛車 ──
  // 四間飛車: 飛車を6筋(左から4番目)へ。玉は右の美濃囲い。
  shikenbisha: { heroColor: "#DDB877", accentFile: 6,
    pieces: [ { file: 6, rank: 8, glyph: "飛", accent: true }, { file: 7, rank: 7, glyph: "角" },
      { file: 2, rank: 8, glyph: "玉" }, { file: 3, rank: 8, glyph: "銀" }, { file: 4, rank: 9, glyph: "金" } ] },
  // 三間飛車: 飛車を7筋へ。四間飛車より一つ左。
  sankenbisha: { heroColor: "#E3C07E", accentFile: 7,
    pieces: [ { file: 7, rank: 8, glyph: "飛", accent: true }, { file: 7, rank: 7, glyph: "角" },
      { file: 2, rank: 8, glyph: "玉" }, { file: 3, rank: 8, glyph: "銀" }, { file: 4, rank: 9, glyph: "金" } ] },
  // 早石田: 7五歩を突いてから飛車を7筋へ。角はまだ8八。
  hayaishida: { heroColor: "#D9B06A", accentFile: 7,
    pieces: [ { file: 7, rank: 8, glyph: "飛", accent: true }, { file: 7, rank: 5, glyph: "歩", accent: true },
      { file: 8, rank: 8, glyph: "角" }, { file: 5, rank: 9, glyph: "玉" } ] },
  // 向かい飛車: 飛車を8筋へ(相手の飛車と向かい合う)。角は7七。
  mukaibisha: { heroColor: "#E0BB78", accentFile: 8,
    pieces: [ { file: 8, rank: 8, glyph: "飛", accent: true }, { file: 7, rank: 7, glyph: "角" },
      { file: 3, rank: 8, glyph: "玉" }, { file: 4, rank: 8, glyph: "金" } ] },
  // ── 中飛車 ──
  gokigen: { heroColor: "#D8AE6B", accentFile: 5,
    pieces: [ { file: 5, rank: 8, glyph: "飛", accent: true }, { file: 5, rank: 5, glyph: "歩", accent: true },
      { file: 3, rank: 8, glyph: "玉" }, { file: 4, rank: 8, glyph: "銀" } ] },
  nakabisha: { heroColor: "#D8AE6B", accentFile: 5,
    pieces: [ { file: 5, rank: 8, glyph: "飛", accent: true }, { file: 5, rank: 6, glyph: "歩" },
      { file: 3, rank: 8, glyph: "玉" }, { file: 4, rank: 8, glyph: "銀" } ] },
  // ── 居飛車 ──
  // 棒銀: 飛車の前に銀を繰り出す。飛・銀・歩が2筋に縦に並ぶ。
  bougin: { heroColor: "#E7C88A", accentFile: 2,
    pieces: [ { file: 2, rank: 8, glyph: "飛" }, { file: 2, rank: 6, glyph: "銀", accent: true },
      { file: 2, rank: 5, glyph: "歩" }, { file: 7, rank: 8, glyph: "玉" } ] },
  // 居飛車穴熊: 玉を9九の隅へ。香・銀・金で蓋をする。
  anaguma: { heroColor: "#E4C48C",
    pieces: [ { file: 9, rank: 9, glyph: "玉", accent: true }, { file: 9, rank: 8, glyph: "香" },
      { file: 8, rank: 8, glyph: "銀" }, { file: 7, rank: 9, glyph: "金" }, { file: 7, rank: 8, glyph: "金" },
      { file: 2, rank: 8, glyph: "飛" } ] },
  // 超速: 右銀を4六へ、左銀を6六へ(2枚銀)。
  chousoku: { heroColor: "#E8CD95",
    pieces: [ { file: 4, rank: 6, glyph: "銀", accent: true }, { file: 6, rank: 6, glyph: "銀", accent: true },
      { file: 2, rank: 8, glyph: "飛" }, { file: 7, rank: 8, glyph: "玉" } ] },
  // 角換わり: 角が盤上に無い(交換済み)。銀を7七と3七へ。
  kakugawari: { heroColor: "#E9D0A0",
    pieces: [ { file: 7, rank: 7, glyph: "銀" }, { file: 3, rank: 7, glyph: "銀", accent: true },
      { file: 2, rank: 8, glyph: "飛" }, { file: 6, rank: 9, glyph: "玉" } ] },
  yagura: { heroColor: "#D4A863",
    pieces: [ { file: 8, rank: 8, glyph: "玉" }, { file: 7, rank: 7, glyph: "銀" }, { file: 7, rank: 8, glyph: "金" },
      { file: 6, rank: 7, glyph: "金" }, { file: 2, rank: 8, glyph: "飛", accent: true } ] },
  aigakari: { heroColor: "#EAD3A6", accentFile: 2,
    pieces: [ { file: 2, rank: 8, glyph: "飛", accent: true }, { file: 2, rank: 5, glyph: "歩" }, { file: 5, rank: 9, glyph: "玉" } ] },
  // 右四間飛車: 居飛車のまま飛車を4筋へ。4五歩の仕掛け。
  migishiken: { heroColor: "#E2BF80", accentFile: 4,
    pieces: [ { file: 4, rank: 8, glyph: "飛", accent: true }, { file: 4, rank: 5, glyph: "歩", accent: true },
      { file: 4, rank: 7, glyph: "銀" }, { file: 7, rank: 8, glyph: "玉" } ] },
  // 横歩取り: 飛車が3四の歩を取った形。
  yokofudori: { heroColor: "#E6C58E",
    pieces: [ { file: 3, rank: 4, glyph: "飛", accent: true }, { file: 8, rank: 8, glyph: "角" }, { file: 5, rank: 9, glyph: "玉" } ] },
  // ── 奇襲 ──
  sujichigaikaku: { heroColor: "#D9B87A",
    pieces: [ { file: 4, rank: 5, glyph: "角", accent: true }, { file: 2, rank: 8, glyph: "飛" }, { file: 5, rank: 9, glyph: "玉" } ] },
  // ── 相手としてだけ現れるもの(「相手に備える」のカード) ──
  "ibisha-kyusen": { heroColor: "#E7C88A", accentFile: 2,
    pieces: [ { file: 2, rank: 8, glyph: "飛", accent: true }, { file: 2, rank: 6, glyph: "銀" },
      { file: 4, rank: 6, glyph: "銀" }, { file: 7, rank: 8, glyph: "玉" } ] },
  ponponkei: { heroColor: "#DCC18F",
    pieces: [ { file: 3, rank: 7, glyph: "桂", accent: true }, { file: 4, rank: 5, glyph: "桂", accent: true },
      { file: 2, rank: 8, glyph: "飛" }, { file: 5, rank: 9, glyph: "玉" } ] },
  torisashi: { heroColor: "#DCC18F",
    pieces: [ { file: 6, rank: 8, glyph: "銀" }, { file: 7, rank: 9, glyph: "角", accent: true },
      { file: 2, rank: 8, glyph: "飛" }, { file: 5, rank: 9, glyph: "玉" } ] },
};

export function visualFor(id: StrategyId): StrategyVisual {
  return VISUALS[id] ?? DEFAULT_VISUAL;
}
