import { create } from "zustand";

/**
 * 学習の記録。どの問題をいつ正解したか、次にいつ出すかを端末に保存する。
 *
 * なぜ必要か: これまで保存していたのは累計ポイントだけで、どの手を覚えたかが
 * 残らなかった。そのため2周目も1周目と同じ258手をなぞり直すことになり、
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

/** 連続2回正解で「覚えた」とみなす。章の達成率はこの数で数える。 */
export const LEARNED_STREAK = 2;

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
}

interface Saved {
  items: Record<string, ItemRecord>;
  /** 学習した日(YYYY-MM-DD)の並び。連続日数の計算に使う。新しい順。 */
  days: string[];
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
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s && typeof s === "object" && s.items) return { items: s.items, days: s.days ?? [] };
    }
  } catch {
    /* 読めない環境(プライベートモード等)では記録なしで始める */
  }
  return { items: {}, days: [] };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても学習は続けられるようにする */
  }
}

/**
 * 連続日数。今日か昨日から遡って、日付が途切れるまで数える。
 * 「今日まだ学習していない」場合でも、昨日やっていれば連続は途切れていないので
 * 昨日を起点にも数える(その日のうちに再開できる猶予を持たせる)。
 */
export function streakDays(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  const start = set.has(today()) ? today() : addDays(today(), -1);
  if (!set.has(start)) return 0;
  let n = 0;
  let cur = start;
  while (set.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

export interface ProgressState extends Saved {
  /** 1問を解いた結果を記録する。sharp は急所かどうか(間隔を短くする)。 */
  record: (key: string, correct: boolean, sharp: boolean) => void;
  /** その問題が今日出題対象か(未学習 or 期日が来ている)。 */
  isDue: (key: string) => boolean;
  /** 覚えた(連続 LEARNED_STREAK 回正解)かどうか。 */
  isLearned: (key: string) => boolean;
  /** 連続学習日数。 */
  streak: () => number;
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
    const days = cur.days.includes(d) ? cur.days : [d, ...cur.days].slice(0, 400);
    const next: Saved = { items: { ...cur.items, [key]: item }, days };
    save(next);
    set(next);
  },

  isDue(key) {
    const it = get().items[key];
    if (!it) return true;            // 一度も解いていない問題は常に対象
    return it.due <= today();
  },

  isLearned(key) {
    return (get().items[key]?.streak ?? 0) >= LEARNED_STREAK;
  },

  streak() {
    return streakDays(get().days);
  },

  reset() {
    const empty: Saved = { items: {}, days: [] };
    save(empty);
    set(empty);
  },
}));
