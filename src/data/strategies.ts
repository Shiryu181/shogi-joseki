/**
 * 「自分の戦法」タブに並べる戦法カード。
 *
 * 粒度は「戦法名として通じる単位」(四間飛車・棒銀・矢倉…)にしている。
 * 以前は「居飛車」を1枚のカードにして中に17本のコースを詰めていたが、
 * 居飛車は戦法ではなく分類なので、カードとしては不適切だった(2026-09に再編)。
 *
 * popularity は将棋ウォーズ約5万局の採用率(scripts/plan.mjs 参照)を 5 点満点に
 * 見立てたもの。「人気」タブの並び順にだけ使う。
 * lineCount と ready はコース一覧(josekiLoader)から算出するので、ここには持たない。
 */
import type { Strategy } from "../domain/types";

export const STRATEGIES: Strategy[] = [
  // ── 振り飛車 ─────────────────────────────────────────────
  {
    id: "shikenbisha", name: "四間飛車", kana: "しけんびしゃ", category: "furibisha",
    popularity: 4.9, level: "入門〜",
    description: "飛車を4筋(後手番なら6筋)に振る振り飛車の代表格。組み方がパターン化されていて覚えやすく、将棋ウォーズで最も多く指されている。",
  },
  {
    id: "sankenbisha", name: "三間飛車", kana: "さんけんびしゃ", category: "furibisha",
    popularity: 4.4, level: "入門〜",
    description: "飛車を3筋(後手番なら7筋)に振る。飛車が角の頭を守るぶん四間飛車より一手得と言われ、石田流への発展や相振り飛車でも主力になる。",
  },
  {
    id: "hayaishida", name: "早石田", kana: "はやいしだ", category: "furibisha",
    popularity: 4.6, level: "初級〜",
    description: "▲7六歩△3四歩▲7五歩から5手で攻めの形を作る三間飛車の速攻。相手が受け方を知らないと一気に優勢になるが、知っていると少し損な奇襲寄りの戦法。",
  },
  {
    id: "mukaibisha", name: "向かい飛車", kana: "むかいびしゃ", category: "furibisha",
    popularity: 3.8, level: "初級〜",
    description: "飛車を相手の飛車と向かい合う筋(先手なら8筋)に振る。相手の飛車先を逆用して攻める。相振り飛車でも多く現れる。",
  },
  // ── 中飛車 ───────────────────────────────────────────────
  {
    id: "gokigen", name: "ゴキゲン中飛車", kana: "ごきげんなかびしゃ", category: "nakabisha",
    popularity: 4.5, level: "入門〜",
    description: "角道を止めずに飛車を5筋へ振る現代の中飛車。中央から攻めを組み立て、相手が2筋を攻めれば角交換から反撃する。",
  },
  // ── 居飛車 ───────────────────────────────────────────────
  {
    id: "bougin", name: "棒銀", kana: "ぼうぎん", category: "ibisha",
    popularity: 4.2, level: "入門〜",
    description: "飛車の前に銀を繰り出して、飛車・銀・歩で一つの筋を突破する最も基本的な攻め方。対振り飛車でも相居飛車でも使える。",
  },
  {
    id: "anaguma", name: "居飛車穴熊", kana: "いびしゃあなぐま", category: "ibisha",
    popularity: 4.0, level: "初級〜",
    description: "玉を盤の隅(9九)に潜らせて香・銀・金で固める最も堅い囲い。組み上がれば多少の駒損を恐れずに攻められる。対振り飛車の持久戦の主役。",
  },
  {
    id: "chousoku", name: "超速▲3七銀", kana: "ちょうそくさんななぎん", category: "ibisha",
    popularity: 3.7, level: "初級〜",
    description: "ゴキゲン中飛車に対して右銀を3七→4六と素早く繰り出す現代の主流対策。2枚銀にして5五の歩を狙う。",
  },
  {
    id: "kakugawari", name: "角換わり", kana: "かくがわり", category: "ibisha",
    popularity: 3.9, level: "初級〜",
    description: "序盤で角を交換し合う相居飛車の戦型。お互いに角を持ち駒にしているので、打ち込みの隙を作らない駒組みが要点。棒銀・早繰り銀などの攻め方がある。",
  },
  {
    id: "yagura", name: "矢倉", kana: "やぐら", category: "ibisha",
    popularity: 3.6, level: "入門〜",
    description: "金2枚と銀1枚で玉を囲う相居飛車の伝統的な戦型。じっくり組み合ってから3筋を攻める。24手組と3六銀3七桂の攻めを収録。",
  },
  {
    id: "aigakari", name: "相掛かり", kana: "あいがかり", category: "ibisha",
    popularity: 3.3, level: "初級〜",
    description: "お互いに角道を開けずに飛車先の歩を交換し合う相居飛車の戦型。開放的な力戦になりやすい。",
  },
  {
    id: "migishiken", name: "右四間飛車", kana: "みぎしけんびしゃ", category: "ibisha",
    popularity: 3.5, level: "初級〜",
    description: "居飛車のまま飛車を4筋に回し、4五歩の仕掛けで一点突破を狙う。振り飛車にも矢倉にも使える破壊力のある戦法。",
  },
  {
    id: "yokofudori", name: "横歩取り", kana: "よこふどり", category: "ibisha",
    popularity: 3.4, level: "中級〜",
    description: "相掛かりから飛車で3四の歩を取る相居飛車の激しい戦型。序盤から駒がぶつかり、知識の差がそのまま出る。",
  },
  // ── 奇襲 ─────────────────────────────────────────────────
  {
    id: "sujichigaikaku", name: "筋違い角", kana: "すじちがいかく", category: "kishu",
    popularity: 2.8, level: "力戦",
    description: "序盤で角を交換し、本来とは違う筋に角を打ち込む奇襲寄りの戦法。1手損する代わりに歩を得て、相手の意表を突く。",
  },
];
