/**
 * 「その局面で定石手を逃すと、どれくらい損をするか」を測る開発用スクリプト。
 *
 * 目的: 学習を「指しこなす本」形式にするため、どの手をクイズにすべきかを決める。
 * 定石から外れたこと自体は咎める理由にならない。駒がぶつかっていない序盤なら、
 * 多少違う手でも成立する。咎めるべきなのは「その手を逃すと劣勢になる」局面だけ。
 *
 * 測り方: 各局面で MultiPV で上位の手を出し、
 *   critical = (定石手の評価) - (定石手以外で最善の手の評価)
 * とする。この差が大きいほど「その手でなければいけない」局面。
 *
 * 使い方: node scripts/analyze-critical.cjs <コースid> [--ms 1200] [--pv 5]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");

const args = process.argv.slice(2);
const courseId = args[0];
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i+1] ? Number(args[i+1]) : d; };
const MS = argVal("--ms", 1200);
const PV = argVal("--pv", 5);
if (!courseId) { console.error("使い方: node scripts/analyze-critical.cjs <コースid>"); process.exit(1); }

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
  const CAP = [];
  const orig = console.log;
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
  send("setoption name Threads value 1");
  send(`setoption name MultiPV value ${PV}`);
  send("isready"); await waitFor(l => l === "readyok", 60000); unhook();
  console.log(`解析: ${course.title}  (MultiPV=${PV}, ${MS}ms/局面)\n`);

  /** その局面の上位 PV 手を [{usi, cp}] で返す(評価は手番側視点)。 */
  async function topMoves(sfen) {
    CAP.length = 0; hook();
    send(`position sfen ${sfen}`);
    send(`go movetime ${MS}`);
    await waitFor(l => l.startsWith("bestmove"), MS + 20000);
    const infos = CAP.filter(l => l.startsWith("info ") && l.includes(" multipv ") && l.includes(" score cp "));
    unhook();
    const best = new Map();
    for (const line of infos) {
      const t = line.split(/\s+/);
      const mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
      if (mi < 0 || si < 0 || pi < 0 || t[si+1] !== "cp") continue;
      best.set(Number(t[mi+1]), { usi: t[pi+1], cp: Number(t[si+2]) });
    }
    return [...best.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
  }

  const { nodes, moves } = mainLine(course);
  const mySide = course.mySide;
  const rows = [];
  for (let i = 0; i < moves.length; i++) {
    if (sideToMove(nodes[i].sfen) !== mySide) continue;   // 自分の手だけ
    const list = await topMoves(nodes[i].sfen);
    if (list.length === 0) continue;
    const joseki = moves[i].usi;
    const hit = list.find(m => m.usi === joseki);
    const alt = list.find(m => m.usi !== joseki);
    if (!hit || !alt) { rows.push({ n: i+1, usi: joseki, gap: null, note: hit ? "候補が1つのみ" : "定石手が上位に無い" }); continue; }
    rows.push({ n: i+1, usi: joseki, gap: hit.cp - alt.cp, rank: list.indexOf(hit)+1, alt: alt.usi });
  }

  console.log("手  定石手   順位  次善手との差   判定");
  console.log("-".repeat(52));
  for (const r of rows) {
    if (r.gap === null) { console.log(`${String(r.n).padStart(2)}  ${r.usi.padEnd(7)}  -     -            ${r.note}`); continue; }
    const level = r.gap >= 100 ? "★急所" : r.gap >= 40 ? "・要注意" : "  どれでも可";
    console.log(`${String(r.n).padStart(2)}  ${r.usi.padEnd(7)}  ${String(r.rank).padStart(2)}    ${String(r.gap).padStart(5)}点差      ${level}`);
  }
  const crit = rows.filter(r => r.gap !== null && r.gap >= 100);
  console.log(`\n自分の手 ${rows.length} のうち、★急所(100点差以上)は ${crit.length} 手: ${crit.map(r=>r.n+"手目").join(", ") || "なし"}`);
  process.exit(0);
})().catch(e => { console.error("解析に失敗:", e && e.message); process.exit(1); });
