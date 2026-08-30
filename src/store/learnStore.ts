import { create } from "zustand";
import { Color, Position, Square, moveFromUSI, parseUSIMove } from "../domain/shogi";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import { loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";

/**
 * 相手(course.mySide の逆の手番)の手を自動で進めるまでの間(ms)。
 * practiceStore の OPPONENT_MOVE_DELAY_MS と同じ値(手が急に切り替わらないよう一呼吸置く)。
 */
const OPPONENT_MOVE_DELAY_MS = 650;

function positionFromNode(node: JosekiNode): Position {
  const position = new Position();
  position.resetBySFEN(node.sfen);
  return position;
}

/** コースの mySide に対応する tsshogi の Color。practiceStore の myColorOf と同じ定義。 */
function myColorOf(course: JosekiCourse): Color {
  return course.mySide === "sente" ? Color.BLACK : Color.WHITE;
}

/**
 * 相手の手を自動で指した直後に「解説を読む時間」を作るための一時停止状態。
 * 盤には既に手が適用されている(= ユーザーは盤を操作しなくてよい)が、
 * その手の解説を表示したまま止まり、「次へ」を押すまで先に進まない。
 * これが null でない間は自動進行もガイド表示も行わない。
 */
export interface AckMove {
  /** 指された手の番号(第n手)。 */
  moveNumber: number;
  /** ▲２六歩 のような表示テキスト。 */
  moveText: string;
  note?: string;
  kind: JosekiMove["kind"];
  punishNote?: string;
  /** その手を指す前の局面(JosekiNode)の解説。 */
  comment?: string;
}

/** 指定した分岐インデックスの手(無ければ null = 末端/理想陣形)。 */
export function branchMove(node: JosekiNode, index: number): JosekiMove | null {
  return node.branches[index] ?? null;
}

/**
 * 自動進行(相手の手)で採用する本線の手。ユーザーが BranchNav で別の分岐(変化/逸れ手)を
 * プレビュー中でも、自動進行は必ず本線を指す(プレビューは selectedBranchIndex の見せ方
 * だけを変えるものであり、実際にノードを進める手ではないため)。
 */
function mainBranchOf(node: JosekiNode): JosekiMove | null {
  return node.branches.find((b) => b.kind === "main") ?? node.branches[0] ?? null;
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
  /**
   * 相手(mySide の逆)の手を一呼吸置いて自動で進めるか。既定 true。
   * トグル「相手の手も自分でなぞる」で false にすると、従来どおり全手を手動でなぞる挙動に戻る。
   */
  autoAdvanceOpponent: boolean;
  /**
   * 相手の手を自動で指した直後の「解説の確認待ち」。null でない間は
   * 盤のガイドを出さず、自動進行も止めて、ユーザーが読み終えるのを待つ。
   */
  pendingAck: AckMove | null;
  /** 「次へ」で確認待ちを解除する。解除後にまた自動進行の判定を行う。 */
  acknowledgeMove: () => void;
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
  /** トグルUIから呼ぶ。切替時に保留中の自動進行タイマーを必ず破棄してから組み直す。 */
  setAutoAdvanceOpponent: (value: boolean) => void;
  /**
   * Learn画面がアンマウントされた(他画面へ移動した)ときに呼ぶ。保留中の自動進行タイマーを
   * 破棄し、画面を見ていない間に裏で手が進み続けるのを防ぐ。
   */
  pauseAutoAdvance: () => void;
  /** Learn画面がマウントされた(戻ってきた)ときに呼ぶ。現在の状態に応じて必要ならタイマーを再設定する。 */
  resumeAutoAdvance: () => void;
}

/**
 * 自動進行タイマー(モジュール単位で1つだけ)。practiceStore の opponentTimer と同じ設計。
 * スケジュールし直す関数(scheduleAutoAdvance)は必ず最初にこれを破棄してから判定するため、
 * 「古い局面に対して発火する」「重複して2つ走る」は起きない。
 */
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer !== null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function initial() {
  const course = loadIbishaVsShikenbishaSente();
  return {
    course,
    currentNode: course.root,
    nodeHistory: [] as JosekiNode[],
    selectedBranchIndex: 0,
    position: positionFromNode(course.root),
    autoAdvanceOpponent: true,
    pendingAck: null as AckMove | null,
  };
}

export const useLearnStore = create<LearnState>((set, get) => {
  /**
   * 現在ノードが相手番(position.color !== myColor)かつ自動進行ONなら、一呼吸置いて
   * 本線の手を適用するタイマーを(再)設定する。呼び出しの最初に必ず既存のタイマーを
   * 破棄するため、goBack/goToStart/loadCourse/setAutoAdvanceOpponent/画面遷移のどこから
   * 呼んでも「古い状態に対して発火する」ことはない。
   */
  function scheduleAutoAdvance() {
    clearAutoAdvanceTimer();
    const { autoAdvanceOpponent, course, currentNode, position, pendingAck } = get();
    if (pendingAck) return; // 解説の確認待ち中は進めない(「次へ」を押すまで止まる)
    if (!autoAdvanceOpponent) return;
    if (position.color === myColorOf(course)) return; // 自分の手番: 自動では進めない
    const move = mainBranchOf(currentNode);
    if (!move || !move.child) return; // 理想陣形、またはこの先の本線データが無い
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      // 盤には手を適用するが、その手の解説を表示したまま止まる(pendingAck)。
      // 表示情報は「手を指す前」の局面から作る必要があるので、goToChild より先に組み立てる。
      const before = get();
      const ack: AckMove = {
        moveNumber: before.nodeHistory.length + 1,
        moveText: moveFromUSI(before.position, move.usi)?.displayText ?? "",
        note: move.note,
        kind: move.kind,
        punishNote: move.punishNote,
        comment: before.currentNode.comment,
      };
      // 先に立てておくことで、goToChild 内の scheduleAutoAdvance が
      // (相手の手が連続する局面でも)そのまま先へ進んでしまうのを防ぐ。
      set({ pendingAck: ack });
      goToChild(move);
    }, OPPONENT_MOVE_DELAY_MS);
  }

  /** ノード遷移の共通処理。手動(advance)・自動(scheduleAutoAdvance)の両方から使う。 */
  function goToChild(move: JosekiMove) {
    if (!move.child) return;
    const { currentNode, nodeHistory } = get();
    set({
      currentNode: move.child,
      nodeHistory: [...nodeHistory, currentNode],
      position: positionFromNode(move.child),
      selectedBranchIndex: 0, // 新しいノードでは本線から見せる
    });
    scheduleAutoAdvance();
  }

  return {
    ...initial(),

    advance() {
      // 確認待ち中の「次へ」は、手を進めるのではなく解説の確認解除として扱う。
      if (get().pendingAck) {
        get().acknowledgeMove();
        return;
      }
      const { currentNode, selectedBranchIndex } = get();
      const move = branchMove(currentNode, selectedBranchIndex);
      if (!move || !move.child) return; // 末端(理想陣形、またはダミー分岐の行き止まり)に到達済み
      goToChild(move);
    },

    acknowledgeMove() {
      if (!get().pendingAck) return;
      set({ pendingAck: null });
      scheduleAutoAdvance();
    },

    attemptSquare(square) {
      if (get().pendingAck) return; // 確認待ち中はガイドを出していないので盤クリックは無視
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
      clearAutoAdvanceTimer();
      const { nodeHistory, course } = get();
      if (nodeHistory.length === 0) return;
      const history = [...nodeHistory];
      let prev = history.pop()!;
      // 相手の自動手ノードは「戻る」の停止点にしない: そこへ戻すとタイマーがすぐ再発火して
      // また先へ進んでしまい、「1手戻る」が実質効かなくなるため。自分の直前の手番ノードまで
      // 遡ることで、体感を「自分の1手を取り消す」に揃える。
      while (history.length > 0 && positionFromNode(prev).color !== myColorOf(course)) {
        prev = history.pop()!;
      }
      set({
        currentNode: prev,
        nodeHistory: history,
        position: positionFromNode(prev),
        selectedBranchIndex: 0,
        pendingAck: null,
      });
      scheduleAutoAdvance();
    },

    goToStart() {
      clearAutoAdvanceTimer();
      const { course } = get();
      set({
        currentNode: course.root,
        nodeHistory: [],
        position: positionFromNode(course.root),
        selectedBranchIndex: 0,
        pendingAck: null,
      });
      scheduleAutoAdvance();
    },

    loadCourse(course) {
      clearAutoAdvanceTimer();
      set({
        course,
        currentNode: course.root,
        nodeHistory: [],
        selectedBranchIndex: 0,
        position: positionFromNode(course.root),
        pendingAck: null,
      });
      scheduleAutoAdvance();
    },

    setAutoAdvanceOpponent(value) {
      clearAutoAdvanceTimer();
      set({ autoAdvanceOpponent: value, pendingAck: null });
      scheduleAutoAdvance();
    },

    pauseAutoAdvance() {
      clearAutoAdvanceTimer();
    },

    resumeAutoAdvance() {
      scheduleAutoAdvance();
    },
  };
});
