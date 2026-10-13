import { create } from "zustand";

/**
 * 学習の記録。どの問題をいつ正解したか、次にいつ出すかを端末に保存する。
 *
 * なぜ必要か: これまでは累計の点数だけを保存していて、どの手を覚えたかが
 * 残らなかった。そのため2周目も1周目と同じ258手を最初から繰り返すことになり、
 * 「何周もして覚える」が現実的な時間に収まらない。
 *
 * 間隔反復(SRS)の考え方: 正解するたびに次の出題を先延ばしし、間違えたら戻す。
 * 覚えている手に時間を使わず、忘れそうな手に集中させる。
 *
 * 急所は間隔を短くする。実測で急所は駒組みの2%・駒がぶつかった後の32%しかなく、
 * そこを外すと確実に損をする手なので、他より手厚く回す。
 */
const KEY = "joseki-dojo:progress:v1";

/** 正解を重ねたときに次の出題までを何日空けるか。index = 連続正解数。 */
const INTERVALS_NORMAL = [1, 3, 7, 21, 60];
/** 急所は短めに回す。 */
const INTERVALS_SHARP = [1, 2, 5, 14, 30];

/** 直近の答えが正解(連続正解数が1以上)なら「正解した」問題とみなす。章ごとの正解した数はこの数で数える。 */
export const CORRECT_STREAK = 1;

/**
 * 1問の記録。キーは「局面 + その局面での正解手」。
 * 局面だけだとコース間で正解が違う場合に混ざるため、手まで含める。
 */
export interface ItemRecord {
  /** 連続正解数。間違えたら 0 に戻る。 */
  streak: number;
  /** 次に出題してよい日(YYYY-MM-DD)。 */
  due: string;
  /** 最後に解いた日(YYYY-MM-DD)。 */
  last: string;
  /** これまでに間違えた回数。苦手な手を見つけるために残す。 */
  misses: number;
  /**
   * 認定試験で落とした問題の印。復習の先頭に出し、次に正解したら外す。
   * 以前の保存データには無い項目なので、無いものは false として読む。
   */
  examMissed?: boolean;
}

interface Saved {
  items: Record<string, ItemRecord>;
}

/** 問題のキー。局面(手数は落とす)と、その局面で指すべき手。 */
export function itemKey(sfen: string, usi: string): string {
  return `${sfen.split(" ").slice(0, 3).join(" ")}|${usi}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(from: string, n: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function load(): Saved {
  try {
    // 廃止したポイントの保存は、読まれないまま残さず消す。
    localStorage.removeItem("joseki-dojo:points:v1");
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // 以前の保存には学習した日の並び(days)も入っている。使わないので読み捨てる。
      const s = JSON.parse(raw) as Saved;
      if (s && typeof s === "object" && s.items) return { items: s.items };
    }
  } catch {
    /* 読めない環境(プライベートモード等)では記録なしで始める */
  }
  return { items: {} };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても学習は続けられるようにする */
  }
}

export interface ProgressState extends Saved {
  /** 1問を解いた結果を記録する。sharp は急所かどうか(間隔を短くする)。 */
  record: (key: string, correct: boolean, sharp: boolean) => void;
  /** 認定試験で落とした問題に印を付け、期日を遅くとも明日にする(復習の先頭に出す)。 */
  markExamMissed: (keys: string[]) => void;
  /** その問題が今日出題対象か(未学習 or 期日が来ている)。 */
  isDue: (key: string) => boolean;
  /** 正解した(直近の答えが正解)かどうか。 */
  isCorrect: (key: string) => boolean;
  /** 記録を全部消す。 */
  reset: () => void;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  ...load(),

  record(key, correct, sharp) {
    const cur = get();
    const prev = cur.items[key];
    const d = today();
    const streak = correct ? (prev?.streak ?? 0) + 1 : 0;
    const table = sharp ? INTERVALS_SHARP : INTERVALS_NORMAL;
    // 連続正解が増えるほど先延ばしする。表を超えたら最後の間隔を使い続ける。
    const gap = correct ? table[Math.min(streak - 1, table.length - 1)] : 1;
    const item: ItemRecord = {
      streak,
      due: addDays(d, gap),
      last: d,
      misses: (prev?.misses ?? 0) + (correct ? 0 : 1),
    };
    // 試験で落とした印は、次に正解したときに外す(間違えたままなら残す)。
    if (!correct && prev?.examMissed) item.examMissed = true;
    const next: Saved = { items: { ...cur.items, [key]: item } };
    save(next);
    set(next);
  },

  markExamMissed(list) {
    if (list.length === 0) return;
    const cur = get();
    const d = today();
    const tomorrow = addDays(d, 1);
    const items = { ...cur.items };
    for (const key of list) {
      const prev = items[key];
      // すでに今日以前が期日のものは、先送りせずそのまま(印だけ付ける)。
      const due = prev && prev.due < tomorrow ? prev.due : tomorrow;
      items[key] = {
        streak: prev?.streak ?? 0,
        due,
        last: prev?.last ?? d,
        misses: (prev?.misses ?? 0) + 1,
        examMissed: true,
      };
    }
    const next: Saved = { items };
    save(next);
    set(next);
  },

  isDue(key) {
    const it = get().items[key];
    if (!it) return true;            // 一度も解いていない問題は常に対象
    return it.due <= today();
  },

  isCorrect(key) {
    return (get().items[key]?.streak ?? 0) >= CORRECT_STREAK;
  },

  reset() {
    const empty: Saved = { items: {} };
    save(empty);
    set(empty);
  },
}));
