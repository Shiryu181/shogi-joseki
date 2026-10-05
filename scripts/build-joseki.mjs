/**
 * 定跡コースの JSON を生成する開発用スクリプト。
 *
 * 目的は「人間が USI や SFEN を手書きしないこと」。
 * 手は「駒種 + 移動先」で書き、tsshogi に合法手を総当たりさせて一意に解決する。
 * 候補が複数ある(=どの駒を動かすか曖昧)場合は **黙って選ばずエラーで停止**し、
 * 呼び出し側に from の明示を求める。転記ミスや解釈違いを取りこぼさないため。
 *
 * 使い方: node scripts/build-joseki.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { Position, PieceType, Square, InitialPositionSFEN, parseUSIMove } from "tsshogi";
import { AIM_BY_NOTE } from "./aims.mjs";

/**
 * 許容手のキャッシュ(scripts/annotate-accepted.cjs が作る)。
 * 無くてもビルドは通る。その場合 accepted / sharp が付かないだけ。
 */
const ACCEPTED_CACHE = (() => {
  const file = new URL("./accepted-cache.json", import.meta.url);
  if (!existsSync(file)) {
    console.log("  (許容手のキャッシュが無いので accepted / sharp は付けません)");
    return { positions: {} };
  }
  return JSON.parse(readFileSync(file, "utf-8"));
})();

/** 急所と見なす「最善手と次善手の差」。実測で駒組みは 3〜39点、仕掛け以降に 100点超が現れる。 */
const SHARP_MIN = 100;
const annotateWarnings = [];

/**
 * 自分の手に accepted(咎められない手)と sharp(急所)を付ける。
 * 正解は常に本線なので、accepted は反応の文言を変えるためだけに使う。
 */
function annotate(sfenBefore, usi, mySide, label) {
  const sideToMove = sfenBefore.split(" ")[1] === "b" ? "sente" : "gote";
  if (sideToMove !== mySide) return {};
  const hit = ACCEPTED_CACHE.positions[sfenBefore.split(" ").slice(0, 3).join(" ")];
  if (!hit) return {};
  // 定跡手がエンジンの許容範囲から外れている場合は、出典とエンジンの食い違いなので報告する。
  if (!hit.accepted.includes(usi)) {
    annotateWarnings.push(`${label}: 定跡手 ${usi} が許容手(最善 ${hit.best})に入っていません`);
  }
  return {
    accepted: hit.accepted,
    ...(hit.gap !== null && hit.gap >= SHARP_MIN ? { sharp: true } : {}),
  };
}

/** ビルドの最後に、出典とエンジンが食い違った手をまとめて出す。 */
export function reportAnnotateWarnings() {
  if (annotateWarnings.length === 0) return;
  console.log(`\n⚠ 定跡手がエンジンの許容手に入っていない手 ${annotateWarnings.length} 件:`);
  for (const w of annotateWarnings) console.log(`   ${w}`);
}

