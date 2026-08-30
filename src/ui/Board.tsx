import { useMemo } from "react";
import { Color, PieceType, Position, Square, boardGrid, handCounts, promotedPieceType } from "../domain/shogi";
import { PieceView } from "./Piece";
import "./Board.css";

const FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const RANKS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export interface GhostPiece {
  /** ゴーストを表示する升(usi) */
  key: string;
  type: PieceType;
  color: Color;
}

export interface HandHighlight {
  type: PieceType;
  color: Color;
}

/**
 * 成/不成の選択UI(off-script用)。指定時のみ盤上に小さなオーバーレイを出す。
 * 未指定(undefined/null)なら見た目・挙動は一切変わらない(Learn/Sandboxは無関係)。
 */
export interface PromotionChoice {
  /** 選択対象の駒種(不成のまま)。 */
  pieceType: PieceType;
  color: Color;
}

export interface BoardProps {
  position: Position;
  /** 'from' 強調を出す升(usi)。持ち駒からの手なら null。 */
  fromKey?: string | null;
  /** 'from' 強調を出す持ち駒(打ちの手のとき)。 */
  fromHand?: HandHighlight | null;
  /** 'glow' 強調(なぞりガイド/合法手ハイライト)を出す升の集合。 */
  glowKeys?: Set<string>;
  /** 'last'(直前の手)強調を出す升の集合。 */
  lastKeys?: Set<string>;
  /** なぞりガイド用の半透明ゴースト駒(移動先にうっすら表示)。 */
  ghost?: GhostPiece | null;
  /** 盤の升をクリックしたときのコールバック。 */
  onSquareClick: (square: Square) => void;
  /** 持ち駒トレイの駒をクリックしたときのコールバック。 */
  onHandPieceClick: (type: PieceType, color: Color) => void;
  /** 持ち駒トレイでクリック可能(選択可能)にする色。指定が無ければ両方クリック可能(Sandbox用)。 */
  clickableHandColor?: Color | "both" | "none";
  /** 成/不成の選択UI。指定時のみ盤上にオーバーレイ表示する(off-script用・追加のみ)。 */
  promotionChoice?: PromotionChoice | null;
  /** 選択UIで「成る」「不成」いずれかが押されたときのコールバック。 */
  onPromotionChoice?: (promote: boolean) => void;
  /**
   * 盤を後手側から見た向きで描く。後手番のコース(mySide:"gote")で使う。
   * 升の並び・筋/段のラベル・持ち駒トレイの上下・駒の向きがすべて反転する。
   * 未指定なら従来どおり先手視点(既存の呼び出しは無影響)。
   */
  flipped?: boolean;
}

function HandTray({
  position,
  color,
  label,
  selected,
  onHandPieceClick,
  clickable,
  flipped,
}: {
  position: Position;
  color: Color;
  label: string;
  selected: HandHighlight | null | undefined;
  onHandPieceClick: (type: PieceType, color: Color) => void;
  clickable: boolean;
  flipped: boolean;
}) {
  const pieces = handCounts(position, color);

  return (
    <div className="tray">
      <span className="tl">{label}</span>
      {pieces.map(({ type, count }) => {
        const isSelected = !!selected && selected.type === type && selected.color === color;
        return (
          <button
            key={type}
            type="button"
            className={`handpiece${isSelected ? " selected" : ""}`}
            disabled={!clickable}
            onClick={() => onHandPieceClick(type, color)}
            aria-label={`持ち駒 ${type} ${count}枚`}
          >
            {count > 1 && <span className="capn">{count}</span>}
            <PieceView type={type} color={color} flipped={flipped} />
          </button>
        );
      })}
    </div>
  );
}

export function Board({
  position,
  fromKey = null,
  fromHand = null,
  glowKeys,
  lastKeys,
  ghost = null,
  onSquareClick,
  onHandPieceClick,
  clickableHandColor = "both",
  promotionChoice = null,
  onPromotionChoice,
  flipped = false,
}: BoardProps) {
  const grid = useMemo(() => boardGrid(position), [position]);
  const glow = glowKeys ?? EMPTY_SET;
  const last = lastKeys ?? EMPTY_SET;
  // 描画順だけを反転させ、升の座標(Square)は常に実際の値を使う。
  // こうすることで、クリック処理や強調表示のロジックは反転を意識しなくてよい。
  const order = flipped ? REVERSED_ORDER : NORMAL_ORDER;
  const fileLabels = flipped ? REVERSED_FILES : FILES;
  const rankLabels = flipped ? REVERSED_RANKS : RANKS;

  return (
    <div className="board-panel">
      <HandTray
        position={position}
        color={flipped ? Color.BLACK : Color.WHITE}
        label={flipped ? "▲持駒" : "△持駒"}
        selected={fromHand}
        onHandPieceClick={onHandPieceClick}
        clickable={
          clickableHandColor === "both" || clickableHandColor === (flipped ? Color.BLACK : Color.WHITE)
        }
        flipped={flipped}
      />
      <div className="board-block">
        <div className="files">
          {fileLabels.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
        <div className="brow">
          <div className="board">
            {order.map((y) =>
              order.map((x) => {
                const piece = grid[y][x];
                const square = Square.newByXY(x, y);
                const key = square.usi;
                const showGhost = !piece && ghost && ghost.key === key;
                const classes = [
                  "cell",
                  last.has(key) ? "last" : "",
                  fromKey === key ? "from" : "",
                  glow.has(key) ? "glow" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={key}
                    type="button"
                    className={classes}
                    onClick={() => onSquareClick(square)}
                    aria-label={`${FILES[x]}${RANKS[y]}`}
                  >
                    {piece && <PieceView type={piece.type} color={piece.color} flipped={flipped} />}
                    {showGhost && <PieceView type={ghost.type} color={ghost.color} ghost flipped={flipped} />}
                  </button>
                );
              }),
            )}
          </div>
          <div className="ranks">
            {rankLabels.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </div>
        {promotionChoice && onPromotionChoice && (
          <div className="promo-overlay" role="dialog" aria-label="成りますか">
            <div className="promo-panel">
              <div className="promo-title">成りますか?</div>
              <div className="promo-pieces">
                <button type="button" className="promo-btn" onClick={() => onPromotionChoice(true)}>
                  <PieceView type={promotedPieceType(promotionChoice.pieceType)} color={promotionChoice.color} />
                  <span>成る</span>
                </button>
                <button type="button" className="promo-btn" onClick={() => onPromotionChoice(false)}>
                  <PieceView type={promotionChoice.pieceType} color={promotionChoice.color} />
                  <span>不成</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <HandTray
        position={position}
        color={flipped ? Color.WHITE : Color.BLACK}
        label={flipped ? "△持駒" : "▲持駒"}
        selected={fromHand}
        onHandPieceClick={onHandPieceClick}
        clickable={
          clickableHandColor === "both" || clickableHandColor === (flipped ? Color.WHITE : Color.BLACK)
        }
        flipped={flipped}
      />
    </div>
  );
}

const EMPTY_SET: Set<string> = new Set();

/** 盤の描画順(0..8)。反転時は逆順に走査して、座標計算はそのまま使う。 */
const NORMAL_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const REVERSED_ORDER = [8, 7, 6, 5, 4, 3, 2, 1, 0];
const REVERSED_FILES = [...FILES].reverse();
const REVERSED_RANKS = [...RANKS].reverse();
