import { create } from "zustand";
import { Position, Square, PieceType, Color, moveFromUSI, tryMovePreview } from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";
import type { JosekiCourse } from "../domain/types";
import { quizItemsOf } from "../domain/reviewQueue";
import type { QuizItem } from "../domain/reviewQueue";
import { useProgressStore, itemKey } from "./progressStore";
import type { Selection } from "./sandboxStore";

/**
 * 認定試験。章ごとに「覚えたことを確かめる」ための出題。
 *
 * 普段の学習・復習との違い(M5の設計で決めたこと):
 *   - ねらい(ヒント)を出さない
 *   - 間違えてもやり直せない。最後まで通す
 *   - 合格は8割。ただし急所を1問でも落としたら不合格
 *     (急所は外すと確実に損をする手なので、点数で埋め合わせられない)
 *
 * 間隔反復の「覚えた」判定とは独立させる。試験合格を条件にすると、
 * 受かるまで復習対象が減らず、毎日の負荷が下がらないため。
 * そのため試験の結果は progressStore に記録しない。
 */
const KEY = "joseki-dojo:exams:v1";

/** 1回の試験で出す問題数の上限。章の問題がこれより少なければ全部出す。 */
export const EXAM_SIZE = 10;
/** 合格に必要な正答率。 */
export const PASS_RATIO = 0.8;

export interface ExamResult {
  /** これまでの最高点(百分率)。 */
  best: number;
  /** 一度でも合格したか。 */
  passed: boolean;
  /** 最後に受けた日(YYYY-MM-DD)。 */
  at: string;
  attempts: number;
}

type Saved = Record<string, ExamResult>;

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* 読めない環境では記録なしで始める */
  }
  return {};
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても受験はできる */
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** その章の試験を受けられるか。章の問題を一通り解いていれば受けられる。 */
export function canTake(course: JosekiCourse, items: Record<string, { streak: number }>): boolean {
  const qs = quizItemsOf(course);
  if (qs.length === 0) return false;
  return qs.every((q) => itemKey(q.sfen, q.usi) in items);
}

interface ExamCard extends QuizItem {
  correctText: string;
}

/** 1問の答案。 */
interface Marked {
  card: ExamCard;
  /** 実際に指した手。答えずに飛ばした場合は null。 */
  played: string | null;
  playedText: string;
  correct: boolean;
}

interface ExamState {
  courseId: string | null;
  courseTitle: string;
  cards: ExamCard[];
  index: number;
  position: Position;
  selected: Selection | null;
  moveDests: MoveDests;
  dropDests: DropDests;
  marked: Marked[];
  /** 採点が終わったか。 */
  finished: boolean;
  results: Saved;

  start: (course: JosekiCourse, title: string) => void;
  selectSquare: (square: Square) => void;
  selectHand: (type: PieceType, color: Color) => void;
  /** 分からないときに飛ばす。不正解として採点する。 */
  skip: () => void;
  quit: () => void;
}

function positionOf(sfen: string): Position {
  const p = new Position();
  p.resetBySFEN(sfen);
  return p;
}

/** 偏らないように並びを混ぜる(Fisher-Yates)。 */
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const useExamStore = create<ExamState>((set, get) => ({
  courseId: null,
  courseTitle: "",
  cards: [],
  index: 0,
  position: new Position(),
  selected: null,
  moveDests: new Map(),
  dropDests: new Map(),
  marked: [],
  finished: false,
  results: load(),

  start(course, title) {
    const all = quizItemsOf(course).map((it) => {
      const pos = positionOf(it.sfen);
      return { ...it, correctText: moveFromUSI(pos, it.usi)?.displayText ?? it.usi };
    });
    // 同じ問題が複数回出ないよう、局面と正解の組で一意にしてから抽出する。
    const seen = new Set<string>();
    const unique = all.filter((c) => {
      const k = itemKey(c.sfen, c.usi);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const cards = shuffle(unique).slice(0, EXAM_SIZE);
    if (cards.length === 0) return;
    const position = positionOf(cards[0].sfen);
    set({
      courseId: course.id, courseTitle: title, cards, index: 0, position,
      selected: null, marked: [], finished: false,
      moveDests: computeMoveDests(position, position.color),
      dropDests: computeDropDests(position, position.color),
    });
  },

  selectSquare(square) {
    const { position, selected, moveDests, dropDests, cards, index, finished } = get();
    if (finished) return;
    const card = cards[index];
    if (!card) return;
    const own = position.board.at(square)?.color === position.color;

    if (selected?.kind === "hand") {
      const ok = (dropDests.get(selected.pieceType) ?? []).some((d) => d.usi === square.usi);
      if (!ok) { set({ selected: own ? { kind: "board", square } : null }); return; }
      const applied = tryMovePreview(position, selected.pieceType, square, card.usi);
      if (applied?.ok) advance(applied.move.usi, applied.displayText);
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
    if (applied?.ok) advance(applied.move.usi, applied.displayText);
    else set({ selected: null });
  },

  selectHand(type, color) {
    const { position, finished } = get();
    if (finished || color !== position.color) return;
    set({ selected: { kind: "hand", pieceType: type } });
  },

  skip() { advance(null, ""); },

  quit() {
    set({ courseId: null, cards: [], marked: [], finished: false, index: 0 });
  },
}));

/**
 * 1問を採点して次へ進む。最後の問題なら結果を保存する。
 * 試験中は正誤を見せないので、ここでは状態を進めるだけ。
 */
function advance(played: string | null, playedText: string) {
  const s = useExamStore.getState();
  const card = s.cards[s.index];
  if (!card || s.finished) return;
  const marked = [...s.marked, { card, played, playedText, correct: played === card.usi }];

  if (s.index + 1 >= s.cards.length) {
    const correct = marked.filter((m) => m.correct).length;
    const ratio = correct / marked.length;
    // 急所を1問でも落としたら不合格。点数では埋め合わせられない。
    const missedSharp = marked.some((m) => m.card.sharp && !m.correct);
    const passed = ratio >= PASS_RATIO && !missedSharp;
    const score = Math.round(ratio * 100);
    const prev = s.results[s.courseId ?? ""];
    const results: Saved = {
      ...s.results,
      [s.courseId ?? ""]: {
        best: Math.max(prev?.best ?? 0, score),
        passed: (prev?.passed ?? false) || passed,
        at: today(),
        attempts: (prev?.attempts ?? 0) + 1,
      },
    };
    save(results);
    useExamStore.setState({ marked, finished: true, selected: null, results });
    return;
  }

  const position = positionOf(s.cards[s.index + 1].sfen);
  useExamStore.setState({
    marked, index: s.index + 1, position, selected: null,
    moveDests: computeMoveDests(position, position.color),
    dropDests: computeDropDests(position, position.color),
  });
}

/** 採点結果の要約。結果画面で使う。 */
export function summarize(marked: { card: { sharp: boolean }; correct: boolean }[]) {
  const correct = marked.filter((m) => m.correct).length;
  const ratio = marked.length === 0 ? 0 : correct / marked.length;
  const missedSharp = marked.some((m) => m.card.sharp && !m.correct);
  return {
    correct, total: marked.length, score: Math.round(ratio * 100),
    missedSharp, passed: ratio >= PASS_RATIO && !missedSharp,
  };
}

/** progressStore の記録から、章ごとの受験可否を求めるための薄い入口。 */
export function examReadiness(course: JosekiCourse): boolean {
  return canTake(course, useProgressStore.getState().items);
}
