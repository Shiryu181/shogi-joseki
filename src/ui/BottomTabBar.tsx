import "./BottomTabBar.css";

export type BottomTab = "home" | "learn";

export interface BottomTabBarProps {
  /** 現在ハイライトすべきタブ。「探す」系画面(home/matchup) or 「学習」系画面(learn/practice)。 */
  active: BottomTab | null;
  onSelectHome: () => void;
  /** 「学習」タブ:実データのある戦法(居飛車)を学習モードで直接開く。 */
  onSelectLearn: () => void;
}

/**
 * 下部タブバー。DESIGN.md §5.0 準拠(探す/保存/学習/マイ)。
 * 「保存」「マイ」は v2 以降のため常に非活性 + 「準備中」を明示する
 * (押しても何も起きない、が一番良くないため)。
 */
export function BottomTabBar({ active, onSelectHome, onSelectLearn }: BottomTabBarProps) {
  return (
    <nav className="bottom-tabbar" aria-label="メインナビゲーション">
      <div className="bottom-tabbar-inner">
        <button type="button" className={`tab${active === "home" ? " on" : ""}`} onClick={onSelectHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          探す
        </button>

        <button type="button" className="tab tab-disabled" disabled aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 21C8 18 4 14.5 4 9.5 4 7 6 5 8.3 5c1.5 0 2.8.8 3.7 2 .9-1.2 2.2-2 3.7-2C18 5 20 7 20 9.5c0 5-4 8.5-8 11.5z" />
          </svg>
          保存
          <span className="tab-soon">準備中</span>
        </button>

        <button type="button" className={`tab${active === "learn" ? " on" : ""}`} onClick={onSelectLearn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="4" width="16" height="16" rx="1" />
            <path d="M9 4v16M15 4v16M4 9h16M4 15h16" />
          </svg>
          学習
        </button>

        <button type="button" className="tab tab-disabled" disabled aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          マイ
          <span className="tab-soon">準備中</span>
        </button>
      </div>
    </nav>
  );
}
