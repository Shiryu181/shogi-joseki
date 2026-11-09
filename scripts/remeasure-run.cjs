/**
 * 新エンジン(つようら王11mini)での測り直し(A の範囲)を回す。1局面ずつ測り、1行ずつ追記保存。再開できる。
 *   node scripts/remeasure-run.cjs --stage 1            1段目(500万ノード、MultiPV 8)
 *   node scripts/remeasure-run.cjs --stage 2            2段目(4000万ノード)。対象は stage2-cases.json
 *   node scripts/remeasure-run.cjs --make-stage2        1段目の結果から2段目の対象を書き出す(1段目の最後にも自動で行う)
 *   node scripts/remeasure-run.cjs --status [--stage 2] 進み具合を1行で出す
 * 組の選択: --set C(本線の記録なし局面。既定は A)。入力・出力名の remeasure-A- が remeasure-C- になる。
 *   --limit N  先頭から N 局面だけ測る(試し)。環境変数 REMEASURE_TAG=TRIAL で出力名に TRIAL を付け、本番データと分ける。
 * 入力 : scripts/lab-out/remeasure-A-cases.json (node scripts/remeasure-cases.mjs で作る)
 * 出力 : scripts/lab-out/remeasure-A-stage1.jsonl / remeasure-A-stage2-cases.json / remeasure-A-stage2.jsonl
 * 1局面の記録: {id, sfen, kinds, courses, nodes, reachedDepth, ms, nps, best, bestCp, top[8], moves:[{usi,kinds,loss,via,margin,second,cp}]}
 *   loss   = 最善の評価 - その手の評価(手番側から見た値)。候補8手に無い手は指した後を探索して求める(via:"child")
 *   margin = その手が最善のとき、次善との差
 * 境目: 100以内=損60〜140 / 咎め=損250〜350 / 唯一=次善との差60〜140
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove } = require("tsshogi");
process.env.ENGINE = process.env.ENGINE || "native";
const { createUsi } = require("./lib/usi-engine.cjs");

const out = path.join(__dirname, "lab-out");
const args = process.argv.slice(2);
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const STAGE = Number(argVal("--stage", 1));
const NODES = Number(argVal("--nodes", STAGE === 2 ? 40000000 : 5000000));
const PV = 8;
const SET = argVal("--set", "A"); // 対象の組: A / C。出力ファイル名の remeasure-<SET>- が変わる
if (!/^[A-Z]$/.test(SET)) { console.error("--set は A か C"); process.exit(1); }
const TAG = process.env.REMEASURE_TAG || ""; // 試し用: 出力名に付ける(例 TRIAL)。A の既存データを汚さない
const F = {
  cases: path.join(out, `remeasure-${SET}-cases${TAG}.json`),
  s1: path.join(out, `remeasure-${SET}-stage1${TAG}.jsonl`),
  s2cases: path.join(out, `remeasure-${SET}-stage2-cases${TAG}.json`),
  s2: path.join(out, `remeasure-${SET}-stage2${TAG}.jsonl`),
};
const LIMIT = Number(argVal("--limit", 0)); // 試し用: 先頭からこの数だけ測る
const casesFile = STAGE === 2 ? F.s2cases : F.cases;
const resultFile = STAGE === 2 ? F.s2 : F.s1;

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);
const fmt = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}時間${m % 60}分`; };
const clock = (t) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 境目に入った手があるか(100以内=損60〜140、咎め=損250〜350、唯一=差60〜140)
function borderReasons(rec) {
  const rs = [];
  for (const m of rec.moves) {
    const punish = m.kinds.some((k) => k === "咎めの外れる手");
    const unique = m.kinds.some((k) => k.startsWith("唯一"));
    const other = m.kinds.some((k) => !k.startsWith("唯一") && k !== "咎めの外れる手");
    if (punish && m.loss != null && m.loss >= 250 && m.loss <= 350) rs.push(`咎め ${m.usi} 損${m.loss}`);
    if (other && m.loss != null && m.loss >= 60 && m.loss <= 140) rs.push(`100以内 ${m.usi} 損${m.loss}`);
    if (unique) {
      if (m.loss === 0 && m.margin != null && m.margin >= 60 && m.margin <= 140) rs.push(`唯一 ${m.usi} 差${m.margin}`);
      else if (m.loss != null && m.loss >= 60 && m.loss <= 140) rs.push(`唯一(最善でない) ${m.usi} 損${m.loss}`);
    }
  }
  if (!rec.moves.length && rec.top.length > 1) { const d = rec.top[0].cp - rec.top[1].cp; if (d >= 60 && d <= 140) rs.push(`唯一(手の指定なし) 差${d}`); }
  return rs;
}

function makeStage2() {
  const cases = new Map(JSON.parse(fs.readFileSync(F.cases, "utf8")).map((c) => [c.id, c]));
  const res = readJsonl(F.s1);
  const list = [];
  for (const r of res) {
    const rs = borderReasons(r);
    if (rs.length && cases.has(r.id)) list.push({ ...cases.get(r.id), stage1Reasons: rs });
  }
  fs.writeFileSync(F.s2cases, JSON.stringify(list, null, 1));
  return { done: res.length, total: cases.size, stage2: list.length };
}

function status() {
  if (!fs.existsSync(casesFile)) { console.log(`対象の一覧がまだ無い: ${casesFile}`); return; }
  const total = JSON.parse(fs.readFileSync(casesFile, "utf8")).length;
  const res = readJsonl(resultFile);
  const done = new Set(res.map((r) => r.id)).size;
  const avg = res.length ? res.reduce((a, r) => a + r.ms, 0) / res.length : 0;
  const left = total - done;
  const last = fs.existsSync(resultFile) ? fs.statSync(resultFile).mtimeMs : 0;
  let running = "不明";
  try { running = require("node:child_process").execSync("pgrep -f 'remeasure-run.cjs.*--stage'", { encoding: "utf8" }).trim().split("\n").length > 0 ? "実行中" : "止まっている"; } catch { running = "止まっている"; }
  console.log(`組${SET} 段${STAGE}: ${done}/${total}局面 済 | 平均${Math.round(avg / 1000)}秒/局面 | 残り${left}局面 約${fmt(left * avg)} | 終了見込み ${left ? clock(Date.now() + left * avg) : "完了"} | ${running} | 最終記録 ${last ? clock(last) : "-"}`);
}

if (args.includes("--status")) { status(); process.exit(0); }
if (args.includes("--make-stage2")) { console.log(makeStage2()); process.exit(0); }

function after(sfen, usi) {
  const p = new Position(); p.resetBySFEN(sfen);
  const parsed = parseUSIMove(usi); if (!parsed) return null;
  let m = p.createMove(parsed.from, parsed.to); if (!m) return null;
  if (parsed.promote) m = m.withPromote();
  if (!p.isValidMove(m) || !p.doMove(m)) return null;
  return p.sfen;
}

(async () => {
  if (STAGE === 2 && !fs.existsSync(F.s2cases)) { console.error("2段目の対象が無い。先に --make-stage2"); process.exit(1); }
  const eng = await createUsi();
  let waiter = null;
  eng.setHandler((l) => { if (waiter) waiter(l); });
  const send = (c) => eng.send(c);
  const wait = (pred) => new Promise((res) => { waiter = (l) => { if (pred(l)) { waiter = null; res(l); } }; });
  let p = wait((l) => l === "usiok"); send("usi"); await p;
  for (const c of eng.initOptions()) send(c);
  p = wait((l) => l === "readyok"); send("isready"); await p;

  async function search(sfen, pv) {
    const byDepth = {}; const t0 = Date.now(); let nodes = 0;
    send("usinewgame");
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
    send(`go nodes ${NODES}`);
    await done;
    const o = {};
    for (const [d, m] of Object.entries(byDepth)) o[d] = [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    // 最後の反復が途中で切れると候補が欠けるので、候補の数が揃っている最も深い深さを使う
    const ds = Object.keys(o).map(Number).sort((a, b) => b - a);
    const full = Math.min(pv, ds.length > 1 ? o[ds[1]].length : pv);
    const reached = ds.find((d) => o[d].length >= full) ?? ds[0];
    return { list: reached === undefined ? [] : o[reached], ms: Date.now() - t0, nodes, reached };
  }

  const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
  const doneIds = new Set(readJsonl(resultFile).map((r) => r.id));
  console.error(`段${STAGE} 開始: 全${cases.length}、済${doneIds.size}、nodes=${NODES} ${new Date().toISOString()}`);
  let ran = 0;
  for (const c of cases) {
    if (doneIds.has(c.id)) continue;
    if (LIMIT && ran >= LIMIT) break;
    ran++;
    const s = await search(c.sfen, PV);
    let ms = s.ms;
    if (!s.list.length) { console.error(`${c.id}: 探索結果なし(スキップ)`); continue; }
    const list = s.list;
    const moves = [];
    for (const mv of c.moves) {
      const hit = list.find((x) => x.usi === mv.usi);
      let loss = null, via = "list", cp = hit ? hit.cp : null;
      if (hit) loss = list[0].cp - hit.cp;
      else {
        const ns = after(c.sfen, mv.usi);
        via = "child";
        if (ns) {
          const cs = await search(ns, 1); ms += cs.ms;
          if (cs.list.length) { cp = -cs.list[0].cp; loss = list[0].cp + cs.list[0].cp; }
        }
      }
      const margin = hit && loss === 0 && list.length > 1 ? list[0].cp - list[1].cp : null;
      moves.push({ usi: mv.usi, kinds: mv.kinds, cp, loss, via, margin, second: hit && loss === 0 && list[1] ? list[1].usi : null });
    }
    const rec = {
      id: c.id, sfen: c.sfen, kinds: c.kinds, courses: c.courses, stage: STAGE, engine: eng.kind, nodesLimit: NODES,
      nodes: s.nodes, reachedDepth: s.reached, ms, nps: s.ms ? Math.round(s.nodes / (s.ms / 1000)) : null,
      best: list[0].usi, bestCp: list[0].cp, top: list, moves,
    };
    fs.appendFileSync(resultFile, JSON.stringify(rec) + "\n");
    console.error(`${new Date().toISOString()} ${c.id} ${c.kinds[0]} best=${rec.best}(${rec.bestCp}) ` + moves.map((m) => `${m.usi}:loss=${m.loss}${m.margin != null ? ",m=" + m.margin : ""}`).join(" ") + ` (${Math.round(ms / 1000)}s)`);
  }
  if (STAGE === 1 && !LIMIT) console.error("2段目の対象:", JSON.stringify(makeStage2()));
  if (STAGE === 1 && LIMIT) console.error("試し(--limit)なので2段目の対象は作らない");
  console.error(`段${STAGE} 完了 ${new Date().toISOString()}`);
  eng.close();
  setTimeout(() => process.exit(0), 700);
})().catch((e) => { console.error("失敗:", e && e.stack); process.exit(1); });
