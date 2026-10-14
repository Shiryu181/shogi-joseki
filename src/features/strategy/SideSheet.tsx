import { useEffect, useRef } from "react";
import { STRATEGIES } from "../../data/strategies";
import { blurbOf } from "../../domain/courseProgress";
import type { Side } from "../../domain/courseProgress";
import "./StrategyPage.css";

export interface SideSheetProps {
  strategyId: string;
  side: Side;
  /** いまの手番の問題数。 */
  total: number;
  counts: { sente: number; gote: number };
  onPick: (side: Side) => void;
  onClose: () => void;
}

/**
 * 戦法と手番のシート(確定版モック 05)。戦法のページの切替ボタンから開く。
 * 手番を選ぶと学習中の手番が切り替わり、シートは閉じる。章が無い手番は選べない。
 */
export function SideSheet({ strategyId, side, total, counts, onPick, onClose }: SideSheetProps) {
  const strategy = STRATEGIES.find((s) => s.id === strategyId);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allRows: { side: Side; mark: string; label: string }[] = [
    { side: "sente", mark: "▲", label: "先手" },
    { side: "gote", mark: "△", label: "後手" },
  ];
  // 章が1つも無い手番は出さない(片方にしか章が無い戦法で、空の手番を選ばせないため)。
  const withChapters = allRows.filter((r) => counts[r.side] > 0);
  const rows = withChapters.length > 0 ? withChapters : allRows;

  return (
    <div className="sheet-layer">
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div className="dojo-panel sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <h2 id="sheet-title" className="sheet-title">戦法と手番</h2>
        <div className="sheet-card">
          <h3>{strategy?.name ?? strategyId}</h3>
          <p>{strategy ? blurbOf(strategy).sheet : ""}</p>
          <span className="sheet-meta">{total}問題</span>
        </div>
        <h3 className="sheet-sub">手番</h3>
        <div className="sheet-radios" role="radiogroup" aria-label="手番">
          {rows.map((r) => {
            const n = counts[r.side];
            const on = r.side === side;
            return (
              <button
                key={r.side}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={n === 0}
                className={`sheet-radio${on ? " is-on" : ""}`}
                onClick={() => onPick(r.side)}
              >
                <span>{r.mark} {r.label}</span>
                <span><span className="sheet-meta">{n}章{on ? " " : ""}</span>{on && <b aria-hidden="true">✓</b>}</span>
              </button>
            );
          })}
        </div>
        <button ref={closeRef} type="button" className="btn-secondary full" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
