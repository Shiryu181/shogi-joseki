/**
 * tsshogi には「現局面の合法手を一括列挙する」API が無い(Position#createMove +
 * #isValidMove を個別に呼ぶ設計)ため、盤UI用の dests (移動可能マップ) は
 * 自前の総当たりで組み立てる。9x9=81マスなので計算量は無視できるレベル。
 */
import { Color, PieceType, Position, Square, handPieceTypes } from "tsshogi";

/** 盤上の駒を動かす場合の dests。key = 移動元の Square.usi, value = 移動先 Square 一覧 */
export type MoveDests = Map<string, Square[]>;

/** 持ち駒を打つ場合の dests。key = PieceType, value = 打てる Square 一覧 */
export type DropDests = Map<PieceType, Square[]>;

function isLegalDestination(position: Position, from: Square | PieceType, to: Square): boolean {
  const move = position.createMove(from, to);
  if (!move) return false;
  if (position.isValidMove(move)) return true;
  // 不成りが非合法でも、成りなら合法という手(強制成り等)を考慮する
  const promoted = move.withPromote();
  return position.isValidMove(promoted);
}

/** 指定した手番が盤上の駒を動かせる先を全て計算する */
export function computeMoveDests(position: Position, color: Color): MoveDests {
  const dests: MoveDests = new Map();
  for (const from of position.board.listSquaresByColor(color)) {
    const tos: Square[] = [];
    for (const to of Square.all) {
      if (isLegalDestination(position, from, to)) tos.push(to);
    }
    if (tos.length > 0) dests.set(from.usi, tos);
  }
  return dests;
}

/** 指定した手番が持ち駒を打てる先を全て計算する */
export function computeDropDests(position: Position, color: Color): DropDests {
  const dests: DropDests = new Map();
  const hand = position.hand(color);
  for (const pieceType of handPieceTypes) {
    if (hand.count(pieceType) <= 0) continue;
    const tos: Square[] = [];
    for (const to of Square.all) {
      if (isLegalDestination(position, pieceType, to)) tos.push(to);
    }
    if (tos.length > 0) dests.set(pieceType, tos);
  }
  return dests;
}
