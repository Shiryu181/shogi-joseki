import { useMemo } from "react";
import { Color, PieceType, Position, Square, boardGrid, handCounts } from "../domain/shogi";
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
}

function HandTray({
  position,
  color,
  label,
  selected,
  onHandPieceClick,
  clickable,
}: {
  position: Position;
  color: Color;
  label: string;
  selected: HandHighlight | null | undefined;
  onHandPieceClick: (type: PieceType, color: Color) => void;
  clickable: boolean;
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
            <PieceView type={type} color={color} />
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
}: BoardProps) {
  const grid = useMemo(() => boardGrid(position), [position]);
  const glow = glowKeys ?? EMPTY_SET;
  const last = lastKeys ?? EMPTY_SET;

  return (
    <div className="board-panel">
      <HandTray
        position={position}
        color={Color.WHITE}
        label="△持駒"
        selected={fromHand}
        onHandPieceClick={onHandPieceClick}
        clickable={clickableHandColor === "both" || clickableHandColor === Color.WHITE}
      />
      <div className="board-block">
        <div className="files">
          {FILES.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
        <div className="brow">
          <div className="board">
            {grid.map((row, y) =>
              row.map((piece, x) => {
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
                    {piece && <PieceView type={piece.type} color={piece.color} />}
                    {showGhost && <PieceView type={ghost.type} color={ghost.color} ghost />}
                  </button>
                );
              }),
            )}
          </div>
          <div className="ranks">
            {RANKS.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </div>
      </div>
      <HandTray
        position={position}
        color={Color.BLACK}
        label="▲持駒"
        selected={fromHand}
        onHandPieceClick={onHandPieceClick}
        clickable={clickableHandColor === "both" || clickableHandColor === Color.BLACK}
      />
    </div>
  );
}

const EMPTY_SET: Set<string> = new Set();
