import { create } from "zustand";
import { Position, Square, PieceType, Color, moveFromUSI, tryMovePreview } from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiNode } from "../domain/types";
import { dueQuizItems, DAILY_CAP } from "../domain/reviewQueue";
import type { QuizItem } from "../domain/reviewQueue";
import { chapterTitle } from "../domain/kanjiNumber";
import { plainMove, splitExplanation } from "../domain/moveText";
import { buildHint } from "../domain/hint";
import { useProgressStore, itemKey } from "./progressStore";
import { usePointsStore, POINTS } from "./pointsStore";
import type { Selection } from "./sandboxStore";

/** 1日の復習の上限(ホームの件数と同じ)。 */
export const SESSION_LIMIT = DAILY_CAP;

/** 復習の対象にする章。no は戦法×手番の章の並びの何番目か(1 始まり)。 */
export interface ReviewCourse {
  course: JosekiCourse;
  label: string;
  no: number;
}

/** 出題中の1問。盤に出す局面と、その局面での正解。 */
export interface ReviewCard extends QuizItem {
  /** ヒント(ねらい)。普段の学習と同じものを、「ヒント」を押した人にだけ見せる。 */
  hint: string | null;
  /** 正解手の短い解説。正解したあとに見せる。 */
  note: string;
  /** 咎められない手(最善から100点以内)。正解ではないが、返し方を変える。 */
  accepted?: string[];
  /** 別の手も同じくらい良いと印を付けた局面。 */
  openEnded?: boolean;
  /** 正解手の表示テキスト(▲7六歩 など)。 */
  correctText: string;
  /** 「第三章 UFO銀速攻の受け方」 */
  chapterLabel: string;
}

/** 直近の誤答。学習画面と同じ分け方。 */
export interface ReviewWrong {
  kind: "bad" | "accepted" | "openEnded";
  attemptedText: string;
  correctText: string;
  correctUsi: string;
}

interface ReviewState {
  cards: ReviewCard[];
  index: number;
  position: Position;
  selected: Selection | null;
  moveDests: MoveDests;
  dropDests: DropDests;
  /** この問題で外した回数。1回目は赤い一行、2回目からは矢印で答えを示す。 */
  misses: number;
  wrong: ReviewWrong | null;
  /** 正解した。null なら出題中。firstTry は一発で当てたか。 */
  result: { text: string; firstTry: boolean } | null;
  /** このセッションで一発正解した数。 */
  correctCount: number;
  /** 期日が来ていたが上限で今日は出さなかった数。 */
  leftover: number;
  done: boolean;

  start: (courses: ReviewCourse[]) => void;
  selectSquare: (square: Square) => void;
  selectHand: (type: PieceType, color: Color) => void;
  next: () => void;
}

function positionOf(sfen: string): Position {
  const p = new Position();
  p.resetBySFEN(sfen);
  return p;
}

/** 本線と枝から、その局面の手の情報(ねらい・解説・許容手)を引く。 */
interface MoveInfo { aim?: string; note?: string; accepted?: string[]; openEnded?: boolean }
function lookup(course: JosekiCourse, sfen: string, usi: string): MoveInfo {
  let found: MoveInfo | null = null;
  const walk = (node: JosekiNode) => {
    if (found) return;
    for (const b of node.branches) {
      if (node.sfen === sfen && b.usi === usi) {
        found = { aim: b.aim, note: b.note, accepted: b.accepted, openEnded: b.openEnded };
        return;
      }
      if (b.child) walk(b.child);
    }
  };
  walk(course.root);
  return found ?? {};
}

const questionState = (sfen: string) => {
  const position = positionOf(sfen);
  return {
    position, selected: null, misses: 0, wrong: null, result: null,
    moveDests: computeMoveDests(position, position.color),
    dropDests: computeDropDests(position, position.color),
  };
};

