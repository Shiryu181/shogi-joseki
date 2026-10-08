/**
 * コース作りの「エンジン作業」を1本にまとめた無人実行スクリプト。
 * 出力の表(<out>.md)と JSON(<out>.json)だけを人(LLM)が読めばよい。
 *
 * 使い方:
 *   node scripts/course-lab.cjs --side sente|gote --prefix "usi usi ..." [--force "23:4f4e,25:3d3c"]
 *        [--plies 14] [--ms 3000] [--out scripts/lab-out/<name>]
 *   node scripts/course-lab.cjs --side sente --course <id> --upto N ...
 *
 * 1. 延長   : 開始手順のあと --plies 手をエンジンに指させる(自分=--force か最善、相手=最善)
 * 2. 二度測り: 全手について指した後の評価を ms と 2×ms の2回測る(自分視点)
 *              自分の手は最善手との差>=100で NOT_ACCEPTED、相手の手は最善より100以上悪いと「悪手」
 * 3. 許容手 : 自分の全局面を accepted-cache.json に追記(annotate-accepted.cjs と同じ形式・ms2000・tol100)
 * 4. 咎め   : 相手の手番の局面ごとに、損230〜900の候補を長い持ち時間の指し継ぎで確認して1つ採用
 * 5. エンジンが固まったら作り直して1回やり直し、駄目ならその手は SKIPPED で続行。途中結果は都度書き出す。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove, formatMove } = require("tsshogi");
const { createEngine } = require("./lib/engine.cjs");

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const SIDE = arg("--side");
const MS = Number(arg("--ms", 3000));
const PLIES = Number(arg("--plies", 14));
const COURSE = arg("--course");
const UPTO = arg("--upto");
const FORCE_ARG = arg("--force", "");
const PUNISH_FROM = Number(arg("--pfrom", 0));      // この手数以降の相手の手だけ咎めを探す
const FIRST = args.includes("--first");
const NO_PUNISH = args.includes("--no-punish");
const OUT = path.resolve(arg("--out", path.join(__dirname, "lab-out", "lab")));

// annotate-accepted.cjs と同じ設定(キャッシュの meta と合わせる)
const CACHE_MS = 2000, TOL = 100, ACC_PV = 20, MAX_ACCEPTED = 12;
// make-punishments.cjs と同じ設定
const CAND_PV = 14, LOSS_MIN = 230, LOSS_MAX = 900, VERIFY_MS = Number(arg("--verifyms", 3000)), PLAY_PLIES = 8, KEEP_GAIN = 200;
const FLAG_GAP = 100, STOP_EVAL = 1500;
const START_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const CACHE = path.join(__dirname, "accepted-cache.json");

if (SIDE !== "sente" && SIDE !== "gote") { console.error("--side sente|gote が必要です"); process.exit(1); }
const LEARNER = SIDE === "sente" ? "b" : "w";

// ---- 開始手順 ----
let prefix = [];
if (COURSE) {
  const c = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "joseki", `${COURSE}.json`), "utf-8"));
  let node = c.root;
  while (true) { const m = node.branches.find((b) => b.kind === "main"); if (!m || !m.child) break; prefix.push(m.usi); node = m.child; }
  if (UPTO !== undefined) prefix = prefix.slice(0, Number(UPTO));
} else {
  prefix = arg("--prefix", "").split(/\s+/).filter(Boolean);
}
const forced = {};
for (const s of FORCE_ARG.split(",").filter(Boolean)) { const [n, u] = s.split(":"); forced[Number(n)] = u; }

// ---- 補助 ----
const key = (sfen) => sfen.split(" ").slice(0, 3).join(" ");
const turn = (sfen) => sfen.split(" ")[1];
const view = (cp, t) => (t === LEARNER ? cp : -cp);      // 手番tから見た値 → 自分視点
const sg = (n) => (n === null || n === undefined ? "-" : Math.abs(n) >= 20000 ? (n > 0 ? "詰勝" : "詰負") : (n > 0 ? "+" : "") + n);
function mkMove(pos, usi) {
  const q = parseUSIMove(usi); if (!q) return null;
  let m = pos.createMove(q.from, q.to); if (m && q.promote) m = m.withPromote();
  return m && pos.isValidMove(m) ? m : null;
}
/** pos を進めず、その手の日本語表記だけ返す(不正なら null)。 */
function jp(sfen, usi) {
  const p = new Position(); p.resetBySFEN(sfen); const m = mkMove(p, usi);
  return m ? formatMove(p, m) : null;
}
function jpLine(sfen, usis) {
  const p = new Position(); p.resetBySFEN(sfen); const o = [];
  for (const u of usis) { const m = mkMove(p, u); if (!m) break; o.push(formatMove(p, m)); p.doMove(m); }
  return o.join(" ");
}

