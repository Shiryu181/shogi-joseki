/**
 * 咎め手の全章走査(第2弾の続き。段階1の残り29章)を、走査 → 下調べ → 確認まで1本で回す。
 *   ENGINE=native nohup caffeinate -i node scripts/punish-sweep.cjs run >> scripts/lab-out/punish3.log 2>&1 &   起動(途中で止まっても、同じ命令でやり直せば続きから)
 *   node scripts/punish-sweep.cjs status                                                                     進み具合を1行で出す
 *   kill $(cat scripts/lab-out/punish3.pid)                                                                   止める(今の1件は捨てて、次の起動でやり直す)
 * 対象: josekiLoader の章のうち、punish1-scan.jsonl(第1弾)で走査済みの章以外。本線の相手の番の局面と、変化(variation)の枝の中の相手の番の局面。
 *       共通の序盤(SHARED_PLY)・今ある咎めのある局面は除く。今ある変化の手は候補から除く。
 * 章ごとに「走査 → 下調べ → 確認」を順に回す。出力(1件1行、追記。済んだ件は読み飛ばして再開):
 *   lab-out/punish3-scan.jsonl     走査(scan2 と同じ: 浅い読み depth 4 と 10万ノード MultiPV 12、深い読み 500万ノード MultiPV 40)
 *   lab-out/punish3-pre.jsonl      下調べ(候補: 損300以上かつ 浅い読みで12位以内・差250以内。1手指して両者最善1手100万ノードで16手指し継ぎ、盤の得の手がかりを数える)
 *   lab-out/punish3-confirm.jsonl  確認(根と子を4000万ノード、20手指し継ぎ(1手200万ノード)、盤の得の判定。verdict が「おすすめ」「保留」「不可」)
 * 下調べの結果が「駒得3以上、終わりの盤に咎める側の竜・馬、王手2連続」のどれかに当たる候補だけ確認する。1局面で「おすすめ」が出たら、その局面の残りは確認しない。
 * 測り方: Threads 1、局面ごとに置換表を消す(usi-clear)、go nodes 固定。エンジンは同時に1つだけ。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
process.env.ENGINE = process.env.ENGINE || "native";
const { createUsi } = require("./lib/usi-engine.cjs");
const { clearSearchMemory } = require("./lib/usi-clear.cjs");
const { features } = require("./lib/punish-features.cjs");
const { check: capturable } = require("./lib/punish-capturable.cjs");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "lab-out");
const F = {
  scan: path.join(out, "punish3-scan.jsonl"), pre: path.join(out, "punish3-pre.jsonl"),
  confirm: path.join(out, "punish3-confirm.jsonl"), pid: path.join(out, "punish3.pid"),
};
// 章が借りている共通の序盤の手数(その元の章で扱うので走査しない)。第1弾の分も含む
const SHARED_PLY = {
  "sankenbisha-gote--aifuri-mukai": 2, "sankenbisha-gote--bogin": 22, "sankenbisha-gote--minokansei": 22, "sankenbisha-ishida--anaguma": 19,
  "sankenbisha-ishida--hidarimino": 19, "sankenbisha-ishida--kakugawari": 5, "nakabisha-vs-anaguma--sente": 16,
  "nakabisha-vs-chousoku--sente": 20, "nakabisha-vs-5yonfu--horyu": 3, "nakabisha-vs-5yonfu--kakukoukan": 3, "nakabisha-vs-ibisha--jikyusen": 20,
  "nakabisha-vs-8yonfu--kakukoukan": 5, "sankenbisha-ishida--honkumi": 19, "sankenbisha-ishida--migishiken": 19, "sankenbisha-ishida--sugairyu": 7,
  "sankenbisha-ishida--bokin": 13, "sankenbisha-ishida--aifuri-shiken": 3, "sankenbisha-gote--hayashikake": 26, "sankenbisha-gote--anaguma": 14,
  "sankenbisha-gote--hidarimino": 24, "sankenbisha-gote--aifuri-naka": 2, "sankenbisha-gote--aisanken": 2, "sankenbisha-gote--migishiken": 22,
  "sankenbisha-gote--nanamebogin": 20,
};

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const append = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + "\n");
const loadCourse = (id) => JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));

function applyUsi(p, usi) {
  const q = parseUSIMove(usi); if (!q) return null;
  let m = p.createMove(q.from, q.to); if (!m) return null;
  if (q.promote) m = m.withPromote();
  if (!p.isValidMove(m)) return null;
  return m;
}
const jp = (sfen, usi) => { const p = new Position(); p.resetBySFEN(sfen); const m = applyUsi(p, usi); return m ? formatMove(p, m) : usi; };
const after = (sfen, usi) => { const p = new Position(); p.resetBySFEN(sfen); const m = applyUsi(p, usi); if (!m || !p.doMove(m)) return null; return p.sfen; };

/** 対象の章(josekiLoader の章のうち、第1弾で走査済みの章以外)。 */
async function targetCourses() {
  const { listEntries } = await import("./count-screen-numbers.mjs");
  const done = new Set(readJsonl(path.join(out, "punish1-scan.jsonl")).map((r) => r.course));
  return listEntries().map((e) => e.id).filter((id) => !done.has(id));
}

