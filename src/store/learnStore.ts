import { create } from "zustand";
import { Position, Square, parseUSIMove } from "../domain/shogi";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import { loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";

function positionFromNode(node: JosekiNode): Position {
  const position = new Position();
  position.resetBySFEN(node.sfen);
  return position;
}

/** 現局面から辿るべき本線の手(Phase1は branches[0] = main のみ収録)。無ければ末端(理想陣形)。 */
export function guideMove(node: JosekiNode): JosekiMove | null {
  return node.branches.length > 0 ? node.branches[0] : null;
}

interface LearnState {
  course: JosekiCourse;
  currentNode: JosekiNode;
  /** 「1手戻る」「最初へ」用の訪問履歴(現在ノードは含まない) */
  nodeHistory: JosekiNode[];
  /** currentNode.sfen から再構成した局面(次の一手はまだ適用されていない状態) */
  position: Position;
  /** 光っている升(ガイドの移動先)をクリックしたときだけ進む。それ以外は無視する。 */
  attemptSquare: (square: Square) => void;
  /** 「なぞって次へ」ボタン。ガイド手をそのまま適用する。 */
  advance: () => void;
  goBack: () => void;
  goToStart: () => void;
}

function initial() {
  const course = loadIbishaVsShikenbishaSente();
  return {
    course,
    currentNode: course.root,
    nodeHistory: [] as JosekiNode[],
    position: positionFromNode(course.root),
  };
}

export const useLearnStore = create<LearnState>((set, get) => ({
  ...initial(),

  advance() {
    const { currentNode, nodeHistory } = get();
    const move = guideMove(currentNode);
    if (!move || !move.child) return; // 理想陣形(末端)に到達済み
    set({
      currentNode: move.child,
      nodeHistory: [...nodeHistory, currentNode],
      position: positionFromNode(move.child),
    });
  },

  attemptSquare(square) {
    const { currentNode } = get();
    const move = guideMove(currentNode);
    if (!move) return;
    const parsed = parseUSIMove(move.usi);
    if (!parsed) return;
    if (parsed.to.usi === square.usi) {
      get().advance();
    }
    // ガイドの移動先以外へのクリックは無視する(仕様どおり)
  },

  goBack() {
    const { nodeHistory } = get();
    if (nodeHistory.length === 0) return;
    const prev = nodeHistory[nodeHistory.length - 1];
    set({
      currentNode: prev,
      nodeHistory: nodeHistory.slice(0, -1),
      position: positionFromNode(prev),
    });
  },

  goToStart() {
    const { course } = get();
    set({ currentNode: course.root, nodeHistory: [], position: positionFromNode(course.root) });
  },
}));
