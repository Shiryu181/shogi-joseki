import { useMemo, useState } from "react";
import { STRATEGIES } from "../../data/strategies";
import { OPPONENTS, courseEntriesFor, courseEntriesForOpponent } from "../../domain/josekiLoader";
import { SearchBar } from "./SearchBar";
import { CategoryTabs } from "./CategoryTabs";
import type { CategoryFilterKey } from "./categories";
import { StrategyCard } from "./StrategyCard";
import type { CardItem } from "./StrategyCard";
import { usePointsStore } from "../../store/pointsStore";
import "./Home.css";

/** ホームの2つの入口。「自分の戦法を学ぶ」と「相手の戦法に備える」。 */
export type HomeMode = "mine" | "opponent";

export interface HomeProps {
  mode: HomeMode;
  /** 「このアプリについて」(ライセンス表記)を開く。 */
  onOpenAbout: () => void;
  /** カードがタップされたときに呼ばれる(コース選択へ進む)。 */
  onOpenCard: (mode: HomeMode, item: CardItem) => void;
}

function matchesCategory(item: CardItem, key: CategoryFilterKey): boolean {
  if (key === "popular") return true;
  if (key === "beginner") return (item.level ?? "").includes("入門");
  return item.category === key;
}

/** 「自分の戦法」タブのカード。コース数は一覧から数える。 */
function myStrategyCards(): CardItem[] {
  return STRATEGIES.map((s) => {
    const n = courseEntriesFor(s.id).length;
    return { ...s, lineCount: n, ready: n > 0 };
  });
}

/** 「相手に備える」タブのカード。対策コースがある相手だけ ready。 */
function opponentCards(): CardItem[] {
  return OPPONENTS.map((o) => {
    const n = courseEntriesForOpponent(o.id).length;
    return { ...o, lineCount: n, ready: n > 0 };
  });
}

const COPY: Record<HomeMode, { title: string; lead: string; placeholder: string }> = {
  mine: {
    title: "自分の戦法",
    lead: "自分が指す戦法を選んで、基本の組み方からその戦法の型・変化までを1手ずつ出題します。",
    placeholder: "戦法名で検索(例:四間飛車)",
  },
  opponent: {
    title: "相手に備える",
    lead: "相手がどの戦法で来るかを選ぶと、その戦法に有利に戦える対策を、おすすめ順に学べます。相手が定跡を外したときの咎め方も出題します。",
    placeholder: "相手の戦法で検索(例:早石田)",
  },
};

/** ホーム画面。DESIGN.md §5.1 準拠。検索・カテゴリ絞り込み・カード一覧。 */
export function Home({ mode, onOpenCard, onOpenAbout }: HomeProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilterKey>("popular");

  const cards = useMemo(() => (mode === "mine" ? myStrategyCards() : opponentCards()), [mode]);

  const list = useMemo(() => {
    const q = query.trim();
    return cards
      .filter((s) => {
        const entries = mode === "mine" ? courseEntriesFor(s.id) : courseEntriesForOpponent(s.id);
        // 戦法名・かなに加えて、そのカードに入っているコース名でも引けるようにする。
        const matchesQuery =
          !q ||
          s.name.includes(q) ||
          s.kana.includes(q) ||
          entries.some((c) => c.label.includes(q) || c.opponentLabel.includes(q));
        return matchesCategory(s, activeCategory) && matchesQuery;
      })
      .sort((a, b) => b.popularity - a.popularity);
  }, [cards, mode, query, activeCategory]);

  const copy = COPY[mode];
  const total = usePointsStore((s) => s.total);
  const today = usePointsStore((s) => s.today);

  return (
    <div className="home-wrap">
      <div className="home-frame">
        <div className="home-head">
          <div className="home-topline">
            <div className="tl">定跡道場</div>
            {/* 正解で貯まるポイント。今日の獲得と累計。 */}
            <div className="home-points" aria-label={`今日 ${today} ポイント、累計 ${total} ポイント`}>
              今日 <b>+{today}</b> ・ 累計 <b>★ {total.toLocaleString()}</b>
            </div>
          </div>
          <h1>{copy.title}</h1>
          <p className="lead">{copy.lead}</p>
          <SearchBar value={query} onChange={setQuery} placeholder={copy.placeholder} />
        </div>
        <CategoryTabs active={activeCategory} onSelect={setActiveCategory} />
        <div className="listcount">{list.length}件の戦法</div>
        <div className="cards">
          {list.length > 0 ? (
            list.map((s) => <StrategyCard key={s.id} item={s} onOpen={(item) => onOpenCard(mode, item)} />)
          ) : (
            <div className="empty">「{query}」に一致する戦法はありません</div>
          )}
        </div>
        <div className="home-foot">
          <button type="button" className="home-about-link" onClick={onOpenAbout}>
            このアプリについて・ライセンス
          </button>
        </div>
      </div>
    </div>
  );
}
