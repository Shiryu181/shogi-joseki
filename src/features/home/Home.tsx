import { useMemo, useState } from "react";
import type { Strategy } from "../../domain/types";
import { STRATEGIES } from "../../data/strategies";
import { SearchBar } from "./SearchBar";
import { CategoryTabs } from "./CategoryTabs";
import type { CategoryFilterKey } from "./categories";
import { StrategyCard } from "./StrategyCard";
import "./Home.css";

export interface HomeProps {
  /** ready な戦法カードがタップされたときに呼ばれる(§5.2 対抗形選択へ進む)。 */
  onOpenStrategy: (strategy: Strategy) => void;
}

function matchesCategory(s: Strategy, key: CategoryFilterKey): boolean {
  if (key === "popular") return true;
  if (key === "beginner") return s.level.includes("入門");
  return s.category === key;
}

/** ホーム(探す)画面。DESIGN.md §5.1 準拠。検索・カテゴリ絞り込み・カード一覧。 */
export function Home({ onOpenStrategy }: HomeProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilterKey>("popular");

  const list = useMemo(() => {
    const q = query.trim();
    return STRATEGIES.filter((s) => {
      const matchesQuery = !q || s.name.includes(q) || s.kana.includes(q);
      return matchesCategory(s, activeCategory) && matchesQuery;
    }).sort((a, b) => b.popularity - a.popularity);
  }, [query, activeCategory]);

  return (
    <div className="home-wrap">
      <div className="home-frame">
        <div className="home-head">
          <div className="tl">JOSEKI DOJO</div>
          <h1>戦法を探す</h1>
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <CategoryTabs active={activeCategory} onSelect={setActiveCategory} />
        <div className="listcount">{list.length}件の戦法</div>
        <div className="cards">
          {list.length > 0 ? (
            list.map((s) => <StrategyCard key={s.id} strategy={s} onOpen={onOpenStrategy} />)
          ) : (
            <div className="empty">「{query}」に一致する戦法はありません</div>
          )}
        </div>
      </div>
    </div>
  );
}
