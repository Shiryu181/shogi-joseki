/**
 * 「優勢になった後の局面を、どこまでクイズにできるか」を測る開発用スクリプト。
 *
 * 知りたいこと: 相手のミスを咎めた後の局面で、自分の手番ごとに
 *   - 最善手が次善手より何点良いか(= 一手に絞れるか)
 *   - 最善から100点以内の手が何通りあるか(= 許容手の集合はどのくらいの広さか)
 * を調べる。差が小さく許容手が多い局面は「次の一手は?」の形では出題できないので、
 * 許容手の集合で正解判定する形にするかどうかの判断材料にする。
 *
 * 使い方: node scripts/quizability.cjs <コースid> [--ms 1500] [--plies 20] [--lossmin 230] [--from 16]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");

const args = process.argv.slice(2);
const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const MS = num("--ms", 1500);
const PLIES = num("--plies", 20);
const LOSS_MIN = num("--lossmin", 230);
const FROM = num("--from", 16);
const TOL = num("--tol", 100);

const CAP = []; const orig = console.log;
const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
const unhook = () => { console.log = orig; };

(async () => {
  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const hit = CAP.find(pred);
      if (hit) { clearInterval(t); res(hit); }
      else if (Date.now() - t0 > ms) { clearInterval(t); rej(new Error("timeout")); }
    }, 30);
  });
  hook(); send("usi"); await waitFor((l) => l === "usiok", 30000);
  send("isready"); await waitFor((l) => l === "readyok", 60000); unhook();

  const sc = (tok) => { const i = tok.indexOf("score"); if (i < 0) return null;
    return tok[i + 1] === "cp" ? Number(tok[i + 2]) : (Number(tok[i + 2]) > 0 ? 30000 : -30000); };

  /** MultiPV で候補手を広く出す(手番側から見た評価)。 */
  async function multi(sfen, pv) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`); send(`go movetime ${MS}`);
    await waitFor((l) => l.startsWith("bestmove"), 60000);
    const lines = CAP.filter((l) => l.startsWith("info ") && l.includes(" multipv ") && l.includes(" pv "));
    unhook();
    const byRank = new Map();
    for (const l of lines) {
      const t = l.split(/\s+/);
      byRank.set(Number(t[t.indexOf("multipv") + 1]), { usi: t[t.indexOf("pv") + 1], cp: sc(t) });
    }
    return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  const mk = (pos, usi) => { const q = parseUSIMove(usi); if (!q) return null;
    let m = pos.createMove(q.from, q.to); if (!m) return null;
    if (q.promote) m = m.withPromote(); return pos.isValidMove(m) ? m : null; };

  for (const id of ids) {
    const file = path.join(__dirname, "..", "src", "data", "joseki", `${id}.json`);
    if (!fs.existsSync(file)) { console.log(`${id}: 見つかりません`); continue; }
    const course = JSON.parse(fs.readFileSync(file, "utf-8"));
    const iAmSente = course.mySide === "sente";
    const myChar = iAmSente ? "b" : "w";

    const line = []; let cur = course.root;
    while (true) { const m = cur.branches.find((b) => b.kind === "main");
      if (!m || !m.child) break; line.push({ sfen: cur.sfen, usi: m.usi }); cur = m.child; }
    console.log(`\n■ ${course.title}`);

    // 大きなミス(損 LOSS_MIN 以上)を1件探す
    let target = null;
    for (let i = FROM; i < line.length; i++) {
      const { sfen } = line[i];
      if (sfen.split(" ")[1] === myChar) continue;
      const c = await multi(sfen, 14);
      if (c.length < 2) continue;
      const bad = c.slice(1).find((x) => c[0].cp - x.cp >= LOSS_MIN);
      if (bad) { target = { i, sfen, bad, loss: c[0].cp - bad.cp }; break; }
    }
    if (!target) { console.log(`  損${LOSS_MIN}点以上のミスが見つかりませんでした`); continue; }

    const pos = new Position(); pos.resetBySFEN(target.sfen);
    const m0 = mk(pos, target.bad.usi);
    console.log(`  ${target.i + 1}手目で相手が ${formatMove(pos, m0)} と間違えた場合 (損 ${target.loss}点)`);
    pos.doMove(m0);
    console.log(`  以降、自分の手番ごとに「次善手との差」と「最善から${TOL}点以内の手の数」:`);

    for (let p = 0; p < PLIES; p++) {
      const mine = pos.sfen.split(" ")[1] === myChar;
      const c = await multi(pos.sfen, mine ? 20 : 2); // MultiPV=1 だと multipv 行が出ないので 2 以上にする
      if (c.length === 0) break;
      const m = mk(pos, c[0].usi); if (!m) break;
      const text = formatMove(pos, m);
      if (mine) {
        const gap = c.length > 1 ? c[0].cp - c[1].cp : null;
        const within = c.filter((x) => c[0].cp - x.cp <= TOL).length;
        const view = iAmSente ? c[0].cp : c[0].cp; // 手番=自分なので手番視点=自分視点
        console.log(
          `    ${String(p + 1).padStart(2)}手目 自分 ${text.padEnd(9)} 評価${view >= 0 ? "+" : ""}${view}` +
          `  次善差 ${gap === null ? "-" : gap + "点"}  許容手 ${within}通り${within >= 20 ? "以上" : ""}`
        );
      } else {
        console.log(`    ${String(p + 1).padStart(2)}手目 相手 ${text}`);
      }
      pos.doMove(m);
    }
  }
  process.exit(0);
})();
