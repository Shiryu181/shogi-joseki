import { Color, PieceType, isPromotedType, PIECE_GLYPH } from "../domain/shogi";

interface PieceViewProps {
  type: PieceType;
  color: Color;
}

/** 五角形+楷書グリフの駒1個分の見た目。後手は180°回転、成駒は朱字。 */
export function PieceView({ type, color }: PieceViewProps) {
  const classes = ["koma", color === Color.WHITE ? "g" : "", isPromotedType(type) ? "pr" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-hidden="true">
      <div className="fc">{PIECE_GLYPH[type]}</div>
    </div>
  );
}
