/**
 * 「咎め手の枝をどこまで作るか」の基準を決めるための計測スクリプト。
 *
 * 知りたいこと: 相手がミスした局面から、こちらが最善を指し続けたとき
 * 自分視点の評価値が +300 に届くまでに何手かかるか、その分布。
 * 枝の長さの上限を決めるために、打ち切らずに最後まで測る。
 * +300 に届いた後も数手続けて、評価が維持されるかを確認する。
 *
 * 相手はミスの後も最善で受ける(こちらに最も厳しい条件)。
 *
 * 使い方: node scripts/punish-depth.cjs <コースid...> [--ms 900] [--plies 28] [--cases 2] [--from 16]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");

const args = process.argv.slice(2);
const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const MS = num("--ms", 2000);
const PLIES = num("--plies", 28);
const CASES = num("--cases", 3);
const FROM = num("--from", 16);      // 駒組みの範囲はミスの損が小さいので、ここから探す
const LOSS_MIN = num("--lossmin", 150);
const LOSS_MAX = num("--lossmax", 600);

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

  const score = (tok) => {
    const i = tok.indexOf("score");
    if (i < 0) return null;
    if (tok[i + 1] === "cp") return Number(tok[i + 2]);
    return Number(tok[i + 2]) > 0 ? 30000 : -30000;
  };

  /** 手番側から見た評価と最善手。 */
  async function best(sfen) {
    CAP.length = 0; hook();
    send("setoption name MultiPV value 1");
    send(`position sfen ${sfen}`); send(`go movetime ${MS}`);
    const bm = await waitFor((l) => l.startsWith("bestmove"), 60000);
    const inf = CAP.filter((l) => l.startsWith("info ") && l.includes(" score ") && l.includes(" pv ")).pop();
    unhook();
    return { usi: bm.split(" ")[1], cp: inf ? score(inf.split(/\s+/)) : 0 };
  }

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
      const r = Number(t[t.indexOf("multipv") + 1]);
      byRank.set(r, { usi: t[t.indexOf("pv") + 1], cp: score(t) });
    }
    return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  const mv = (pos, usi) => {
    const q = parseUSIMove(usi); if (!q) return null;
    let m = pos.createMove(q.from, q.to); if (!m) return null;
    if (q.promote) m = m.withPromote();
    return pos.isValidMove(m) ? m : null;
  };

  for (const id of ids) {
    const file = path.join(__dirname, "..", "src", "data", "joseki", `${id}.json`);
    if (!fs.existsSync(file)) { console.log(`${id}: 見つかりません`); continue; }
    const course = JSON.parse(fs.readFileSync(file, "utf-8"));
    const iAmSente = course.mySide === "sente";
    const mySfenChar = iAmSente ? "b" : "w";

    // 本線の局面を集める
    const line = [];
    let cur = course.root;
    while (true) {
      const m = cur.branches.find((b) => b.kind === "main");
      if (!m || !m.child) break;
      line.push({ sfen: cur.sfen, usi: m.usi });
      cur = m.child;
    }
    console.log(`\n■ ${course.title}  (本線 ${line.length}手)`);

    // 相手の手番で「自然だが損な手」を探す
    let found = 0;
    for (let i = FROM; i < line.length && found < CASES; i++) {
      const { sfen } = line[i];
      if (sfen.split(" ")[1] === mySfenChar) continue;       // 相手の手番だけ
      const cands = await multi(sfen, 14);
      if (cands.length < 2) continue;
      const top = cands[0].cp;
      const bad = cands.slice(1).find((c) => top - c.cp >= LOSS_MIN && top - c.cp <= LOSS_MAX);
      if (!bad) continue;

      const pos = new Position(); pos.resetBySFEN(sfen);
      const m = mv(pos, bad.usi); if (!m) continue;
      const badText = formatMove(pos, m); pos.doMove(m);
      found++;
      console.log(`\n  ${i + 1}手目で相手が ${badText} と間違えた場合 (最善より ${top - bad.cp}点の損)`);

      // ここから最善手を指し合い、自分視点の評価を追う
      let hit300 = null, peak = -99999, after300 = [];
      const seq = [];
      for (let p = 0; p < PLIES; p++) {
        const r = await best(pos.sfen);
        const sideIsSente = pos.sfen.split(" ")[1] === "b";
        const senteView = sideIsSente ? r.cp : -r.cp;
        const myView = iAmSente ? senteView : -senteView;
        if (myView > peak) peak = myView;
        if (hit300 === null && myView >= 300) hit300 = p;
        else if (hit300 !== null) after300.push(myView);
        const m2 = mv(pos, r.usi); if (!m2) break;
        seq.push(`${formatMove(pos, m2)}(${myView >= 0 ? "+" : ""}${myView})`);
        pos.doMove(m2);
        // +300 に届いたら、維持されるかを4手だけ確認して終わる
        if (hit300 !== null && after300.length >= 4) break;
      }
      console.log(`    ${seq.join(" ")}`);
      const held = after300.length > 0 ? (after300.every((v) => v >= 250) ? "維持" : "戻った") : "-";
      console.log(
        `    +300 到達: ${hit300 === null ? `届かず(${PLIES}手まで)` : `${hit300}手後 → その後 ${held}`}` +
        ` / 最高 ${peak >= 0 ? "+" : ""}${peak}`
      );
    }
    if (found === 0) console.log("  条件に合う相手のミスが見つかりませんでした");
  }
  process.exit(0);
})();
