/**
 * 既存コースの棋譜を「手番を入れ替えた棋譜」へ機械的に変換する開発用ツール。
 *
 * なぜ必要か: 対抗形(振り飛車 vs 居飛車)の定跡は、慣習として必ず「居飛車=先手」で
 * 公開されており、先手振り飛車の駒組み手順を載せた資料が見つからなかった。
 * そこで検証済みの棋譜から導出する。手順を人間が発明しないのが要点。
 *
 * 変換の規則(2つだけ):
 *   1. 盤面を180度反転する(筋 f → 10-f、段 r → 10-r)
 *   2. 隣り合う2手を入れ替える(元の後手の手が先手の手になる)
 * 例: 元 [▲7六歩, △3四歩, ▲2六歩, △4四歩, ...] (先手=居飛車)
 *     → [▲7六歩, △3四歩, ▲6六歩, △8四歩, ...] (先手=振り飛車)
 *
 * この変換が常に成立する保証は無い(手の意味が前後する)。必ず
 *   - 生成時の合法性チェック(build-joseki.mjs)
 *   - エンジン検証(verify-joseki.cjs)
 *   - 到達陣形が資料どおりかの目視確認
 * の3つを通すこと。
 *
 * 使い方: node scripts/mirror-course.mjs <コースid>
 */
import { readFileSync } from "node:fs";
import { Position, InitialPositionSFEN, parseUSIMove } from "tsshogi";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "joseki");

const RANK_LETTERS = "abcdefghi";
/** USI のマス("7g")を180度反転する。 */
function mirrorSquare(sq) {
  const file = Number(sq[0]);
  const rank = RANK_LETTERS.indexOf(sq[1]) + 1;
  return `${10 - file}${RANK_LETTERS[10 - rank - 1]}`;
}
/** USI の指し手を180度反転する(打ち・成りにも対応)。 */
export function mirrorUsi(usi) {
  if (usi.includes("*")) return `${usi[0]}*${mirrorSquare(usi.slice(2))}`;
  const promote = usi.endsWith("+");
  const body = promote ? usi.slice(0, -1) : usi;
  return mirrorSquare(body.slice(0, 2)) + mirrorSquare(body.slice(2, 4)) + (promote ? "+" : "");
}

function mainLineUsi(course) {
  const out = [];
  let n = course.root;
  while (n.branches.length > 0) {
    const mv = n.branches.find((b) => b.kind === "main") ?? n.branches[0];
    if (!mv || !mv.child) break;
    out.push(mv.usi);
    n = mv.child;
  }
  return out;
}

/**
 * この棋譜が手番入れ替え変換に適するかを検査する。
 *
 * 隣接する2手を入れ替える変換は、駒の取り合い(取る手と取り返す手)がある棋譜だと
 * 順序が壊れて別物になる。実例: 筋違い角の「▲2二角成 △同銀」を変換すると
 * 「▲8八銀 △8八角成」となり、銀をタダで取られる無意味な進行になった。
 * 合法ではあるので生成時のチェックは素通りしてしまうため、ここで先に弾く。
 */
export function assertSwappable(usiList) {
  const position = new Position();
  position.resetBySFEN(InitialPositionSFEN.STANDARD);
  for (let i = 0; i < usiList.length; i++) {
    const usi = usiList[i];
    const parsed = parseUSIMove(usi);
    if (!parsed) throw new Error(`${i + 1}手目 ${usi}: USI として解釈できません`);
    if (!usi.includes("*") && position.board.at(parsed.to)) {
      throw new Error(
        `${i + 1}手目 ${usi} で駒を取っています。取り合いのある棋譜は手番入れ替え変換に使えません` +
        `(取る手と取り返す手の順序が入れ替わり、別の進行になるため)`
      );
    }
    let move = position.createMove(parsed.from, parsed.to);
    if (parsed.promote) move = move.withPromote();
    position.doMove(move);
  }
}

/**
 * 手番を入れ替えた USI 列を返す。奇数手で終わる場合は最後の1手を落とす。
 *
 * limit を渡すと、元の棋譜の先頭 limit 手だけを使う。元コースに仕掛け(駒の
 * 取り合い)を足しても、手番入れ替え版は駒組みの範囲で安定させるために使う
 * (取り合いを含めると変換が破綻するため。assertSwappable を参照)。
 */
export function swapSides(usiList, limit) {
  const source = typeof limit === "number" ? usiList.slice(0, limit) : usiList;
  assertSwappable(source);
  const even = source.length - (source.length % 2);
  const out = [];
  for (let i = 0; i < even; i += 2) {
    out.push(mirrorUsi(source[i + 1]));  // 元の後手の手 → 新しい先手の手
    out.push(mirrorUsi(source[i]));      // 元の先手の手 → 新しい後手の手
  }
  return out;
}

// courses.mjs から import して使うのが主目的なので、CLI としての出力は
// このファイルを直接実行したときだけ行う。
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const id = process.argv[2];
  if (!id) {
    console.error("使い方: node scripts/mirror-course.mjs <コースid>");
    process.exit(1);
  }
  const course = JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf-8"));
  const original = mainLineUsi(course);
  const swapped = swapSides(original);
  console.log(`元: ${course.title} (${original.length}手)`);
  console.log(`  ${original.join(" ")}`);
  console.log(`\n手番入れ替え後 (${swapped.length}手):`);
  console.log(`  ${swapped.join(" ")}`);
}
