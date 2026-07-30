/**
 * DESIGN.md §4.2 練習モードの状態管理。
 *
 * 学習モード(learnStore)と違い、ユーザーは自分の手番で「任意の合法手」を指せる
 * (sandboxStore と同じ選択→着手パターンを使う)。指した手が現局面の分岐
 * (JosekiNode.branches)のどれかと USI 一致すれば正解として前進し、
 * 一致しなければ局面を進めずに正解手を提示する(エンジンなし・台本一致判定のみ)。
 *
 * 相手(コースの mySide と逆の手番)は台本のライン(branches[0])を少し間を置いて
 * 自動で指す。
 */
import { create } from "zustand";
import { Color, PieceType, Position, Square, moveFromUSI, tryMove } from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import { listMainLineNodes, loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";
import type { Selection } from "./sandboxStore";

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
}

let opponentTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpponentTimer() {
  if (opponentTimer !== null) {
    clearTimeout(opponentTimer);
    opponentTimer = null;
  }
}

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
    });
    if (turn.status === "opponentTurn") {
      opponentTimer = setTimeout(() => get().playOpponentMove(), OPPONENT_MOVE_DELAY_MS);
    }
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
            });
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
      set({ wrongAttempt: null, selected: null });
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
  };
});
