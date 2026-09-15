import type { CardItem } from "../home/StrategyCard";
import type { HomeMode } from "../home/Home";
import { pathSidesFor } from "../../domain/josekiLoader";
import "./Matchup.css";

export interface SidePickProps {
  mode: HomeMode;
  item: CardItem;
  onBack: () => void;
  onPick: (side: "sente" | "gote") => void;
}

/**
 * 戦法を選んだ直後に、先手で学ぶか後手で学ぶかを選ぶ。
 * 先手と後手は別の学習パス(章の並び)になるので、ここで分ける。
 * 片方しか無い戦法では、その側だけ押せる。
 */
export function SidePick({ mode, item, onBack, onPick }: SidePickProps) {
  const sides = pathSidesFor(mode, item.id);
  return (
    <div className="matchup-wrap">
      <div className="matchup-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <h2>{mode === "mine" ? item.name : `相手が${item.name}`}</h2>
            <div className="as">手番を選ぶ</div>
          </div>
        </div>
        <div className="mbody">
          <div className="vshero">
            <div className="vs">
              {mode === "mine" ? item.name : `vs ${item.name}`}
              <small>{item.description}</small>
            </div>
          </div>
          <div className="fld">
            <h4>自分の手番</h4>
            <div className="sidepick">
              {(["sente", "gote"] as const).map((side) => {
                const n = side === "sente" ? sides.sente : sides.gote;
                const label = side === "sente" ? "▲ 先手で学ぶ" : "△ 後手で学ぶ";
                if (n === 0) {
                  return (
                    <div key={side} className="opt disabled sidebtn">
                      {label} <span className="mini">準備中</span>
                    </div>
                  );
                }
                return (
                  <button key={side} type="button" className="opt sidebtn" onClick={() => onPick(side)}>
                    <span className="sidebtn-main">{label}</span>
                    <span className="sidebtn-sub">{n}章 ・ 基本の組み方から仕掛け、咎め方まで</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
