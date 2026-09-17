/**
 * 「効果の実演」を作るための下調べ。指定した手の直後の局面から、
 *   (a) エンジンの読み筋(この後の進行例)
 *   (b) 相手の自然な応手(動かした駒を取る / 移動先を取る / エンジン上位手)ごとの、こちらの最善と評価
 * を出す。実演の候補を人が選び、courses.mjs に demos として書くための材料。
 *
 * 使い方: node scripts/demo-probe.cjs <コースid> <手数> [--ms 2000]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");

const [courseId, moveNoStr] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const argVal = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
const MS = argVal("--ms", 2000);
const moveNo = Number(moveNoStr);
const course = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "joseki", `${courseId}.json`), "utf-8"));

function nodeAfter(n) { let node = course.root; for (let i = 0; i < n; i++) { const m = node.branches.find((b) => b.kind === "main"); if (!m || !m.child) return null; node = m.child; } return node; }

(async () => {
  const CAP = []; const orig = console.log;
  const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); }; const unhook = () => { console.log = orig; };
  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const h = CAP.find(pred); if (h) { clearInterval(t); res(h); } else if (Date.now() - t0 > ms) { clearInterval(t); rej(new Error("timeout")); } }, 30); });
  hook(); send("usi"); await waitFor((l) => l === "usiok", 30000); send("setoption name Threads value 1"); send("isready"); await waitFor((l) => l === "readyok", 60000); unhook();

  async function analyse(sfen, pv) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`); send(`position sfen ${sfen}`); send(`go movetime ${MS}`);
    await waitFor((l) => l.startsWith("bestmove"), MS + 40000);
    const infos = CAP.filter((l) => l.startsWith("info ") && l.includes(" score ") && l.includes(" pv "));
    unhook();
    const m = new Map();
    for (const line of infos) {
      const t = line.split(/\s+/); const mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
      if (si < 0 || pi < 0) continue;
      const cp = t[si + 1] === "cp" ? Number(t[si + 2]) : (Number(t[si + 2]) > 0 ? 30000 : -30000);
      m.set(mi >= 0 ? Number(t[mi + 1]) : 1, { pv: t.slice(pi + 1, pi + 6), cp });
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }
  const fmtLine = (sfen, usis) => { const p = new Position(); p.resetBySFEN(sfen); const out = []; for (const u of usis) { const q = parseUSIMove(u); if (!q) break; let mv = p.createMove(q.from, q.to); if (!mv) break; if (q.promote) mv = mv.withPromote(); out.push(formatMove(p, mv)); if (!p.doMove(mv)) break; } return out.join(" "); };

  const before = nodeAfter(moveNo - 1), after = nodeAfter(moveNo);
  if (!before || !after) { console.log("その手数はありません"); process.exit(1); }
  const mv = before.branches.find((b) => b.kind === "main");
  const pb = new Position(); pb.resetBySFEN(before.sfen);
  const q = parseUSIMove(mv.usi); let m0 = pb.createMove(q.from, q.to); if (q.promote) m0 = m0.withPromote();
  const mySideToMove = pb.color;
  console.log(`■ ${course.title} ${moveNo}手目 ${formatMove(pb, m0)}  解説: ${(mv.note ?? "").slice(0, 60)}`);
  const sfen = after.sfen;
  const evalFor = (cp, colorToMove) => (colorToMove === mySideToMove ? cp : -cp); // 自分視点に揃える

  // (a) 読み筋
  const top = await analyse(sfen, 4);
  console.log("\n(a) 相手の応手の候補と、その後の進行(自分視点の評価):");
  for (const t of top) console.log(`   ${String(evalFor(t.cp, pb.color === "black" ? "white" : "black")).padStart(6)}  ${fmtLine(sfen, t.pv)}   [${t.pv.join(" ")}]`);

  // (b) 自然な応手: 動かした駒/移動先を取る手、全部
  const pa = new Position(); pa.resetBySFEN(sfen);
  const dest = m0.to;
  const captures = [];
  for (const from of pa.board.listSquaresByColor(pa.color)) {
    const c = pa.createMove(from, dest);
    if (c && pa.isValidMove(c)) captures.push(c);
  }
  console.log("\n(b) 相手が「その駒を取る」応手ごとの、こちらの最善と評価(自分視点):");
  for (const c of captures) {
    const p2 = pa.clone(); p2.doMove(c);
    const r = await analyse(p2.sfen, 1);
    if (!r[0]) continue;
    console.log(`   ${formatMove(pa, c)} → ${fmtLine(p2.sfen, r[0].pv)}   評価 ${evalFor(r[0].cp, p2.color)}   [${c.usi} ${r[0].pv.join(" ")}]`);
  }
  process.exit(0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(1); });
