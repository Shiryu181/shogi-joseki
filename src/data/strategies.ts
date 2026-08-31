/**
 * 戦法マスタ(DESIGN.md §3.4 / §5.1)。
 *
 * ここに載っている情報はホーム画面(カード一覧・検索・カテゴリ絞り込み)の表示用メタ情報。
 * 将棋の定石そのものの正誤には関わらない(手順データは src/data/joseki/ 側)。
 *
 * 【重要】実際に定石データ(src/data/joseki/)が存在し、学習/練習ができるのは
 * 現時点で「居飛車(vs 四間飛車・先手)」の1コースのみ。そのため ready:true は
 * カードは「自分が何を指すか」の単位で置く。角換わり・矢倉・相掛かりは
 * どれも居飛車の一種(相手も居飛車のときの戦型)なので、独立したカードにはせず
 * 居飛車カードの中の作戦として扱う。居飛車カードと並べると包含関係が
 * 分かりにくくなるため。
 * 「選べないものを選べるように見せない」ため、コースの実データが無い戦法は
 * 必ず ready:false にすること。
 */
import type { Strategy } from "../domain/types";

export const STRATEGIES: Strategy[] = [
  {
    id: "ibisha",
    name: "居飛車",
    kana: "いびしゃ",
    category: "ibisha",
    popularity: 4.9,
    level: "入門〜",
    lineCount: 17,
    ready: true,
    description:
      "飛車を初期位置に構えたまま戦う、最も基本的な指し方。相手が振り飛車なら棒銀・穴熊など、相手も居飛車なら角換わり・矢倉・相掛かりへ進む。",
  },
  {
    id: "shikenbisha",
    name: "四間飛車",
    kana: "しけんびしゃ",
    category: "furibisha",
    popularity: 4.8,
    level: "入門〜",
    lineCount: 3,
    ready: true,
    description:
      "飛車を4筋(後手番なら6筋)に振る振り飛車の代表格。組み方がパターン化されていて覚えやすい。基本の組み方(美濃囲い)と対居飛車穴熊を収録。",
  },
  {
    id: "nakabisha",
    name: "中飛車",
    kana: "なかびしゃ",
    category: "nakabisha",
    popularity: 4.6,
    level: "入門〜",
    lineCount: 2,
    ready: true,
    description:
      "飛車を5筋に構える振り飛車の一種。中央から攻めを組み立てる。対居飛車穴熊の指し方を収録。",
  },
  {
    id: "sankenbisha",
    name: "三間飛車",
    kana: "さんけんびしゃ",
    category: "furibisha",
    popularity: 4.3,
    level: "入門〜",
    lineCount: 2,
    ready: true,
    description:
      "飛車を3筋(後手番なら7筋)に振る振り飛車の一種。飛車が角の頭を守るぶん、四間飛車より一手得と言われる。基本の組み方(美濃囲い)を収録。",
  },
  {
    id: "sujichigaikaku",
    name: "筋違い角",
    kana: "すじちがいかく",
    category: "kishu",
    popularity: 3.6,
    level: "力戦",
    lineCount: 1,
    ready: true,
    description:
      "序盤で角を交換し、本来とは違う筋に角を打ち込む奇襲寄りの戦法。1手損する代わりに歩を得て、相手の意表を突く。",
  },
];
