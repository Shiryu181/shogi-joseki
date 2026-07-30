import { create } from "zustand";
import { Position, Square, parseUSIMove } from "../domain/shogi";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import { loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";

function positionFromNode(node: JosekiNode): Position {
  const position = new Position();
  position.resetBySFEN(node.sfen);
  return position;
}

/** 指定した分岐インデックスの手(無ければ null = 末端/理想陣形)。 */
export function branchMove(node: JosekiNode, index: number): JosekiMove | null {
  return node.branches[index] ?? null;
}

interface LearnState {
  course: JosekiCourse;
  currentNode: JosekiNode;
  /** 「1手戻る」「最初へ」用の訪問履歴(現在ノードは含まない) */
  nodeHistory: JosekiNode[];
  /** 現局面でどの分岐(currentNode.branches の何番目)をたどっているか。0 = 本線がデフォルト。 */
  selectedBranchIndex: number;
  /** currentNode.sfen から再構成した局面(選択中の手はまだ適用されていない状態) */
  position: Position;
  /** 光っている升(ガイドの移動先)をクリックしたときだけ進む。それ以外は無視する。 */
  attemptSquare: (square: Square) => void;
  /** 「なぞって次へ」ボタン。選択中の分岐の手をそのまま適用する。 */
  advance: () => void;
  /** 現局面の分岐(本線/変化/逸れ手)を選び直す。ノードは移動しない(プレビューのみ)。 */
  chooseBranch: (index: number) => void;
  goBack: () => void;
  goToStart: () => void;
  /** 表示するコース自体を差し替える(本物のコース ⇔ 分岐ナビ動作確認用デモの切替に使う)。 */
  loadCourse: (course: JosekiCourse) => void;
}

function initial() {
  const course = loadIbishaVsShikenbishaSente();
  return {
    course,
    currentNode: course.root,
    nodeHistory: [] as JosekiNode[],
    selectedBranchIndex: 0,
    position: positionFromNode(course.root),
  };
}

export const useLearnStore = create<LearnState>((set, get) => ({
  ...initial(),

  advance() {
    const { currentNode, nodeHistory, selectedBranchIndex } = get();
    const move = branchMove(currentNode, selectedBranchIndex);
    if (!move || !move.child) return; // 末端(理想陣形、またはダミー分岐の行き止まり)に到達済み
    set({
      currentNode: move.child,
      nodeHistory: [...nodeHistory, currentNode],
      position: positionFromNode(move.child),
      selectedBranchIndex: 0, // 新しいノードでは本線から見せる
    });
  },

  attemptSquare(square) {
    const { currentNode, selectedBranchIndex } = get();
    const move = branchMove(currentNode, selectedBranchIndex);
    if (!move) return;
    const parsed = parseUSIMove(move.usi);
    if (!parsed) return;
    if (parsed.to.usi === square.usi) {
      get().advance();
    }
    // ガイドの移動先以外へのクリックは無視する(仕様どおり)
  },

  chooseBranch(index) {
    const { currentNode } = get();
    if (index < 0 || index >= currentNode.branches.length) return;
    set({ selectedBranchIndex: index });
  },

  goBack() {
    const { nodeHistory } = get();
    if (nodeHistory.length === 0) return;
    const prev = nodeHistory[nodeHistory.length - 1];
    set({
      currentNode: prev,
      nodeHistory: nodeHistory.slice(0, -1),
      position: positionFromNode(prev),
      selectedBranchIndex: 0,
    });
  },

  goToStart() {
    const { course } = get();
    set({
      currentNode: course.root,
      nodeHistory: [],
      position: positionFromNode(course.root),
      selectedBranchIndex: 0,
    });
  },

  loadCourse(course) {
    set({
      course,
      currentNode: course.root,
      nodeHistory: [],
      selectedBranchIndex: 0,
      position: positionFromNode(course.root),
    });
  },
}));
