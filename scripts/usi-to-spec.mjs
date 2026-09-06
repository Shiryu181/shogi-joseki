/**
 * USI の指し手を courses.mjs の指定形式(駒種＋移動先)に書き起こす開発用スクリプト。
 *
 * find-punishments.cjs が出す候補(USI)を人が courses.mjs へ写すとき、
 * 座標や成/不成を手で書き換えると取り違えが起きる。ここで機械的に変換する。
 * build-joseki.mjs と同じく、曖昧さが残る書き方はしない:
 *   - from は常に付ける(同じ駒種が2枚以上動ける局面で取り違えないため)
 *   - 成/不成の両方が合法なら promote を明示する
 *
 * 使い方: node scripts/usi-to-spec.mjs "<SFEN>" <usi> [<usi> ...]
 */
import { Position, PieceType, parseUSIMove } from "tsshogi";

const TYPE_TO_GLYPH = {
  [PieceType.PAWN]: "歩", [PieceType.LANCE]: "香", [PieceType.KNIGHT]: "桂",
  [PieceType.SILVER]: "銀", [PieceType.GOLD]: "金", [PieceType.BISHOP]: "角",
  [PieceType.ROOK]: "飛", [PieceType.KING]: "玉",
  [PieceType.PROM_PAWN]: "歩", [PieceType.PROM_LANCE]: "香", [PieceType.PROM_KNIGHT]: "桂",
  [PieceType.PROM_SILVER]: "銀", [PieceType.HORSE]: "角", [PieceType.DRAGON]: "飛",
};
const RANK_KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const label = (square) => `${9 - square.x}${RANK_KANJI[square.y]}`;

const [sfen, ...usiList] = process.argv.slice(2);
if (!sfen || usiList.length === 0) {
  console.error('使い方: node scripts/usi-to-spec.mjs "<SFEN>" <usi> [<usi> ...]');
  process.exit(1);
}

const position = new Position();
if (!position.resetBySFEN(sfen)) {
  console.error("SFEN を読めません");
  process.exit(1);
}

for (const usi of usiList) {
  const parsed = parseUSIMove(usi);
  if (!parsed) { console.error(`USI が不正: ${usi}`); process.exit(1); }

  // 打つ手(from が駒種)と盤上の手で書き方が変わる。
  if (!(typeof parsed.from === "object" && "x" in parsed.from)) {
    const move = position.createMove(parsed.from, parsed.to);
    if (!move || !position.isValidMove(move) || !position.doMove(move)) {
      console.error(`合法でない打ち: ${usi}`); process.exit(1);
    }
    console.log(`{ piece:"${TYPE_TO_GLYPH[parsed.from]}", to:"${label(parsed.to)}", drop:true, note:"" },`);
    continue;
  }

  const piece = position.board.at(parsed.from);
  if (!piece) { console.error(`移動元に駒がありません: ${usi}`); process.exit(1); }
  const plain = position.createMove(parsed.from, parsed.to);
  if (!plain) { console.error(`手を作れません: ${usi}`); process.exit(1); }
  const promoted = plain.withPromote();
  const plainOk = position.isValidMove(plain);
  const promoteOk = position.isValidMove(promoted);
  const move = parsed.promote ? promoted : plain;
  if (!position.isValidMove(move)) { console.error(`合法でない手: ${usi}`); process.exit(1); }

  // 成/不成の両方が合法なときだけ promote を書く(build-joseki.mjs が明示を要求する)。
  const promoteField = plainOk && promoteOk ? `, promote:${parsed.promote ? "true" : "false"}` : "";
  console.log(
    `{ piece:"${TYPE_TO_GLYPH[piece.type]}", to:"${label(parsed.to)}", from:"${label(parsed.from)}"${promoteField}, note:"" },`,
  );
  if (!position.doMove(move)) { console.error(`適用できません: ${usi}`); process.exit(1); }
}
