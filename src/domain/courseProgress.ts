import { STRATEGIES } from "../data/strategies";
import type { Strategy } from "./types";
import { buildLearnPath, pathSidesFor } from "./josekiLoader";
import type { PathChapter } from "./josekiLoader";
import { quizItemsOf, dueQuizItems, DAILY_CAP } from "./reviewQueue";
import { itemKey, CORRECT_STREAK } from "../store/progressStore";
import type { ItemRecord } from "../store/progressStore";
import type { ExamResult } from "../store/examStore";

/**
 * ホーム・戦法のページ・章のページ・認定試験の一覧が共有する、進み具合の数え方。
 * 画面ごとに数え方が食い違わないよう、ここ1か所で決める。
 */

export type Side = "sente" | "gote";

/**
 * いまの基準で作り込みが終わっている戦法。ここに無い戦法は一覧に出さない。
 *
 * なぜ絞るか: 「出典+エンジン検証」「許容手と急所」「相手のミスを咎める枝」
 * 「盤上の実演」まで揃えた戦法だけを出す方針にしたため。古いコースは
 * これらが未整備で、並べると同じ品質のものに見えてしまう。
 * 1戦法ずつ仕上げて、仕上がった順にここへ足していく。
 */
// 隠すときは、下の配列から該当の戦法 id を消す1行だけでよい(章の JSON と josekiLoader の登録は残す)。
export const READY_STRATEGY_IDS = ["gokigen", "sankenbisha"];

/** 仕上がっている戦法だけを返す。 */
export function readyStrategies(): Strategy[] {
  return STRATEGIES.filter((s) => READY_STRATEGY_IDS.includes(s.id));
}

/** カードとシートに出す短い説明(確定版モックの文言)。無い戦法は戦法マスタの説明を使う。 */
const BLURB: Record<string, { card: string; sheet: string }> = {
  gokigen: {
    card: "飛車を中央に振る戦法。受け方と反撃を覚えます。",
    sheet: "後手が飛車を中央に振る戦法。先手の出方ごとの受け方と反撃を覚えます。",
  },
  sankenbisha: {
    card: "飛車を7筋に振る振り飛車。先手は石田流に組みます。",
    sheet: "飛車を7筋に振る振り飛車。先手は石田流に組みます。",
  },
};
export function blurbOf(s: Strategy): { card: string; sheet: string } {
  return BLURB[s.id] ?? { card: s.description, sheet: s.description };
}

export const sideName = (side: Side) => (side === "sente" ? "先手" : "後手");

/** 戦法×手番の章の数(先手・後手)。 */
export function chapterCounts(strategyId: string): { sente: number; gote: number } {
  return pathSidesFor("mine", strategyId);
}

/** 希望の手番にその戦法の章があればそれ、無ければある方を返す。 */
export function pickSide(strategyId: string, preferred: Side): Side {
  const n = chapterCounts(strategyId);
  if (n[preferred] > 0) return preferred;
  return preferred === "sente" ? (n.gote > 0 ? "gote" : "sente") : (n.sente > 0 ? "sente" : "gote");
}

/** 戦法×手番の学習パス(章の並び)。学習画面と同じ並びを使う。 */
export function pathFor(strategyId: string, side: Side) {
  const name = STRATEGIES.find((s) => s.id === strategyId)?.name ?? strategyId;
  return buildLearnPath("mine", strategyId, name, side);
}

/** 章の状態。合格 > 復習中(一通り解いた) > 学習中(一部解いた) > 未学習。 */
export type ChapterState = "passed" | "review" | "learning" | "none";

