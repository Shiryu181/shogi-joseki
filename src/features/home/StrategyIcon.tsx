import type { StrategyVisual } from "./strategyVisuals";

/** 1升の大きさ(SVG座標)。9升＋余白で viewBox を組む。 */
const CELL = 10;
const PAD = 1;
const SIZE = CELL * 9 + PAD * 2;

/**
 * 戦法カード用のミニ盤アイコン。
 * 9×9の枠に、その戦法を象徴する駒だけを置く(飛車を振った筋・玉の囲いの位置など)。
 * 駒は五角形のシルエット＋文字で描き、主役の駒は色を強める。
 */
export function StrategyIcon({ visual }: { visual: StrategyVisual }) {
  const x = (file: number) => PAD + (9 - file) * CELL;
  const y = (rank: number) => PAD + (rank - 1) * CELL;
  return (
    <svg className="sicon" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      {visual.accentFile && (
        <rect x={x(visual.accentFile)} y={PAD} width={CELL} height={CELL * 9} className="sicon-file" />
      )}
      {/* 升目の線 */}
      {Array.from({ length: 10 }, (_, i) => (
        <g key={i}>
          <line x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={PAD + CELL * 9} className="sicon-line" />
          <line x1={PAD} y1={PAD + i * CELL} x2={PAD + CELL * 9} y2={PAD + i * CELL} className="sicon-line" />
        </g>
      ))}
      {visual.pieces.map((p) => {
        const cx = x(p.file) + CELL / 2;
        const top = y(p.rank) + 0.8;
        const w = CELL * 0.82;
        const h = CELL * 0.86;
        // 五角形(将棋の駒の形)。上が尖っている。
        const pts = [
          [cx, top],
          [cx + w * 0.38, top + h * 0.26],
          [cx + w * 0.46, top + h],
          [cx - w * 0.46, top + h],
          [cx - w * 0.38, top + h * 0.26],
        ]
          .map((q) => q.join(","))
          .join(" ");
        return (
          <g key={`${p.file}${p.rank}`} className={p.accent ? "sicon-piece accent" : "sicon-piece"}>
            <polygon points={pts} />
            <text x={cx} y={top + h * 0.74} textAnchor="middle">
              {p.glyph}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
