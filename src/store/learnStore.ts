import { create } from "zustand";
import { useProgressStore, itemKey } from "./progressStore";
import {
  Color,
  PieceType,
  Position,
  Square,
  moveFromUSI,
  tryMovePreview,
} from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiMove, JosekiNode, MoveDemo } from "../domain/types";
import type { Selection } from "./sandboxStore";
import { loadIbishaVsShikenbishaSente } from "../domain/josekiLoader";
import { plainMove, splitExplanation, cleanNote } from "../domain/moveText";

/** 相手の手が自動で指されるまでの間(ms)。手が急に切り替わらないよう一呼吸置く。 */
const OPPONENT_MOVE_DELAY_MS = 500;
/** 相手の手を指したあと、その意図を読ませてから自分の番にするまでの間(ms)。 */
const OPPONENT_SHOWN_MS = 700;

export function positionFromNode(node: JosekiNode): Position {
  const position = new Position();
  position.resetBySFEN(node.sfen);
  return position;
}

/** コースの mySide に対応する tsshogi の Color。 */
function myColorOf(course: JosekiCourse): Color {
  return course.mySide === "sente" ? Color.BLACK : Color.WHITE;
}

/** 自動進行・出題で使う本線の手。 */
export function mainBranchOf(node: JosekiNode): JosekiMove | null {
  return node.branches.find((b) => b.kind === "main") ?? node.branches[0] ?? null;
}

/**
 * 指された手の記録(画面に出す文言の素)。
 * 相手の手は「意図の1行」に、自分の正解手は「正解」の結果パネルに使う。
 */
export interface AckMove {
  /** 指された手の番号(第n手)。 */
  moveNumber: number;
  /** ▲2六歩 のような表示テキスト。 */
  moveText: string;
  kind: JosekiMove["kind"];
  by: "me" | "opponent";
  /** その手の解説(自分の手では「正解」の下に出す1〜2行)。相手の手では意図の1行の素。 */
  note?: string;
  /** 「くわしく」で開く続きの解説(長い解説の残り・局面の解説・咎め方)。 */
  more?: string;
  /** その手の効果の実演(あれば)。結果パネルから盤上で再生できる。 */
  demos?: MoveDemo[];
  /** 相手が定跡を外した手。 */
  deviation?: boolean;
}

/** 自分の手番での「次の一手」クイズの状態。 */
export interface BookQuizState {
  /** ここまでに外した回数。1回目は赤い一行、2回目からは矢印で答えを示す。 */
  misses: number;
  /**
   * 直近の誤答。null なら未回答。
   * kind: bad = 定跡の手ではない / accepted = エンジンが許容した手(最善から100点以内) /
   *       openEnded = 別の手も同じくらい良いと手で印を付けた局面。
   */
  wrong: {
    kind: "bad" | "accepted" | "openEnded";
    attemptedText: string;
    correctText: string;
    attemptedUsi: string;
    correctUsi: string;
  } | null;
}

/** 本線を終えたあとに出す、相手の逸れ手(咎めの問題)。 */
export interface DevItem {
  /** 逸れる直前の局面。 */
  anchor: JosekiNode;
  move: JosekiMove;
  /** 初形から anchor の手前までのノード(戻り先・手数の数え方に使う)。 */
  path: JosekiNode[];
}

/**
 * 本線にある相手の逸れ手を、出てくる順に集める。startDepth より前(章が始まる前の
 * 共通の序盤)にある逸れ手は、前の章で扱うので含めない。
 */
function collectDeviations(course: JosekiCourse, startDepth: number): DevItem[] {
  const out: DevItem[] = [];
  const path: JosekiNode[] = [];
  let node = course.root;
  for (;;) {
    if (path.length >= startDepth) {
      for (const b of node.branches) {
        if (b.kind === "deviation" && b.child) out.push({ anchor: node, move: b, path: [...path] });
      }
    }
    const m = mainBranchOf(node);
    if (!m || !m.child) break;
    path.push(node);
    node = m.child;
  }
  return out;
}

