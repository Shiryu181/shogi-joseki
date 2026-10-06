import { create } from "zustand";

/**
 * アプリの設定。いまはテーマだけ。端末の localStorage に保存する。
 *
 * "auto" は OS の設定に従う(tokens.css の prefers-color-scheme が効く)。
 * "light" / "dark" は :root の data-theme で上書きする。
 */
const KEY = "joseki-dojo:settings:v1";

export type Theme = "auto" | "light" | "dark";

interface Saved {
  theme: Theme;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s && (s.theme === "auto" || s.theme === "light" || s.theme === "dark")) return s;
    }
  } catch {
    /* 読めない環境では既定値 */
  }
  return { theme: "auto" };
}

/** :root に data-theme を反映する。"auto" のときは属性を外して OS 設定に任せる。 */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

export interface SettingsState extends Saved {
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...load(),
  setTheme(theme) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme }));
    } catch {
      /* 保存できなくても見た目は切り替える */
    }
    applyTheme(theme);
    set({ theme });
  },
}));
