import type { JosekiCourse, JosekiNode } from "./types";

/**
 * コースから「自分が答える問題」を取り出す。本線だけでなく、
 * 相手のミスを咎める枝の中の自分の手も問題として数える。
 *
 * 間隔反復と章の達成率は、どちらもこの一覧を土台にする。
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
  /** 枝(相手のミスを咎める手順)の中の問題か。 */
  inBranch: boolean;
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
 * 出題の優先順位。急所を先に、次に未学習、最後に期限切れの古いものから。
 * 「急所の優先度を上げたい」という方針をここで表す。
 */
export function sortForReview(
  items: QuizItem[],
  info: (it: QuizItem) => { due: boolean; seen: boolean; streak: number },
): QuizItem[] {
  return items
    .filter((it) => info(it).due)
    .sort((a, b) => {
      const ia = info(a), ib = info(b);
      if (a.sharp !== b.sharp) return a.sharp ? -1 : 1;          // 急所が先
      if (ia.seen !== ib.seen) return ia.seen ? 1 : -1;          // 未学習が先
      return ia.streak - ib.streak;                               // 定着が浅いものが先
    });
}

/** 章(コース)の達成率。覚えた問題の割合。 */
export function chapterProgress(
  items: QuizItem[],
  isLearned: (sfen: string, usi: string) => boolean,
): { learned: number; total: number; ratio: number } {
  const total = items.length;
  const learned = items.filter((it) => isLearned(it.sfen, it.usi)).length;
  return { learned, total, ratio: total === 0 ? 0 : learned / total };
}
