import { create } from "zustand";
import { Color, PieceType, Position, Square, createInitialPosition, tryMove } from "../domain/shogi";
import type { DropDests, MoveDests } from "../domain/legalMoves";
import { computeDropDests, computeMoveDests } from "../domain/legalMoves";

export type Selection = { kind: "board"; square: Square } | { kind: "hand"; pieceType: PieceType } | null;

interface SandboxState {
  position: Position;
  selected: Selection;
  moveDests: MoveDests;
  dropDests: DropDests;
  lastMove: { from: Square | null; to: Square } | null;
  lastMoveText: string | null;
  /** 直近の着手が非合法だった場合に短く表示するメッセージ */
  errorFlash: string | null;
  selectSquare: (square: Square) => void;
  selectHand: (pieceType: PieceType, color: Color) => void;
  reset: () => void;
}

function destsFor(position: Position) {
  const color = position.color;
  return {
    moveDests: computeMoveDests(position, color),
    dropDests: computeDropDests(position, color),
  };
}

function initialState() {
  const position = createInitialPosition();
  const { moveDests, dropDests } = destsFor(position);
  return { position, moveDests, dropDests };
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  ...initialState(),
  selected: null,
  lastMove: null,
  lastMoveText: null,
  errorFlash: null,

  selectSquare(square) {
    const { position, selected, moveDests, dropDests } = get();
    const turn = position.color;
    const pieceAtSquare = position.board.at(square);

    if (selected) {
      const destinations =
        selected.kind === "board"
          ? (moveDests.get(selected.square.usi) ?? [])
          : (dropDests.get(selected.pieceType) ?? []);
      const isLegalDest = destinations.some((s) => s.usi === square.usi);

      if (isLegalDest) {
        const cloned = position.clone();
        const from = selected.kind === "board" ? selected.square : selected.pieceType;
        const result = tryMove(cloned, from, square);
        if (result.ok) {
          const next = destsFor(cloned);
          set({
            position: cloned,
            selected: null,
            moveDests: next.moveDests,
            dropDests: next.dropDests,
            lastMove: { to: square, from: selected.kind === "board" ? selected.square : null },
            lastMoveText: result.displayText,
            errorFlash: null,
          });
          return;
        }
      }

      // 合法手ではない: 自分の別の駒を選び直したのか、選択解除かを判定する
      if (pieceAtSquare && pieceAtSquare.color === turn) {
        set({ selected: { kind: "board", square }, errorFlash: null });
        return;
      }
      set({ selected: null });
      return;
    }

    if (pieceAtSquare && pieceAtSquare.color === turn) {
      set({ selected: { kind: "board", square }, errorFlash: null });
    }
  },

  selectHand(pieceType, color) {
    const { position } = get();
    if (position.color !== color) return;
    if (position.hand(color).count(pieceType) <= 0) return;
    set({ selected: { kind: "hand", pieceType }, errorFlash: null });
  },

  reset() {
    const { position, moveDests, dropDests } = initialState();
    set({
      position,
      moveDests,
      dropDests,
      selected: null,
      lastMove: null,
      lastMoveText: null,
      errorFlash: null,
    });
  },
}));
