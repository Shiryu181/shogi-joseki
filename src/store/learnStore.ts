import { create } from "zustand";
import {
  Color,
  PieceType,
  Position,
  Square,
  moveFromUSI,
  parseUSIMove,
  tryMovePreview,
} from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiMove, JosekiNode } from "../domain/types";
import type { Selection } from "./sandboxStore";
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

/**
 * 「相手が定石を外したので咎めてください」の出題状態。
 *
 * なぜこの形にしたか: 定石から外れたこと自体は咎める理由にならない。実測でも
 * 駒組みの範囲では定石手を逃しても損は±30点程度しかなく、必ず見つけるべき手は
 * ほぼ存在しなかった(scripts/analyze-critical.cjs)。急所ができるのは相手が
 * 明確に損な手を指した直後なので、そこだけを出題する。
 */
export interface QuizState {
  /** 分岐点のノード。咎め終わったらここへ戻り、本線を続ける。 */
  anchorNode: JosekiNode;
  /** 分岐点の手数(戻ったときの表示用)。 */
  anchorMoveNumber: number;
  /** 相手が指した逸れ手。 */
  deviation: JosekiMove;
  /** 逸れ手の表示テキスト(例: ☖６四歩)。 */
  deviationText: string;
  /** 直近の誤答(正解するかクリアするまで表示)。 */
  wrong: { attemptedText: string; correctText: string } | null;
  /** 咎め手を当てたか。当てたあとは咎めの手順を最後まで見せる。 */
  solved: boolean;
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
  /**
   * 出題中の状態。null = 通常の学習(なぞり)。
   * null でない間は盤で任意の合法手を指せる(咎め手を自分で見つけてもらうため)。
   */
  quiz: QuizState | null;
  /**
   * すでに出題した分岐点のノードid。咎めを終えて本線へ戻ったときに
   * 同じ局面でもう一度出題してしまい、先へ進めなくなるのを防ぐ。
   */
  askedQuizIds: string[];
  /**
   * 直前に盤に現れた手(USI)。どの駒が動いたかを盤上で示すために使う。
   * 相手の手は自動で進むので、これが無いと見落としやすい。
   */
  lastMoveUsi: string | null;
  /** 出題中に自分の手番で選べる合法手。通常時は空。 */
  moveDests: MoveDests;
  dropDests: DropDests;
  selected: Selection;
  /** 出題中に盤の升をクリックしたときの処理(選択→着手)。 */
  quizSelectSquare: (square: Square) => void;
  /** 出題中に持ち駒をクリックしたときの処理。 */
  quizSelectHand: (pieceType: PieceType, color: Color) => void;
  /** 誤答の表示を消してやり直す。 */
  quizRetry: () => void;
  /** 咎め方を見せてもらう(答えを見る)。 */
  quizReveal: () => void;
  /** 咎めが終わったら分岐点へ戻り、本線を続ける。 */
  quizReturnToMainLine: () => void;
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
    quiz: null as QuizState | null,
    askedQuizIds: [] as string[],
    lastMoveUsi: null as string | null,
    moveDests: new Map() as MoveDests,
    dropDests: new Map() as DropDests,
    selected: null as Selection,
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
    // 相手番で逸れ手が用意されている局面は、本線ではなく逸れ手を指させて出題する。
    const asked = get().askedQuizIds.includes(currentNode.id);
    const deviation = asked
      ? undefined
      : currentNode.branches.find((b) => b.kind === "deviation" && b.child);
    if (deviation) {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        startQuiz(currentNode, deviation);
      }, OPPONENT_MOVE_DELAY_MS);
      return;
    }

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

  /** 出題中に自分が指せる合法手を計算する。 */
  function questDests(position: Position) {
    return {
      moveDests: computeMoveDests(position, position.color),
      dropDests: computeDropDests(position, position.color),
    };
  }

  /**
   * 相手の逸れ手を実際に指させて、出題状態に入る。
   * 本線は指さない(咎め終わったあとに分岐点へ戻って指す)。
   */
  function startQuiz(anchor: JosekiNode, dev: JosekiMove) {
    const { nodeHistory, askedQuizIds } = get();
    const before = positionFromNode(anchor);
    const devText = moveFromUSI(before, dev.usi)?.displayText ?? "";
    const child = dev.child;
    if (!child) return;
    const position = positionFromNode(child);
    set({
      currentNode: child,
      position,
      pendingAck: null,
      selectedBranchIndex: 0,
      lastMoveUsi: dev.usi,
      askedQuizIds: [...askedQuizIds, anchor.id],
      ...questDests(position),
      selected: null,
      quiz: {
        anchorNode: anchor,
        anchorMoveNumber: nodeHistory.length + 1,
        deviation: dev,
        deviationText: devText,
        wrong: null,
        solved: false,
      },
    });
  }

  /** 出題中に1手進める(正解した咎め手・相手の応手の両方で使う)。 */
  function advanceQuizLine(move: JosekiMove) {
    if (!move.child) return;
    const position = positionFromNode(move.child);
    const { quiz, course } = get();
    set({
      currentNode: move.child,
      position,
      ...questDests(position),
      selected: null,
      lastMoveUsi: move.usi,
      quiz: quiz ? { ...quiz, wrong: null, solved: true } : null,
    });
    // 咎めの手順の途中で相手番になったら、その応手も自動で指して最後まで見せる。
    clearAutoAdvanceTimer();
    if (position.color !== myColorOf(course)) {
      const next = mainBranchOf(move.child);
      if (next && next.child) {
        autoAdvanceTimer = setTimeout(() => {
          autoAdvanceTimer = null;
          advanceQuizLine(next);
        }, OPPONENT_MOVE_DELAY_MS);
      }
    }
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
      lastMoveUsi: move.usi,
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

    quizSelectSquare(square) {
      const { quiz, position, selected, currentNode, moveDests } = get();
      if (!quiz || quiz.solved) return;
      // 咎め手を当てるのは自分の手番のときだけ。
      if (position.color !== myColorOf(get().course)) return;

      // 1回目のクリックで駒を選び、2回目で着手する(sandbox/practice と同じ操作)。
      if (!selected || selected.kind === "hand") {
        if (position.board.at(square)?.color === position.color) set({ selected: { kind: "board", square } });
        else set({ selected: null });
        return;
      }
      const from = selected.square;
      if (from.usi === square.usi) { set({ selected: null }); return; }
      if (!moveDests.get(from.usi)?.some((d) => d.usi === square.usi)) {
        if (position.board.at(square)?.color === position.color) set({ selected: { kind: "board", square } });
        else set({ selected: null });
        return;
      }

      // 判定は局面を進めずに行う(不正解のときは盤をそのまま残す)。
      const answer = mainBranchOf(currentNode);
      const applied = tryMovePreview(position, from, square, answer?.usi);
      if (!applied.ok) { set({ selected: null }); return; }
      const correctText = answer ? (moveFromUSI(position, answer.usi)?.displayText ?? "") : "";
      if (answer && applied.move.usi === answer.usi) {
        advanceQuizLine(answer);
        return;
      }
      // 不正解: 局面は進めず、何が正解かを示してやり直してもらう。
      set({
        selected: null,
        quiz: { ...quiz, wrong: { attemptedText: applied.displayText, correctText } },
      });
    },

    quizSelectHand(pieceType, color) {
      const { quiz, position } = get();
      if (!quiz || quiz.solved) return;
      if (color !== position.color) return;
      set({ selected: { kind: "hand", pieceType } });
    },

    quizRetry() {
      const { quiz } = get();
      if (!quiz) return;
      set({ quiz: { ...quiz, wrong: null }, selected: null });
    },

    quizReveal() {
      const { quiz, currentNode } = get();
      if (!quiz || quiz.solved) return;
      const answer = mainBranchOf(currentNode);
      if (answer) advanceQuizLine(answer);
    },

    quizReturnToMainLine() {
      clearAutoAdvanceTimer();
      const { quiz } = get();
      if (!quiz) return;
      const anchor = quiz.anchorNode;
      set({
        currentNode: anchor,
        position: positionFromNode(anchor),
        quiz: null,
        lastMoveUsi: null,
        moveDests: new Map(),
        dropDests: new Map(),
        selected: null,
        selectedBranchIndex: 0,
        pendingAck: null,
      });
      // 分岐点に戻ったので、今度は本線を指させる(相手の正しい手を見せる)。
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
        lastMoveUsi: null,
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
        lastMoveUsi: null,
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
        lastMoveUsi: null,
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
