/**
 * DESIGN.md §4.2 練習モードの状態管理。
 *
 * 学習モード(learnStore)と違い、ユーザーは自分の手番で「任意の合法手」を指せる
 * (sandboxStore と同じ選択→着手パターンを使う)。指した手が現局面の分岐
 * (JosekiNode.branches)のどれかと USI 一致すれば正解として前進し、
 * 一致しなければ局面を進めずに正解手を提示する(台本一致判定。これはエンジンの
 * 有無に関わらず常にこの判定だけで行う)。
 *
 * 相手(コースの mySide と逆の手番)は台本のライン(branches[0])を少し間を置いて
 * 自動で指す。
 *
 * Phase 3b: 不正解時にエンジン(src/engine/)で「A/B比較」を追加する。
 * 重要な設計判断(2026-07-31 コーディネーター確認済み):
 * エンジンの役割は「ユーザーの手 vs 定石手」の評価値を並べて見せることに限定し、
 * エンジンの bestmove を「推奨手」として提示しない。理由: 不正解局面を評価した
 * ときの bestmove は「その局面の手番(=相手)の最善応手」であり、ユーザーが
 * 指すべきだった手ではない。推奨手は既に定石データ(正解手)が持っているため、
 * エンジンに尋ねる必要が無い。同じ理由でヒント機能にもエンジンのbestmoveは
 * 使わない(定石手のハイライトのみ)。
 * エンジンが使えない場合(未初期化・COOP/COEP無し・ロード失敗等)は、この
 * A/B比較を静かに省略するだけで、台本ベースの判定・進行には一切影響しない
 * (グレースフルデグレード)。
 *
 * DESIGN.md §3.3 3層目(2026-08 コーディネーター確認済み): 不正解フィードバックに
 * 「このまま指し続ける」を追加し、ユーザーが実際に指した手を盤へ適用して
 * off-script(台本を離れた自由対局)へ入れるようにする。off-script中は相手の手を
 * エンジンの bestMove で指す。
 *
 * 【bestMoveの使い分け(重要・混同注意)】
 * - Phase 3b(A/B比較・上記)で禁じたのは「不正解局面のbestMoveをユーザーへの
 *   推奨手として出す」こと。その局面の手番は相手であり、bestMoveはユーザーが
 *   指すべきだった手ではないため誤った使い方だった。
 * - off-script(このファイル内 stepAfterUserOffScriptMove)で使うbestMoveは
 *   「ユーザーの手の直後の局面」を評価した結果であり、その局面の手番は文字通り
 *   相手なので、bestMoveをそのまま相手の応手として指すのは意味的に正しい。
 *   同じevaluate()のscoreCp/mateは「ユーザーの手の後の評価値」としてフィード
 *   バック表示にも使う(1回のevaluate()呼び出しを両用し、呼び出し回数を増やさない)。
 *   ここでも「あなたはこう指すべきだった」という推奨手の提示は行わない
 *   (見せるのは評価値のみ)。
 */