const KANJI_RANK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const GLYPH_TO_TYPE = {
  歩: PieceType.PAWN, 香: PieceType.LANCE, 桂: PieceType.KNIGHT, 銀: PieceType.SILVER,
  金: PieceType.GOLD, 角: PieceType.BISHOP, 飛: PieceType.ROOK, 玉: PieceType.KING,
  // 成駒。すでに成っている駒を動かす手(馬を寄る、竜で取るなど)を書けるようにする。
  // 「角」と書くと成る前の駒しか探さないので、馬の移動は必ず「馬」と書く。
  と: PieceType.PROM_PAWN, 杏: PieceType.PROM_LANCE, 圭: PieceType.PROM_KNIGHT,
  全: PieceType.PROM_SILVER, 馬: PieceType.HORSE, 龍: PieceType.DRAGON,
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
/**
 * 実演(demos)の手順が、その手を指した直後の局面から合法に進められるか検査する。
 * 転記ミスをここで止める(アプリ側で再生できない実演を出さないため)。
 */
function checkDemos(demos, sfenAfter, label) {
  // 失敗したときに局面も出す(どのコースのどの手か特定するため)
  for (const d of demos) {
    const pos = new Position();
    pos.resetBySFEN(sfenAfter);
    d.usi.forEach((usi, k) => {
      const parsed = parseUSIMove(usi);
      if (!parsed) throw new Error(`${label} 実演「${d.title}」${k + 1}手目 ${usi}: USI が不正`);
      let mv = pos.createMove(parsed.from, parsed.to);
      if (mv && parsed.promote) mv = mv.withPromote();
      if (!mv || !pos.isValidMove(mv) || !pos.doMove(mv)) throw new Error(`${label} 実演「${d.title}」${k + 1}手目 ${usi}: 非合法 / 開始局面 ${sfenAfter}`);
    });
  }
  return demos;
}

export function buildCourse({ id, title, myStrategy, opponentStrategy, mySide, source, goalFormation, goalLabel, rootComment, moves }) {
  const position = new Position();
  position.resetBySFEN(InitialPositionSFEN.STANDARD);

  const nodes = [{ id: "n0", sfen: position.sfen, comment: rootComment, branches: [] }];
  const usiList = [];

  moves.forEach((spec, i) => {
    // 逸れ手(相手が定跡を外す手)は、本線を適用する前の局面から枝を伸ばす。
    // 学習画面で「相手がこう指してきたらどう咎めるか」を出題するために使う。
    // 本線を常に branches[0] に置くため、逸れ手は本線を積んでから後ろに足す。
    const devBranches = (spec.devs ?? []).map((dev) => buildDeviation(position, dev, i + 1));

    const move = resolveMove(position, spec, i + 1);
    const usi = move.usi;
    usiList.push(usi);
    if (!position.doMove(move)) throw new Error(`${i + 1}手目 ${usi}: 適用に失敗`);

    const child = { id: `n${i + 1}`, sfen: position.sfen, comment: spec.comment, branches: [] };
    // aim は出題時に見せる「ねらい」。明示が無ければ辞書から引く。
    const aim = spec.aim ?? (spec.note ? AIM_BY_NOTE[spec.note] : undefined);
    nodes[i].branches.push({
      usi, kind: "main", note: spec.note,
      ...(aim ? { aim } : {}),
      ...(spec.openEnded ? { openEnded: true } : {}),
      ...annotate(nodes[i].sfen, usi, mySide, `${id} ${i + 1}手目`),
      ...(spec.demos ? { demos: checkDemos(spec.demos, child.sfen, `${i + 1}手目`) } : {}),
      child,
    });
    for (const b of devBranches) nodes[i].branches.push(b);
    nodes.push(child);
  });

  const course = {
    id, title, myStrategy, opponentStrategy, mySide, source,
    goalFormation,
    ...(goalLabel ? { goalLabel } : {}),
    goalSfen: nodes[nodes.length - 1].sfen,
    root: nodes[0],
  };
  return { course, usiList };
}

/**
 * 逸れ手の枝を1本組み立てる。
 * dev = { piece, to, from?, drop?, promote?, note, punishNote, line: [手のspec...] }
 * line には咎め方の手順を入れる(先頭がこちらの咎め手)。
 */
function buildDeviation(position, dev, moveNo) {
  const work = position.clone();
  const devMove = resolveMove(work, dev, `${moveNo}(逸れ手)`);
  if (!work.doMove(devMove)) throw new Error(`${moveNo}手目の逸れ手 ${devMove.usi}: 適用に失敗`);

  const head = { id: `d${moveNo}`, sfen: work.sfen, comment: dev.comment, branches: [] };
  let cursor = head;
  (dev.line ?? []).forEach((spec, j) => {
    const mv = resolveMove(work, spec, `${moveNo}(咎め${j + 1})`);
    if (!work.doMove(mv)) throw new Error(`${moveNo}手目の咎め手 ${mv.usi}: 適用に失敗`);
    const child = { id: `d${moveNo}_${j + 1}`, sfen: work.sfen, comment: spec.comment, branches: [] };
    cursor.branches.push({ usi: mv.usi, kind: "main", note: spec.note, child });
    cursor = child;
  });

  return {
    usi: devMove.usi,
    kind: "deviation",
    note: dev.note,
    punishNote: dev.punishNote,
    child: head,
  };
}

/**
 * USI の指し手列から直接コースを組み立てる。
 * mirror-course.mjs で機械変換した棋譜など、既に USI が確定しているものに使う
 * (人間が指し手を書き写さないので転記ミスが入らない)。
 * notes[i] = [note, comment] を手ごとに与える。
 */
export function buildCourseFromUsi({ id, title, myStrategy, opponentStrategy, mySide, source, goalFormation, goalLabel, rootComment, usiList, notes = [] }) {
  const position = new Position();
  position.resetBySFEN(InitialPositionSFEN.STANDARD);
  const nodes = [{ id: "n0", sfen: position.sfen, comment: rootComment, branches: [] }];

  usiList.forEach((usi, i) => {
    const parsed = parseUSIMove(usi);
    if (!parsed) throw new Error(`${i + 1}手目 ${usi}: USI として解釈できません`);
    let move = position.createMove(parsed.from, parsed.to);
    if (!move) throw new Error(`${i + 1}手目 ${usi}: 手を作れません`);
    if (parsed.promote) move = move.withPromote();
    if (!position.isValidMove(move)) throw new Error(`${i + 1}手目 ${usi}: 非合法です`);
    // notes[i] = [解説, 局面の解説, 実演(任意), 咎めクイズ(任意)]
    const [note, comment, demos, devs] = notes[i] ?? [];
    // 逸れ手は本線を適用する「前」の局面から枝を伸ばす(buildCourse と同じ扱い)。
    const devBranches = (devs ?? []).map((dev) => buildDeviation(position, dev, i + 1));
    if (!position.doMove(move)) throw new Error(`${i + 1}手目 ${usi}: 適用に失敗`);
    // USI から組み立てるコース(先後を入れ替えたコースなど)にも、同じ辞書でねらいを付ける。
    const aim = note ? AIM_BY_NOTE[note] : undefined;
    const child = { id: `n${i + 1}`, sfen: position.sfen, comment, branches: [] };
    nodes[i].branches.push({
      usi, kind: "main", note,
      ...(aim ? { aim } : {}),
      ...annotate(nodes[i].sfen, usi, mySide, `${id} ${i + 1}手目`),
      ...(demos ? { demos: checkDemos(demos, child.sfen, `${i + 1}手目`) } : {}),
      child,
    });
    for (const b of devBranches) nodes[i].branches.push(b);
    nodes.push(child);
  });

  const course = {
    id, title, myStrategy, opponentStrategy, mySide, source,
    goalFormation,
    ...(goalLabel ? { goalLabel } : {}),
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