/** 章の走査する局面: 本線の相手の番(ply 手目を指す直前)と、変化の枝の中の相手の番。咎めのある局面は除く。 */
function positionsOf(id) {
  const c = loadCourse(id);
  const oppBlack = c.mySide === "gote"; // 相手が先手なら奇数手目
  const res = [];
  const info = (n) => ({
    punished: n.branches.some((b) => b.kind === "deviation" && !b.variation),
    skip: n.branches.filter((b) => b.kind !== "main").map((b) => b.usi),
    mains: n.branches.filter((b) => b.kind === "main").map((b) => b.usi),
  });
  let n = c.root; let ply = 1;
  while (n) {
    if (ply > (SHARED_PLY[id] || 0) && (ply % 2 === 1) === oppBlack) { const x = info(n); if (!x.punished) res.push({ key: `${id}@${ply}`, course: id, ply, branch: null, sfen: n.sfen, existing: x.skip, mains: x.mains }); }
    const mb = n.branches.find((b) => b.kind === "main");
    n = mb && mb.child; ply++;
  }
  (function walk(nd, p) {
    for (const b of nd.branches) {
      if (b.kind === "deviation" && b.variation && b.child) walkv(b.child, p + 1, `${p}${b.usi}`);
      else if (b.child && b.kind === "main") walk(b.child, p + 1);
    }
  })(c.root, 1);
  function walkv(nd, p, tag) {
    if ((p % 2 === 1) === oppBlack && p > (SHARED_PLY[id] || 0)) { const x = info(nd); if (!x.punished) res.push({ key: `${id}@${tag}@${p}`, course: id, ply: p, branch: tag, sfen: nd.sfen, existing: x.skip, mains: x.mains }); }
    const mb = nd.branches.find((b) => b.kind === "main");
    if (mb && mb.child) walkv(mb.child, p + 1, tag);
  }
  return res;
}

// ── 状況(status) ──
async function status() {
  const courses = await targetCourses();
  const all = courses.flatMap(positionsOf);
  const scan = readJsonl(F.scan), pre = readJsonl(F.pre), conf = readJsonl(F.confirm);
  const scanKeys = new Set(scan.map((r) => r.key));
  const done = all.filter((p) => scanKeys.has(p.key)).length;
  const cands = scan.reduce((s, r) => s + (r.candidates ? r.candidates.length : 0), 0);
  const avg = (a) => { const b = a.filter((x) => x > 0); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : 0; }; // 流用した件(0)は除く
  const msScan = avg(scan.map((r) => r.msTotal || 0)), msPre = avg(pre.map((r) => r.msTotal || 0)), msConf = avg(conf.map((r) => r.msTotal || 0));
  // 見込み: 走査 残り局面×平均、下調べ 残り候補×平均(未走査分は 0.37手/局面)、確認 下調べ済みの対象外を含め 約2割
  const remScan = all.length - done;
  const remCandsKnown = cands - pre.length;
  const remCandsFuture = Math.round(remScan * 0.37);
  const gateRate = pre.length ? pre.filter((r) => r.gate).length / pre.length : 0.22;
  const etaMs = remScan * (msScan || 21000) + (remCandsKnown + remCandsFuture) * (msPre || 90000) + Math.round((remCandsKnown + remCandsFuture) * gateRate) * (msConf || 960000) * 0.6;
  const rec = conf.filter((r) => r.verdict === "おすすめ").length, hold = conf.filter((r) => r.verdict === "保留").length;
  const eta = new Date(Date.now() + etaMs);
  const run = fs.existsSync(F.pid) ? F.pid : null;
  let alive = false;
  if (run) { try { process.kill(Number(fs.readFileSync(F.pid, "utf8")), 0); alive = true; } catch {} }
  console.log(`走査 ${done}/${all.length}局面 | 候補 ${cands} 下調べ済 ${pre.length} 確認済 ${conf.length}(おすすめ${rec} 保留${hold}) | 残りの見込み 約${(etaMs / 3600000).toFixed(1)}時間(${eta.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}ごろ) | ${alive ? "実行中 PID " + fs.readFileSync(F.pid, "utf8").trim() : "止まっている"}`);
}

