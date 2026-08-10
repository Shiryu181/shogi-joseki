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
 */
import { create } from "zustand";
import { Color, PieceType, Position, Square, applyUsiMove, moveFromUSI, tryMove } from "../domain/shogi";
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
}

/** 直近に盤上へ適用された1手(ユーザー/相手いずれか)。 */
export interface PracticeLastMove {
  usi: string;
  displayText: string;
  kind: JosekiMove["kind"];
  by: "user" | "opponent";
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
    });
    if (turn.status === "opponentTurn") {
      opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
    }
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

    selectSquare(square) {
      const { status, position, selected, moveDests, dropDests, currentNode, correctCount, mistakeCount } = get();
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
      const { status, position } = get();
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
  };
});
