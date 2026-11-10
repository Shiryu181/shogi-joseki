/**
 * 評価関数の新旧比較(docs/engine-compare-2026-11.md 用)。
 * 使い方:
 *   ENGINE=wasm   node scripts/compare-engines.cjs cases.json out-wasm.json [--depths 16,18,20] [--pv 8]
 *   ENGINE=native node scripts/compare-engines.cjs cases.json out-native.json
 * cases.json: [{id, kind:"punish"|"unique"|"near100", sfen, move, label}]
 *   sfen の局面で move を指したときの
 *     best        : その局面の最善手
 *     loss        : move が最善より何点劣るか(MultiPV 内に無ければ、指した後を探索して求める)
 *     margin      : move が最善のとき、次善手との差
 *   を、深さごとに 1 回の探索(go depth N)から取る。評価値は手番側から見た値。
 * 1局面ずつ、エンジンは1つだけ動かす。
 */
const fs = require("node:fs");
const { Position, parseUSIMove } = require("tsshogi");
const { createUsi } = require("./lib/usi-engine.cjs");
const { clearSearchMemory } = require("./lib/usi-clear.cjs");

const args = process.argv.slice(2);
const [casesPath, outPath] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const NODES = Number(argVal("--nodes", 0)); // >0 なら go nodes N(深さ固定でなくノード数固定)。結果は深さの代わりにキー "n" に入る
const DEPTHS = NODES ? ["n"] : argVal("--depths", "16,18,20").split(",").map(Number);
const PV = Number(argVal("--pv", 8));

function after(sfen, usi) {
  const p = new Position(); p.resetBySFEN(sfen);
  const parsed = parseUSIMove(usi); if (!parsed) return null;
  let m = p.createMove(parsed.from, parsed.to); if (!m) return null;
  if (parsed.promote) m = m.withPromote();
  if (!p.isValidMove(m) || !p.doMove(m)) return null;
  return p.sfen;
}

(async () => {
  const eng = await createUsi();
  let waiter = null;
  eng.setHandler((l) => { if (waiter) waiter(l); });
  const send = (c) => eng.send(c);
  const wait = (pred) => new Promise((res) => { waiter = (l) => { if (pred(l)) { waiter = null; res(l); } }; });
  let p = wait((l) => l === "usiok"); send("usi"); await p;
  for (const c of eng.initOptions()) send(c);
  p = wait((l) => l === "readyok"); send("isready"); await p;

  /** go depth D の探索で、深さ d(DEPTHS の各値)ごとの MultiPV 結果を返す。{d: [{usi,cp}]} */
  async function search(sfen, pv, maxDepth) {
    const byDepth = {};
    const t0 = Date.now(); let nodes = 0;
    await clearSearchMemory(eng, wait); // 局面ごとに置換表を消す(測り直しで同じ結果にするため)
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`);
    const done = new Promise((res) => {
      waiter = (l) => {
        if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ")) {
          const t = l.split(/\s+/);
          const di = t.indexOf("depth"), mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv"), ni = t.indexOf("nodes");
          const d = Number(t[di + 1]);
          if (ni >= 0) nodes = Number(t[ni + 1]);
          let cp = null;
          if (t[si + 1] === "cp") cp = Number(t[si + 2]);
          else if (t[si + 1] === "mate") cp = Number(t[si + 2]) > 0 ? 30000 : -30000;
          if (/lowerbound|upperbound/.test(l) || cp === null) return;
          (byDepth[d] ||= new Map()).set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp });
        } else if (l.startsWith("bestmove")) { waiter = null; res(l.split(/\s+/)[1]); }
      };
    });
    send(NODES ? `go nodes ${NODES}` : `go depth ${maxDepth}`);
    const best = await done;
    const out = {};
    for (const [d, m] of Object.entries(byDepth)) out[d] = [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    let reached = null;
    if (NODES) {
      // 最後の反復が途中で切れると候補が欠けるので、候補の数が揃っている最も深い深さを使う
      const ds = Object.keys(out).map(Number).sort((a, b) => b - a);
      const full = Math.min(pv, ds.length > 1 ? out[ds[1]].length : pv);
      reached = ds.find((d) => out[d].length >= full) ?? ds[0];
      out.n = out[reached];
    }
    return { byDepth: out, best, ms: Date.now() - t0, nodes, reached };
  }

  const cases = JSON.parse(fs.readFileSync(casesPath, "utf-8"));
  const results = [];
  for (const c of cases) {
    const r = { ...c, depths: {}, ms: 0 };
    const s = await search(c.sfen, PV, NODES ? 0 : Math.max(...DEPTHS)); r.ms += s.ms;
    r.nodes = s.nodes; r.reachedDepth = s.reached; r.nps = s.ms ? Math.round(s.nodes / (s.ms / 1000)) : null;
    const nextSfen = after(c.sfen, c.move);
    let child = null;
    for (const d of DEPTHS) {
      const list = s.byDepth[d];
      if (!list || !list.length) { r.depths[d] = null; continue; }
      const hit = list.find((x) => x.usi === c.move);
      let loss, via;
      if (hit) { loss = list[0].cp - hit.cp; via = "list"; }
      else {
        if (!child) { child = await search(nextSfen, 1, NODES ? 0 : Math.max(...DEPTHS)); r.ms += child.ms; }
        const cl = child.byDepth[d];
        loss = cl && cl.length ? list[0].cp + cl[0].cp : null; via = "child";
      }
      const margin = hit && loss === 0 && list.length > 1 ? list[0].cp - list[1].cp : null;
      r.depths[d] = { best: list[0].usi, bestCp: list[0].cp, loss, margin, via, second: list[1] ? list[1].usi : null, top: list.slice(0, 3) };
    }
    results.push(r);
    console.error(`${c.id} ${c.kind} ${c.move}: ` + DEPTHS.map((d) => { const x = r.depths[d]; return x ? `${d === "n" ? "n(d" + r.reachedDepth + ")" : "d" + d} best=${x.best}(${x.bestCp}) loss=${x.loss} m=${x.margin}` : `d${d} -`; }).join(" | ") + `  (${Math.round(r.ms / 1000)}s)`);
    fs.writeFileSync(outPath, JSON.stringify({ engine: eng.kind, pv: PV, depths: DEPTHS, results }, null, 1));
  }
  eng.close();
  process.exit(0);
})().catch((e) => { console.error("失敗:", e && e.stack); process.exit(1); });
