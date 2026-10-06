import { create } from "zustand";
import { Position, Square, PieceType, Color, moveFromUSI, tryMovePreview } from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse, JosekiNode } from "../domain/types";
import { quizItemsOf, sortForReview } from "../domain/reviewQueue";
import type { QuizItem } from "../domain/reviewQueue";
import { useProgressStore, itemKey } from "./progressStore";
import { usePointsStore, POINTS } from "./pointsStore";
import type { Selection } from "./sandboxStore";

/** 1回の復習で出す上限。多すぎると続かないので、毎日こなせる量に抑える。 */
export const SESSION_LIMIT = 25;

/** 出題中の1問。盤に出す局面と、その局面での正解。 */
export interface ReviewCard extends QuizItem {
  /** 出題文(ねらい)。普段の学習と同じものを見せる。 */
  aim?: string;
  /** 正解手の解説。答えたあとに見せる。 */
  note?: string;
  /** 咎められない手(最善から100点以内)。正解ではないが、返し方を変える。 */
  accepted?: string[];
  /** 正解手の表示テキスト(☖５四歩 など)。 */
  correctText: string;
  /** この問題が属する章の名前。 */
  chapterLabel: string;
}

type Answer = { kind: "correct" } | { kind: "accepted"; text: string } | { kind: "wrong"; text: string };

interface ReviewState {
  cards: ReviewCard[];
  index: number;
  position: Position;
  selected: Selection | null;
  moveDests: MoveDests;
  dropDests: DropDests;
  /** 直近の回答。null なら未回答。 */
  answer: Answer | null;
  /** このセッションで正解した数(一発正解のみ数える)。 */
  correctCount: number;
  /** 終了したか。 */
  done: boolean;

  start: (courses: { course: JosekiCourse; label: string }[]) => void;
  /**
   * 回答の判定。正解 / 咎められない手 / 不正解 の3段階。
   * 基準は学習画面と同じにして、二つの画面で挙動が食い違わないようにする。
   */
  judge: (usi: string, text: string) => void;
  selectSquare: (square: Square) => void;
  selectHand: (type: PieceType, color: Color) => void;
  next: () => void;
  /** 「答えを見る」。正解として数えず、記録も誤答にする。 */
  reveal: () => void;
}

function positionOf(sfen: string): Position {
  const p = new Position();
  p.resetBySFEN(sfen);
  return p;
}

/** 本線と枝から、その局面の手の情報(ねらい・解説・許容手)を引く。 */
function lookup(course: JosekiCourse, sfen: string, usi: string) {
  let found: { aim?: string; note?: string; accepted?: string[] } | null = null;
  const walk = (node: JosekiNode) => {
    if (found) return;
    for (const b of node.branches) {
      if (node.sfen === sfen && b.usi === usi) {
        found = { aim: b.aim, note: b.note, accepted: b.accepted };
        return;
      }
      if (b.child) walk(b.child);
    }
  };
  walk(course.root);
  return found ?? {};
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  cards: [],
  index: 0,
  position: new Position(),
  selected: null,
  moveDests: new Map(),
  dropDests: new Map(),
  answer: null,
  correctCount: 0,
  done: false,

  start(courses) {
    const progress = useProgressStore.getState();
    const all: ReviewCard[] = [];
    for (const { course, label } of courses) {
      for (const it of quizItemsOf(course)) {
        const extra = lookup(course, it.sfen, it.usi);
        const pos = positionOf(it.sfen);
        all.push({
          ...it,
          ...extra,
          correctText: moveFromUSI(pos, it.usi)?.displayText ?? it.usi,
          chapterLabel: label,
        });
      }
    }
    // 同じ問題が複数のコースに出てくる場合は1問にまとめる。
    const seen = new Set<string>();
    const unique = all.filter((c) => {
      const k = itemKey(c.sfen, c.usi);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const queue = sortForReview(unique, (it) => {
      const k = itemKey(it.sfen, it.usi);
      const rec = progress.items[k];
      return { due: progress.isDue(k), seen: !!rec, streak: rec?.streak ?? 0 };
    }).slice(0, SESSION_LIMIT) as ReviewCard[];

    if (queue.length === 0) {
      set({ cards: [], index: 0, answer: null, correctCount: 0, done: true });
      return;
    }
    const position = positionOf(queue[0].sfen);
    set({
      cards: queue, index: 0, position, selected: null, answer: null,
      correctCount: 0, done: false,
      moveDests: computeMoveDests(position, position.color),
      dropDests: computeDropDests(position, position.color),
    });
  },

  selectSquare(square) {
    const { position, selected, moveDests, dropDests, answer, cards, index } = get();
    if (answer) return;                       // 回答済みは触らせない
    const card = cards[index];
    if (!card) return;
    const own = position.board.at(square)?.color === position.color;

    // 持ち駒を選んでいたら打つ手として扱う。
    if (selected?.kind === "hand") {
      const ok = (dropDests.get(selected.pieceType) ?? []).some((d) => d.usi === square.usi);
      if (!ok) { set({ selected: own ? { kind: "board", square } : null }); return; }
      const applied = tryMovePreview(position, selected.pieceType, square, card.usi);
      if (applied?.ok) get().judge(applied.move.usi, applied.displayText);
      else set({ selected: null });
      return;
    }

    let from: Square | null = selected?.kind === "board" ? selected.square : null;
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
    if (applied?.ok) get().judge(applied.move.usi, applied.displayText);
    else set({ selected: null });
  },

  selectHand(type, color) {
    const { position, answer } = get();
    if (answer || color !== position.color) return;
    set({ selected: { kind: "hand", pieceType: type } });
  },

  next() {
    const { cards, index } = get();
    const i = index + 1;
    if (i >= cards.length) { set({ done: true, answer: null, selected: null }); return; }
    const position = positionOf(cards[i].sfen);
    set({
      index: i, position, selected: null, answer: null,
      moveDests: computeMoveDests(position, position.color),
      dropDests: computeDropDests(position, position.color),
    });
  },

  reveal() {
    const { cards, index, answer } = get();
    const card = cards[index];
    if (!card || answer) return;
    useProgressStore.getState().record(itemKey(card.sfen, card.usi), false, card.sharp);
    set({ answer: { kind: "wrong", text: "" }, selected: null });
  },

  judge(usi, text) {
    const { cards, index, correctCount } = get();
    const card = cards[index];
    if (!card) return;
    const key = itemKey(card.sfen, card.usi);
    if (usi === card.usi) {
      useProgressStore.getState().record(key, true, card.sharp);
      usePointsStore.getState().award(card.sharp ? POINTS.sharpFirstTry : POINTS.bookFirstTry);
      set({ answer: { kind: "correct" }, selected: null, correctCount: correctCount + 1 });
      return;
    }
    // 咎められない手(最善から100点以内)は赤で返さないが、記録としては正解にしない。
    const accepted = !!card.accepted?.includes(usi);
    useProgressStore.getState().record(key, false, card.sharp);
    set({ answer: accepted ? { kind: "accepted", text } : { kind: "wrong", text }, selected: null });
  },
}));
