import { Color, PieceType, isPromotedType, PIECE_GLYPH } from "../domain/shogi";

interface PieceViewProps {
  type: PieceType;
  color: Color;
  /** なぞりガイド用の半透明ゴースト表示(移動先プレビュー)。 */
  ghost?: boolean;
  /**
   * 盤を後手側から見ている(反転表示)か。
   * 通常は後手の駒を180°回すが、反転表示では先手の駒の方を回す
   * (見ている側の駒が常に自分に向いて見えるようにするため)。
   */
  flipped?: boolean;
}

/** 五角形+楷書グリフの駒1個分の見た目。後手は180°回転、成駒は朱字。 */
export function PieceView({ type, color, ghost = false, flipped = false }: PieceViewProps) {
  const classes = [
    "koma",
    (flipped ? color === Color.BLACK : color === Color.WHITE) ? "g" : "",
    isPromotedType(type) ? "pr" : "",
    ghost ? "ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} aria-hidden="true">
      <div className="fc">{PIECE_GLYPH[type]}</div>
    </div>
  );
}
