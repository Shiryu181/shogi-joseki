/**
 * 直しの案(第2弾)用: 手を差し替えたあとの新しい手順を、新エンジン(つようら王11mini)の読み筋で作る。章のデータは変えない。
 *   node scripts/propose-lines.cjs <シナリオ.json>
 * シナリオ = [{ id, sfen, usi, steps }]  (sfen の局面で usi を指し、続けて両者エンジンの最善手で、合わせて steps 手まで進める)
 *          | [{ id, eval: sfen }]        (その局面の評価だけ測る)
 * 1手の探索: 既定 300万ノード・MultiPV 2(--nodes N で変更)。最後の局面だけ 500万ノード。Threads 1・go nodes。
 * 出力: lab-out/proposal2-lines.jsonl に1シナリオ1行。局面ごとの探索結果は proposal2-cache.jsonl に溜めて、再実行・別シナリオで再利用する
 *       (同じ局面・同じノード数なら同じ値が出るので、章をまたぐ同じ局面は1回で済む)。
 * 評価値は「その局面で手番の側から見た値」。同時に動かすエンジンは1つだけ。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
process.env.ENGINE = process.env.ENGINE || "native";
const { createUsi } = require("./lib/usi-engine.cjs");
const out = path.join(__dirname, "lab-out");
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const nIdx = args.indexOf("--nodes");
const NODES = nIdx >= 0 ? Number(args[nIdx + 1]) : 3000000;
const FINAL = 5000000;
const key3 = (s) => s.split(" ").slice(0, 3).join(" ");
const cacheF = path.join(out, "proposal2-cache.jsonl");
const cache = new Map();
if (fs.existsSync(cacheF)) for (const l of fs.readFileSync(cacheF, "utf8").split("\n").filter(Boolean)) { try { const r = JSON.parse(l); cache.set(`${r.key}|${r.nodes}`, r); } catch {} }

function mv(p, usi) { const q = parseUSIMove(usi); if (!q) return null; let m = q.from ? p.createMove(q.from, q.to) : p.createMove(q.piece, q.to); if (!m) return null; if (q.promote) m = m.withPromote(); return p.isValidMove(m) ? m : null; }
const jp = (sfen, usi) => { const p = Position.newBySFEN(sfen); const m = mv(p, usi); return m ? formatMove(p, m).replace("☗", "▲").replace("☖", "△") : usi; };
const after = (sfen, usi) => { const p = Position.newBySFEN(sfen); const m = mv(p, usi); if (!m || !p.doMove(m)) return null; return p.sfen; };

(async () => {
  const eng = await createUsi();
  let waiter = null; eng.setHandler((l) => { if (waiter) waiter(l); });
  const send = (c) => eng.send(c);
  const wait = (pred) => new Promise((res) => { waiter = (l) => { if (pred(l)) { waiter = null; res(l); } }; });
  let p = wait((l) => l === "usiok"); send("usi"); await p;
  for (const c of eng.initOptions()) send(c);
  p = wait((l) => l === "readyok"); send("isready"); await p;

  async function search(sfen, nodes, pv = 2) {
    const k = `${key3(sfen)}|${nodes}`; if (cache.has(k)) return cache.get(k);
    const byDepth = {}; const t0 = Date.now();
    send("usinewgame"); send(`setoption name MultiPV value ${pv}`); send(`position sfen ${sfen}`);
    const done = new Promise((res) => {
      waiter = (l) => {
        if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ")) {
          const t = l.split(/\s+/); const di = t.indexOf("depth"), mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
          let cp; if (t[si + 1] === "cp") cp = Number(t[si + 2]); else if (t[si + 1] === "mate") cp = Number(t[si + 2]) > 0 ? 30000 : -30000; else return;
          if (/lowerbound|upperbound/.test(l)) return;
          (byDepth[Number(t[di + 1])] ||= new Map()).set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp });
        } else if (l.startsWith("bestmove")) { waiter = null; res(l.split(/\s+/)[1]); }
      };
    });
    send(`go nodes ${nodes}`); const bm = await done;
    const ds = Object.keys(byDepth).map(Number).sort((a, b) => b - a);
    const full = Math.min(pv, ds.length > 1 ? byDepth[ds[1]].size : pv);
    const d = ds.find((x) => byDepth[x].size >= full) ?? ds[0];
    const top = d === undefined ? [] : [...byDepth[d].entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const rec = { key: key3(sfen), nodes, depth: d, top, bestmove: bm, ms: Date.now() - t0 };
    cache.set(k, rec); fs.appendFileSync(cacheF, JSON.stringify(rec) + "\n"); return rec;
  }

  const sc = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const outF = path.join(out, "proposal2-lines.jsonl");
  const done = new Set(fs.existsSync(outF) ? fs.readFileSync(outF, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
  for (const s of sc) {
    if (done.has(s.id)) continue;
    if (s.eval) { const r = await search(s.eval, FINAL); fs.appendFileSync(outF, JSON.stringify({ id: s.id, sfen: s.eval, cp: r.top[0].cp, best: jp(s.eval, r.top[0].usi), second: r.top[1] ? r.top[1].cp : null, turn: s.eval.split(" ")[1] }) + "\n"); console.error(s.id, r.top[0].cp); continue; }
    let cur = s.sfen; const line = [];
    let u = s.usi;
    for (let i = 0; i < s.steps; i++) {
      if (i > 0) { const r = await search(cur, NODES); if (!r.top.length) break; u = r.top[0].usi; line.push({ usi: u, jp: jp(cur, u), mover: cur.split(" ")[1], cp: r.top[0].cp, gap: r.top[1] ? r.top[0].cp - r.top[1].cp : null, d: r.depth }); }
      else line.push({ usi: u, jp: jp(cur, u), mover: cur.split(" ")[1], given: true });
      const nx = after(cur, u); if (!nx) { line.push({ error: "非合法 " + u }); break; } cur = nx;
    }
    const fin = await search(cur, FINAL);
    const rec = { id: s.id, sfen: s.sfen, steps: s.steps, line, endSfen: cur, endTurn: cur.split(" ")[1], endCp: fin.top[0] ? fin.top[0].cp : null, endBest: fin.top[0] ? jp(cur, fin.top[0].usi) : null, endSecond: fin.top[1] ? fin.top[1].cp : null };
    fs.appendFileSync(outF, JSON.stringify(rec) + "\n");
    console.error(s.id, line.map((x) => x.jp).join(" "), "end", rec.endCp, rec.endTurn);
  }
  eng.close(); setTimeout(() => process.exit(0), 700);
})().catch((e) => { console.error("失敗:", e && e.stack); process.exit(1); });