export const useReviewStore = create<ReviewState>((set, get) => ({
  cards: [],
  index: 0,
  position: new Position(),
  selected: null,
  moveDests: new Map(),
  dropDests: new Map(),
  misses: 0,
  wrong: null,
  result: null,
  correctCount: 0,
  leftover: 0,
  done: false,

  start(courses) {
    const progress = useProgressStore.getState();
    // 復習の対象と順序は dueQuizItems が決める(ホームの件数と同じ関数)。
    const due = dueQuizItems(courses.map((c) => c.course), progress.items);
    const byCourse = new Map(courses.map((c) => [c.course.id, c]));
    const queue: ReviewCard[] = due.slice(0, SESSION_LIMIT).map((it) => {
      const rc = byCourse.get(it.courseId)!;
      const extra = lookup(rc.course, it.sfen, it.usi);
      const correctText = plainMove(moveFromUSI(positionOf(it.sfen), it.usi)?.displayText ?? it.usi);
      return {
        ...it,
        hint: extra.aim ?? buildHint(extra.note, correctText),
        note: splitExplanation(extra.note).lead,
        accepted: extra.accepted,
        openEnded: extra.openEnded,
        correctText,
        chapterLabel: chapterTitle(rc.no - 1, rc.label),
      };
    });
    const leftover = due.length - queue.length;

    if (queue.length === 0) {
      set({ cards: [], index: 0, result: null, wrong: null, correctCount: 0, leftover: 0, done: true });
      return;
    }
    set({ cards: queue, index: 0, ...questionState(queue[0].sfen), correctCount: 0, leftover, done: false });
  },

  selectSquare(square) {
    const { position, selected, moveDests, dropDests, result, cards, index } = get();
    if (result) return;                       // 正解後は触らせない
    const card = cards[index];
    if (!card) return;
    const own = position.board.at(square)?.color === position.color;

    // 持ち駒を選んでいたら打つ手として扱う。
    if (selected?.kind === "hand") {
      const ok = (dropDests.get(selected.pieceType) ?? []).some((d) => d.usi === square.usi);
      if (!ok) { set({ selected: own ? { kind: "board", square } : null }); return; }
      const applied = tryMovePreview(position, selected.pieceType, square, card.usi);
      if (applied?.ok) judge(applied.move.usi, applied.displayText);
      else set({ selected: null });
      return;
    }

    const from: Square | null = selected?.kind === "board" ? selected.square : null;
    if (!from) {
      if (!own) { set({ selected: null }); return; }
      set({ selected: { kind: "board", square } });
      return;
    }
    if (from.usi === square.usi) { set({ selected: null }); return; }
    if (!moveDests.get(from.usi)?.some((d) => d.usi === square.usi)) {
      set({ selected: own ? { kind: "board", square } : null });
      return;
    }
    const applied = tryMovePreview(position, from, square, card.usi);
    if (applied?.ok) judge(applied.move.usi, applied.displayText);
    else set({ selected: null });
  },

  selectHand(type, color) {
    const { position, result } = get();
    if (result || color !== position.color) return;
    set({ selected: { kind: "hand", pieceType: type } });
  },

  next() {
    const { cards, index } = get();
    const i = index + 1;
    if (i >= cards.length) { set({ done: true, result: null, wrong: null, selected: null }); return; }
    set({ index: i, ...questionState(cards[i].sfen) });
  },
}));

/**
 * 回答の判定。学習画面と同じ基準:
 *   正解 / 咎められない手(別の良い手) / 不正解 の3段階で、正解するまで指し直せる。
 * 記録は最初の回答だけ(一発で当てたら正解、外したら誤答。何度外しても誤答は1回)。
 */
function judge(usi: string, text: string) {
  const { cards, index, misses, correctCount } = useReviewStore.getState();
  const card = cards[index];
  if (!card) return;
  const key = itemKey(card.sfen, card.usi);
  const progress = useProgressStore.getState();

  if (usi === card.usi) {
    const firstTry = misses === 0;
    if (firstTry) {
      progress.record(key, true, card.sharp);
      usePointsStore.getState().award(card.sharp ? POINTS.sharpFirstTry : POINTS.bookFirstTry);
    }
    useReviewStore.setState({
      result: { text: card.correctText, firstTry }, wrong: null, selected: null,
      correctCount: correctCount + (firstTry ? 1 : 0),
    });
    return;
  }

  if (misses === 0) progress.record(key, false, card.sharp);
  const kind: ReviewWrong["kind"] = card.accepted?.includes(usi) ? "accepted" : card.openEnded ? "openEnded" : "bad";
  useReviewStore.setState({
    selected: null,
    misses: misses + 1,
    wrong: { kind, attemptedText: plainMove(text), correctText: card.correctText, correctUsi: card.usi },
  });
}