// ── 本体 ──
async function run() {
  fs.writeFileSync(F.pid, String(process.pid));
  for (const sg of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sg, () => { try { fs.unlinkSync(F.pid); } catch {} process.exit(0); });
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
    send(typeof nodes === "string" ? `go ${nodes}` : `go nodes ${nodes}`);
    const bm = await done;
    const o = {}; for (const [d, m] of Object.entries(byDepth)) o[d] = [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const ds = Object.keys(o).map(Number).sort((a, b) => b - a);
    const full = Math.min(pv, ds.length > 1 ? o[ds[1]].length : pv);
    const reached = ds.find((d) => o[d].length >= full) ?? ds[0];
    return { list: reached === undefined ? [] : o[reached], bestmove: bm, ms: Date.now() - t0, depth: reached };
  }

  // 1件の失敗(詰みの局面など)で全体を止めない。ログに残して次へ(再起動すると、失敗した件はやり直す)
  const safe = async (label, fn) => { try { return await fn(); } catch (e) { console.error(new Date().toISOString(), "失敗", label, e && e.message); return null; } };
  const scanDone = new Set(readJsonl(F.scan).map((r) => r.key));
  const preDone = new Set(readJsonl(F.pre).map((r) => r.key + "|" + r.usi));
  const confDone = new Set(readJsonl(F.confirm).map((r) => r.key + "|" + r.usi));
  const rank = (list, usi) => { const i = list.findIndex((x) => x.usi === usi); return i < 0 ? null : i + 1; };
  const lossIn = (list, usi) => { const h = list.find((x) => x.usi === usi); return h ? list[0].cp - h.cp : null; };

  // 同じ局面(sfen)は章をまたいで1回だけ測る(序盤の共通の局面など)。第1弾・第2弾の走査(punish1/punish2-scan)も使う
  const scanBySfen = new Map();
  for (const f of [path.join(out, "punish1-scan.jsonl"), path.join(out, "punish2-scan.jsonl"), F.scan]) for (const r of readJsonl(f)) if (r.cands && r.cands.length && r.sfen) scanBySfen.set(r.sfen, r);
  const pickCandidates = (cands, ps) => cands.filter((c) => c.loss >= 300 && !ps.existing.includes(c.usi) && ((c.rD4 && c.rD4 <= 12 && c.lossD4 <= 250) || (c.rN100k && c.rN100k <= 12 && c.lossN100k <= 250)))
    .map((c) => ({ usi: c.usi, jp: c.jp, loss: c.loss }));
  async function scanOne(ps) {
    const t0 = Date.now();
    const old = scanBySfen.get(ps.sfen);
    if (old) {
      const candidates = pickCandidates(old.cands, ps);
      const rec = { key: ps.key, course: ps.course, ply: ps.ply, branch: ps.branch, sfen: ps.sfen, mains: ps.mains, existing: ps.existing, bestCp: old.bestCp, depth: old.depth, msTotal: 0, reusedFrom: old.key, candidates, cands: old.cands };
      append(F.scan, rec);
      console.error(new Date().toISOString(), "走査(同じ局面を流用)", ps.key, "←", old.key, "候補:", candidates.map((c) => `${c.jp}:損${c.loss}`).join(" ") || "なし");
      return rec;
    }
    const sh1 = await search(ps.sfen, 12, "depth 4");
    const sh2 = await search(ps.sfen, 12, 100000);
    const r = await search(ps.sfen, 40, 5000000);
    if (!r.list.length) { console.error("結果なし", ps.key); return null; }
    const best = r.list[0].cp;
    const cands = r.list.map((x) => ({ usi: x.usi, jp: jp(ps.sfen, x.usi), cp: x.cp, loss: best - x.cp, rD4: rank(sh1.list, x.usi), lossD4: lossIn(sh1.list, x.usi), rN100k: rank(sh2.list, x.usi), lossN100k: lossIn(sh2.list, x.usi) }));
    const candidates = pickCandidates(cands, ps);
    const rec = { key: ps.key, course: ps.course, ply: ps.ply, branch: ps.branch, sfen: ps.sfen, mains: ps.mains, existing: ps.existing, bestCp: best, depth: r.depth, msTotal: Date.now() - t0, candidates, cands };
    append(F.scan, rec); scanBySfen.set(ps.sfen, rec);
    console.error(new Date().toISOString(), "走査", ps.key, "最善", cands[0].jp, best, "候補:", candidates.map((c) => `${c.jp}:損${c.loss}`).join(" ") || "なし");
    return rec;
  }

  const preBySfenUsi = new Map(), confBySfenUsi = new Map(); // 局面+手 → 結果(章をまたいで流用)
  const sfenOfKey = new Map(readJsonl(F.scan).map((r) => [r.key, r.sfen]));
  for (const r of readJsonl(F.pre)) preBySfenUsi.set(sfenOfKey.get(r.key) + "|" + r.usi, r);
  for (const r of readJsonl(F.confirm)) confBySfenUsi.set(r.sfen + "|" + r.usi, r);
  async function preOne(sc, c) {
    const t0 = Date.now();
    const hit = preBySfenUsi.get(sc.sfen + "|" + c.usi);
    if (hit) { const rec = { ...hit, key: sc.key, msTotal: 0, reusedFrom: hit.key }; append(F.pre, rec); console.error(new Date().toISOString(), "下調べ(流用)", sc.key, c.jp); return rec; }
    let cur = after(sc.sfen, c.usi); const moves = [c.usi]; const jps = [jp(sc.sfen, c.usi)];
    for (let i = 0; i < 16 && cur; i++) {
      const r = await search(cur, 1, 1000000);
      if (!r.list.length) break;
      jps.push(jp(cur, r.list[0].usi)); moves.push(r.list[0].usi); cur = after(cur, r.list[0].usi);
    }
    const ft = features(sc.sfen, moves);
    const matGain = (ft.mat[ft.mat.length - 1] - ft.mat0) / 2;
    const gate = matGain >= 3 || ft.endHorseDragon.mine > 0 || ft.checkRun >= 2;
    const rec = { key: sc.key, usi: c.usi, jp: c.jp, loss: c.loss, line: jps, moves, matGain, made: ft.made, checks: ft.checks, checkRun: ft.checkRun, endHorseDragon: ft.endHorseDragon, gate, msTotal: Date.now() - t0 };
    append(F.pre, rec); preBySfenUsi.set(sc.sfen + "|" + c.usi, rec);
    console.error(new Date().toISOString(), "下調べ", sc.key, c.jp, `損${c.loss}`, `駒得${matGain}`, "竜馬", JSON.stringify(ft.endHorseDragon), "王手連続", ft.checkRun, gate ? "→確認へ" : "→見送り");
    return rec;
  }

  async function confirmOne(sc, pr) {
    const t0 = Date.now();
    const sfen = sc.sfen, usi = pr.usi;
    const hit = confBySfenUsi.get(sfen + "|" + usi);
    if (hit) { const rec = { ...hit, key: sc.key, msTotal: 0, reusedFrom: hit.key }; append(F.confirm, rec); console.error(new Date().toISOString(), "確認(流用)", sc.key, pr.jp, "→", rec.verdict); return rec; }
    const turn = sfen.split(" ")[1];
    const root1 = await search(sfen, 1, 40000000);
    const child = after(sfen, usi);
    const c1 = await search(child, 1, 40000000);
    const loss = root1.list[0].cp + c1.list[0].cp;
    const base = { key: sc.key, usi, jp: pr.jp, sfen, rootBestJp: jp(sfen, root1.list[0].usi), loss };
    if (loss < 300) { const rec = { ...base, verdict: "不可", reason: "損300未満(4000万ノード)", msTotal: Date.now() - t0 }; append(F.confirm, rec); confBySfenUsi.set(sfen + "|" + usi, rec); console.error(new Date().toISOString(), "確認", sc.key, pr.jp, "不可 損", loss); return rec; }
    let cur = child; const trace = []; const moves = []; const movesUsi = [usi];
    for (let i = 1; i <= 20; i++) {
      const r = await search(cur, 1, 2000000);
      if (!r.list.length) break;
      const mover = cur.split(" ")[1];
      trace.push(mover === turn ? -r.list[0].cp : r.list[0].cp);
      const mv = r.list[0].usi; moves.push(jp(cur, mv)); movesUsi.push(mv);
      const nx = after(cur, mv); if (!nx) break; cur = nx;
    }
    const ft = features(sfen, movesUsi);
    const matGain = (ft.mat[ft.mat.length - 1] - ft.mat0) / 2;
    let cap = []; try { cap = capturable(sfen, movesUsi); } catch {}
    const final = trace[trace.length - 1]; const baseline = -root1.list[0].cp;
    const remains = final !== undefined && final - baseline >= 150;
    const safeMade = ft.made.length > 0 && cap.some((x) => x.opponentAttackers === 0) && ft.endHorseDragon.mine > 0;
    const gains = []; if (matGain >= 3) gains.push(`駒得${matGain}`); if (safeMade) gains.push("竜馬を作れて取られない"); if (ft.checkRun >= 2) gains.push(`王手${ft.checkRun}連続`);
    const verdict = !remains ? "不可" : gains.length ? (matGain >= 3 || safeMade ? "おすすめ" : "保留") : "不可";
    const rec = { ...base, rootCp: root1.list[0].cp, childCp: -c1.list[0].cp, refutation: jp(child, c1.list[0].usi), afterLine: moves, tracePunisher: trace, final, baselinePunisher: baseline, remains, matGain, made: ft.made, checkRun: ft.checkRun, endHorseDragon: ft.endHorseDragon, capturable: cap, gains, movesUsi, verdict, msTotal: Date.now() - t0 };
    append(F.confirm, rec); confBySfenUsi.set(sfen + "|" + usi, rec);
    console.error(new Date().toISOString(), "確認", sc.key, pr.jp, `損${loss}`, `20手後${final}(前${baseline})`, gains.join("/") || "得なし", "→", verdict);
    return rec;
  }

  const courses = await targetCourses();
  console.error(new Date().toISOString(), "開始 対象", courses.length, "章");
  for (const id of courses) {
    const poss = positionsOf(id);
    const scans = [];
    for (const ps of poss) {
      if (scanDone.has(ps.key)) { scans.push(readJsonl(F.scan).find((r) => r.key === ps.key)); continue; }
      const rec = await safe(ps.key, () => scanOne(ps)); if (rec) { scans.push(rec); scanDone.add(ps.key); }
    }
    const pres = [];
    for (const sc of scans.filter(Boolean)) {
      for (const c of sc.candidates) {
        const k = sc.key + "|" + c.usi;
        if (preDone.has(k)) { pres.push({ sc, pr: readJsonl(F.pre).find((r) => r.key === sc.key && r.usi === c.usi) }); continue; }
        const pr = await safe(k, () => preOne(sc, c)); if (pr) { pres.push({ sc, pr }); preDone.add(k); }
      }
    }
    // 確認: 1局面で「おすすめ」が出たら、その局面の残りは確認しない。駒得の大きい順
    const bySc = new Map();
    for (const x of pres.filter((x) => x.pr && x.pr.gate)) { if (!bySc.has(x.sc.key)) bySc.set(x.sc.key, []); bySc.get(x.sc.key).push(x); }
    for (const [, list] of bySc) {
      list.sort((a, b) => b.pr.matGain - a.pr.matGain);
      const prior = readJsonl(F.confirm);
      let got = prior.some((r) => r.key === list[0].sc.key && r.verdict === "おすすめ");
      for (const x of list) {
        if (got) break;
        const k = x.sc.key + "|" + x.pr.usi;
        if (confDone.has(k)) continue;
        const rec = await safe(k, () => confirmOne(x.sc, x.pr)); confDone.add(k);
        if (rec && rec.verdict === "おすすめ") got = true;
      }
    }
    console.error(new Date().toISOString(), "章の終わり", id);
  }
  console.error(new Date().toISOString(), "全部終わり");
  try { fs.unlinkSync(F.pid); } catch {}
  eng.close(); setTimeout(() => process.exit(0), 700);
}

const mode = process.argv[2];
if (mode === "status") status().catch((e) => { console.error(e); process.exit(1); });
else if (mode === "run") run().catch((e) => { console.error("失敗:", e && e.stack); try { fs.unlinkSync(F.pid); } catch {} process.exit(1); });
else console.error("使い方: node scripts/punish-sweep.cjs run | status");