interface LearnState {
  course: JosekiCourse;
  currentNode: JosekiNode;
  /** 訪問履歴(現在ノードは含まない)。手数の数え方に使う。 */
  nodeHistory: JosekiNode[];
  /** currentNode.sfen から再構成した局面 */
  position: Position;
  /** 直前に盤に現れた手(USI)。どの駒が動いたかを盤上で示す。 */
  lastMoveUsi: string | null;
  /** 章が始まった手数(0 = 初手から)。共通の序盤を飛ばして始めた章では逸れ手の対象を絞る。 */
  startDepth: number;
  /**
   * 相手の手の進み具合。waiting = 指す前、shown = 指した直後(意図を読む時間)、idle = それ以外。
   */
  oppPhase: "idle" | "waiting" | "shown";
  /** 直前に相手が指した手。自分の番の画面に「相手 ▲2六歩 — …」と並べる。 */
  lastOpponent: AckMove | null;
  /** 自分の番の出題。null = 出題していない(相手が指している・結果表示中・章の終わり)。 */
  bookQuiz: BookQuizState | null;
  /** 自分が正解した直後の結果パネル。「次へ」で解除する。 */
  pendingAck: AckMove | null;
  /** 本線を終えたあとの逸れ手の問題。 */
  devQueue: DevItem[];
  /** 次に出す逸れ手の番号(= すでに出した数)。 */
  devNext: number;
  /** いま咎めている逸れ手。本線の間は null。 */
  dev: DevItem | null;
  /** 章を終えた(本線も逸れ手もすべて済んだ)。 */
  chapterDone: boolean;
  moveDests: MoveDests;
  dropDests: DropDests;
  selected: Selection;
  /** 盤の升をクリックしたときの処理(選択→着手)。 */
  bookSelectSquare: (square: Square) => void;
  /** 持ち駒をクリックしたときの処理。 */
  bookSelectHand: (pieceType: PieceType, color: Color) => void;
  /** 結果パネルの「次へ」。相手の手が自動で進む。 */
  acknowledgeMove: () => void;
  /** 本線の n 手目を指す直前の局面から始める(n=1 で初形)。 */
  goToMove: (n: number) => void;
  /** 表示するコースを差し替えて、最初から始める。 */
  loadCourse: (course: JosekiCourse) => void;
  /** Learn画面を離れた。保留中のタイマーを破棄し、裏で手が進み続けるのを防ぐ。 */
  pauseAutoAdvance: () => void;
  /** Learn画面に戻った。状況に応じて必要なタイマーを張り直す。 */
  resumeAutoAdvance: () => void;
}

/**
 * 自動進行タイマー(モジュール単位で1つだけ)。scheduleAutoAdvance は必ず最初にこれを破棄するので、
 * 「古い局面に対して発火する」「重複して2つ走る」は起きない。
 */
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer !== null) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

const NO_DESTS = { moveDests: new Map() as MoveDests, dropDests: new Map() as DropDests, selected: null as Selection };

function initial() {
  const course = loadIbishaVsShikenbishaSente();
  return {
    course,
    currentNode: course.root,
    nodeHistory: [] as JosekiNode[],
    position: positionFromNode(course.root),
    lastMoveUsi: null as string | null,
    startDepth: 0,
    oppPhase: "idle" as LearnState["oppPhase"],
    lastOpponent: null as AckMove | null,
    bookQuiz: null as BookQuizState | null,
    pendingAck: null as AckMove | null,
    devQueue: [] as DevItem[],
    devNext: 0,
    dev: null as DevItem | null,
    chapterDone: false,
    ...NO_DESTS,
  };
}

/** 章の状態をまっさらにして、depth 手目の手前の局面に置く。 */
function freshAt(course: JosekiCourse, node: JosekiNode, history: JosekiNode[]) {
  return {
    course,
    currentNode: node,
    nodeHistory: history,
    position: positionFromNode(node),
    lastMoveUsi: null as string | null,
    startDepth: history.length,
    oppPhase: "idle" as LearnState["oppPhase"],
    lastOpponent: null as AckMove | null,
    bookQuiz: null as BookQuizState | null,
    pendingAck: null as AckMove | null,
    devQueue: collectDeviations(course, history.length),
    devNext: 0,
    dev: null as DevItem | null,
    chapterDone: false,
    ...NO_DESTS,
  };
}

