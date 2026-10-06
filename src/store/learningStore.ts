import { create } from "zustand";

/**
 * いま学んでいる戦法と手番。ホームの「学習中」と復習の対象を決める。
 *
 * 戦法カードで手番を選ぶたびにここへ保存し、次にホームを開いたときは
 * その手番の章が出る。先手と後手を別カードに分けると同じ戦法が2枚並んで
 * 分かりにくくなるため、1枚のカードの中で手番を選ぶ形にしている。
 */
const KEY = "joseki-dojo:learning:v1";

export interface Learning {
  strategyId: string;
  side: "sente" | "gote";
}

/** まだ何も選んでいないときの既定。いま公開しているのは中飛車だけ。 */
const DEFAULT: Learning = { strategyId: "gokigen", side: "gote" };

function load(): Learning {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Learning;
      if (s && typeof s.strategyId === "string" && (s.side === "sente" || s.side === "gote")) return s;
    }
  } catch {
    /* 読めない環境では既定値 */
  }
  return DEFAULT;
}

export interface LearningState extends Learning {
  select: (strategyId: string, side: "sente" | "gote") => void;
}

export const useLearningStore = create<LearningState>((set) => ({
  ...load(),
  select(strategyId, side) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ strategyId, side }));
    } catch {
      /* 保存できなくてもその場の学習は続けられる */
    }
    set({ strategyId, side });
  },
}));
