/**
 * DESIGN.md §3.2 / §3.4 のドメイン型。
 * Phase 0 では未使用(参照実装なし)。Phase 1 の定石データモデルで使用開始する。
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
  lineCount: number; // 収録ライン数
  ready: boolean; // 定石データありか
  description: string;
}

// コース = 1 つの対抗形 × 自分の手番
export interface JosekiCourse {
  id: string; // "ibisha-vs-shikenbisha--sente"
  title: string; // "居飛車 vs 四間飛車(先手・急戦)"
  myStrategy: StrategyId;
  opponentStrategy: StrategyId;
  mySide: "sente" | "gote";
  goalFormation: string; // 理想陣形の説明
  goalSfen?: string; // 理想陣形に到達した局面(達成判定用)
  root: JosekiNode;
}

export interface JosekiNode {
  id: string;
  sfen: string; // このノードの局面
  comment?: string; // この局面の教育的解説(自作)
  branches: JosekiMove[]; // ここから指せる手(定石/逸れ)
}

export interface JosekiMove {
  usi: string; // 指し手
  kind: "main" | "alt" | "deviation";
  //  main     = 定石本線
  //  alt      = 定石内の有力な別手順
  //  deviation= 相手のよくある逸れ手(咎め方を持つ)
  note?: string; // この手の意味 / 逸れ手なら「なぜ悪いか」
  punishNote?: string; // deviation のとき「どう咎めるか」の要点
  child: JosekiNode | null; // null = 末端 or エンジンに委譲
}
