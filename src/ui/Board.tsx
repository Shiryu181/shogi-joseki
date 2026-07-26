import { useMemo } from "react";
import { Color, Square, boardGrid, handCounts } from "../domain/shogi";
import { useSandboxStore } from "../store/sandboxStore";
import { PieceView } from "./Piece";
import "./Board.css";

const FILES = ["9", "8", "7", "6", "5", "4", "3", "2", "1"];
const RANKS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function HandTray({ color, label }: { color: Color; label: string }) {
  const position = useSandboxStore((s) => s.position);
  const selected = useSandboxStore((s) => s.selected);
  const selectHand = useSandboxStore((s) => s.selectHand);
  const pieces = handCounts(position, color);
  const isTurn = position.color === color;

  return (
    <div className="tray">
      <span className="tl">{label}</span>
      {pieces.map(({ type, count }) => {
        const isSelected = selected?.kind === "hand" && selected.pieceType === type && isTurn;
        return (
          <button
            key={type}
            type="button"
            className={`handpiece${isSelected ? " selected" : ""}`}
            disabled={!isTurn}
            onClick={() => selectHand(type, color)}
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

export function Board() {
  const position = useSandboxStore((s) => s.position);
  const selected = useSandboxStore((s) => s.selected);
  const moveDests = useSandboxStore((s) => s.moveDests);
  const dropDests = useSandboxStore((s) => s.dropDests);
  const lastMove = useSandboxStore((s) => s.lastMove);
  const selectSquare = useSandboxStore((s) => s.selectSquare);

  const grid = useMemo(() => boardGrid(position), [position]);

  const glowTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    const dests =
      selected.kind === "board"
        ? (moveDests.get(selected.square.usi) ?? [])
        : (dropDests.get(selected.pieceType) ?? []);
    return new Set(dests.map((s) => s.usi));
  }, [selected, moveDests, dropDests]);

  const fromKey = selected?.kind === "board" ? selected.square.usi : null;
  const lastKeys = useMemo(() => {
    const keys = new Set<string>();
    if (lastMove) {
      keys.add(lastMove.to.usi);
      if (lastMove.from) keys.add(lastMove.from.usi);
    }
    return keys;
  }, [lastMove]);

  return (
    <div className="board-panel">
      <HandTray color={Color.WHITE} label="△持駒" />
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
                const classes = [
                  "cell",
                  lastKeys.has(key) ? "last" : "",
                  fromKey === key ? "from" : "",
                  glowTargets.has(key) ? "glow" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={key}
                    type="button"
                    className={classes}
                    onClick={() => selectSquare(square)}
                    aria-label={`${FILES[x]}${RANKS[y]}`}
                  >
                    {piece && <PieceView type={piece.type} color={piece.color} />}
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
      <HandTray color={Color.BLACK} label="▲持駒" />
    </div>
  );
}
