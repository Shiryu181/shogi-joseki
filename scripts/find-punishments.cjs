/**
 * 「相手が定石を外し、それを咎める」クイズの候補をエンジンで探す開発用スクリプト。
 *
 * 前提(2026-08 の実測): 駒組みの範囲では、定石手を逃しても損は±30点程度しかなく
 * 「必ず見つけるべき手」が存在しない(analyze-critical.cjs 参照)。急所は
 * 相手がミスした直後にできる。そこを出題する。
 *
 * 探し方: 相手の手番の各局面で
 *   1. MultiPV で相手の候補手を広く出し、明確に損な手(LOSS_MIN〜LOSS_MAX)を拾う
 *      - 損が小さい手は咎める理由が無い / 大きすぎる手は不自然で出題価値が低い
 *   2. その手を指させた局面で、こちらの最善手と次善手の差を測る
 *      - 差が大きいほど「その手を見つけなければいけない」= 良い問題
 *   3. 両方を満たす組み合わせだけを候補として出す
 *
 * 使い方: node scripts/find-punishments.cjs <コースid> [--ms 2000] [--pv 20]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");

const args = process.argv.slice(2);
const courseId = args[0];
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i+1] ? Number(args[i+1]) : d; };
const MS = argVal("--ms", 2000);
const PV = argVal("--pv", 20);
const LOSS_MIN = argVal("--lossmin", 150);   // これ未満の損は咎める理由が無い
const LOSS_MAX = argVal("--lossmax", 600);   // これを超える手は不自然(出題価値が低い)
const SHARP_MIN = argVal("--sharp", 120);    // 咎め手が次善手より何点良ければ「急所」とみなすか

if (!courseId) { console.error("使い方: node scripts/find-punishments.cjs <コースid>"); process.exit(1); }
const course = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "joseki", `${courseId}.json`), "utf-8"));

function mainLine(c) {
  const nodes = [c.root], moves = [];
  let cur = c.root;
  while (cur.branches.length > 0) {
    const mv = cur.branches.find(b => b.kind === "main") ?? cur.branches[0];
    if (!mv || !mv.child) break;
    moves.push(mv); nodes.push(mv.child); cur = mv.child;
  }
  return { nodes, moves };
}
const sideToMove = (sfen) => (sfen.split(" ")[1] === "w" ? "gote" : "sente");

(async () => {
  const CAP = []; const orig = console.log;
  const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
  const unhook = () => { console.log = orig; };
  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => {
    const s = Date.now();
    const t = setInterval(() => {
      const h = CAP.find(pred);
      if (h) { clearInterval(t); res(h); }
      else if (Date.now() - s > ms) { clearInterval(t); rej(new Error("timeout")); }
    }, 30);
  });
  hook(); send("usi"); await waitFor(l => l === "usiok", 30000);
  send("setoption name Threads value 1"); send("isready");
  await waitFor(l => l === "readyok", 60000); unhook();

  async function top(sfen, pv) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`);
    send(`go movetime ${MS}`);
    await waitFor(l => l.startsWith("bestmove"), MS + 25000);
    const infos = CAP.filter(l => l.startsWith("info ") && l.includes(" multipv ") && l.includes(" score cp "));
    unhook();
    const m = new Map();
    for (const line of infos) {
      const t = line.split(/\s+/);
      const mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
      if (mi < 0 || si < 0 || pi < 0 || t[si+1] !== "cp") continue;
      m.set(Number(t[mi+1]), { usi: t[pi+1], cp: Number(t[si+2]) });
    }
    return [...m.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
  }
  /** SFEN に1手指した局面の SFEN を返す(tsshogi 経由)。 */
  const { Position, parseUSIMove } = require("tsshogi");
  function after(sfen, usi) {
    const p = new Position(); p.resetBySFEN(sfen);
    const pm = parseUSIMove(usi); if (!pm) return null;
    let mv = p.createMove(pm.from, pm.to); if (!mv) return null;
    if (pm.promote) mv = mv.withPromote();
    if (!p.isValidMove(mv) || !p.doMove(mv)) return null;
    return p.sfen;
  }

  const { nodes, moves } = mainLine(course);
  const oppSide = course.mySide === "sente" ? "gote" : "sente";
  console.log(`探索: ${course.title}`);
  console.log(`条件: 相手の損 ${LOSS_MIN}〜${LOSS_MAX}点 / 咎め手が次善手より ${SHARP_MIN}点以上良い\n`);

  const found = [];
  for (let i = 0; i < moves.length; i++) {
    if (sideToMove(nodes[i].sfen) !== oppSide) continue;
    const list = await top(nodes[i].sfen, PV);
    if (list.length < 2) continue;
    const best = list[0].cp;
    for (const cand of list) {
      // 定石手そのものは逸れ手ではない。エンジンの最善手と定石手が食い違うことは
      // 普通にあるので、順位ではなく指し手そのもので除外する。
      if (cand.usi === moves[i].usi) continue;
      const loss = best - cand.cp;
      if (loss < LOSS_MIN || loss > LOSS_MAX) continue;
      const sfen2 = after(nodes[i].sfen, cand.usi);
      if (!sfen2) continue;
      const reply = await top(sfen2, 3);
      if (reply.length < 2) continue;
      const sharp = reply[0].cp - reply[1].cp;
      if (sharp < SHARP_MIN) continue;
      found.push({ n: i+1, joseki: moves[i].usi, dev: cand.usi, loss, punish: reply[0].usi, sharp });
      console.log(`  ${String(i+1).padStart(2)}手目: 定石は ${moves[i].usi} / 相手が ${cand.usi} と指すと ${loss}点の損`);
      console.log(`         → 咎め手 ${reply[0].usi} (次善手より ${sharp}点良い)`);
      break; // 1局面につき最有力の1つだけ拾う
    }
  }
  console.log(`\n見つかった出題候補: ${found.length}件`);
  process.exit(0);
})().catch(e => { console.error("失敗:", e && e.message); process.exit(1); });
