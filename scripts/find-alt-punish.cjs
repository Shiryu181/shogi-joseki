/**
 * 損が300未満になった咎めの代わりを、新エンジン(つようら王11mini)で探す(段階1の調査用。章のデータは変えない)。
 *   node scripts/find-alt-punish.cjs scan                  4件の局面と前後(2手おき±4手)を MultiPV 40 で走査 → lab-out/alt-punish-scan.jsonl
 *   node scripts/find-alt-punish.cjs measure <sfen> <usi...>      局面を 4000万ノード・MultiPV 8 で測り、指定の手の損(最善との差)と次善との差を出す → lab-out/alt-punish-measure.jsonl
 *   node scripts/find-alt-punish.cjs confirm <sfen> <usi> [label]   候補1手を確かめる(根の最善・子の損を4000万ノード、20手指し継ぎ)→ lab-out/alt-punish-confirm.jsonl
 * 走査: 1段目 1500万ノード・MultiPV 40(損300以上の候補を拾う用。値は目安)。
 * 確認: 根と子を 4000万ノード(2段目)。指し継ぎは両者最善・1手 200万ノード、20手後の評価を咎める側から見て出す。
 *   node scripts/find-alt-punish.cjs scan2 <章id,章id,...>   (段階1・全章に広げる用)各章の本線の相手の番の局面で、浅い読み(depth 4 と 10万ノード、MultiPV 12)と深い読み(500万ノード、MultiPV 40)を取り、
 *        浅い読みで上位なのに深い読みで損300以上の手を拾う → lab-out/punish1-scan.jsonl(1局面1行)。共通の序盤(SHARED_PLY)は除く。
 *   node scripts/find-alt-punish.cjs trace <sfen> <ノード数> <MultiPV> <手数> [先に指す手...]   咎めの枝の手順づくり用。指定の手のあと、各手番の上位を出しながら最善手で指し継ぐ(各手番で最善・次善の差を見る)
 * 同時に動かすエンジンは1つだけ。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
process.env.ENGINE = process.env.ENGINE || "native";
const { createUsi } = require("./lib/usi-engine.cjs");
const { clearSearchMemory } = require("./lib/usi-clear.cjs");
const { features } = require("./lib/punish-features.cjs");
const out = path.join(__dirname, "lab-out");
const root = path.join(__dirname, "..");

// ALT_TARGETS(JSON の配列 [{id, ply, bad}])を環境変数で渡すと、そちらを探す(第2弾の3回目: 手順を差し替えた章の新しい局面)。
const TARGETS = process.env.ALT_TARGETS ? JSON.parse(process.env.ALT_TARGETS) : [
  { id: "nakabisha-vs-anaguma--7suji", ply: 23, bad: "7g6h" },
  { id: "nakabisha-vs-ibisha--gokigen24", ply: 13, bad: "2d2a+" },
  { id: "nakabisha-vs-sankenbisha--aifuri", ply: 17, bad: "5i5h" },
  { id: "sankenbisha-gote--aifuri-mukai", ply: 29, bad: "6e6d" },
];

function applyUsi(p, usi) {
  const q = parseUSIMove(usi); if (!q) return null;
  let m = p.createMove(q.from, q.to); if (!m) return null;
  if (q.promote) m = m.withPromote();
  if (!p.isValidMove(m)) return null;
  return m;
}
const jp = (sfen, usi) => { const p = new Position(); p.resetBySFEN(sfen); const m = applyUsi(p, usi); return m ? formatMove(p, m) : usi; };
const after = (sfen, usi) => { const p = new Position(); p.resetBySFEN(sfen); const m = applyUsi(p, usi); if (!m || !p.doMove(m)) return null; return p.sfen; };

// 章の本線(kind main)をたどって、ply 手目の直前の局面と前後の局面(ミスをする側の番)を返す
function positionsFor(t) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${t.id}.json`), "utf8"));
  const res = []; let found = null;
  (function walk(n, depth, path) {
    for (const b of n.branches) {
      if (depth + 1 === t.ply && b.usi === t.bad) found = { node: n, path };
      if (b.child) walk(b.child, depth + 1, [...path, b]);
    }
  })(c.root, 0, []);
  if (!found) throw new Error("not found " + t.id);
  const atPly = new Map(); // ply(その局面で指す手の番号) -> {sfen, hasDeviation}
  // 手前: path は ply-1 手
  let n = c.root;
  const nodes = [c.root, ...found.path.map((b) => b.child)];
  nodes.forEach((nd, i) => atPly.set(i + 1, { sfen: nd.sfen, devs: nd.branches.filter((b) => b.kind === "deviation").map((b) => b.usi), mains: nd.branches.filter((b) => b.kind === "main").map((b) => b.usi) }));
  // 先: 本線をたどる
  let cur = found.node;
  for (let k = t.ply; k <= t.ply + 4; k++) {
    const mb = cur.branches.find((b) => b.kind === "main");
    if (!mb || !mb.child) break;
    cur = mb.child; atPly.set(k + 1, { sfen: cur.sfen, devs: cur.branches.filter((b) => b.kind === "deviation").map((b) => b.usi), mains: cur.branches.filter((b) => b.kind === "main").map((b) => b.usi) });
  }
  for (const d of [-4, -2, 0, 2, 4]) { const x = atPly.get(t.ply + d); if (x) res.push({ ply: t.ply + d, ...x }); }
  return res;
}

// 章が借りている共通の序盤の手数(その元の章で扱うので走査しない)
const SHARED_PLY = { "sankenbisha-gote--aifuri-mukai": 2, "sankenbisha-gote--bogin": 22, "sankenbisha-gote--minokansei": 22, "sankenbisha-ishida--anaguma": 19,
  "sankenbisha-ishida--hidarimino": 19, "sankenbisha-ishida--kakugawari": 5, "nakabisha-vs-anaguma--sente": 16 };
// 章の本線で相手の番の局面(ply 手目を指す直前の局面)を返す。終端の局面も含む
function opponentPositions(id) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));
  const oppBlack = c.mySide === "gote"; // 相手が先手なら奇数手目
  const res = []; let n = c.root; let ply = 1;
  while (n) {
    if (ply > (SHARED_PLY[id] || 0) && (ply % 2 === 1) === oppBlack) res.push({ ply, sfen: n.sfen, devs: n.branches.filter((b) => b.kind !== "main").map((b) => b.usi), mains: n.branches.filter((b) => b.kind === "main").map((b) => b.usi) });
    const mb = n.branches.find((b) => b.kind === "main");
    n = mb && mb.child; ply++;
  }
  return res;
}

// 章の変化の枝(variation)の中で、相手の番の局面(枝の終わりの、相手が指す直前の局面も含む)。段階1の探す場所の拡張(2026-11-11)
function branchOpponentPositions(id) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));
  const oppBlack = c.mySide === "gote"; // 相手が先手なら奇数手目
  const res = [];
  (function walk(n, ply) {
    for (const b of n.branches) {
      if (b.kind === "deviation" && b.child) walkv(b.child, ply + 1, b.usi, ply);
      else if (b.child) walk(b.child, ply + 1);
    }
  })(c.root, 1);
  function walkv(n, ply, tag, devPly) {
    if ((ply % 2 === 1) === oppBlack) res.push({ ply, sfen: n.sfen, tag: `${devPly}${tag}`, devs: n.branches.filter((b) => b.kind !== "main").map((b) => b.usi), mains: n.branches.filter((b) => b.kind === "main").map((b) => b.usi) });
    const mb = n.branches.find((b) => b.kind === "main");
    if (mb && mb.child) walkv(mb.child, ply + 1, tag, devPly);
  }
  return res;
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

  async function search(sfen, pv, nodes) {
    const byDepth = {}; const t0 = Date.now();
    await clearSearchMemory(eng, wait); send(`setoption name MultiPV value ${pv}`); send(`position sfen ${sfen}`);
    const done = new Promise((res) => {
      waiter = (l) => {
        if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ")) {
          const t = l.split(/\s+/);
          const di = t.indexOf("depth"), mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
          let cp = null;
          if (t[si + 1] === "cp") cp = Number(t[si + 2]); else if (t[si + 1] === "mate") cp = Number(t[si + 2]) > 0 ? 30000 : -30000;
          if (/lowerbound|upperbound/.test(l) || cp === null) return;
          (byDepth[Number(t[di + 1])] ||= new Map()).set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp, pv: t.slice(pi + 1, pi + 9) });
        } else if (l.startsWith("bestmove")) { waiter = null; res(l.split(/\s+/)[1]); }
      };
    });
    send(typeof nodes === "string" ? `go ${nodes}` : `go nodes ${nodes}`); // 文字列なら "depth 4" のようにそのまま go に渡す
    const bm = await done;
    const o = {}; for (const [d, m] of Object.entries(byDepth)) o[d] = [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const ds = Object.keys(o).map(Number).sort((a, b) => b - a);
    const full = Math.min(pv, ds.length > 1 ? o[ds[1]].length : pv);
    const reached = ds.find((d) => o[d].length >= full) ?? ds[0];
    return { list: reached === undefined ? [] : o[reached], bestmove: bm, ms: Date.now() - t0, depth: reached };
  }

  const mode = process.argv[2];
  if (mode === "scan") {
    const f = path.join(out, "alt-punish-scan.jsonl");
    const done = new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
    for (const t of TARGETS) {
      for (const ps of positionsFor(t)) {
        const key = `${t.id}@${ps.ply}`;
        if (done.has(key)) continue;
        const r = await search(ps.sfen, 40, 15000000);
        if (!r.list.length) { console.error("結果なし", key); continue; }
        const best = r.list[0].cp;
        const cands = r.list.map((x) => ({ usi: x.usi, jp: jp(ps.sfen, x.usi), cp: x.cp, loss: best - x.cp, pv: x.pv }));
        const rec = { key, course: t.id, ply: ps.ply, sfen: ps.sfen, existingDeviations: ps.devs, mains: ps.mains, bestCp: best, depth: r.depth, ms: r.ms, n: cands.length, cands };
        fs.appendFileSync(f, JSON.stringify(rec) + "\n");
        console.error(key, "best", cands[0].jp, best, "損300以上:", cands.filter((c) => c.loss >= 300).map((c) => c.jp + ":" + c.loss).join(" "), `(${Math.round(r.ms / 1000)}s)`);
      }
    }
  } else if (mode === "scan2") {
    const f = path.join(out, "punish1-scan.jsonl");
    const done = new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
    for (const id of process.argv[3].split(",")) {
      for (const ps of opponentPositions(id)) {
        const key = `${id}@${ps.ply}`;
        if (done.has(key)) continue;
        const sh1 = await search(ps.sfen, 12, "depth 4");
        const sh2 = await search(ps.sfen, 12, 100000);
        const r = await search(ps.sfen, 40, 5000000);
        if (!r.list.length) { console.error("結果なし", key); continue; }
        const best = r.list[0].cp;
        const rank = (list, usi) => { const i = list.findIndex((x) => x.usi === usi); return i < 0 ? null : i + 1; };
        const loss = (list, usi) => { const h = list.find((x) => x.usi === usi); return h ? list[0].cp - h.cp : null; };
        const cands = r.list.map((x) => ({ usi: x.usi, jp: jp(ps.sfen, x.usi), cp: x.cp, loss: best - x.cp, pv: x.pv,
          rD4: rank(sh1.list, x.usi), lossD4: loss(sh1.list, x.usi), rN100k: rank(sh2.list, x.usi), lossN100k: loss(sh2.list, x.usi) }));
        const rec = { key, course: id, ply: ps.ply, sfen: ps.sfen, existingDeviations: ps.devs, mains: ps.mains, bestCp: best, depth: r.depth, ms: r.ms, shallowD4: sh1.list.map((x) => x.usi), shallowN: sh2.list.map((x) => x.usi), cands };
        fs.appendFileSync(f, JSON.stringify(rec) + "\n");
        console.error(key, "best", cands[0].jp, best, "損300以上で浅い上位(D4<=6 or N<=6):", cands.filter((c) => c.loss >= 300 && ((c.rD4 && c.rD4 <= 6) || (c.rN100k && c.rN100k <= 6))).map((c) => `${c.jp}:損${c.loss}/D4#${c.rD4}/N#${c.rN100k}`).join(" "), `(${Math.round(r.ms / 1000)}s)`);
      }
    }
  } else if (mode === "scan3") {
    // 変化の枝の中の相手の番の局面を scan2 と同じ条件で走査 → lab-out/punish2-scan.jsonl
    const f = path.join(out, "punish2-scan.jsonl");
    const done = new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).key) : []);
    for (const id of process.argv[3].split(",")) {
      for (const ps of branchOpponentPositions(id)) {
        const key = `${id}@${ps.tag}@${ps.ply}`;
        if (done.has(key)) continue;
        const sh1 = await search(ps.sfen, 12, "depth 4");
        const sh2 = await search(ps.sfen, 12, 100000);
        const r = await search(ps.sfen, 40, 5000000);
        if (!r.list.length) { console.error("結果なし", key); continue; }
        const best = r.list[0].cp;
        const rank = (list, usi) => { const i = list.findIndex((x) => x.usi === usi); return i < 0 ? null : i + 1; };
        const loss = (list, usi) => { const h = list.find((x) => x.usi === usi); return h ? list[0].cp - h.cp : null; };
        const cands = r.list.map((x) => ({ usi: x.usi, jp: jp(ps.sfen, x.usi), cp: x.cp, loss: best - x.cp, pv: x.pv,
          rD4: rank(sh1.list, x.usi), lossD4: loss(sh1.list, x.usi), rN100k: rank(sh2.list, x.usi), lossN100k: loss(sh2.list, x.usi) }));
        const rec = { key, course: id, ply: ps.ply, branch: ps.tag, sfen: ps.sfen, existingDeviations: ps.devs, mains: ps.mains, bestCp: best, depth: r.depth, ms: r.ms, cands };
        fs.appendFileSync(f, JSON.stringify(rec) + "\n");
        console.error(key, "best", cands[0].jp, best, "損300以上で浅い上位:", cands.filter((c) => c.loss >= 300 && ((c.rD4 && c.rD4 <= 12 && c.lossD4 <= 250) || (c.rN100k && c.rN100k <= 12 && c.lossN100k <= 250))).map((c) => `${c.jp}:損${c.loss}`).join(" "), `(${Math.round(r.ms / 1000)}s)`);
      }
    }
  } else if (mode === "pre") {
    // 候補(JSON の配列 [{key,sfen,usi,jp,loss}])の下調べ: 1手指したあと両者最善(1手100万ノード)で16手指し継ぎ、盤の得の手がかりを数える → lab-out/punish2-pre.jsonl
    const list = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    const f = path.join(out, "punish2-pre.jsonl");
    const done = new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return r.key + "|" + r.usi; }) : []);
    for (const c of list) {
      if (done.has(c.key + "|" + c.usi)) continue;
      let cur = after(c.sfen, c.usi); const moves = [c.usi]; const jps = [jp(c.sfen, c.usi)];
      for (let i = 0; i < 16 && cur; i++) {
        const r = await search(cur, 1, 1000000);
        if (!r.list.length) break;
        jps.push(jp(cur, r.list[0].usi)); moves.push(r.list[0].usi); cur = after(cur, r.list[0].usi);
      }
      const ft = features(c.sfen, moves);
      const rec = { key: c.key, usi: c.usi, jp: c.jp, loss: c.loss, line: jps, moves, matGain: (ft.mat[ft.mat.length - 1] - ft.mat0) / 2, matTrace: ft.mat.map((v) => (v - ft.mat0) / 2), made: ft.made, checks: ft.checks, checkRun: ft.checkRun, endHorseDragon: ft.endHorseDragon };
      fs.appendFileSync(f, JSON.stringify(rec) + "\n");
      console.error(c.key, c.jp, `損${c.loss}`, `駒得${rec.matGain}`, "終わりの竜馬", JSON.stringify(ft.endHorseDragon), "王手の連続", ft.checkRun, jps.slice(0, 10).join(" "));
    }
  } else if (mode === "trace") {
    const [sfen0, nodes, pvn, cnt, ...pre] = process.argv.slice(3);
    let cur = sfen0;
    for (const u of pre) { cur = after(cur, u); if (!cur) throw new Error("非合法: " + u); }
    for (let i = 0; i < Number(cnt); i++) {
      const r = await search(cur, Number(pvn), Number(nodes));
      if (!r.list.length) break;
      const best = r.list[0].cp;
      console.error(`#${pre.length + i + 1} ${cur.split(" ")[1]}番 ` + r.list.map((x) => `${jp(cur, x.usi)}[${x.usi}] ${x.cp}(${best - x.cp})`).join(" | "));
      cur = after(cur, r.list[0].usi);
      if (!cur) break;
    }
  } else if (mode === "line") {
    // 咎めの枝の手順の検査: line <sfen> <usi...>。1手目(ミスの手)は測らず、2手目以降を各局面で500万ノード・MultiPV 8 で測り、
    // 各手の最善との差と、学ぶ側(2手目、4手目…)では差100以内の別解を出す。差60以上は4000万ノードで測り直す。
    const [sfen0, ...us] = process.argv.slice(3);
    let cur = after(sfen0, us[0]); if (!cur) throw new Error("非合法: " + us[0]);
    const res = [];
    for (let i = 1; i < us.length; i++) {
      const student = i % 2 === 1;
      let r = await search(cur, 8, 5000000); let nodes = "5M";
      const lossOf = (rr) => { const h = rr.list.find((x) => x.usi === us[i]); return h ? rr.list[0].cp - h.cp : null; };
      let l = lossOf(r);
      if (l === null || l >= 60) { r = await search(cur, 8, 40000000); nodes = "40M"; l = lossOf(r); }
      const best = r.list[0].cp;
      let viaChild = false;
      if (l === null) { // 上位8手に入らない手は、その手を指したあとの局面を同じノード数で測って損を出す
        const rc = await search(after(cur, us[i]), 1, nodes === "40M" ? 40000000 : 5000000);
        l = best + rc.list[0].cp; viaChild = true;
      }
      const alts = r.list.filter((x) => x.usi !== us[i] && best - x.cp <= 100).map((x) => `${jp(cur, x.usi)}(${best - x.cp})`);
      const row = { i: i + 1, who: student ? "学ぶ側" : "相手", usi: us[i], jp: jp(cur, us[i]), loss: l, viaChild, nodes, best: jp(cur, r.list[0].usi), alts };
      res.push(row); console.error(JSON.stringify(row));
      cur = after(cur, us[i]); if (!cur) throw new Error("非合法: " + us[i]);
    }
  } else if (mode === "measure") {
    const [sfen, ...usis] = process.argv.slice(3);
    const r = await search(sfen, 8, 40000000);
    const best = r.list[0].cp;
    const rec = { sfen, depth: r.depth, ms: r.ms, top: r.list.map((x) => ({ usi: x.usi, jp: jp(sfen, x.usi), cp: x.cp })), gapBestSecond: r.list[1] ? best - r.list[1].cp : null,
      moves: usis.map((u) => { const h = r.list.find((x) => x.usi === u); return { usi: u, jp: jp(sfen, u), loss: h ? best - h.cp : null, inTop8: !!h }; }) };
    fs.appendFileSync(path.join(out, "alt-punish-measure.jsonl"), JSON.stringify(rec) + "\n");
    console.error(JSON.stringify(rec));
  } else if (mode === "confirm") {
    const [sfen, usi, label] = process.argv.slice(3);
    const turn = sfen.split(" ")[1]; // 咎められる側(ミスをする側)
    const root1 = await search(sfen, 1, 40000000);
    const child = after(sfen, usi);
    const c1 = await search(child, 1, 40000000);
    const loss = root1.list[0].cp + c1.list[0].cp; // 根の最善 - その手の評価(ミスする側から見て)
    if (loss < 300) { const r0 = { label, sfen, usi, jp: jp(sfen, usi), rootBestJp: jp(sfen, root1.list[0].usi), loss, skipped: "損300未満" }; fs.appendFileSync(path.join(out, "alt-punish-confirm.jsonl"), JSON.stringify(r0) + "\n"); console.error(JSON.stringify(r0)); eng.close(); setTimeout(() => process.exit(0), 700); return; }
    // 20手指し継ぎ(両者最善、1手200万ノード)。咎める側から見た評価を記録
    let cur = child; const trace = []; let moves = []; const movesUsi = [usi];
    for (let i = 1; i <= 20; i++) {
      const r = await search(cur, 1, 2000000);
      if (!r.list.length) break;
      const mover = cur.split(" ")[1];
      const cpMover = r.list[0].cp;
      const cpPunisher = mover === turn ? -cpMover : cpMover; // 咎める側から見た評価
      trace.push(cpPunisher);
      const mv = r.list[0].usi; moves.push(jp(cur, mv)); movesUsi.push(mv);
      const nx = after(cur, mv); if (!nx) break; cur = nx;
    }
    const rec = { label, sfen, usi, jp: jp(sfen, usi), rootBest: root1.list[0].usi, rootBestJp: jp(sfen, root1.list[0].usi), rootCp: root1.list[0].cp, childCp: -c1.list[0].cp, loss, refutation: jp(child, c1.list[0].usi), afterLine: moves, tracePunisher: trace, final: trace[trace.length - 1], baselinePunisher: -root1.list[0].cp };
    try { const ft = features(sfen, movesUsi.filter(Boolean)); rec.feat = { matGain: (ft.mat[ft.mat.length - 1] - ft.mat0) / 2, made: ft.made, checkRun: ft.checkRun, endHorseDragon: ft.endHorseDragon, endSfen: ft.endSfen, movesUsi: movesUsi.filter(Boolean) }; } catch (e) { rec.featError = String(e); }
    fs.appendFileSync(path.join(out, "alt-punish-confirm.jsonl"), JSON.stringify(rec) + "\n");
    console.error(JSON.stringify(rec));
  }
  eng.close(); setTimeout(() => process.exit(0), 700);
})().catch((e) => { console.error("失敗:", e && e.stack); process.exit(1); });
