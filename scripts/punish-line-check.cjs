/**
 * 咎めの枝に入れる手順を、1手ずつ測り直す(段階1の案づくり用)。
 *   ENGINE=native node scripts/punish-line-check.cjs <入力JSON> <出力JSONL>
 * 入力: [{ "id": "名前", "sfen": "咎める前(外れる手を指す前)の局面", "moves": ["外れる手のUSI", "咎める側の手", "相手の手", ...], "punisherEven": true }]
 *   moves[0] は外れる手。そのあと咎める側(学ぶ側)の手と相手の手が交互に続く。
 * 出力(1手1行): 各手の前の局面を 500万ノード・MultiPV 8・Threads 1・置換表を消して測り、指した手の順位と最善との差を出す。
 *   学ぶ側の手は最善との差100以内(別解を許す)、相手の手は最善との差100以内であること、を見る基準。圏外(MultiPV 8の外)は diff:null。
 * 済んだ id は読み飛ばして続きから進む。エンジンは同時に1つだけ(測り方は punish-sweep.cjs と同じ)。
 */
const fs = require("node:fs");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
process.env.ENGINE = process.env.ENGINE || "native";
const { createUsi } = require("./lib/usi-engine.cjs");
const { clearSearchMemory } = require("./lib/usi-clear.cjs");

const [inFile, outFile] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(inFile, "utf8"));
const NODES = Number(process.env.NODES || 5000000), PV = Number(process.env.PV || 8);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return r.id + "|" + r.i; }) : []);

function apply(p, usi) { const q = parseUSIMove(usi); let m = p.createMove(q.from, q.to); if (q.promote) m = m.withPromote(); if (!p.isValidMove(m)) return null; return m; }

(async () => {
  const eng = await createUsi();
  let waiter = null;
  eng.setHandler((l) => { if (waiter) waiter(l); });
  const wait = (pred) => new Promise((res) => { waiter = (l) => { if (pred(l)) { waiter = null; res(l); } }; });
  let p = wait((l) => l === "usiok"); eng.send("usi"); await p;
  for (const c of eng.initOptions()) eng.send(c);
  p = wait((l) => l === "readyok"); eng.send("isready"); await p;
  async function search(sfen) {
    await clearSearchMemory(eng, wait); eng.send(`setoption name MultiPV value ${PV}`); eng.send(`position sfen ${sfen}`);
    const byDepth = {};
    const fin = new Promise((res) => { waiter = (l) => {
      if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ")) {
        const t = l.split(/\s+/); const di = t.indexOf("depth"), mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
        let cp = null; if (t[si + 1] === "cp") cp = Number(t[si + 2]); else if (t[si + 1] === "mate") cp = Number(t[si + 2]) > 0 ? 30000 : -30000;
        if (/lowerbound|upperbound/.test(l) || cp === null) return;
        (byDepth[Number(t[di + 1])] ||= new Map()).set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp });
      } else if (l.startsWith("bestmove")) { waiter = null; res(); } }; });
    eng.send(`go nodes ${NODES}`); await fin;
    const ds = Object.keys(byDepth).map(Number).sort((a, b) => b - a);
    const full = Math.min(PV, ds.length > 1 ? byDepth[ds[1]].size : PV);
    const d = ds.find((x) => byDepth[x].size >= full) ?? ds[0];
    return [...byDepth[d].entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }
  for (const it of items) {
    const pos = new Position(); pos.resetBySFEN(it.sfen);
    const first = pos.color; // 外れる側
    for (let i = 1; i < it.moves.length; i++) {
      // i = 1.. : moves[0] を指したあとの局面から、moves[i] を測る
      if (i === 1) { const m0 = apply(pos, it.moves[0]); if (!m0 || !pos.doMove(m0)) throw new Error("違法手 " + it.id + " 0"); }
      const sfen = pos.sfen; const mover = pos.color;
      const key = it.id + "|" + i;
      const m = apply(pos, it.moves[i]); if (!m) throw new Error("違法手 " + it.id + " " + i);
      const jpm = formatMove(pos, m);
      if (!done.has(key)) {
        const list = await search(sfen);
        const idx = list.findIndex((x) => x.usi === it.moves[i]);
        const rec = { id: it.id, i, role: mover === first ? "相手" : "学ぶ側", usi: it.moves[i], jp: jpm, rank: idx < 0 ? null : idx + 1, diff: idx < 0 ? null : list[0].cp - list[idx].cp,
          best: list[0].usi, bestJp: (() => { const q = new Position(); q.resetBySFEN(sfen); const bm = apply(q, list[0].usi); return bm ? formatMove(q, bm) : list[0].usi; })(), bestCp: list[0].cp, second: list[1] ? list[0].cp - list[1].cp : null };
        fs.appendFileSync(outFile, JSON.stringify(rec) + "\n");
        console.error(new Date().toISOString(), it.id, i, rec.role, jpm, "順位", rec.rank, "差", rec.diff);
      }
      if (!pos.doMove(m)) throw new Error("指せない " + it.id + " " + i);
    }
  }
  eng.send("quit"); setTimeout(() => process.exit(0), 500);
})();
