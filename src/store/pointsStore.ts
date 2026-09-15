import { create } from "zustand";

/**
 * 正解で貯まるポイント。Duolingo のように「解くたびに数字が増える」手応えを作る。
 *
 * 配点(2026-09):
 *   次の一手に一発で正解 +10 / 一度間違えてから正解 +5 / 答えを見た手 0
 *   咎めクイズ(相手のミスを咎める手)の正解 +20
 *
 * 端末の localStorage に累計と「今日の獲得」を保存する。共有もサーバーも無い
 * 個人の記録なので、読めない環境(プライベートモード等)では 0 から始めるだけにする。
 */
const KEY = "joseki-dojo:points:v1";

export const POINTS = {
  bookFirstTry: 10,
  bookAfterMiss: 5,
  punish: 20,
} as const;

interface Saved {
  total: number;
  today: number;
  todayDate: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (typeof s.total === "number") {
        // 日付が変わっていたら「今日」は 0 に戻す
        return s.todayDate === todayStr() ? s : { total: s.total, today: 0, todayDate: todayStr() };
      }
    }
  } catch {
    /* 読めない環境では初期値 */
  }
  return { total: 0, today: 0, todayDate: todayStr() };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できない環境では諦める(表示は続く) */
  }
}

export interface PointsState extends Saved {
  /** 直近に獲得した点(「+10」の表示用)。表示側が消したら null にする。 */
  lastGain: { amount: number; at: number } | null;
  award: (amount: number) => void;
  clearGain: () => void;
}

export const usePointsStore = create<PointsState>((set, get) => ({
  ...load(),
  lastGain: null,
  award(amount) {
    if (amount <= 0) return;
    const cur = get();
    const base = cur.todayDate === todayStr() ? cur : { ...cur, today: 0, todayDate: todayStr() };
    const next: Saved = { total: base.total + amount, today: base.today + amount, todayDate: base.todayDate };
    save(next);
    set({ ...next, lastGain: { amount, at: Date.now() } });
  },
  clearGain() {
    set({ lastGain: null });
  },
}));