export interface ChapterStat {
  index: number;
  chapter: PathChapter;
  /** 章の問題数。 */
  total: number;
  /** 正解した(直近の答えが正解 = 連続正解が CORRECT_STREAK 以上)問題数。 */
  correct: number;
  /** 一度でも解いた問題数。 */
  answered: number;
  /** まだ一度も解いていない問題の数(同じ局面・同じ手は1問と数える)。認定試験が受けられるまでの残り。 */
  unanswered: number;
  state: ChapterState;
  /** 認定試験を受けられるか(章の問題を一通り解いている)。 */
  ready: boolean;
  result?: ExamResult;
}

export function chapterStat(
  chapter: PathChapter,
  index: number,
  items: Record<string, ItemRecord>,
  results: Record<string, ExamResult>,
): ChapterStat {
  const qs = quizItemsOf(chapter.course);
  const correct = qs.filter((q) => (items[itemKey(q.sfen, q.usi)]?.streak ?? 0) >= CORRECT_STREAK).length;
  const answered = qs.filter((q) => itemKey(q.sfen, q.usi) in items).length;
  const missing = new Set<string>();
  for (const q of qs) {
    const k = itemKey(q.sfen, q.usi);
    if (!(k in items)) missing.add(k);
  }
  const unanswered = missing.size;
  const result = results[chapter.course.id];
  const ready = qs.length > 0 && unanswered === 0;
  const state: ChapterState = result?.passed ? "passed" : ready ? "review" : answered > 0 ? "learning" : "none";
  return { index, chapter, total: qs.length, correct, answered, unanswered, state, ready, result };
}

export interface PathSummary {
  stats: ChapterStat[];
  correct: number;
  total: number;
  passed: number;
  /** いま取り組む章。まだ解いていない問題がある最初の章。無ければ正解していない問題が残る最初の章。全部正解していたら -1。 */
  currentIndex: number;
}

export function summarizePath(
  chapters: PathChapter[],
  items: Record<string, ItemRecord>,
  results: Record<string, ExamResult>,
): PathSummary {
  const stats = chapters.map((c, i) => chapterStat(c, i, items, results));
  let currentIndex = stats.findIndex((s) => s.unanswered > 0);
  if (currentIndex < 0) currentIndex = stats.findIndex((s) => s.correct < s.total);
  return {
    stats,
    correct: stats.reduce((a, s) => a + s.correct, 0),
    total: stats.reduce((a, s) => a + s.total, 0),
    passed: stats.filter((s) => s.state === "passed").length,
    currentIndex,
  };
}

/** 章の状態を文字にする。「学習中 4/26」のように、学習中だけ正解した数を添える。 */
export function stateWord(s: ChapterStat, withCount: boolean): string {
  switch (s.state) {
    case "passed": return "合格";
    case "review": return "復習中";
    case "learning": return withCount ? `学習中 ${s.correct}/${s.total}` : "学習中";
    default: return "未学習";
  }
}

/**
 * 今日の復習の件数。復習画面が出す問題(上限 DAILY_CAP)と同じ数え方で、
 * due=期日が来ている問題の総数、shown=今日出す数、sharp=今日出す中の急所、leftover=明日以降に回る数。
 */
export function dueToday(
  chapters: PathChapter[],
  items: Record<string, ItemRecord>,
): { due: number; shown: number; sharp: number; leftover: number } {
  const queue = dueQuizItems(chapters.map((c) => c.course), items);
  const shown = queue.slice(0, DAILY_CAP);
  return {
    due: queue.length,
    shown: shown.length,
    sharp: shown.filter((q) => q.sharp).length,
    leftover: queue.length - shown.length,
  };
}

/** 合格した章の数。仕上がっている全戦法の先手・後手の章をまとめて数える。 */
export function passedChapterCount(results: Record<string, ExamResult>): number {
  const ids = new Set<string>();
  for (const id of READY_STRATEGY_IDS) {
    const n = chapterCounts(id);
    for (const side of ["gote", "sente"] as const) {
      if (n[side] === 0) continue;
      for (const c of pathFor(id, side).chapters) if (results[c.course.id]?.passed) ids.add(c.course.id);
    }
  }
  return ids.size;
}
