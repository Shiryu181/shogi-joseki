/**
 * 戦法マスタ(DESIGN.md §3.4 / §5.1)。
 *
 * ここに載っている情報はホーム画面(カード一覧・検索・カテゴリ絞り込み)の表示用メタ情報。
 * 将棋の定石そのものの正誤には関わらない(手順データは src/data/joseki/ 側)。
 *
 * 【重要】実際に定石データ(src/data/joseki/)が存在し、学習/練習ができるのは
 * 現時点で「居飛車(vs 四間飛車・先手)」の1コースのみ。そのため ready:true は
 * "ibisha" だけとし、他はすべて ready:false(準備中)にしてある。
 * mockup.html のサンプルデータでは「四間飛車」も ready:true だったが、四間飛車側の
 * 手順データはまだ無いため、ここでは意図的に ready:false にしている
 * (選べないものを選べるように見せないため。詳細は完了報告を参照)。
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
    lineCount: 1,
    ready: true,
    description:
      "飛車を初期位置(２筋・８筋)に構えたまま戦う、最も基本的な戦法群。ここでは対四間飛車の急戦(4六銀左/斜め棒銀)を1ライン収録。",
  },
  {
    id: "shikenbisha",
    name: "四間飛車",
    kana: "しけんびしゃ",
    category: "furibisha",
    popularity: 4.8,
    level: "入門〜",
    lineCount: 0,
    ready: false,
    description: "飛車を4筋(後手番なら6筋)に振る振り飛車の代表格。四間飛車側の手順データは準備中です。",
  },
  {
    id: "kakugawari",
    name: "角換わり",
    kana: "かくがわり",
    category: "ibisha",
    popularity: 4.7,
    level: "中級〜",
    lineCount: 0,
    ready: false,
    description: "序盤で角を交換し合ってから駒組みを進める、相居飛車の代表的な戦型。データは準備中です。",
  },
  {
    id: "nakabisha",
    name: "中飛車",
    kana: "なかびしゃ",
    category: "nakabisha",
    popularity: 4.6,
    level: "入門〜",
    lineCount: 0,
    ready: false,
    description: "飛車を5筋に構える振り飛車の一種。中央から攻めを組み立てます。データは準備中です。",
  },
  {
    id: "aigakari",
    name: "相掛かり",
    kana: "あいがかり",
    category: "ibisha",
    popularity: 4.5,
    level: "中級〜",
    lineCount: 0,
    ready: false,
    description: "互いに飛車先の歩を交換してから戦う、相居飛車の古典的な戦型。データは準備中です。",
  },
  {
    id: "yagura",
    name: "矢倉",
    kana: "やぐら",
    category: "ibisha",
    popularity: 4.4,
    level: "中級〜",
    lineCount: 0,
    ready: false,
    description: "金銀を堅く組み合わせた矢倉囲いを作ってから戦う、相居飛車の伝統的な戦型。データは準備中です。",
  },
  {
    id: "sankenbisha",
    name: "三間飛車",
    kana: "さんけんびしゃ",
    category: "furibisha",
    popularity: 4.3,
    level: "入門〜",
    lineCount: 0,
    ready: false,
    description: "飛車を3筋(後手番なら7筋)に振る振り飛車の一種。データは準備中です。",
  },
  {
    id: "sujichigaikaku",
    name: "筋違い角",
    kana: "すじちがいかく",
    category: "kishu",
    popularity: 3.6,
    level: "力戦",
    lineCount: 0,
    ready: false,
    description: "序盤早々に角を敵陣寄りへ打ち直す奇襲戦法の一つ。データは準備中です。",
  },
];