export const useLearnStore = create<LearnState>((set, get) => {
  /**
   * 「行き先だけをタップ」したときに、その升へ行ける自分の駒を探す。
   * 候補がちょうど1枚のときだけ移動元を返す(2枚以上なら駒を選んでもらう)。
   * タップ回数が半分になるので、盤が小さい端末での誤操作が減る。
   */
  function soleMoverTo(square: Square): Square | null {
    const { moveDests, position } = get();
    let found: Square | null = null;
    for (const [fromUsi, dests] of moveDests) {
      if (!dests.some((d) => d.usi === square.usi)) continue;
      const from = Square.newByUSI(fromUsi);
      if (!from) continue;
      if (position.board.at(from)?.color !== position.color) continue;
      if (found) return null; // 2枚以上が行ける升なので、どれを動かすかは選んでもらう
      found = from;
    }
    return found;
  }


  /**
   * 出題中に升を押したとき、選択状態から「試す手」を決める。
   * 返り値: 試す手(局面は進めない) / null は「選び直し・解除のみ」で判定しない。
   *
   * 持ち駒を選んでいた場合はその駒を打つ手を試す。以前はこの分岐が無く、
   * 持ち駒を選んでも「何も選んでいない」扱いになって打つ手が一切指せなかった。
   */
  function resolveAttempt(
    square: Square,
    preferUsi: string | undefined,
  ): ReturnType<typeof tryMovePreview> | null {
    const { position, selected, moveDests, dropDests } = get();
    const own = position.board.at(square)?.color === position.color;

    if (selected?.kind === "hand") {
      const ok = (dropDests.get(selected.pieceType) ?? []).some((d) => d.usi === square.usi);
      if (ok) return tryMovePreview(position, selected.pieceType, square, preferUsi);
      // 打てない升: 自分の駒なら選び直し、そうでなければ解除
      set({ selected: own ? { kind: "board", square } : null });
      return null;
    }

    let from: Square | null = selected?.kind === "board" ? selected.square : null;
    if (!from) {
      if (own) { set({ selected: { kind: "board", square } }); return null; }
      // 自分の駒がない升をいきなり押したときは、そこへ行ける自分の駒が
      // 1枚だけなら着手として扱う(タップ回数が半分になり、誤操作が減る)。
      from = soleMoverTo(square);
      if (!from) { set({ selected: null }); return null; }
    }
    if (from.usi === square.usi) { set({ selected: null }); return null; }
    if (!moveDests.get(from.usi)?.some((d) => d.usi === square.usi)) {
      set({ selected: own ? { kind: "board", square } : null });
      return null;
    }
    return tryMovePreview(position, from, square, preferUsi);
  }

  /** 出題中に自分が指せる合法手を計算する。 */
  function questDests(position: Position) {
    return {
      moveDests: computeMoveDests(position, position.color),
      dropDests: computeDropDests(position, position.color),
    };
  }


  /** 自分の番になったとき、「次の一手」クイズを立てる。 */
  function refreshBookQuiz() {
    const { course, currentNode, position } = get();
    const move = mainBranchOf(currentNode);
    if (!move || !move.child || position.color !== myColorOf(course)) {
      set({ bookQuiz: null, ...NO_DESTS });
      return;
    }
    set({ bookQuiz: { misses: 0, wrong: null }, ...questDests(position), selected: null });
  }

  /** ノードを1つ進める(手の記録と、盤に出す手の強調)。 */
  function goToChild(move: JosekiMove) {
    if (!move.child) return;
    const { currentNode, nodeHistory } = get();
    set({
      currentNode: move.child,
      nodeHistory: [...nodeHistory, currentNode],
      position: positionFromNode(move.child),
      lastMoveUsi: move.usi,
    });
  }

  /** 相手の手を自動で指す。逸れ手のときは意図を読ませる間を置かず、すぐ自分の番にする。 */
  function playOpponent(move: JosekiMove, deviation: boolean) {
    const before = get();
    const info = moveFromUSI(before.position, move.usi);
    const ack: AckMove = {
      moveNumber: before.nodeHistory.length + 1,
      moveText: plainMove(info?.displayText ?? move.usi),
      note: move.note,
      kind: move.kind,
      by: "opponent",
      deviation,
    };
    goToChild(move);
    set({ lastOpponent: ack, oppPhase: deviation ? "idle" : "shown" });
    scheduleAutoAdvance();
  }

  /** いまの流れ(本線または逸れ手の手順)が終わった。次の逸れ手へ進むか、章を終える。 */
  function finishLine() {
    const { devQueue, devNext } = get();
    const item = devQueue[devNext];
    if (!item) {
      set({ chapterDone: true, dev: null, oppPhase: "idle", bookQuiz: null, ...NO_DESTS });
      return;
    }
    // 逸れる直前の局面に盤を戻し、相手に誤りの手を自動で指させる。
    set({
      dev: item,
      devNext: devNext + 1,
      currentNode: item.anchor,
      nodeHistory: item.path,
      position: positionFromNode(item.anchor),
      lastMoveUsi: null,
      lastOpponent: null,
      pendingAck: null,
      bookQuiz: null,
      oppPhase: "waiting",
      ...NO_DESTS,
    });
    scheduleAutoAdvance();
  }

  /**
   * いまの状態から次に起こすことを決めて、必要ならタイマーを張る。
   * 呼び出しの最初に必ず既存のタイマーを破棄するので、どこから呼んでも古い状態に対して発火しない。
   *  - 自分が答える途中(出題中・結果表示中)・章の終わりでは何もしない
   *  - 相手の手を指した直後は、意図を読む間(約0.7秒)を置いて自分の番にする
   *  - 自分の番なら出題する / 相手の番なら少し置いて相手の手を指す
   *  - 手順の終わりなら次の逸れ手(または章の終わり)へ
   */
  function scheduleAutoAdvance() {
    clearAutoAdvanceTimer();
    const s = get();
    if (s.chapterDone || s.pendingAck || s.bookQuiz) return;
    if (s.oppPhase === "shown") {
      autoAdvanceTimer = setTimeout(() => {
        autoAdvanceTimer = null;
        set({ oppPhase: "idle" });
        scheduleAutoAdvance();
      }, OPPONENT_SHOWN_MS);
      return;
    }
    // 逸れる直前の局面にいるときは、本線ではなく逸れ手を指させる。
    const devMove = s.dev && s.currentNode === s.dev.anchor ? s.dev.move : null;
    const next = devMove ?? mainBranchOf(s.currentNode);
    if (!next || !next.child) { finishLine(); return; }
    if (s.position.color === myColorOf(s.course)) { refreshBookQuiz(); return; }
    set({ oppPhase: "waiting" });
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      playOpponent(next, next === devMove);
    }, OPPONENT_MOVE_DELAY_MS);
  }

  return {
    ...initial(),

    bookSelectSquare(square) {
      const { bookQuiz, position, currentNode, course, dev, nodeHistory } = get();
      if (!bookQuiz) return;
      if (position.color !== myColorOf(course)) return;

      const answer = mainBranchOf(currentNode);
      const applied = resolveAttempt(square, answer?.usi);
      if (!applied) return;
      if (!applied.ok) { set({ selected: null }); return; }
      if (answer && applied.move.usi === answer.usi) {
        // 正解。
        const missed = bookQuiz.misses > 0;
        // 間隔反復の記録。一度でも間違えた問題は「正解」として数えない
        // (答えを見てから当てたのと変わらないため)。咎めの手順の中の自分の手も同じ扱い。
        useProgressStore.getState().record(
          itemKey(currentNode.sfen, answer.usi), !missed, !!answer.sharp
        );
        // 一旦止めて、結果(正解と理由)を読ませる。「次へ」で相手が指す。
        const { lead, rest } = splitExplanation(answer.note);
        const more = [
          rest,
          // 指す前の局面の解説(章の最初の説明や、相手の手のあとの方針)は答えを明かしうるので、
          // 出題中には出さず、正解のあとにここで読ませる。
          cleanNote(currentNode.comment),
          cleanNote(answer.child?.comment),
          // 咎めの手順の最初の一手には、咎め方の要点を添える。
          dev && nodeHistory.length === dev.path.length + 1 ? cleanNote(dev.move.punishNote) : "",
        ].filter(Boolean).join("\n");
        const ack: AckMove = {
          moveNumber: nodeHistory.length + 1,
          moveText: plainMove(applied.displayText),
          note: lead,
          more,
          kind: answer.kind,
          by: "me",
          demos: answer.demos,
        };
        set({ bookQuiz: null, lastOpponent: null, pendingAck: ack, oppPhase: "idle", ...NO_DESTS });
        goToChild(answer);
        return;
      }
      // 不正解: 盤はそのまま(指した駒は元の位置に戻ったことになる)。
      // 最初の誤答だけ記録する(何度外しても記録は1回)。
      if (answer && bookQuiz.misses === 0) {
        useProgressStore.getState().record(itemKey(currentNode.sfen, answer.usi), false, !!answer.sharp);
      }
      const kind: "bad" | "accepted" | "openEnded" = answer?.accepted?.includes(applied.move.usi)
        ? "accepted"
        : answer?.openEnded ? "openEnded" : "bad";
      set({
        selected: null,
        bookQuiz: {
          misses: bookQuiz.misses + 1,
          wrong: {
            kind,
            attemptedText: plainMove(applied.displayText),
            correctText: answer ? plainMove(moveFromUSI(position, answer.usi)?.displayText ?? "") : "",
            attemptedUsi: applied.move.usi,
            correctUsi: answer?.usi ?? "",
          },
        },
      });
    },

    bookSelectHand(pieceType, color) {
      const { bookQuiz, position } = get();
      if (!bookQuiz) return;
      if (color !== position.color) return;
      set({ selected: { kind: "hand", pieceType } });
    },

    acknowledgeMove() {
      if (!get().pendingAck) return;
      set({ pendingAck: null });
      scheduleAutoAdvance();
    },

    goToMove(n) {
      clearAutoAdvanceTimer();
      const { course } = get();
      const history: JosekiNode[] = [];
      let node = course.root;
      for (let i = 1; i < n; i++) {
        const next = mainBranchOf(node);
        if (!next || !next.child) break;
        history.push(node);
        node = next.child;
      }
      set(freshAt(course, node, history));
      scheduleAutoAdvance();
    },

    loadCourse(course) {
      clearAutoAdvanceTimer();
      set(freshAt(course, course.root, []));
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
