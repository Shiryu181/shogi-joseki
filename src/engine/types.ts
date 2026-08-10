/**
 * DESIGN.md §6 エンジン統合。YaneuraOu WASM(@mizarjp/yaneuraou.k-p, GPL-3.0)を
 * USI プロトコル経由で扱うための型。
 */

/** エンジン初期化の状態。UI(練習モード)のローディング/デグレード表示に使う。 */
export type EngineStatus =
  | "idle" // まだ init() されていない(アプリ起動直後・学習/Sandboxではこのまま)
  | "loading" // init() 実行中(Worker起動・WASMロード・usi/isready ハンドシェイク中)
  | "ready" // 使用可能
  | "unavailable"; // 初期化に失敗した、またはこの環境では使えない(非対応ブラウザ等)

/**
 * 1局面の思考結果。
 *
 * scoreCp / mate は **エンジンに渡した sfen の手番から見た値**(USIの標準的な
 * 意味論)。呼び出し側(practiceStore)で「常に先手視点」に正規化して表示する。
 *
 * mate は DESIGN.md §6 に書かれた元のインターフェース
 * `{ bestMove; scoreCp; pv }` への純増拡張(オプショナル追加のみ)。
 * `score mate N` が返ったときに scoreCp を欠番のままにせず、詰み手数として
 * 保持するために追加した。cp と mate は排他(どちらか一方が入る)。
 */
export interface EngineEvaluateResult {
  bestMove: string;
  /** センチポーン評価値。mate が入っている場合は cp 値の意味を持たない(0扱い)。 */
  scoreCp: number;
  /** 詰み手数(手番側が詰ます/詰まされるまでの手数)。cp 評価のときは undefined。 */
  mate?: number;
  pv: string[];
}

export interface Engine {
  /**
   * エンジンを起動しUSIハンドシェイク(usi→usiok→isready→readyok)まで終える。
   * 多重呼び出しは安全(2回目以降は同じ Promise を返す/即解決する)。
   * 失敗時は reject する(呼び出し側で catch し、練習モードは台本判定のまま継続する)。
   */
  init(): Promise<void>;
  /**
   * 指定局面(SFEN)を ms ミリ秒思考させ、最善手・評価値・読み筋を返す。
   * 内部で直列化される(前の evaluate が終わるまで次は待たされる)。
   * init 未完了/失敗時は reject する。
   */
  evaluate(sfen: string, ms: number): Promise<EngineEvaluateResult>;
  /** Worker を終了し破棄する。以後この Engine インスタンスは使えない。 */
  dispose(): void;
}
