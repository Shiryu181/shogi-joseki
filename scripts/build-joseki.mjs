/**
 * 定石コースの JSON を生成する開発用スクリプト。
 *
 * 目的は「人間が USI や SFEN を手書きしないこと」。
 * 手は「駒種 + 移動先」で書き、tsshogi に合法手を総当たりさせて一意に解決する。
 * 候補が複数ある(=どの駒を動かすか曖昧)場合は **黙って選ばずエラーで停止**し、
 * 呼び出し側に from の明示を求める。転記ミスや解釈違いを取りこぼさないため。
 *
 * 使い方: node scripts/build-joseki.mjs
 */
import { writeFileSync } from "node:fs";
import { Position, PieceType, Square, InitialPositionSFEN } from "tsshogi";

const KANJI_RANK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const GLYPH_TO_TYPE = {
  歩: PieceType.PAWN, 香: PieceType.LANCE, 桂: PieceType.KNIGHT, 銀: PieceType.SILVER,
  金: PieceType.GOLD, 角: PieceType.BISHOP, 飛: PieceType.ROOK, 玉: PieceType.KING,
};

/** "7六" → tsshogi の Square */
function sq(label) {
  const file = Number(label[0]);
  const rank = KANJI_RANK[label[1]];
  if (!file || !rank) throw new Error(`マス表記が不正: ${label}`);
  const s = Square.newByXY(9 - file, rank - 1);
  if (!s) throw new Error(`マスを解決できない: ${label}`);
  return s;
}

/**
 * その局面で「piece が to へ動く」合法手を総当たりで探す。一意でなければ例外。
 * 成れる手は spec.promote(true/false)の明示を必須にする。黙って不成を選ぶと
 * 「▲同銀」と「▲同銀成」のような別の手を取り違えても気づけないため。
 */
function resolveMove(position, spec, moveNo) {
  const to = sq(spec.to);
  const type = GLYPH_TO_TYPE[spec.piece];
  if (!type) throw new Error(`${moveNo}手目: 駒種が不正: ${spec.piece}`);

  // 持ち駒を打つ手(例: 相掛かりの △2三歩)。盤上の駒を動かす手とは別扱い。
  if (spec.drop) {
    const move = position.createMove(type, to);
    if (!move || !position.isValidMove(move)) {
      throw new Error(`${moveNo}手目 ${spec.piece}${spec.to}打: 合法な打ちがありません(持ち駒が無い/二歩など)`);
    }
    return move;
  }

  const candidates = [];
  const froms = spec.from
    ? [sq(spec.from)]
    : position.board.listSquaresByColor(position.color);

  for (const from of froms) {
    const piece = position.board.at(from);
    if (!piece || piece.type !== type) continue;
    const plain = position.createMove(from, to);
    if (!plain) continue;
    const plainOk = position.isValidMove(plain);
    const promoted = plain.withPromote();
    const promoteOk = position.isValidMove(promoted);

    if (spec.promote === true) {
      if (promoteOk) candidates.push({ from, move: promoted });
      continue;
    }
    if (spec.promote === false) {
      if (plainOk) candidates.push({ from, move: plain });
      continue;
    }
    // promote 未指定: 成/不成の両方が合法なら、どちらの手か決められないので停止する。
    if (plainOk && promoteOk) {
      throw new Error(
        `${moveNo}手目 ${spec.piece}${spec.to}: 成/不成のどちらも合法です。` +
        `promote: true / false を明示してください`
      );
    }
    if (plainOk) candidates.push({ from, move: plain });
    else if (promoteOk) candidates.push({ from, move: promoted }); // 強制成り
  }

  if (candidates.length === 0) {
    throw new Error(
      `${moveNo}手目 ${spec.piece}${spec.to}: 合法手が見つかりません` +
      (spec.from ? `(from=${spec.from} 指定)` : "") +
      ` — 手順の転記が誤っている可能性があります`
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `${moveNo}手目 ${spec.piece}${spec.to}: 候補が ${candidates.length} 通りあります` +
      `(${candidates.map((c) => c.from.usi).join(", ")})。from を明示してください`
    );
  }
  return candidates[0].move;
}

/**
 * 手のリストからコース JSON を組み立てる。
 * moves[i] = { piece, to, from?, note } / nodeComments[i] = そのノードの局面解説
 */
export function buildCourse({ id, title, myStrategy, opponentStrategy, mySide, source, goalFormation, rootComment, moves }) {
  const position = new Position();
  position.resetBySFEN(InitialPositionSFEN.STANDARD);

  const nodes = [{ id: "n0", sfen: position.sfen, comment: rootComment, branches: [] }];
  const usiList = [];

  moves.forEach((spec, i) => {
    const move = resolveMove(position, spec, i + 1);
    const usi = move.usi;
    usiList.push(usi);
    if (!position.doMove(move)) throw new Error(`${i + 1}手目 ${usi}: 適用に失敗`);

    const child = { id: `n${i + 1}`, sfen: position.sfen, comment: spec.comment, branches: [] };
    nodes[i].branches.push({ usi, kind: "main", note: spec.note, child });
    nodes.push(child);
  });

  const course = {
    id, title, myStrategy, opponentStrategy, mySide, source,
    goalFormation,
    goalSfen: nodes[nodes.length - 1].sfen,
    root: nodes[0],
  };
  return { course, usiList };
}

export function writeCourse(course, usiList) {
  const path = `src/data/joseki/${course.id}.json`;
  writeFileSync(path, JSON.stringify(course, null, 2) + "\n", "utf-8");
  console.log(`  ✓ ${path} (${usiList.length}手)`);
  console.log(`    ${usiList.join(" ")}`);
}
