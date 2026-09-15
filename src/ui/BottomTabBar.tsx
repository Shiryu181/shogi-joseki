import "./BottomTabBar.css";

export type BottomTab = "mine" | "opponent";

export interface BottomTabBarProps {
  /** 現在ハイライトすべきタブ。学習中は、その入口のタブを光らせる。 */
  active: BottomTab | null;
  onSelectMine: () => void;
  onSelectOpponent: () => void;
}

/**
 * 下部タブバー。「自分の戦法」「相手に備える」「保存」の3つ(2026-09 に再編)。
 * 「保存」は v2 以降のため常に非活性 + 「準備中」を明示する
 * (押しても何も起きない、が一番良くないため)。
 */
export function BottomTabBar({ active, onSelectMine, onSelectOpponent }: BottomTabBarProps) {
  return (
    <nav className="bottom-tabbar" aria-label="メインナビゲーション">
      <div className="bottom-tabbar-inner">
        <button type="button" className={`tab${active === "mine" ? " on" : ""}`} onClick={onSelectMine}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l3 3.5-1 13.5H10L9 6.5z" />
          </svg>
          自分の戦法
        </button>

        <button type="button" className={`tab${active === "opponent" ? " on" : ""}`} onClick={onSelectOpponent}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
            <path d="M12 7v5l3 2" />
          </svg>
          相手に備える
        </button>

        <button type="button" className="tab tab-disabled" disabled aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 21C8 18 4 14.5 4 9.5 4 7 6 5 8.3 5c1.5 0 2.8.8 3.7 2 .9-1.2 2.2-2 3.7-2C18 5 20 7 20 9.5c0 5-4 8.5-8 11.5z" />
          </svg>
          保存
          <span className="tab-soon">準備中</span>
        </button>
      </div>
    </nav>
  );
}