import { create } from "zustand";
import {
  Color,
  PieceType,
  Position,
  Square,
  applyChosenPromotion,
  applyUsiMove,
  moveFromUSI,
  tryMove,
  tryMoveWithPromotionChoice,
} from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import { listMainLineNodes, loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";
import type { Selection } from "./sandboxStore";
import { getEngine } from "../engine/usiEngine";
import type { EngineStatus } from "../engine/types";
import { toSenteViewScore } from "../engine/scoreView";
import type { SenteViewScore } from "../engine/scoreView";

/** 不正解時のA/B比較1手あたりの思考時間(ms)。2手評価するため合計は約1.5秒。 */
const ENGINE_COMPARE_MOVETIME_MS = 700;

/** 相手の自動着手までの間(ms)。手が急に切り替わらないよう一呼吸置く。 */
const OPPONENT_MOVE_DELAY_MS = 650;

export type PracticeStatus = "userTurn" | "opponentTurn" | "goal";

/** 不正解だった直近の1手についての表示情報。局面は進めていない。 */
export interface WrongAttempt {
  /** ユーザーが実際に指した手の表示テキスト(例: ▲２四歩)。 */
  attemptedText: string;
  /** この局面の正しい定石手の表示テキスト(例: ▲同歩)。 */
  correctText: string;
  /** 正解手の note(あれば)。 */
  correctNote?: string;
  /** 「このまま指し続ける」用: 実際に指した手のUSI。 */
  attemptedUsi: string;
  /** 「このまま指し続ける」用: その手を適用した後のSFEN。 */
  attemptedSfenAfter: string;
}

/** 直近に盤上へ適用された1手(ユーザー/相手いずれか)。"offscript" = 台本に無い自由対局の手。 */
export interface PracticeLastMove {
  usi: string;
  displayText: string;
  kind: JosekiMove["kind"] | "offscript";
  by: "user" | "opponent";
}

/** off-script(台本を離れた自由対局)の手番。 */
export type OffScriptStatus = "userTurn" | "engineThinking" | "ended";

export type OffScriptOutcomeType = "checkmate" | "engineResign" | "engineWin" | "engineError";

/** off-scriptが終局した理由。 */
export interface OffScriptOutcome {
  type: OffScriptOutcomeType;
  /** checkmateのとき、合法手が無くなった(=詰んだ)側。 */
  loser?: Color;
  /** engineErrorのときの補足(UI表示・デバッグ用)。 */
  message?: string;
}

/** off-script中、直近のユーザーの手に対するエンジン評価(先手視点)。 */
export interface OffScriptFeedback extends SenteViewScore {
  /** 評価対象になったユーザーの手の表示テキスト。 */
  displayText: string;
  /** 思考時間(ms)。UI表示用。 */
  thinkMs: number;
}

/** 成/不成の選択待ち(両方合法な手を指したとき)。 */
export interface PendingPromotion {
  from: Square | PieceType;
  to: Square;
}

/**
 * DESIGN.md §3.3 3層目: 定石(台本)を外れても対局を続けられる状態。
 * null = 通常の台本ベース練習(既存のPhase3a/3bの挙動そのまま)。
 */
export interface OffScriptState {
  /** 台本を離れる直前のノード。「定石の局面に戻る」の復帰先。 */
  anchorNode: JosekiNode;
  /** anchorNode時点のmoveIndex(復帰時に戻す)。 */
  anchorMoveIndex: number;
  status: OffScriptStatus;
  outcome: OffScriptOutcome | null;
  lastFeedback: OffScriptFeedback | null;
  pendingPromotion: PendingPromotion | null;
  /** off-script中に指された手数(表示用)。 */
  moveCount: number;
}

/** A/B比較の片側(ユーザーの手 or 定石手)の評価。scoreCp/mateは常に先手視点。 */
export interface EngineMoveEval extends SenteViewScore {
  /** 表示用の手のテキスト(例: ▲２四歩)。 */
  displayText: string;
}

/** 不正解時のエンジンA/B比較結果。 */
export interface EngineComparison {
  yourMove: EngineMoveEval;
  josekiMove: EngineMoveEval;
  /** 片側あたりの思考時間(ms)。UI表示用。 */
  thinkMs: number;
}

export type EngineComparisonStatus = "idle" | "thinking" | "done" | "error";

interface PracticeState {
  course: JosekiCourse;
  currentNode: JosekiNode;
  /** currentNode.sfen から再構成した局面。 */
  position: Position;
  /** userTurn のときのみ非空(自分の手番でだけ合法手を選べる)。 */
  moveDests: MoveDests;
  dropDests: DropDests;
  selected: Selection;
  status: PracticeStatus;
  /** 完了した手数(0始まり)。表示上の「第n手」は min(moveIndex+1, totalMoves)。 */
  moveIndex: number;
  /** コース本線の総手数。 */
  totalMoves: number;
  correctCount: number;
  mistakeCount: number;
  /** 直近の不正解の詳細(なければ null)。次の着手・retry・restart でクリアされる。 */
  wrongAttempt: WrongAttempt | null;
  lastMove: PracticeLastMove | null;
  /** ヒント表示中か(次の定石手の from/to を光らせる)。 */
  hintOn: boolean;

  /** エンジン(src/engine/)の初期化状態。'idle' はまだロード要求していない。 */
  engineStatus: EngineStatus;
  /** 直近の不正解に対するA/B比較の進行状態。 */
  engineComparisonStatus: EngineComparisonStatus;
  /** 直近の不正解に対するA/B比較結果(無ければ null)。 */
  engineComparison: EngineComparison | null;

  /** off-script(台本を離れた自由対局)の状態。null = 通常の台本モード。 */
  offScript: OffScriptState | null;

  /** 盤の升をクリックしたときの処理。userTurn 以外では無視する。 */
  selectSquare: (square: Square) => void;
  /** 持ち駒トレイをクリックしたときの処理。userTurn 以外では無視する。 */
  selectHand: (pieceType: PieceType, color: Color) => void;
  /** ヒント表示の切替。 */
  toggleHint: () => void;
  /** 「もう一度」: ✕フィードバックをクリアして選択解除する(局面・カウントはそのまま)。 */
  retry: () => void;
  /** 「⟲ 最初からやり直す」: コース全体をリセットする(カウントも0に戻す)。 */
  restart: () => void;
  /** 表示するコース自体を差し替える。 */
  loadCourse: (course: JosekiCourse) => void;
  /** 相手番のタイマーから呼ばれる自動着手(内部用。UI からは直接呼ばない)。 */
  playOpponentMove: () => void;
  /**
   * エンジンの遅延ロードを要求する(練習画面マウント時に一度呼ぶ想定)。
   * 既に idle でなければ何もしない(多重ロード防止。失敗後の自動再試行もしない)。
   * 失敗しても reject を投げず、engineStatus を 'unavailable' にするだけ。
   */
  ensureEngineLoaded: () => void;

  /**
   * 不正解フィードバックの「このまま指し続ける」。ユーザーが実際に指した手
   * (wrongAttempt)を盤へ適用し、off-scriptへ入る。エンジンが使えない場合
   * (engineStatus !== 'ready')は何もしない(UI側でボタンを無効化する想定の
   * グレースフルデグレード。相手役が居ないため続行できない)。
   */
  continueOffScript: () => void;
  /** off-script中、成/不成の選択UIでユーザーが選んだ側を適用する。 */
  choosePromotion: (promote: boolean) => void;
  /** 「定石の局面に戻る」。off-scriptを離脱し、台本を離れた地点の局面へ復帰する。 */
  returnToScript: () => void;
}

let opponentTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpponentTimer() {
  if (opponentTimer !== null) {
    clearTimeout(opponentTimer);
    opponentTimer = null;
  }
}

/**
 * 直近に開始したエンジンA/B比較のシーケンス番号。
 * evaluate() は非同期(直列化されているため0.5〜1.5秒程度かかる)なので、
 * その間にユーザーが「もう一度」を押す/正解を指す/別の不正解を指す等で
 * 状況が変わり得る。resolve時にこの値が変わっていたら古い結果として捨てる。
 */
let engineRequestSeq = 0;

/** コースの mySide に対応する tsshogi の Color。 */
function myColorOf(course: JosekiCourse): Color {
  return course.mySide === "sente" ? Color.BLACK : Color.WHITE;
}

function positionFromNode(node: JosekiNode): Position {
  const position = new Position();
  position.resetBySFEN(node.sfen);
  return position;
}

function destsFor(position: Position) {
  const color = position.color;
  return {
    moveDests: computeMoveDests(position, color),
    dropDests: computeDropDests(position, color),
  };
}

const EMPTY_MOVE_DESTS: MoveDests = new Map();
const EMPTY_DROP_DESTS: DropDests = new Map();

/** 指定ノードに立ったときの status/dests をまとめて決める(goal/userTurn/opponentTurn)。 */
function computeTurnState(
  course: JosekiCourse,
  node: JosekiNode,
): { status: PracticeStatus; moveDests: MoveDests; dropDests: DropDests } {
  if (node.branches.length === 0) {
    return { status: "goal", moveDests: EMPTY_MOVE_DESTS, dropDests: EMPTY_DROP_DESTS };
  }
  const position = positionFromNode(node);
  if (position.color === myColorOf(course)) {
    const { moveDests, dropDests } = destsFor(position);
    return { status: "userTurn", moveDests, dropDests };
  }
  return { status: "opponentTurn", moveDests: EMPTY_MOVE_DESTS, dropDests: EMPTY_DROP_DESTS };
}

/**
 * off-script中の手番/終局判定。合法手が両方(移動・打ち)無ければ、将棋のルール上
 * 手番側の負け(詰み。停止形も含め一律「合法手なし」として扱う)。
 */
function computeOffScriptTurnState(
  position: Position,
  myColor: Color,
): { status: OffScriptStatus; moveDests: MoveDests; dropDests: DropDests; outcome: OffScriptOutcome | null } {
  const { moveDests, dropDests } = destsFor(position);
  if (moveDests.size === 0 && dropDests.size === 0) {
    return {
      status: "ended",
      moveDests: EMPTY_MOVE_DESTS,
      dropDests: EMPTY_DROP_DESTS,
      outcome: { type: "checkmate", loser: position.color },
    };
  }
  if (position.color === myColor) {
    return { status: "userTurn", moveDests, dropDests, outcome: null };
  }
  return { status: "engineThinking", moveDests: EMPTY_MOVE_DESTS, dropDests: EMPTY_DROP_DESTS, outcome: null };
}

/** 現ノードの分岐から、実際に指された手(usi)に一致するものを探す(kind問わず一致=正解)。 */
function findMatchingBranch(node: JosekiNode, usi: string): JosekiMove | null {
  return node.branches.find((b) => b.usi === usi) ?? null;
}

/**
 * 不正解のとき「正解手」として提示する分岐(本線優先。無ければ先頭)。
 * ヒント表示(次の定石手の from/to)にも同じ分岐を使う。
 */
export function primaryBranch(node: JosekiNode): JosekiMove | null {
  return node.branches.find((b) => b.kind === "main") ?? node.branches[0] ?? null;
}

export const usePracticeStore = create<PracticeState>((set, get) => {
  /** 次のノードへ前進し、そのノードでの手番/ヒント/選択状態をまとめて反映する。 */
  function goToNode(node: JosekiNode, extra: Partial<PracticeState> = {}) {
    const { course, moveIndex } = get();
    const turn = computeTurnState(course, node);
    set({
      currentNode: node,
      position: positionFromNode(node),
      moveDests: turn.moveDests,
      dropDests: turn.dropDests,
      status: turn.status,
      selected: null,
      moveIndex: moveIndex + 1,
      wrongAttempt: null,
      hintOn: false,
      engineComparison: null,
      engineComparisonStatus: "idle",
      ...extra,
    });
    if (turn.status === "opponentTurn") {
      clearOpponentTimer();
      opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
    }
  }

  function resetTo(course: JosekiCourse) {
    clearOpponentTimer();
    engineRequestSeq++; // 進行中のA/B比較・off-script用エンジン呼び出しを無効化する
    const root = course.root;
    const turn = computeTurnState(course, root);
    set({
      course,
      currentNode: root,
      position: positionFromNode(root),
      moveDests: turn.moveDests,
      dropDests: turn.dropDests,
      selected: null,
      status: turn.status,
      moveIndex: 0,
      totalMoves: listMainLineNodes(course).length - 1,
      correctCount: 0,
      mistakeCount: 0,
      wrongAttempt: null,
      lastMove: null,
      hintOn: false,
      engineComparison: null,
      engineComparisonStatus: "idle",
      offScript: null, // 「⟲最初からやり直す」はoff-script中でも必ず抜けられる安全弁
    });
    if (turn.status === "opponentTurn") {
      opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
    }
  }

  /**
   * off-script中、ユーザーが1手指した直後に呼ぶ。適用後の局面を反映し、相手番なら
   * エンジンへ1回だけ evaluate() を投げて「ユーザーの手への評価値フィードバック」と
   * 「相手(エンジン)の応手」の両方に使う(ファイル冒頭の bestMove 使い分けコメント
   * 参照)。詰み(合法手なし)・resign・win・エンジン異常はすべて 'ended' にし、
   * 例外を投げずアプリを落とさない。
   */
  function stepAfterUserOffScriptMove(userDisplayText: string, sfenAfterUserMove: string, myColor: Color) {
    const afterUserPosition = new Position();
    afterUserPosition.resetBySFEN(sfenAfterUserMove);
    const turn = computeOffScriptTurnState(afterUserPosition, myColor);

    set((s) => ({
      position: afterUserPosition,
      moveDests: turn.moveDests,
      dropDests: turn.dropDests,
      selected: null,
      offScript: s.offScript && {
        ...s.offScript,
        status: turn.status,
        outcome: turn.outcome,
        pendingPromotion: null,
        moveCount: s.offScript.moveCount + 1,
      },
    }));

    if (turn.status !== "engineThinking") return; // 詰み等で既に終局・防御的にoffScript解除後の呼び出しも弾く

    if (get().engineStatus !== "ready") {
      // off-scriptはエンジンready時にしか開始できない設計だが、対局中にエンジンが
      // 使えなくなった場合(Worker異常等)への防御。
      set((s) => ({
        offScript: s.offScript && {
          ...s.offScript,
          status: "ended",
          outcome: { type: "engineError", message: "エンジンが利用できなくなりました" },
        },
      }));
      return;
    }

    const seq = ++engineRequestSeq;
    const opponentColor = afterUserPosition.color;

    getEngine()
      .evaluate(sfenAfterUserMove, ENGINE_COMPARE_MOVETIME_MS)
      .then((result) => {
        if (seq !== engineRequestSeq) return; // 古い結果(戻る/やり直し等で状況が変わった)
        const s = get();
        if (!s.offScript) return; // その間に「定石の局面に戻る」等で抜けていた

        const senteView = toSenteViewScore(result, opponentColor);
        const feedback: OffScriptFeedback = {
          displayText: userDisplayText,
          thinkMs: ENGINE_COMPARE_MOVETIME_MS,
          ...senteView,
        };

        if (result.bestMove === "resign") {
          set({ offScript: { ...s.offScript, status: "ended", outcome: { type: "engineResign" }, lastFeedback: feedback } });
          return;
        }
        if (result.bestMove === "win") {
          set({ offScript: { ...s.offScript, status: "ended", outcome: { type: "engineWin" }, lastFeedback: feedback } });
          return;
        }

        const applied = applyUsiMove(afterUserPosition, result.bestMove);
        if (!applied) {
          set({
            offScript: {
              ...s.offScript,
              status: "ended",
              outcome: { type: "engineError", message: `エンジンの手(${result.bestMove})を適用できませんでした` },
              lastFeedback: feedback,
            },
          });
          return;
        }

        const nextPosition = new Position();
        nextPosition.resetBySFEN(applied.sfenAfter);
        const nextTurn = computeOffScriptTurnState(nextPosition, myColor);

        set((s2) => ({
          position: nextPosition,
          moveDests: nextTurn.moveDests,
          dropDests: nextTurn.dropDests,
          selected: null,
          lastMove: { usi: result.bestMove, displayText: applied.displayText, kind: "offscript", by: "opponent" },
          offScript: s2.offScript && {
            ...s2.offScript,
            status: nextTurn.status,
            outcome: nextTurn.outcome,
            lastFeedback: feedback,
          },
        }));
      })
      .catch((err: unknown) => {
        console.warn("[practice] off-script engine step failed:", err);
        if (seq !== engineRequestSeq) return;
        set((s) => ({
          offScript: s.offScript && {
            ...s.offScript,
            status: "ended",
            outcome: { type: "engineError", message: "エンジンの応答を取得できませんでした" },
          },
        }));
      });
  }

  /**
   * 不正解時、ユーザーの手と定石手のそれぞれを適用した局面をエンジンで評価し、
   * A/B比較として提示する。エンジン未準備なら何もしない(黙って省略)。
   * DESIGN確認済み方針: エンジンのbestmoveは「推奨手」として出さない
   * (ファイル冒頭のコメント参照)。あくまで2つの手の評価値比較のみに使う。
   */
  function triggerEngineComparison(nodeAtAttempt: JosekiNode, userDisplayText: string, sfenAfterUser: string, colorToMove: Color) {
    if (get().engineStatus !== "ready") return;
    const correct = primaryBranch(nodeAtAttempt);
    if (!correct) return;

    const basePosition = new Position();
    basePosition.resetBySFEN(nodeAtAttempt.sfen);
    const joseki = applyUsiMove(basePosition, correct.usi);
    if (!joseki) return;

    const seq = ++engineRequestSeq;
    set({ engineComparisonStatus: "thinking" });

    const engine = getEngine();
    Promise.all([
      engine.evaluate(sfenAfterUser, ENGINE_COMPARE_MOVETIME_MS),
      engine.evaluate(joseki.sfenAfter, ENGINE_COMPARE_MOVETIME_MS),
    ])
      .then(([yourResult, josekiResult]) => {
        // ユーザーが待っている間に状況が変わっていたら(もう一度/新しい不正解/前進
        // 等)、古い結果は捨てる。
        if (seq !== engineRequestSeq || get().wrongAttempt === null) return;
        const yourView = toSenteViewScore(yourResult, colorToMove);
        const josekiView = toSenteViewScore(josekiResult, colorToMove);
        set({
          engineComparisonStatus: "done",
          engineComparison: {
            thinkMs: ENGINE_COMPARE_MOVETIME_MS,
            yourMove: { displayText: userDisplayText, ...yourView },
            josekiMove: { displayText: joseki.displayText, ...josekiView },
          },
        });
      })
      .catch((err: unknown) => {
        console.warn("[practice] engine comparison failed:", err);
        if (seq !== engineRequestSeq) return;
        set({ engineComparisonStatus: "error", engineComparison: null });
      });
  }

  const initialCourse = loadIbishaVsShikenbishaSente();
  const initialRoot = initialCourse.root;
  const initialTurn = computeTurnState(initialCourse, initialRoot);
  // このコースの root は mySide(先手)の手番のため、ここで opponentTurn になることは
  // 実際には無いが、将来 mySide:"gote" のコースにも対応できるよう保険で処理する。
  if (initialTurn.status === "opponentTurn") {
    opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
  }

  return {
    course: initialCourse,
    currentNode: initialRoot,
    position: positionFromNode(initialRoot),
    moveDests: initialTurn.moveDests,
    dropDests: initialTurn.dropDests,
    selected: null,
    status: initialTurn.status,
    moveIndex: 0,
    totalMoves: listMainLineNodes(initialCourse).length - 1,
    correctCount: 0,
    mistakeCount: 0,
    wrongAttempt: null,
    lastMove: null,
    hintOn: false,
    engineStatus: "idle",
    engineComparisonStatus: "idle",
    engineComparison: null,
    offScript: null,

    selectSquare(square) {
      const { offScript, status, position, selected, moveDests, dropDests, currentNode, correctCount, mistakeCount, course } =
        get();

      if (offScript) {
        if (offScript.status !== "userTurn" || offScript.pendingPromotion) return;
        const turn = position.color;
        const pieceAtSquare = position.board.at(square);

        if (selected) {
          const destinations =
            selected.kind === "board"
              ? (moveDests.get(selected.square.usi) ?? [])
              : (dropDests.get(selected.pieceType) ?? []);
          const isLegalDest = destinations.some((s) => s.usi === square.usi);

          if (isLegalDest) {
            const cloned = position.clone();
            const from = selected.kind === "board" ? selected.square : selected.pieceType;
            const result = tryMoveWithPromotionChoice(cloned, from, square);
            if (result.kind === "choice") {
              set({ selected: null, offScript: { ...offScript, pendingPromotion: { from: result.from, to: result.to } } });
              return;
            }
            if (result.kind === "applied") {
              set({ selected: null });
              stepAfterUserOffScriptMove(result.displayText, cloned.sfen, myColorOf(course));
              return;
            }
            // "illegal": 理論上は起きない想定(dests計算と食い違うケースへの防御)。
            // 選び直し判定へフォールスルーする。
          }

          if (pieceAtSquare && pieceAtSquare.color === turn) {
            set({ selected: { kind: "board", square } });
            return;
          }
          set({ selected: null });
          return;
        }

        if (pieceAtSquare && pieceAtSquare.color === turn) {
          set({ selected: { kind: "board", square } });
        }
        return;
      }

      if (status !== "userTurn") return;
      const turn = position.color;
      const pieceAtSquare = position.board.at(square);

      if (selected) {
        const destinations =
          selected.kind === "board"
            ? (moveDests.get(selected.square.usi) ?? [])
            : (dropDests.get(selected.pieceType) ?? []);
        const isLegalDest = destinations.some((s) => s.usi === square.usi);

        if (isLegalDest) {
          const cloned = position.clone();
          const from = selected.kind === "board" ? selected.square : selected.pieceType;
          const result = tryMove(cloned, from, square);
          if (result.ok) {
            const matched = findMatchingBranch(currentNode, result.move.usi);
            if (matched && matched.child) {
              goToNode(matched.child, {
                correctCount: correctCount + 1,
                lastMove: { usi: matched.usi, displayText: result.displayText, kind: matched.kind, by: "user" },
              });
              return;
            }
            // 収録済みの定石手と一致しない(または一致したが台本がここで途切れている):
            // 局面は進めず、正解手を提示する。何度でも再挑戦できる。
            const correct = primaryBranch(currentNode);
            const correctInfo = correct ? moveFromUSI(position, correct.usi) : null;
            set({
              selected: null,
              mistakeCount: mistakeCount + 1,
              wrongAttempt: {
                attemptedText: result.displayText,
                correctText: correctInfo?.displayText ?? correct?.usi ?? "",
                correctNote: correct?.note,
                attemptedUsi: result.move.usi,
                attemptedSfenAfter: cloned.sfen,
              },
              // 直前の不正解のA/B比較結果を持ち越さない(新しい不正解のため)。
              engineComparison: null,
              engineComparisonStatus: "idle",
            });
            // エンジンが使えるときだけ、ユーザーの手 vs 定石手のA/B比較を裏で走らせる
            // (非同期・エンジン未準備なら内部で何もしない)。
            triggerEngineComparison(currentNode, result.displayText, cloned.sfen, cloned.color);
            return;
          }
        }

        // 合法手ではない: 自分の別の駒を選び直したのか、選択解除かを判定する
        if (pieceAtSquare && pieceAtSquare.color === turn) {
          set({ selected: { kind: "board", square } });
          return;
        }
        set({ selected: null });
        return;
      }

      if (pieceAtSquare && pieceAtSquare.color === turn) {
        set({ selected: { kind: "board", square } });
      }
    },

    selectHand(pieceType, color) {
      const { offScript, status, position } = get();
      if (offScript) {
        if (offScript.status !== "userTurn" || offScript.pendingPromotion) return;
        if (position.color !== color) return;
        if (position.hand(color).count(pieceType) <= 0) return;
        set({ selected: { kind: "hand", pieceType } });
        return;
      }
      if (status !== "userTurn") return;
      if (position.color !== color) return;
      if (position.hand(color).count(pieceType) <= 0) return;
      set({ selected: { kind: "hand", pieceType } });
    },

    toggleHint() {
      set((s) => ({ hintOn: !s.hintOn }));
    },

    retry() {
      set({ wrongAttempt: null, selected: null, engineComparison: null, engineComparisonStatus: "idle" });
    },

    restart() {
      const { course } = get();
      resetTo(course);
    },

    loadCourse(course) {
      resetTo(course);
    },

    playOpponentMove() {
      const { currentNode, position } = get();
      const move = currentNode.branches[0];
      if (!move || !move.child) return; // データ上は発生しない想定の防御
      const info = moveFromUSI(position, move.usi);
      goToNode(move.child, {
        lastMove: { usi: move.usi, displayText: info?.displayText ?? move.usi, kind: move.kind, by: "opponent" },
      });
    },

    ensureEngineLoaded() {
      if (get().engineStatus !== "idle") return; // 多重ロード防止・失敗後の自動再試行もしない
      set({ engineStatus: "loading" });
      getEngine()
        .init()
        .then(() => set({ engineStatus: "ready" }))
        .catch((err: unknown) => {
          // グレースフルデグレード: 練習モードは台本判定のまま使えるので、ここでは
          // 警告ログのみ残しアプリは落とさない。
          console.warn("[practice] engine unavailable:", err);
          set({ engineStatus: "unavailable" });
        });
    },

    continueOffScript() {
      const { wrongAttempt, currentNode, moveIndex, engineStatus, course } = get();
      // グレースフルデグレード: エンジンが無ければ相手役が居らず続行できないため
      // 何もしない(UI側は engineStatus !== 'ready' のときボタンを無効化して理由を示す)。
      if (!wrongAttempt || engineStatus !== "ready") return;
      clearOpponentTimer();
      set({
        wrongAttempt: null,
        engineComparison: null,
        engineComparisonStatus: "idle",
        selected: null,
        hintOn: false,
        lastMove: { usi: wrongAttempt.attemptedUsi, displayText: wrongAttempt.attemptedText, kind: "offscript", by: "user" },
        offScript: {
          anchorNode: currentNode,
          anchorMoveIndex: moveIndex,
          status: "userTurn", // 仮値。直後の stepAfterUserOffScriptMove が正しい値に更新する
          outcome: null,
          lastFeedback: null,
          pendingPromotion: null,
          moveCount: 0,
        },
      });
      stepAfterUserOffScriptMove(wrongAttempt.attemptedText, wrongAttempt.attemptedSfenAfter, myColorOf(course));
    },

    choosePromotion(promote) {
      const { offScript, position, course } = get();
      if (!offScript || !offScript.pendingPromotion) return;
      const { from, to } = offScript.pendingPromotion;
      const cloned = position.clone();
      const result = applyChosenPromotion(cloned, from, to, promote);
      if (!result.ok) {
        // 理論上起きない想定の防御: 選択待ちだけ解除し、局面はそのまま。
        set({ offScript: { ...offScript, pendingPromotion: null } });
        return;
      }
      set({ offScript: { ...offScript, pendingPromotion: null } });
      stepAfterUserOffScriptMove(result.displayText, cloned.sfen, myColorOf(course));
    },

    returnToScript() {
      const { offScript, course } = get();
      if (!offScript) return;
      clearOpponentTimer();
      engineRequestSeq++; // 進行中のoff-script用エンジン呼び出しを無効化する
      const anchor = offScript.anchorNode;
      const turn = computeTurnState(course, anchor);
      set({
        currentNode: anchor,
        position: positionFromNode(anchor),
        moveDests: turn.moveDests,
        dropDests: turn.dropDests,
        status: turn.status,
        selected: null,
        moveIndex: offScript.anchorMoveIndex,
        wrongAttempt: null,
        hintOn: false,
        engineComparison: null,
        engineComparisonStatus: "idle",
        lastMove: null,
        offScript: null,
      });
      if (turn.status === "opponentTurn") {
        opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
      }
    },
  };
});
