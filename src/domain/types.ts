/**
 * DESIGN.md §3.2 / §3.4 のドメイン型。
 * Phase 0 では未使用(参照実装なし)。Phase 1 の定跡データモデルで使用開始する。
 */

export type StrategyId = "ibisha" | "shikenbisha" | string; // v2+ で拡張

// ブラウズ用カテゴリ(§5.1 のフィルタと一致)
export type Category = "ibisha" | "furibisha" | "nakabisha" | "kishu";

export interface Strategy {
  id: StrategyId;
  name: string; // "居飛車"
  kana: string; // "いびしゃ"
  category: Category;
  popularity: number; // 人気順ソート・★表示用
  level: string; // "入門〜" 等
  description: string;
}

// コース = 1 つの対抗形 × 自分の手番
export interface JosekiCourse {
  id: string; // "ibisha-vs-shikenbisha--sente"
  title: string; // "居飛車 vs 四間飛車(先手・急戦)"
  myStrategy: StrategyId;
  opponentStrategy: StrategyId;
  mySide: "sente" | "gote";
  source?: string; // 手順の出所(定跡書・サイト等の裏取り情報。表記のみ、DB自体は同梱しない)
  goalFormation: string;
  /**
   * 到達時の見出し。既定は「理想陣形に到達しました」。
   * 仕掛けまで収録したコースは到達点が陣形ではないので、
   * 「仕掛けが決まりました」等に差し替えるために使う。
   */
  goalLabel?: string; // 理想陣形の説明
  goalSfen?: string; // 理想陣形に到達した局面(達成判定用)
  root: JosekiNode;
}

export interface JosekiNode {
  id: string;
  sfen: string; // このノードの局面
  comment?: string; // この局面の教育的解説(自作)
  branches: JosekiMove[]; // ここから指せる手(定跡/逸れ)
}

export interface JosekiMove {
  usi: string; // 指し手
  kind: "main" | "alt" | "deviation";
  //  main     = 定跡本線
  //  alt      = 定跡内の有力な別手順
  //  deviation= 相手のよくある逸れ手(咎め方を持つ)
  note?: string; // この手の意味 / 逸れ手なら「なぜ悪いか」
  /**
   * 出題時に先に見せる「ねらい」。省略時は note から升を伏せて自動生成する
   * (src/domain/hint.ts)。自動生成では答えが分かってしまう場合や、
   * もっと良い言い方がある場合にコース側で明示する。
   */
  aim?: string;
  /**
   * 「別の手も同じくらい良い」手(エンジンで測った次善手との差が小さい手)。
   * 出題はするが、違う手を指されたときに「不正解」ではなく
   * 「その手も悪くないが、この講座ではこう進める」と穏やかに返す。
   * 以前はこの手を出題から外していたが、連続すると「途中からなぞりになった」ように
   * 見えてしまったため、出題を続けて返し方だけ変える形にした。
   */
  openEnded?: boolean;
  punishNote?: string; // deviation のとき「どう咎めるか」の要点
  child: JosekiNode | null; // null = 末端 or エンジンに委譲
}
