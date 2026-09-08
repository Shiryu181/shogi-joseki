/**
 * コースの最終局面から、中盤の指し手をエンジンに指させて教材の素材を作る開発用スクリプト。
 *
 * なぜエンジンに任せるのか: 序盤(駒組み)ではエンジンの評価と定跡が食い違うため
 * 出典に従う必要があったが、駒がぶつかったあとの局面ではエンジンの最善手が
 * そのまま正解になる。実際、これまで作った咎めクイズ32問すべてで
 * 「咎め手 = エンジンの最善手」が一致した。
 *
 * 出力する情報(教材にするときに必要なもの):
 *   - 各手の USI と、その手を指す前の評価値
 *   - 自分の手については「最善手が次善手より何点良いか(急所度)」
 *     ここが大きい手ほど『指さないと形勢を損ねる』ので、出題の候補になる
 *   - 取った駒・成りの有無(解説を書くときの手がかり)
 *
 * 使い方: node scripts/extend-middlegame.cjs <コースid> [--plies 24] [--ms 3000]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");

const args = process.argv.slice(2);
const courseId = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const PLIES = argVal("--plies", 24);
const MS = argVal("--ms", 3000);
// 相手が何番目の候補手を指すか。1 = 最善(互角の局面では駒を組み替えるだけになりがち)。
// 2〜3 にすると「人がよく指す自然な手」に近づき、こちらの攻めが形になる。
// 互角で終わるコースで『攻め方』を見せたいときに使う。
const OPP_RANK = argVal("--opp-rank", 1);

if (!courseId) { console.error("使い方: node scripts/extend-middlegame.cjs <コースid>"); process.exit(1); }
const file = path.join(__dirname, "..", "src", "data", "joseki", `${courseId}.json`);
const course = JSON.parse(fs.readFileSync(file, "utf-8"));

/** 本線をたどって最終ノードと手数を得る。 */
function tailOf(c) {
  let node = c.root, n = 0;
  while (true) {
    const m = node.branches.find((b) => b.kind === "main");
    if (!m || !m.child) return { node, n };
    node = m.child; n++;
  }
}

(async () => {
  const CAP = []; const orig = console.log;
  const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
  const unhook = () => { console.log = orig; };
  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => {
    const start = Date.now();
    const t = setInterval(() => {
      const hit = CAP.find(pred);
      if (hit) { clearInterval(t); res(hit); }
      else if (Date.now() - start > ms) { clearInterval(t); rej(new Error("timeout")); }
    }, 30);
  });
  hook(); send("usi"); await waitFor((l) => l === "usiok", 30000);
  send("setoption name Threads value 1"); send("isready");
  await waitFor((l) => l === "readyok", 60000); unhook();

  /** その局面の候補手を評価値つきで返す(手番側から見た値)。 */
  async function top(sfen, pv) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`);
    send(`go movetime ${MS}`);
    await waitFor((l) => l.startsWith("bestmove"), MS + 40000);
    const infos = CAP.filter((l) => l.startsWith("info ") && l.includes(" score cp ") && l.includes(" pv "));
    unhook();
    const m = new Map();
    for (const line of infos) {
      const t = line.split(/\s+/);
      const mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
      if (si < 0 || pi < 0 || t[si + 1] !== "cp") continue;
      m.set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp: Number(t[si + 2]) });
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  const { node: tail, n: tailNo } = tailOf(course);
  const position = new Position();
  position.resetBySFEN(tail.sfen);

  console.log(`■ ${course.title}`);
  console.log(`  ${tailNo}手目までのコース。ここから ${PLIES} 手をエンジンに指させる`);
  console.log(`  (評価値は先手視点。急所度 = 最善手が次善手より何点良いか)\n`);

  for (let i = 0; i < PLIES; i++) {
    // tsshogi の Color は文字列なので数値比較すると常に false になる(手番判定が壊れる)。
    const sideToMove = position.sfen.split(" ")[1] === "b" ? "sente" : "gote";
    const list = await top(position.sfen, Math.max(3, OPP_RANK + 1));
    if (list.length === 0) { console.log("  候補手が取れないため終了"); break; }
    const mineNow = sideToMove === course.mySide;
    // 自分の手は常に最善。相手の手は指定順位(既定は最善)。
    const best = mineNow ? list[0] : list[Math.min(OPP_RANK, list.length) - 1];
    const margin = mineNow && list.length > 1 ? list[0].cp - list[1].cp : null;
    const parsed = parseUSIMove(best.usi);
    if (!parsed) break;
    let move = position.createMove(parsed.from, parsed.to);
    if (!move) break;
    if (parsed.promote) move = move.withPromote();
    const captured = position.board.at(parsed.to);
    const text = formatMove(position, move);
    if (!position.doMove(move)) break;
    const cpSente = sideToMove === "sente" ? best.cp : -best.cp;
    const mine = mineNow;
    const tags = [
      captured ? `${captured.type}を取る` : null,
      parsed.promote ? "成り" : null,
      mine && margin !== null && margin >= 150 ? `★急所(次善手より${margin}点良い)` : null,
      mine && margin !== null && margin < 150 ? `(次善手との差${margin}点)` : null,
    ].filter(Boolean);
    console.log(
      `  ${tailNo + i + 1}手目 ${mine ? "自分" : "相手"} ${text.padEnd(8)} ${best.usi.padEnd(6)} ` +
      `評価 ${cpSente > 0 ? "+" : ""}${cpSente}  ${tags.join(" ")}`,
    );
  }
  console.log(`\n最終局面 SFEN: ${position.sfen}`);
  process.exit(0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(1); });
