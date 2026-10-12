import type { ReactNode } from "react";
import "./DojoParts.css";

/** 確定版モックの線画アイコン(22px, 線 1.75)。 */
const svgProps = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;

export const ChevronRight = () => (
  <svg className="dj-ic" {...svgProps}><path d="M9 5l7 7-7 7" /></svg>
);
export const ChevronDown = () => (
  <svg className="dj-ic" {...svgProps}><path d="M6 9l6 6 6-6" /></svg>
);
export const GearIcon = () => (
  <svg className="dj-ic" {...svgProps}>
    <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="6.4" />
    <line x1="19" y1="12" x2="21.6" y2="12" /><line x1="16.95" y1="16.95" x2="18.79" y2="18.79" />
    <line x1="12" y1="19" x2="12" y2="21.6" /><line x1="7.05" y1="16.95" x2="5.21" y2="18.79" />
    <line x1="5" y1="12" x2="2.4" y2="12" /><line x1="7.05" y1="7.05" x2="5.21" y2="5.21" />
    <line x1="12" y1="5" x2="12" y2="2.4" /><line x1="16.95" y1="7.05" x2="18.79" y2="5.21" />
  </svg>
);

/** 戦法のアイコン。駒の形に1文字(飛車を振る戦法は「飛」、それ以外は「角」)。 */
export function PieceIcon({ glyph, size = 40 }: { glyph: string; size?: number }) {
  return (
    <svg className="dj-ic dj-ic--mark" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l6.8 4.7L20.5 21.5h-17L5.2 7.2z" />
      <text x="12" y="17" textAnchor="middle" fontSize="10.5" fontWeight="700" stroke="none" fill="currentColor"
        fontFamily="Hiragino Mincho ProN,Yu Mincho,serif">{glyph}</text>
    </svg>
  );
}

/** 看板(上の板)。左に「◀ 戻る」、中央寄せでなく左詰めの題名。 */
export function TopBar({ backLabel, onBack, title }: { backLabel: string; onBack: () => void; title: string }) {
  return (
    <header className="dojo-topbar">
      <button type="button" className="btn-secondary" onClick={onBack}>◀ {backLabel}</button>
      <h1>{title}</h1>
    </header>
  );
}

/** 進み具合の細い棒。ratio は 0〜1。 */
export function Bar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return <div className="dj-bar" role="presentation"><i style={{ width: `${pct}%` }} /></div>;
}

/** 画面の外枠(畳の地)。 */
export function Screen({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`dojo-screen dojo-ground ${className}`.trim()}>{children}</div>;
}
