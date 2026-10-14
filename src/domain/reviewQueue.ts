import type { JosekiCourse, JosekiNode } from "./types";
import { itemKey } from "../store/progressStore";
import type { ItemRecord } from "../store/progressStore";

/** 1日に出す復習の上限。溜まっても追われないよう、超えた分は期日のまま翌日以降に回る。 */
export const DAILY_CAP = 20;

/**
 * コースから「自分が答える問題」を取り出す。本線だけでなく、
 * 相手のミスを咎める枝と、相手の別の手(変化。kind が deviation で variation: true)の
 * 枝の中の自分の手も問題として数える。
 *
 * 間隔反復と章ごとの正解した数は、どちらもこの一覧を土台にする。
 */
export interface QuizItem {
  courseId: string;
  /** 局面(その手を指す前)。 */
  sfen: string;
  /** その局面での正解手。 */
  usi: string;
  /** 急所(最善手と次善手の差が100点以上)。間隔を短くし、優先的に出す。 */
  sharp: boolean;
  /** 本線の何手目か。枝の中の手は分岐元の手数を入れる。 */
  moveNumber: number;
  /** 枝(相手のミスを咎める手順・変化)の中の問題か。 */
  inBranch: boolean;
  /** その手の解説・ねらい(試験の振り返りで使う)。 */
  note?: string;
  aim?: string;
}

/** コースに含まれる問題をすべて集める。 */
export function quizItemsOf(course: JosekiCourse): QuizItem[] {
  const myChar = course.mySide === "sente" ? "b" : "w";
  const out: QuizItem[] = [];

  const walk = (node: JosekiNode, moveNumber: number, inBranch: boolean) => {
    const isMine = node.sfen.split(" ")[1] === myChar;
    for (const b of node.branches) {
      if (isMine && b.kind === "main") {
        out.push({
          courseId: course.id,
          sfen: node.sfen,
          usi: b.usi,
          sharp: !!b.sharp,
          moveNumber,
          inBranch,
          note: b.note,
          aim: b.aim,
        });
      }
      if (b.child) {
        // 逸れ手(相手のミス)に入ると、そこから先は枝の中。
        walk(b.child, moveNumber + 1, inBranch || b.kind === "deviation");
      }
    }
  };
  walk(course.root, 1, false);
  return out;
}

/**
 * 出題の優先順位。試験で落とした問題、急所、未学習、定着の浅い順。
 * 「急所の優先度を上げたい」という方針をここで表す。
 */
export function sortForReview(
  items: QuizItem[],
  info: (it: QuizItem) => { due: boolean; seen: boolean; streak: number; examMissed?: boolean },
): QuizItem[] {
  return items
    .filter((it) => info(it).due)
    .sort((a, b) => {
      const ia = info(a), ib = info(b);
      if (!!ia.examMissed !== !!ib.examMissed) return ia.examMissed ? -1 : 1;  // 試験で落とした問題が最優先
      if (a.sharp !== b.sharp) return a.sharp ? -1 : 1;          // 急所が先
      if (ia.seen !== ib.seen) return ia.seen ? 1 : -1;          // 未学習が先
      return ia.streak - ib.streak;                               // 定着が浅いものが先
    });
}

/** 日付(YYYY-MM-DD, 記録と同じ UTC)。 */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 今日の復習の対象を、出す順に並べて返す(上限は掛けない)。
 *   - 一度でも解いた問題だけ。未学習の問題は「復習」ではなく学習なので含めない。
 *   - 期日が今日以前のもの。同じ局面・同じ手は複数の章にあっても1問。
 *   - 順序: 試験で落とした問題 → 急所 → 定着の浅い順。
 * ホームの件数と復習画面の出題は、どちらもこの関数から作る(食い違わないように)。
 */
export function dueQuizItems(
  courses: JosekiCourse[],
  records: Record<string, ItemRecord>,
  today: string = todayStr(),
): QuizItem[] {
  const seen = new Set<string>();
  const all: QuizItem[] = [];
  for (const course of courses) {
    for (const it of quizItemsOf(course)) {
      const k = itemKey(it.sfen, it.usi);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(it);
    }
  }
  return sortForReview(all, (it) => {
    const rec = records[itemKey(it.sfen, it.usi)];
    return {
      due: !!rec && rec.due <= today,
      seen: !!rec,
      streak: rec?.streak ?? 0,
      examMissed: !!rec?.examMissed,
    };
  });
}
