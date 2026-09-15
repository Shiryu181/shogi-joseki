import type { Category } from "../../domain/types";
import { visualFor } from "./strategyVisuals";
import { StrategyIcon } from "./StrategyIcon";

const CATEGORY_LABEL: Record<Category, string> = {
  ibisha: "居飛車",
  furibisha: "振り飛車",
  nakabisha: "中飛車",
  kishu: "奇襲戦法",
};

/**
 * ホームのカード1枚ぶんの表示データ。
 * 「自分の戦法」(Strategy)と「相手に備える」(Opponent)のどちらも同じ見た目で出すので、
 * 共通の形にしてから渡す。lineCount / ready はコース一覧から算出した値。
 */
export interface CardItem {
  id: string;
  name: string;
  kana: string;
  category: Category;
  popularity: number;
  level?: string;
  description: string;
  lineCount: number;
  ready: boolean;
}

export interface StrategyCardProps {
  item: CardItem;
  onOpen: (item: CardItem) => void;
}

/**
 * 戦法カード(§5.1)。ready のものだけタップで先へ進める。
 * ready:false は準備中オーバーレイを出し、クリックしても何も起きない
 * (「選べないものを選べるように見せない」ため、onOpen 自体を割り当てない)。
 */
export function StrategyCard({ item, onOpen }: StrategyCardProps) {
  const visual = visualFor(item.id);

  return (
    <div
      className={`lcard${item.ready ? "" : " disabled"}`}
      role={item.ready ? "button" : undefined}
      tabIndex={item.ready ? 0 : undefined}
      onClick={item.ready ? () => onOpen(item) : undefined}
      onKeyDown={
        item.ready
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(item);
              }
            }
          : undefined
      }
    >
      <div className="hero" style={{ background: visual.heroColor }}>
        <StrategyIcon visual={visual} />
        <div className="fam">{CATEGORY_LABEL[item.category]}</div>
        {!item.ready && <div className="soon">準備中</div>}
      </div>
      <div className="lmeta">
        <div className="r1">
          <h3>{item.name}</h3>
          <div className="rate">
            <span className="st">★</span> {item.popularity.toFixed(1)}
          </div>
        </div>
        <div className="kana">{item.kana}</div>
        <p className="desc">{item.description}</p>
        {item.ready ? (
          <div className="sub">
            <b>{item.lineCount}</b> コース{item.level ? ` ・ 難易度 ${item.level}` : ""}
          </div>
        ) : (
          <div className="sub">定跡データ準備中{item.level ? ` ・ ${item.level}` : ""}</div>
        )}
      </div>
    </div>
  );
}