const logErr = (s) => process.stderr.write(s + "\n");
const engine = createEngine(logErr);
const memo = new Map();
async function multi(sfen, pv, ms) {
  const k = `${sfen}|${pv}|${ms}`;
  if (memo.has(k)) return memo.get(k);
  const r = await engine.search(sfen, pv, ms);
  if (r) memo.set(k, r);
  return r;
}

let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf-8")) : { meta: {}, positions: {} };
if (cache.meta.ms !== CACHE_MS || cache.meta.tol !== TOL) {
  if (Object.keys(cache.positions).length > 0) { console.error(`accepted-cache の設定が違います (ms=${cache.meta.ms} tol=${cache.meta.tol})。キャッシュには書きません。`); cache = null; }
  else cache.meta = { ms: CACHE_MS, tol: TOL };
}
let cacheDirty = false;
function saveCache() {
  if (!cache || !cacheDirty) return;
  cache.meta = { ms: CACHE_MS, tol: TOL, updated: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n", "utf-8"); cacheDirty = false;
}

/** 自分の局面の最善手・許容手。キャッシュにあれば使い、無ければ 20PV/2000ms で測って書き足す。 */
async function learnerInfo(sfen) {
  const k = key(sfen);
  const hit = cache && cache.positions[k];
  if (hit) return { best: hit.best, cp: hit.cp, accepted: hit.accepted, ranked: null, cached: true };
  const ranked = await multi(sfen, ACC_PV, CACHE_MS);
  if (!ranked || ranked.length === 0) return null;
  const best = ranked[0];
  const accepted = ranked.filter((r) => best.cp - r.cp <= TOL).slice(0, MAX_ACCEPTED).map((r) => r.usi);
  if (cache) {
    cache.positions[k] = { best: best.usi, cp: best.cp, gap: ranked.length > 1 ? best.cp - ranked[1].cp : null, accepted, courses: ["_lab"] };
    cacheDirty = true;
  }
  return { best: best.usi, cp: best.cp, accepted, ranked, cached: false };
}

// ---- 出力 ----
const data = { v: 2, side: SIDE, ms: MS, prefixLen: prefix.length, rows: [], punishments: [], usi: [], done: false };
function render() {
  const L = [];
  L.push(`# コース実験 (${SIDE === "sente" ? "先手" : "後手"}・ms=${MS}/${MS * 2}・評価は自分視点)`);
  L.push("");
  L.push("手数|手|手番|評価1|評価2|最善手|最善の評価|差|印");
  L.push("--|--|--|--|--|--|--|--|--");
  for (const r of data.rows) {
    L.push([r.ply, r.text ?? r.usi, r.mine ? "自分" : "相手", sg(r.e1), sg(r.e2),
      r.bestText && r.bestUsi !== r.usi ? r.bestText : "-", r.bestUsi !== r.usi ? sg(r.bestEval) : "-",
      r.gap > 0 ? r.gap : "-", r.flags.join(",")].join("|"));
  }
  L.push("");
  L.push("## 咎め (相手のミス → 自分の手順)");
  if (data.punishments.length === 0) L.push("(なし)");
  for (const p of data.punishments) {
    L.push(`- ${p.ply}手目 ${p.badText}(損${p.loss}${p.played ? "・本線で指した手" : ""}): ${p.lineText} | ${sg(p.before)} → ${sg(p.after)}(最高${sg(p.peak)})`);
    if (p.alts && p.alts.length) L.push(`  他の確認済み: ${p.alts.map((a) => `${a.badText}(損${a.loss}→${sg(a.after)})`).join(" ")}`);
    L.push(`  usi:"${p.badUsi}" / line:[${p.lineUsi.map((u) => `"${u}"`).join(", ")}]`);
  }
  L.push("");
  L.push(`USI: ${data.usi.join(" ")}${data.done ? "" : "  (途中)"}`);
  return L.join("\n") + "\n";
}
function flush() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT + ".json", JSON.stringify(data, null, 1) + "\n", "utf-8");
  fs.writeFileSync(OUT + ".md", render(), "utf-8");
  saveCache();
}

