import { CATEGORY_TABS } from "./categories";
import type { CategoryFilterKey } from "./categories";

export interface CategoryTabsProps {
  active: CategoryFilterKey;
  onSelect: (key: CategoryFilterKey) => void;
}

/** ホーム画面(§5.1)のカテゴリ横スクロール。 */
export function CategoryTabs({ active, onSelect }: CategoryTabsProps) {
  return (
    <div className="cats">
      {CATEGORY_TABS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`cat${c.key === active ? " on" : ""}`}
          onClick={() => onSelect(c.key)}
          aria-pressed={c.key === active}
        >
          <span className="ci">{c.glyph}</span>
          {c.label}
        </button>
      ))}
    </div>
  );
}
