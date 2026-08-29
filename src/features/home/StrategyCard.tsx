import type { Strategy } from "../../domain/types";
import { visualFor } from "./strategyVisuals";

const CATEGORY_LABEL: Record<Strategy["category"], string> = {
  ibisha: "居飛車",
  furibisha: "振り飛車",
  nakabisha: "中飛車",
  kishu: "奇襲戦法",
};

export interface StrategyCardProps {
  strategy: Strategy;
  onOpen: (strategy: Strategy) => void;
}

/**
 * Airbnb風の戦法カード(§5.1)。ready の戦法だけタップで対抗形選択(§5.2)へ進める。
 * ready:false は準備中オーバーレイを出し、クリックしても何も起きない
 * (「選べないものを選べるように見せない」ため、onOpen 自体を割り当てない)。
 */
export function StrategyCard({ strategy, onOpen }: StrategyCardProps) {
  const visual = visualFor(strategy.id);

  return (
    <div
      className={`lcard${strategy.ready ? "" : " disabled"}`}
      role={strategy.ready ? "button" : undefined}
      tabIndex={strategy.ready ? 0 : undefined}
      onClick={strategy.ready ? () => onOpen(strategy) : undefined}
      onKeyDown={
        strategy.ready
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(strategy);
              }
            }
          : undefined
      }
    >
      <div className="hero" style={{ background: visual.heroColor }}>
        <div className="grid9" aria-hidden="true" />
        <div className="glyph" aria-hidden="true">
          {visual.glyph}
        </div>
        <div className="fam">{CATEGORY_LABEL[strategy.category]}</div>
        {!strategy.ready && <div className="soon">準備中</div>}
      </div>
      <div className="lmeta">
        <div className="r1">
          <h3>{strategy.name}</h3>
          <div className="rate">
            <span className="st">★</span> {strategy.popularity.toFixed(1)}
          </div>
        </div>
        <div className="kana">{strategy.kana}</div>
        <p className="desc">{strategy.description}</p>
        {strategy.ready ? (
          <div className="sub">
            <b>{strategy.lineCount}</b> ライン ・ 難易度 {strategy.level}
          </div>
        ) : (
          <div className="sub">定石データ準備中 ・ {strategy.level}</div>
        )}
      </div>
    </div>
  );
}