// ---- 既存JSONの再描画(エンジン不要): 旧版の出力の符号誤りと負の差を直して md を書き直す ----
const RERENDER = arg("--rerender");
if (RERENDER) {
  delete data.v;
  Object.assign(data, JSON.parse(fs.readFileSync(RERENDER, "utf-8")));
  if (!data.v) { // 旧版: 咎めの before の符号が逆で、確認の基準も誤っていた
    for (const p of data.punishments) p.before = -p.before;
    data.punishments = data.punishments.filter((p) => p.after >= p.before + KEEP_GAIN);
    data.v = 2;
  }
  for (const r of data.rows) if (r.gap < 0) r.gap = 0;
  fs.writeFileSync(OUT + ".json", JSON.stringify(data, null, 1) + "\n", "utf-8");
  fs.writeFileSync(OUT + ".md", render(), "utf-8");
  console.log(`再描画: ${OUT}.md (咎め ${data.punishments.length}件)`); process.exit(0);
}

// ---- 本体 ----
(async () => {
  const t0 = Date.now();
  const pos = new Position(); pos.resetBySFEN(START_SFEN);
  const total = prefix.length + PLIES;
  const oppPositions = []; // 咎め探索用 {ply, sfen, usi}
  let stopped = false;

  for (let ply = 1; ply <= total && !stopped; ply++) {
    const sfen = pos.sfen;
    const mover = turn(sfen);
    const mine = mover === LEARNER;
    const row = { ply, mine, flags: [] };
    let usi = ply <= prefix.length ? prefix[ply - 1] : null;
    let info = null, cands = null;

    // 指す前の局面の候補手(最善手・許容手・相手の悪手判定・咎め候補に使う)
    if (mine) info = await learnerInfo(sfen);
    else cands = await multi(sfen, CAND_PV, MS);

    if (!usi) { // 延長
      if (ply in forced) usi = forced[ply];
      else if (mine && info) usi = info.best;
      else if (!mine && cands && cands.length) usi = cands[0].usi;
      if (!usi) { logErr(`${ply}手目: 手が決められないので延長を終了`); break; }
    }
    const move = mkMove(pos, usi);
    if (!move) { console.error(`${ply}手目 ${usi} は不正な手です`); data.rows.push({ ...row, usi, flags: ["SKIPPED"] }); flush(); break; }
    row.usi = usi; row.text = formatMove(pos, move);
    if (ply <= prefix.length && ply in forced) logErr(`(--force ${ply} は開始手順の範囲内なので無視)`);

    // 指す前の最善手
    const bestSide = mine ? info : (cands && cands[0] ? { best: cands[0].usi, cp: cands[0].cp } : null);
    if (bestSide) {
      row.bestUsi = bestSide.best; row.bestText = jp(sfen, bestSide.best);
      row.bestEval = view(bestSide.cp, mover);
    }

    pos.doMove(move);
    data.usi.push(usi);
    const after = pos.sfen;

    // 二度測り(指した後の局面。手番は相手側)
    const m1 = await multi(after, 1, MS);
    const m2 = await multi(after, 1, MS * 2);
    if (!m1 || !m2 || !m1.length || !m2.length) {
      if (!(m1 && m1.length === 0)) row.flags.push("SKIPPED"); // 合法手なし(詰み)は skip ではない
      else { row.e1 = row.e2 = view(-30000, turn(after)); }
    } else { row.e1 = view(m1[0].cp, turn(after)); row.e2 = view(m2[0].cp, turn(after)); }

    // 差と印
    if (row.e2 !== undefined && row.bestEval !== undefined) {
      let bookCp = row.e2;                                 // 自分視点の「実際の手の後」
      if (mine && info && info.ranked) { const f = info.ranked.find((r) => r.usi === usi); if (f) bookCp = view(f.cp, mover); }
      if (!mine && cands) { const f = cands.find((r) => r.usi === usi); if (f) bookCp = view(f.cp, mover); }
      if (usi === row.bestUsi) row.gap = 0;                 // 最善手そのものなら差は0(測定誤差を出さない)
      else if (mine) row.gap = row.bestEval - bookCp;       // 自分: 最善より何点悪いか
      else row.gap = bookCp - row.bestEval;                 // 相手: 相手の最善より何点悪いか(相手の損)
      row.gap = Math.max(0, row.gap);                       // 別々の探索の誤差で負にならないよう0で止める
      if (mine && info && !info.accepted.includes(usi)) row.flags.push("NOT_ACCEPTED");
      if (!mine && row.gap >= FLAG_GAP) row.flags.push("悪手");
    }
    if (!mine) oppPositions.push({ ply, sfen, usi, cands, row });

    data.rows.push(row);
    flush();
    if (ply > prefix.length && row.e2 !== undefined && Math.abs(row.e2) >= STOP_EVAL) { stopped = true; logErr(`${ply}手目で評価 ${sg(row.e2)}。延長を終了`); }
    if (ply > prefix.length && m1 && m1.length === 0) stopped = true;
  }

  // ---- 咎め ----
  if (!NO_PUNISH) {
    for (const o of oppPositions) {
      if (o.ply < PUNISH_FROM || !o.cands || o.cands.length < 2) continue;
      const top = o.cands[0].cp;
      const bads = o.cands.slice(1).filter((c) => top - c.cp >= LOSS_MIN && top - c.cp <= LOSS_MAX);
      const confirmed = [];
      for (const bad of bads) { // 候補すべてを長い持ち時間で確かめる(--first なら最初に確認できたもので打ち切り)
        const p = new Position(); p.resetBySFEN(o.sfen);
        const m0 = mkMove(p, bad.usi); if (!m0) continue;
        const badText = formatMove(p, m0);
        const before = view(top, turn(o.sfen)); // 相手が最善を指した場合の、自分視点の評価(top は相手視点)
        p.doMove(m0);
        const afterBad = p.sfen;
        const seq = []; let peak = -99999, last = null, ok = true;
        for (let k = 0; k < PLAY_PLIES; k++) {
          const r = await multi(p.sfen, 2, VERIFY_MS);
          if (!r || r.length === 0) { ok = k > 0 && r !== null; break; }
          const mineV = view(r[0].cp, turn(p.sfen));
          if (k === 0 && mineV < before + KEEP_GAIN) { ok = false; break; }
          peak = Math.max(peak, mineV); last = mineV;
          const mv = mkMove(p, r[0].usi); if (!mv) break;
          seq.push({ usi: r[0].usi, text: formatMove(p, mv) });
          p.doMove(mv);
        }
        if (!ok || last === null || last < before + KEEP_GAIN) continue;
        confirmed.push({ ply: o.ply, badUsi: bad.usi, badText, loss: top - bad.cp, played: bad.usi === o.usi,
          lineText: seq.map((x) => x.text).join(" "), lineUsi: seq.map((x) => x.usi), before, after: last, peak });
        if (FIRST) break;
      }
      if (confirmed.length) {
        // 咎めたあとの評価が最高のものから150点以内の中で、損が最も小さい=自然な手を採る
        const maxAfter = Math.max(...confirmed.map((c) => c.after));
        const chosen = confirmed.filter((c) => maxAfter - c.after <= 150).sort((a, b) => a.loss - b.loss)[0];
        chosen.alts = confirmed.filter((c) => c !== chosen).sort((a, b) => b.after - a.after).slice(0, 6).map((c) => ({ badUsi: c.badUsi, badText: c.badText, loss: c.loss, after: c.after }));
        data.punishments.push(chosen); flush();
      }
    }
  }

  data.done = true; data.elapsedSec = Math.round((Date.now() - t0) / 1000);
  flush(); engine.close();
  const flagged = data.rows.filter((r) => r.flags.length);
  console.log(`${data.rows.length}手 / 印あり ${flagged.length}手 (${flagged.map((r) => `${r.ply}${r.flags[0]}`).join(" ") || "なし"}) / 咎め ${data.punishments.length}件 (${data.punishments.map((p) => p.ply).join(",") || "-"})`);
  console.log(`所要 ${data.elapsedSec}秒 / キャッシュ追記 ${cache ? "あり" : "なし"}`);
  console.log(`${OUT}.md  ${OUT}.json`);
  process.exit(0);
})().catch((e) => { try { flush(); } catch {} console.error("失敗:", e && e.stack || e); process.exit(1); });
