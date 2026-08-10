/**
 * tsshogi の薄いラッパ。
 * 局面生成・SFEN入出力・指し手適用・USI↔表示テキスト変換をここに集約する。
 */
import {
  Color,
  InitialPositionSFEN,
  Move,
  Piece,
  PieceType,
  Position,
  Square,
  formatMove,
  parseUSIMove,
} from "tsshogi";

export { Color, PieceType, Square, Move, Position, formatMove, parseUSIMove };
export type { Piece };

/** 駒種→表示グリフ(楷書1文字)。mockup.html の GLYPH 定義を tsshogi の PieceType に合わせて踏襲。 */
export const PIECE_GLYPH: Record<PieceType, string> = {
  [PieceType.PAWN]: "歩",
  [PieceType.LANCE]: "香",
  [PieceType.KNIGHT]: "桂",
  [PieceType.SILVER]: "銀",
  [PieceType.GOLD]: "金",
  [PieceType.BISHOP]: "角",
  [PieceType.ROOK]: "飛",
  [PieceType.KING]: "玉",
  [PieceType.PROM_PAWN]: "と",
  [PieceType.PROM_LANCE]: "杏",
  [PieceType.PROM_KNIGHT]: "圭",
  [PieceType.PROM_SILVER]: "全",
  [PieceType.HORSE]: "馬",
  [PieceType.DRAGON]: "龍",
};

/** 成駒かどうか(朱字表示の判定に使う) */
export function isPromotedType(type: PieceType): boolean {
  return (
    type === PieceType.PROM_PAWN ||
    type === PieceType.PROM_LANCE ||
    type === PieceType.PROM_KNIGHT ||
    type === PieceType.PROM_SILVER ||
    type === PieceType.HORSE ||
    type === PieceType.DRAGON
  );
}

/** 初期局面(平手)を生成する */
export function createInitialPosition(): Position {
  const position = new Position();
  position.resetBySFEN(InitialPositionSFEN.STANDARD);
  return position;
}

/**
 * 盤面を [rank(0=一段目)][file(0=9筋)] の 9x9 配列として取得する。
 * tsshogi の Square.newByXY(x, y) は x=0 が9筋、y=0 が一段目に対応するため、
 * mockup.html の FILES(['9'..'1']) / RANKS(['一'..'九']) の並びとそのまま一致する。
 */
export function boardGrid(position: Position): (Piece | null)[][] {
  const grid: (Piece | null)[][] = [];
  for (let y = 0; y < 9; y++) {
    const row: (Piece | null)[] = [];
    for (let x = 0; x < 9; x++) {
      row.push(position.board.at(Square.newByXY(x, y)));
    }
    grid.push(row);
  }
  return grid;
}

/** 指定した手番の持ち駒を、枚数0のものを除いて返す */
export function handCounts(position: Position, color: Color): { type: PieceType; count: number }[] {
  return position.hand(color).counts.filter((c) => c.count > 0);
}

/**
 * 指定升への指し手を生成し、必要なら自動で成りを補完して適用する。
 * - 不成りが合法ならそのまま適用(Phase 0 では成り選択ダイアログを実装しないため)。
 * - 不成りが非合法(例: 歩・香・桂が最終段に到達し成るしかない)場合のみ自動で成る。
 * 戻り値: 適用できた場合は { ok: true, move, displayText }、できない場合は { ok: false }。
 */
export function tryMove(
  position: Position,
  from: Square | PieceType,
  to: Square,
): { ok: true; move: Move; displayText: string } | { ok: false } {
  let move = position.createMove(from, to);
  if (!move) return { ok: false };

  if (!position.isValidMove(move)) {
    const promoted = move.withPromote();
    if (position.isValidMove(promoted)) {
      move = promoted;
    } else {
      return { ok: false };
    }
  }

  // formatMove は「指し手の直前の局面」を要求するため、doMove の前に呼ぶ。
  const displayText = formatMove(position, move);
  const applied = position.doMove(move);
  if (!applied) return { ok: false };

  return { ok: true, move, displayText };
}

/** Square/PieceType を dests のキーとして使う一意な文字列に変換する */
export function squareKey(square: Square): string {
  return square.usi;
}

/** USI文字列から Move と、その表示テキスト(▲２六歩 等)をまとめて取得する(学習モードの手表示用)。 */
export function moveFromUSI(position: Position, usi: string): { move: Move; displayText: string } | null {
  const move = position.createMoveByUSI(usi);
  if (!move) return null;
  return { move, displayText: formatMove(position, move) };
}

/**
 * 指定局面(不変)に USI 形式の手を1つ適用し、適用後の SFEN と表示テキストを返す。
 * 元の position は変更しない(内部で clone する)。practiceStore がユーザーの手と
 * 定石手を並べてエンジン評価する(A/B比較)ために使う。
 */
export function applyUsiMove(position: Position, usi: string): { sfenAfter: string; displayText: string } | null {
  const cloned = position.clone();
  const parsed = moveFromUSI(cloned, usi);
  if (!parsed) return null;
  const applied = cloned.doMove(parsed.move);
  if (!applied) return null;
  return { sfenAfter: cloned.sfen, displayText: parsed.displayText };
}
