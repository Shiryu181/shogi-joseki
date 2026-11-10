// 測り直し D(境目の124局面。置換表を毎回消す測り方)の結果をまとめる。章のデータは変えない。
// 使い方: node scripts/remeasure-D-summary.mjs  → scripts/lab-out/remeasure-D-result.json と、画面への要約
// 入力: scripts/lab-out/remeasure-D-cases.json / remeasure-D-stage1.jsonl(D の値)
//       scripts/lab-out/remeasure-A/C-stage1/2.jsonl・proposal2-cache.jsonl(古い測り方=置換表を消さない値)
//       src/data/joseki/<章>.json(画面の文と手の並び)
// 基準: PLAN.md「エンジンと基準の数字(2026-11-08 改定)」。学ぶ側・相手の本線の手=最善との差100以内/咎め=相手の損300以上/唯一=次善との差100以上。
//       作戦選びの例外(EXCEPTIONS)は100以内の対象にしない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Position, parseUSIMove, formatMove } = require("tsshogi");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lab = path.join(root, "scripts/lab-out");
const B = 37; // 初手の評価(形勢の言葉は v−B で決める)
const key = (s) => s.split(" ").slice(0, 3).join(" ");
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);

// ---- 作戦選びの例外(PLAN.md 2026-11-09〜10 の項目。章 | 手数 | 指し手) ----
const EXC_TXT = `
sankenbisha-gote--aisanken|4|4c4d
sankenbisha-gote--aisanken|6|8b3b
sankenbisha-gote--aifuri-naka|3|5g5f
sankenbisha-gote--aifuri-naka|4|4c4d
sankenbisha-gote--aifuri-naka|6|8b3b
sankenbisha-gote--deashi|3|5g5f
sankenbisha-gote--deashi|4|4c4d
sankenbisha-ishida--aifuri|3|6g6f
sankenbisha-ishida--deashi|3|6g6f
sankenbisha-ishida--aifuri-shiken|4|4c4d
sankenbisha-ishida--aifuri-shiken|6|8b3b
sankenbisha-ishida--aifuri-shiken|6|8b5b
sankenbisha-ishida--deashi|4|4c4d
sankenbisha-ishida--hidarimino|21|8h7g
nakabisha-vs-sankenbisha--aifuri|3|6g6f
nakabisha-vs-ibisha--gokigen24|7|2e2d
nakabisha--shote|4|5c5d
ibisha-vs-gokigen--chousoku|4|5c5d
nakabisha-vs-8yonfu--kakukoukan|9|5i6h
nakabisha-vs-anaguma--7suji|9|4i5h
nakabisha-vs-anaguma--7suji|19|9i9h
nakabisha-vs-hidarimino--gote|9|4i5h
nakabisha-vs-anaguma--sente|16|2b3c
nakabisha-vs-hidarimino--sente|16|2b3c
`.trim().split("\n");
const EXC = new Set(EXC_TXT);
const exRe = /より良い手\(.*?\)もありますが/;
const negRe = /唯一(の手|の)?(では|じゃ)(ありません|ない)/g;
const hasUniq = (t) => typeof t === "string" && t.replace(negRe, "").includes("唯一");

// ---- D の値 ----
const dRecs = new Map(readJsonl(path.join(lab, "remeasure-D-stage1.jsonl")).map((r) => [r.id, r]));
const cases = JSON.parse(fs.readFileSync(path.join(lab, "remeasure-D-cases.json"), "utf8"));
// top の重複(同じ指し手が2回)を除く
for (const r of dRecs.values()) { const s = new Set(); r.top = r.top.filter((t) => (s.has(t.usi) ? false : (s.add(t.usi), true))); }
// ---- 古い測り方(置換表を消さない)の値 ----
const oldRecs = new Map(); // key -> {rec, src}
for (const [f, st, label] of [["remeasure-A-stage1", 1, "500万"], ["remeasure-C-stage1", 1, "500万"], ["remeasure-A-stage2", 2, "4000万"], ["remeasure-C-stage2", 2, "4000万"]])
  for (const r of readJsonl(path.join(lab, f + ".jsonl"))) { const o = oldRecs.get(r.id); if (!o || st >= o.st) oldRecs.set(r.id, { rec: r, st, src: label }); }
const oldCache = new Map();
for (const r of readJsonl(path.join(lab, "proposal2-cache.jsonl"))) if (r.top && r.top.length >= 2) oldCache.set(r.key, r);

// ---- 手の日本語表記 ----
const half = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
function jp(sfen, usi) {
  try {
    const p = Position.newBySFEN(sfen); const q = parseUSIMove(usi);
    let m = q.from ? p.createMove(q.from, q.to) : p.createMove(q.piece, q.to);
    if (!m) return usi;
    if (q.promote) m = m.withPromote();
    return half(formatMove(p, m)).replace("☗", "▲").replace("☖", "△");
  } catch { return usi; }
}

// ---- 章を歩いて、D の局面にある手を全部拾う ----
const courseIds = [...new Set(cases.flatMap((c) => c.courses.map((x) => x.course)))].sort();
const occ = [];
for (const cid of courseIds) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${cid}.json`), "utf8"));
  (function walk(node, depth, ctx, trunk) {
    const k = key(node.sfen); const r = dRecs.get(k);
    const t = node.sfen.split(" ")[1] === "w" ? "gote" : "sente";
    for (const b of node.branches) {
      const nt = trunk && b.kind === "main";
      if (r) {
        const m = r.moves.find((x) => x.usi === b.usi);
        const role = b.kind === "deviation" && !b.variation ? "punish" : nt ? "main" : ctx === "dev" ? "inDev" : "var";
        occ.push({ course: cid, ply: depth + 1, usi: b.usi, key: k, sfen: node.sfen, role, mine: t === c.mySide, turn: t, goalLabel: c.goalLabel,
          loss: m?.loss, margin: m?.margin, cp: m?.cp,
          texts: { note: b.note, aim: b.aim, punishNote: b.punishNote, childComment: b.child?.comment, nodeComment: node.comment },
          exc: EXC.has(`${cid}|${depth + 1}|${b.usi}`) || [b.note, b.aim, b.punishNote, b.child?.comment].some((x) => typeof x === "string" && exRe.test(x)) });
      }
      if (b.child) {
        let nc = ctx;
        if (b.kind === "deviation") nc = b.variation ? "var" : "dev"; else if (!nt && ctx === "trunk") nc = "dev";
        walk(b.child, depth + 1, nc, nt);
      }
    }
  })(c.root, 0, "trunk", true);
}

// ---- 判定 ----
// 局面+手ごとにまとめる(章をまたぐ)
const groups = new Map();
for (const o of occ) { const g = `${o.key}|${o.usi}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
const J = { changed: [], same: {} };
const bump = (k) => (J.same[k] = (J.same[k] || 0) + 1);
const rows = [];
for (const [g, os] of groups) {
  const o0 = os[0]; const r = dRecs.get(o0.key);
  const roles = os.map((o) => o.role);
  const subject = os.filter((o) => o.role !== "punish" && !(o.role === "inDev" && !o.mine) && !o.exc); // 100以内の対象になる出現
  const isPunish = roles.every((x) => x === "punish");
  const isExc = os.every((o) => o.exc);
  const uniqClaim = os.some((o) => hasUniq(o.texts.note) || hasUniq(o.texts.aim));
  const loss = o0.loss, margin = o0.margin;
  const f = [];
  if (isPunish) { if (loss >= 300) bump("咎め300以上のまま"); else f.push({ kind: "咎め300未満", v: loss }); }
  else if (isExc) { if (loss > 100) bump("例外のまま(100超)"); else f.push({ kind: "例外が不要に", v: loss }); }
  else if (subject.length) { if (loss <= 100) bump("100以内のまま"); else f.push({ kind: "100超", v: loss }); }
  else bump("対象外(咎めの枝の中の相手の手)");
  if (uniqClaim) { if (loss === 0 && margin >= 100) bump("唯一のまま"); else f.push({ kind: loss > 0 ? "唯一なのに最善でない" : "唯一なのに次善との差100未満", v: loss > 0 ? loss : margin }); }
  else if (!isPunish && loss === 0 && margin >= 100) f.push({ kind: "唯一でない文で差100以上", v: margin });
  else if (!isPunish && loss === 0) bump("唯一と書かず差100未満のまま");
  rows.push({ g, os, f, loss, margin, cp: o0.cp });
  for (const x of f) J.changed.push({ ...x, group: g, courses: os.map((o) => `${o.course} ${o.ply}手目`), usi: o0.usi, move: jp(o0.sfen, o0.usi), role: [...new Set(roles)], exc: isExc, loss, margin, best: r.best, bestMove: jp(o0.sfen, r.best), bestCp: r.bestCp });
}

// ---- 古い測り方との差 ----
const deltas = [];
for (const c of cases) {
  const d = dRecs.get(c.id); if (!d) continue;
  const old = oldRecs.get(c.id); const oc = oldCache.get(c.id);
  const dMargin = d.top.length > 1 ? d.top[0].cp - d.top[1].cp : null;
  for (const [kind, usi, v] of c.reasons) {
    let nv = null, src = old ? old.src : oc ? "500万(第2弾)" : "-";
    if (kind === "100以内" || kind === "唯一(最善でない)") { const m = d.moves.find((x) => x.usi === usi); nv = m?.loss ?? null; }
    else if (kind === "次善との差" || kind === "唯一") nv = d.best === usi ? dMargin : null;
    else if (kind.startsWith("第2弾")) nv = dMargin;
    else continue;
    const bestChanged = (old && old.rec.best !== d.best) || (!old && oc && oc.top[0].usi !== d.best);
    deltas.push({ id: c.id, kind, usi, old: v, d: nv, delta: nv == null ? null : nv - v, src, bestChanged: !!bestChanged });
  }
}
const stat = (a) => { const v = a.map((x) => x.delta).filter((x) => x != null); const ab = v.map(Math.abs).sort((x, y) => x - y); return { n: v.length, 平均絶対差: +(ab.reduce((p, x) => p + x, 0) / ab.length).toFixed(1), 中央値: ab[Math.floor(ab.length / 2)], 最大: ab[ab.length - 1], 符号つき平均: +(v.reduce((p, x) => p + x, 0) / v.length).toFixed(1), Dのほうが大きい: v.filter((x) => x > 0).length, Dのほうが小さい: v.filter((x) => x < 0).length }; };
// 線をまたいだ数(100以内の損は100、唯一/次善との差は100を境)
const crossed = deltas.filter((x) => x.d != null && ((x.old > 100) !== (x.d > 100)));
// 最善手の評価値のずれ(古い記録がある局面)
const bestDeltas = [];
for (const c of cases) {
  const d = dRecs.get(c.id); const old = oldRecs.get(c.id); const oc = oldCache.get(c.id);
  const ob = old ? old.rec.bestCp : oc ? oc.top[0].cp : null; if (ob == null) continue;
  bestDeltas.push({ id: c.id, delta: d.bestCp - ob, src: old ? old.src : "500万(第2弾)" });
}


// ---- 画面の文の点検材料(手の差の言葉・形勢の言葉・唯一)。人の目で最終判断する ----
const lbl = (x) => { const a = Math.abs(x); return a <= 40 ? "互角" : a <= 150 ? "少し良い" : a <= 400 ? "良い" : "大きく良い"; };
const senteLabel = (turn, cp) => { const v = (turn === "sente" ? cp : -cp); const w = v - B; return `${lbl(w)}${Math.abs(w) <= 40 ? "" : w > 0 ? "(先手)" : "(後手)"}[v=${v},v-B=${w}]`; };
const FORM = /互角|良い|有利|優勢|苦しい|悪い|形勢|劣勢|不利|崩れ|損/;
const DIFF = /同じくらい|ほぼ同じ|近い|劣|はっきり|唯一|ずっと|はるかに|ミスではない|ミスとまでは/;
const sentences = (t) => (typeof t === "string" ? t.split(/(?<=。)/).filter(Boolean) : []);
const cands = [];
const seenQ = new Set();
for (const o of occ) {
  const r = dRecs.get(o.key);
  const topJp = r.top.map((t) => ({ jp: jp(o.sfen, t.usi), usi: t.usi, cp: t.cp, loss: r.top[0].cp - t.cp }));
  const base = `${o.course} ${o.ply}手目 ${jp(o.sfen, o.usi)}(loss ${o.loss}${o.margin != null ? ", 次善との差 " + o.margin : ""})`;
  const items = [["note", o.texts.note], ["aim", o.texts.aim], ["punishNote", o.texts.punishNote], ["childComment", o.texts.childComment]];
  for (const [f, t] of items) for (const s of sentences(t)) {
    const hit = [];
    if (FORM.test(s)) hit.push("形勢");
    if (DIFF.test(s)) hit.push("差");
    if (!hit.length) continue;
    const mentioned = topJp.filter((x) => s.includes(x.jp.slice(0, 4)) || s.includes(x.jp.replace(/[▲△]/, "").slice(0, 3)));
    cands.push({ where: base, field: f, kinds: hit, s, afterMove: senteLabel(o.turn, o.cp ?? 0), mentioned: mentioned.map((x) => `${x.jp}:${x.loss}`) });
  }
  if (!seenQ.has(o.key + o.course + o.ply) && typeof o.texts.nodeComment === "string") {
    seenQ.add(o.key + o.course + o.ply);
    for (const s of sentences(o.texts.nodeComment)) if (FORM.test(s) || DIFF.test(s))
      cands.push({ where: `${o.course} ${o.ply}手目の局面(前の手のコメント)`, field: "nodeComment", kinds: [FORM.test(s) ? "形勢" : "", DIFF.test(s) ? "差" : ""].filter(Boolean), s, posEval: senteLabel(o.turn, r.bestCp), mentioned: topJp.filter((x) => s.includes(x.jp.slice(0, 4))).map((x) => `${x.jp}:${x.loss}`) });
  }
}
fs.writeFileSync(path.join(lab, "remeasure-D-text-candidates.json"), JSON.stringify(cands, null, 1));

const out = { stat: stat(deltas), statBySrc: Object.fromEntries(["500万", "4000万", "500万(第2弾)"].map((k) => [k, stat(deltas.filter((x) => x.src === k))])), crossed: crossed.length, bestChanged: deltas.filter((x) => x.bestChanged).length, changed: J.changed, same: J.same, deltas, bestDeltas, nGroups: groups.size, nOcc: occ.length };
fs.writeFileSync(path.join(lab, "remeasure-D-result.json"), JSON.stringify(out, null, 1));

// 要約の表示
const byKind = {}; for (const x of J.changed) (byKind[x.kind] ||= []).push(x);
console.log("局面+手", groups.size, "出現(章×手)", occ.length);
console.log("変わった:", Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])));
console.log("変わらない:", J.same);
const bucket = (a) => { const b = { "0〜10": 0, "11〜20": 0, "21〜40": 0, "41〜80": 0, "81以上": 0 }; for (const x of a) { const v = Math.abs(x); b[v <= 10 ? "0〜10" : v <= 20 ? "11〜20" : v <= 40 ? "21〜40" : v <= 80 ? "41〜80" : "81以上"]++; } return b; };
const dv = deltas.filter((x) => x.delta != null);
console.log("差(条件の値): 件数", dv.length, "/", deltas.length, bucket(dv.map((x) => x.delta)));
for (const s of ["500万", "4000万", "500万(第2弾)"]) { const a = dv.filter((x) => x.src === s); if (a.length) console.log(" ", s, a.length, bucket(a.map((x) => x.delta)), "平均|差|", (a.reduce((p, x) => p + Math.abs(x.delta), 0) / a.length).toFixed(1)); }
console.log("統計:", JSON.stringify(out.stat), "線をまたいだ", crossed.length, "最善手が入れ替わった", out.bestChanged);
for (const [k, v] of Object.entries(out.statBySrc)) console.log("  ", k, JSON.stringify(v));
console.log("最善の評価値のずれ:", bestDeltas.length, bucket(bestDeltas.map((x) => x.delta)));
for (const x of J.changed) console.log(x.kind, "|", x.courses.join(", "), "|", x.move, "loss", x.loss, "margin", x.margin, "best", x.bestMove, x.bestCp, x.exc ? "(例外)" : "");

// =====================================================================
// docs/fix-proposal-3.md を書く(判定が変わったものの直しの案。章のデータは変えない)
// 決定の中身(案・新しい文・おすすめ)は人が書いたもの。今の文・D の値・旧の値はここで機械的に引く。
// =====================================================================
const courseCache = new Map();
const loadCourse = (cid) => { if (!courseCache.has(cid)) courseCache.set(cid, JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${cid}.json`), "utf8"))); return courseCache.get(cid); };
// (章, 手数, 指し手) の分岐と、その手前の局面を探す。同じ手数・同じ指し手が複数あれば D の局面にあるもの
function findBranch(cid, ply, mv) { // mv は指し手(USI)か、「▲7七角」のような表記
  let found = null;
  (function w(n, d) { for (const b of n.branches) { if (d + 1 === ply && dRecs.has(key(n.sfen)) && !found && (b.usi === mv || jp(n.sfen, b.usi) === mv)) found = { node: n, b }; if (b.child) w(b.child, d + 1); } })(loadCourse(cid).root, 0);
  if (!found) throw new Error(`見つからない: ${cid} ${ply} ${mv}`);
  return found;
}
const fieldText = (f, field) => (field === "childComment" ? f.b.child?.comment : field === "nodeComment" ? f.node.comment : f.b[field]);
// 画面の文の引用。引用が実際の文に含まれることを確かめる
function Q(cid, ply, usi, field, quote) {
  const f = findBranch(cid, ply, usi); const t = fieldText(f, field);
  if (typeof t !== "string" || !t.includes(quote)) throw new Error(`引用が合わない: ${cid} ${ply} ${usi} ${field}: ${quote}`);
  return `「${quote}」`;
}
const sgn = (v) => (v >= 0 ? `+${v}` : `${v}`);
// D の値(evidence 用)
function EV(cid, ply, mv, extra = "") {
  const f = findBranch(cid, ply, mv); const usi = f.b.usi; const r = dRecs.get(key(f.node.sfen));
  const m = r.moves.find((x) => x.usi === usi);
  const top = r.top.slice(0, 5).map((t) => `${jp(f.node.sfen, t.usi)}${sgn(t.cp)}`).join("、");
  const cs = cases.find((c) => c.id === key(f.node.sfen));
  const oldTxt = (cs?.reasons || []).map((x) => (x[1] === usi ? `${x[0]} ${x[2]}` : x[1] === "" ? `手の指定なし ${x[2]}` : `別の手 ${jp(f.node.sfen, x[1])} の${x[0]} ${x[2]}`));
  const old = oldTxt.length ? `。旧の測り方(置換表を消さない)の値: ${oldTxt.join("、")}` : "";
  const mvName = jp(f.node.sfen, usi);
  const own = m.loss === 0 ? `この手は差0(次善との差${m.margin})` : `${mvName}は損${m.loss}`;
  return `新エンジン つようら王11mini、置換表を毎回消す測り(測り直し D、4000万ノード・Threads 1、2026-11-10): 最善 ${jp(f.node.sfen, r.best)}(${sgn(r.bestCp)}、手番側から)、${own}。上位: ${top}${old}${extra}`;
}
const lossOf2 = (cid, ply, mv) => { const f = findBranch(cid, ply, mv); return dRecs.get(key(f.node.sfen)).moves.find((x) => x.usi === f.b.usi); };
const L = []; const P = (s = "") => L.push(s);
const D_ = []; // 決定
const dec = (title, body) => D_.push({ title, body });

// ---------------- A. 基準外(100超) ----------------
dec("8yonfu の変化の中の▲6八玉(玉を左へ運ぶ手)", () => [
  "章: nakabisha-vs-8yonfu--kakukoukan、△4二銀の変化の枝、11手目 ▲6八玉(学ぶ側。枝の中の自分の手)",
  `今: note ${Q("nakabisha-vs-8yonfu--kakukoukan", 11, "▲6八玉", "note", "玉を6八へ寄せます。本線と同じく、玉を左へ運び始める手です。")}`,
  `D: ${EV("nakabisha-vs-8yonfu--kakukoukan", 11, "▲6八玉")}`,
  "案:",
  "- A 作戦選び・題材として残す。本線9手目の▲6八玉(第2弾 決定12 案C)と同じ手で、章の骨格。note の末尾に足す文(案): 「▲8六歩や▲1六歩のほうがはっきり良い手ですが、この章は玉を左へ運ぶ形を覚えます。」`KNOWN_BOOK_OVER_ENGINE`(build-joseki.mjs)にこの枝の分も足す。量: 約5分。",
  "- B 差し替え。▲8六歩(差0)にして、先の2手を新エンジンの最善で作り直す(枝なし)。量: 約35分(30+3×2)。玉を右へ運ぶ別の題材になる。",
  "- C 枝(△4二銀の変化)ごと消す。量: 約20分。",
  "おすすめ: A。本線9手目と同じ手で、決定12 で「題材として残す」と決めたのと同じ理由。B にすると、枝だけ玉を右へ運ぶ手順になり、章の骨格(玉を左へ運ぶ)とずれる。",
]);
dec("7suji・hidarimino--gote の15手目 ▲7七角(相手が穴熊・左美濃に組む準備)", () => [
  "章: nakabisha-vs-anaguma--7suji 15手目、nakabisha-vs-hidarimino--gote 15手目 ▲7七角(相手の本線)",
  `今: 7suji の note ${Q("nakabisha-vs-anaguma--7suji", 15, "▲7七角", "note", "相手が角を上がりました。穴熊に組む準備です。")}、hidarimino--gote の note ${Q("nakabisha-vs-hidarimino--gote", 15, "▲7七角", "note", "相手が角を7七へ上げました。玉を8八へ寄せる準備と考えられます。")}`,
  `D: ${EV("nakabisha-vs-anaguma--7suji", 15, "▲7七角")}`,
  "案:",
  "- A 作戦選び(相手が穴熊・左美濃に組む準備)として残す。9手目 ▲5八金右・19手目 ▲9八香(第2弾 決定13)と同じ扱い。note に足す文(案): 7suji 「より良い手(▲3三角成など)もありますが、これは穴熊に組むための手です。」/ hidarimino--gote 「より良い手(▲3三角成など)もありますが、これは玉を囲うための手です。」量: 2か所 約10分。",
  "- B 差し替え。▲3三角成(角交換)に替えて、以降を作り直す。7suji は先の13手+枝9本(約160分)、hidarimino--gote は先の19手+枝16本(約250分)、計およそ7時間。角交換になると、相手が囲いを選ぶ題材が成り立たない。",
  "- C 14手目で章を止める。両章とも後半が消えるので非推奨。",
  "おすすめ: A。9手目・19手目と同じ「相手が囲いを選ぶ」筋の手で、B は章の題材ごと作り直しになる(約7時間)。",
]);
dec("aifuri-naka の5手目 ▲5八飛(先手が中飛車に振る)", () => [
  "章: sankenbisha-gote--aifuri-naka 5手目 ▲5八飛(相手の本線)",
  `今: child.comment ${Q("sankenbisha-gote--aifuri-naka", 5, "▲5八飛", "childComment", "▲6八玉など、飛車を振らずに居飛車(飛車を動かさない戦法)で進める手のほうが少し良い手です。")}`,
  `D: ${EV("sankenbisha-gote--aifuri-naka", 5, "▲5八飛")}。▲6八玉は上位8手に入らない(文が挙げる手が違う)`,
  "案:",
  "- A 作戦選び(先手が中飛車を選ぶ手)として残す。3手目 ▲5六歩(第2弾 決定3)と同じ章内の扱い。文の置き換え(案): 「▲3六歩や▲5八金右など、飛車を振らずに居飛車(飛車を動かさない戦法)で進める手のほうがはっきり良い手ですが、これは先手が中飛車を選ぶ手です。」(続く「▲5八飛のあとは後手が少し良い形です。…」はそのまま)。量: 約10分。",
  "- B 差し替え。▲3六歩にして以降を作り直す。先の31手+枝9本(約210分、約3.5時間)。章の題材(先手が中飛車に振った場合)が消える。",
  "おすすめ: A。同じ章の3手目 ▲5六歩を作戦選びの例外にしたのと同じ理由で、B は章の題材が消える。文が「▲6八玉など」と挙げた手は上位に無く、挙げ直す必要がある。",
]);
dec("bogin の26手目 △4三銀(棒銀の受け)", () => [
  "章: sankenbisha-gote--bogin 26手目 △4三銀(学ぶ側の本線)",
  `今: child.comment ${Q("sankenbisha-gote--bogin", 26, "△4三銀", "childComment", "△5三銀のほうが少し良い手ですが、△4三銀もこの形の基本の受けです。")}`,
  `D: ${EV("sankenbisha-gote--bogin", 26, "△4三銀")}`,
  "案:",
  "- A 最善 △7二銀(差0)に差し替え、以降(先の10手+枝3本)を新エンジンの両者最善で作り直す。量: 約90分(30+3×10+10×3)。",
  "- B △5三銀(損93)に差し替える。文が元から推している手で量も同じ(約90分)だが、損93は100の近くで、測り方のぶれで超えうる。",
  "- C 題材として残す(例外)。ただし△4三銀は「基本の受け」で、作戦選びではないため、例外の方針(作戦選びだけ)から外れる。量: 約5分。",
  "おすすめ: A。基準どおりで、差0なので境目の心配がない。棒銀に仕掛けられたあとの手で、仕掛け以降はエンジンで決める方針(駒組みは出典)。C は例外を作戦選び以外へ広げることになる。",
]);
dec("ishida--deashi の変化 △8八角成(相手が振る前に角を交換)", () => [
  "章: sankenbisha-ishida--deashi 4手目の変化の枝の入口 △8八角成(相手の別の手)",
  `今: note ${Q("sankenbisha-ishida--deashi", 4, "△8八角成", "note", "相手が、飛車を振る前に角を交換してきました。")}`,
  `D: ${EV("sankenbisha-ishida--deashi", 4, "△8八角成")}`,
  "案:",
  "- A 作戦選び(相手が角交換を選ぶ手)として残す。punishNote の頭に足す文(案): 「より良い手(△5四歩など)もありますが、これは相手が角交換を選ぶ手です。」量: 約5分。",
  "- B 枝ごと消す(第2弾 決定30〜37 と同じ扱い)。先の9手が消える。量: 約20分。",
  "おすすめ: A。相手が角交換型を選ぶ手は、△3二飛・△5二飛(第2弾 決定8・9)と同じ「相手の作戦選び」で、B だと早い角交換への備えが章から無くなる。ただし例外が1つ増えるので、B でもよい。",
]);
dec("ishida--migishiken の変化 △6二飛(相手が右四間に振る)", () => [
  "章: sankenbisha-ishida--migishiken 22手目の変化の枝の入口 △6二飛(相手の別の手)",
  `今: punishNote ${Q("sankenbisha-ishida--migishiken", 22, "△6二飛", "punishNote", "△6二飛は最善より少し劣る手ですが、指せる手です。")}`,
  `D: ${EV("sankenbisha-ishida--migishiken", 22, "△6二飛")}`,
  "案:",
  "- A 作戦選び(相手が右四間飛車に振る手)として残し、文を置き換える。置き換え(案): 「より良い手(△3三角など)もありますが、これは相手が右四間飛車に振る手です。」(「最善より少し劣る」は損が100を超えるので外す)。量: 約5分。",
  "- B 枝ごと消す。先の3手が消える。量: 約20分。",
  "おすすめ: A。相手が飛車の振り方(戦法)を選ぶ手で、△3二飛・△5二飛(第2弾 決定8・9)と同じ。小さな枝なので B でも失うものは少ない。",
]);

// ---------------- B. 唯一・例外 ----------------
dec("hidarimino--sente の24手目 △2三銀(「唯一」が崩れた)", () => [
  "章: nakabisha-vs-hidarimino--sente 24手目 △2三銀(相手の本線)",
  `今: note ${Q("nakabisha-vs-hidarimino--sente", 24, "△2三銀", "note", "最善で、次善の△8四飛よりはっきり良い、唯一の手です。")}`,
  `D: ${EV("nakabisha-vs-hidarimino--sente", 24, "△2三銀")}。次善との差94(100未満)`,
  "案:",
  "- A 「唯一」を外す。note の置き換え(案): 「最善で、次善の△8四飛より少し良い手です。」ねらい(aims.mjs)が note の文で引かれていれば、キーを付け直す。量: 約5分。",
  "- B 「唯一」のまま(基準の100に6足りないが許容)。基準を動かすことになる。",
  "おすすめ: A。基準は次善との差100以上で、94は届かない。結果を見てから基準を動かさない方針。",
]);
const uniqList = J.changed.filter((x) => x.kind === "唯一でない文で差100以上");
dec("「唯一」と書いていないが次善との差が100以上の手(25か所)", () => [
  "対象(D で最善、次善との差100以上。全部、唯一とは書いていない。括弧は次善との差):",
  ...uniqList.map((x) => `  - ${x.courses.join("・")} ${x.move}(${x.margin})`),
  "ほとんどが取り返す手・逃げる手・受ける手(一目で分かる手)。文に「同じくらい」などの矛盾する言葉があるものは、決定10〜24で別に直す。",
  "案:",
  "- A 書き足さない。「唯一」は覚える価値のある手にだけ付ける(第2弾のときも、同じ扱いにした)。量: 0。",
  "- B 25か所に「次善よりはっきり良い、唯一の手です」を足す。量: 約125分(約5分×25)。",
  "- C 本線で次善の手が見えている数か所(5yonfu--kakukoukan 18手、aisanken 14手・18手など)に限って足す。量: 約30分。",
  "おすすめ: A。画面の文に「唯一」が増えるだけで、級位者が次に指す手を決める助けにならない手が多い。",
]);
dec("作戦選びの例外が不要になった6か所(D で損100以内に入った)", () => [
  "対象(D の損): 7suji・hidarimino--gote 9手目 ▲5八金右(42)、7suji 19手目 ▲9八香(98)、aifuri-naka 6手目 △3二飛(40)、aifuri-shiken 6手目 △4二飛(99)・△5二飛(41)、ishida--deashi 5手目 ▲6六歩(50)",
  "今: どれも「より良い手(…)もありますが、これは…を選ぶ手です」の一文を持つ(7suji・hidarimino--gote の9手と19手は「はっきり良い手ですが」)。",
  "案:",
  "- A 文はそのまま(より良い手があるのは本当)。例外の登録(KNOWN_BOOK_OVER_ENGINE や evidence の「例外」)は、そのまま残してもよい。「はっきり」の語だけ決定18・19で直す。量: 0。",
  "- B 一文を外して、普通の手と同じ書き方にする。量: 約30分(約5分×6)。",
  "おすすめ: A。例外が不要になっても、文は正しい。選ぶ手だと伝える意味は残る。",
]);

// ---------------- C. 手の差の言葉 ----------------
dec("jikyusen 22手目 △3三角(「同じくらい」の相手が違う)", () => [
  "章: nakabisha-vs-ibisha--jikyusen 22手目 △3三角(相手の本線)、枝 △3二銀",
  `今: note ${Q("nakabisha-vs-ibisha--jikyusen", 22, "△3三角", "note", "△6四銀・△3二銀でも同じくらいの手です。")}、△3二銀の punishNote ${Q("nakabisha-vs-ibisha--jikyusen", 22, "△3二銀", "punishNote", "△3二銀も、△3三角と同じくらいの手です。")}`,
  `D: ${EV("nakabisha-vs-ibisha--jikyusen", 22, "△3三角")}。差は△6四銀27(同じくらい)、△3二銀58(少し良い)`,
  "案:",
  "- A 文を直す。note の末尾(案): 「△6四銀でも同じくらいの手です。△3二銀は、それより少し良い手です。」△3二銀の punishNote の頭(案): 「△3二銀は、△3三角より少し良い手です。」△6四銀の punishNote は27なのでそのまま。量: 2文 約10分。",
  "- B 直さない。基準(同じくらい=30まで)に合わない。",
  "おすすめ: A。",
]);

dec("jikyusen 37手目 ▲8六歩(「▲同角でも同じくらい」)", () => [
  "章: nakabisha-vs-ibisha--jikyusen 37手目 ▲8六歩(相手の本線)",
  `今: note ${Q("nakabisha-vs-ibisha--jikyusen", 37, "▲8六歩", "note", "▲同角でも同じくらいの手で、▲6八角や▲5九角などの角を引く手は大きく損をします。")}`,
  `D: ${EV("nakabisha-vs-ibisha--jikyusen", 37, "▲8六歩")}。▲同角(▲8六角)が最善で、▲8六歩より63良い`,
  "案:",
  "- A 文を直す(案): 「▲同角のほうが少し良い手です。▲6八角や▲5九角などの角を引く手は大きく損をします。」量: 約5分(note なので ねらい aims.mjs のキーも確かめる)。",
  "- B 直さない。基準(同じくらい=30まで)に合わない。",
  "おすすめ: A。形勢の言葉は決定28で別に直す。",
]);
dec("4手目 △4四歩の「△8四歩や△3二金でも同じくらい」(8章の同じ局面)", () => [
  "章: sankenbisha-gote の anaguma・bogin・deashi・hayashikake・hidarimino・migishiken・minokansei・nanamebogin の8章、4手目 △4四歩(同じ局面。学ぶ側の本線)",
  `今: child.comment ${Q("sankenbisha-gote--anaguma", 4, "△4四歩", "childComment", "△8四歩や△3二金でも同じくらいの手です。")}`,
  `D: ${EV("sankenbisha-gote--anaguma", 4, "△4四歩")}。△3二金は44、△8四歩は60劣る(同じくらい=30まで)`,
  "案:",
  "- A 文を直す(案): 「△8四歩や△3二金も指せますが、少し劣る手です。」量: 8章×1文 約30分。",
  "- B 直さない。",
  "おすすめ: A。8章とも同じ文なので、まとめて直せる。",
]);
dec("sugairyu 23手目 ▲4六飛(逃げ場の比べ方が逆)", () => [
  "章: sankenbisha-ishida--sugairyu 23手目 ▲4六飛(学ぶ側の本線)",
  `今: child.comment ${Q("sankenbisha-ishida--sugairyu", 23, "▲4六飛", "childComment", "▲2六飛・▲5六飛などの逃げ場は、▲4六飛よりはっきり劣ります。")}`,
  `D: ${EV("sankenbisha-ishida--sugairyu", 23, "▲4六飛")}。▲2六飛は▲4六飛より43良く、▲5六飛は7良い`,
  "案:",
  "- A 文を直す(案): 「▲6六飛のほうが少し良い手です。▲5六飛は▲4六飛と同じくらいで、▲2六飛は▲4六飛より少し良い手です。」量: 約5分。",
  "- B ▲4六飛を▲6六飛(最善)へ差し替える。先の2手を作り直す(枝なし)。量: 約35分。",
  "おすすめ: A。▲4六飛の損は98で100以内。B は文の食い違いだけを理由にするには大きい。",
]);
dec("aifuri-mukai 11手目 ▲8八飛(「最善は▲9六歩」)", () => [
  "章: sankenbisha-gote--aifuri-mukai 11手目 ▲8八飛(相手の本線)",
  `今: child.comment ${Q("sankenbisha-gote--aifuri-mukai", 11, "▲8八飛", "childComment", "最善は▲9六歩で、この▲8八飛はそれより少し劣ります。ミスではありませんが、境目に近い手です。")}`,
  `D: ${EV("sankenbisha-gote--aifuri-mukai", 11, "▲8八飛")}。最善は▲8六歩。▲9六歩は▲8八飛より18良いだけ`,
  "案:",
  "- A 文を直す(案): 「▲8六歩のほうが少し良い手です。▲9六歩は、この▲8八飛と同じくらいの手です。」(「境目に近い」は外す)。量: 約5分。",
  "- B 直さない。",
  "おすすめ: A。",
]);
dec("aifuri-mukai 13手目 ▲8六歩と枝 ▲5六銀(「最善は▲5六銀」)", () => [
  "章: sankenbisha-gote--aifuri-mukai 13手目 ▲8六歩(相手の本線)と、その変化 ▲5六銀",
  `今: ▲8六歩の child.comment ${Q("sankenbisha-gote--aifuri-mukai", 13, "▲8六歩", "childComment", "最善は▲5六銀ですが、この▲8六歩も最善に近い手で、ミスではありません。")}、▲5六銀の punishNote ${Q("sankenbisha-gote--aifuri-mukai", 13, "▲5六銀", "punishNote", "▲5六銀は、先手の最善手です。")}`,
  `D: ${EV("sankenbisha-gote--aifuri-mukai", 13, "▲8六歩")}。最善は▲6五歩。▲5六銀は損59`,
  "案:",
  "- A 文を直す(案): child.comment 「▲6五歩と▲8六歩はほぼ同じ手です。▲5六銀は少し劣りますが、『変化』で覚えます。」/ ▲5六銀の punishNote の頭 「▲5六銀は、▲8六歩より少し劣る手です。」量: 2文 約10分。",
  "- B 直さない。",
  "おすすめ: A。",
]);
dec("5yonfu--kakukoukan 15手目 ▲5五歩(「▲5三角ははるかに劣る」)", () => [
  "章: nakabisha-vs-5yonfu--kakukoukan 15手目 ▲5五歩(学ぶ側の本線)",
  `今: note ${Q("nakabisha-vs-5yonfu--kakukoukan", 15, "▲5五歩", "note", "ほかの手よりはっきり良く、▲5三角ははるかに劣ります。")}`,
  `D: ${EV("nakabisha-vs-5yonfu--kakukoukan", 15, "▲5五歩")}。次善の▲5三角との差90(少し劣る)`,
  "案:",
  "- A 文を直す(案): 「ほかの手より良い手で、次善の▲5三角は少し劣ります。」量: 約5分(note なので aims.mjs のキーも確かめる)。",
  "- B 直さない。",
  "おすすめ: A。",
]);
dec("8yonfu--kakukoukan 27手目 ▲3七角(「少し劣る手」)", () => [
  "章: nakabisha-vs-8yonfu--kakukoukan 27手目 ▲3七角(学ぶ側の本線)",
  `今: note ${Q("nakabisha-vs-8yonfu--kakukoukan", 27, "▲3七角", "note", "▲5五角や▲4六角も指せますが、少し劣る手です。")}`,
  `D: ${EV("nakabisha-vs-8yonfu--kakukoukan", 27, "▲3七角")}。▲4六角・▲5五角との差は0〜1(同じくらい)`,
  "案:",
  "- A 文を直す(案): 「▲5五角や▲4六角でも同じくらいの手です。」量: 約5分(note なので aims.mjs のキーも確かめる)。",
  "- B 直さない。",
  "おすすめ: A。",
]);
dec("7suji・hidarimino--gote の9手目 ▲5八金右(「はっきり良い手」)", () => [
  "章: nakabisha-vs-anaguma--7suji 9手目、nakabisha-vs-hidarimino--gote 9手目 ▲5八金右(相手の本線)",
  `今: child.comment ${Q("nakabisha-vs-anaguma--7suji", 9, "▲5八金右", "childComment", "角交換のほうがはっきり良い手ですが、▲5八金右は")}…`,
  `D: ${EV("nakabisha-vs-anaguma--7suji", 9, "▲5八金右")}`,
  "案:",
  "- A 「はっきり良い」を「少し良い」に直す(案): 「角交換のほうが少し良い手ですが、▲5八金右は…」(以降は同じ)。量: 2章 約10分。",
  "- B 直さない。",
  "おすすめ: A。損が42なので、「はっきり」(100以上の差)は合わない。",
]);
dec("7suji 19手目 ▲9八香(「はっきり良い手」)", () => [
  "章: nakabisha-vs-anaguma--7suji 19手目 ▲9八香(相手の本線)",
  `今: note ${Q("nakabisha-vs-anaguma--7suji", 19, "▲9八香", "note", "▲3六歩などのほうがはっきり良い手ですが、▲9八香は穴熊を選ぶ手です。")}`,
  `D: ${EV("nakabisha-vs-anaguma--7suji", 19, "▲9八香")}`,
  "案:",
  "- A 「少し良い」に直す(案): 「▲3六歩などのほうが少し良い手ですが、▲9八香は穴熊を選ぶ手です。」量: 約5分(note なので aims.mjs のキーも確かめる)。",
  "- B 直さない。",
  "おすすめ: A。損98は100の近くで、測り方のぶれで超えうる。次に測り直すときに100を超えたら、決定1〜3と同じ「作戦選びの例外」に戻る。",
]);
dec("gote anaguma 31手目 ▲2六歩(「▲2七歩の打ちも近い」と「受ける手は3つだけ」)", () => [
  "章: sankenbisha-gote--anaguma 31手目 ▲2六歩(相手の本線)",
  `今: child.comment ${Q("sankenbisha-gote--anaguma", 31, "▲2六歩", "childComment", "最善の手でした(▲2七歩の打ちも近い手です)。")}、この局面の comment ${Q("sankenbisha-gote--anaguma", 31, "▲2六歩", "nodeComment", "受ける手は、▲2六歩(打)、▲2七歩(打)、▲2二飛成の3つだけです(次の手)。")}`,
  `D: ${EV("sankenbisha-gote--anaguma", 31, "▲2六歩")}。▲2五歩(打)が次善で71劣り、▲2七歩は118劣る`,
  "案:",
  "- A 文を直す(案): child.comment 「最善の手でした(▲2五歩の打ちは少し劣り、▲2七歩の打ちははっきり劣ります)。」/ comment 「受ける手は、▲2六歩(打)・▲2五歩(打)・▲2七歩(打)・▲2二飛成などです(次の手)。」量: 2文 約10分。",
  "- B 直さない。",
  "おすすめ: A。▲2七歩は118劣るので「近い手」は合わない。",
]);
dec("gote anaguma 23手目の枝 ▲5八金右(「▲9九玉より少し良い」)", () => [
  "章: sankenbisha-gote--anaguma 23手目の枝 ▲5八金右(本線 ▲9九玉の変化の枝)",
  `今: punishNote ${Q("sankenbisha-gote--anaguma", 23, "▲5八金右", "punishNote", "▲5八金右は、▲9九玉より少し良い手です。")}`,
  `D: ${EV("sankenbisha-gote--anaguma", 23, "▲5八金右")}。本線 ▲9九玉との差は8(ほぼ同じ)`,
  "案:",
  "- A 文を直す(案): 「▲5八金右は、▲9九玉とほぼ同じ手です。」量: 約5分。",
  "- B 直さない(軽い食い違い。同じ並びの本線側の文は「差は小さい手です」と書いてあり、意味は合っている)。",
  "おすすめ: A。ただし優先度は低い。",
]);
dec("ishida--hidarimino 20手目 △3一玉(「△1五歩のほうが少し良い」)", () => [
  "章: sankenbisha-ishida--hidarimino 20手目 △3一玉(相手の本線)",
  `今: child.comment ${Q("sankenbisha-ishida--hidarimino", 20, "△3一玉", "childComment", "△1五歩のほうが少し良い手です。")}`,
  `D: ${EV("sankenbisha-ishida--hidarimino", 20, "△3一玉")}。△1五歩との差は5(同じくらい)`,
  "案:",
  "- A 文を直す(案): 「△1五歩でも同じくらいの手です。」(続く「△1五歩と指された場合は、この章ではなく第3章の道筋になります。」はそのまま)。量: 約5分。",
  "- B 直さない。",
  "おすすめ: A。",
]);
dec("37kei 24手目 △2二飛(「△7二銀もありますが…ソフトの判断では差はつきません」)", () => [
  "章: ibisha-vs-sankenbisha--37kei 24手目 △2二飛(相手の本線)",
  `今: note ${Q("ibisha-vs-sankenbisha--37kei", 24, "△2二飛", "note", "美濃囲いの完成を急ぐ△7二銀もありますが、出典では危険とされています(ただし将棋ソフトの判断ではそこまで差はつきません)。")}`,
  `D: ${EV("ibisha-vs-sankenbisha--37kei", 24, "△2二飛")}。△7二銀は上位8手に入らない(最善より270以上悪い)`,
  "案:",
  "- A 文を直す(案): 「美濃囲いの完成を急ぐ△7二銀は、ここでは損の大きい手です。」(出典の名前と「将棋ソフト」は画面に書かない。出どころは evidence へ)。量: 約5分(note なので aims.mjs のキーも確かめる)。",
  "- B 直さない。",
  "おすすめ: A。文の言い分(差はつかない)が D と逆で、出どころの言葉も画面の決まりに反する。",
]);
dec("jikyusen 35手目 ▲7五歩(「次善より少し良い」と「先手が少し良い」)", () => [
  "章: nakabisha-vs-ibisha--jikyusen 35手目 ▲7五歩(学ぶ側の本線)",
  `今: note ${Q("nakabisha-vs-ibisha--jikyusen", 35, "▲7五歩", "note", "最善の手で、次善の▲5八金左より少し良い手です。形勢は先手が少し良い形です。")}`,
  `D: ${EV("nakabisha-vs-ibisha--jikyusen", 35, "▲7五歩")}。次善との差161、▲7五歩のあとは先手から+56(v−B=+19、互角)`,
  "案:",
  "- A 文を直す(案): 「最善の手で、次善の▲5八金左よりはっきり良い手です。形勢は互角です。」量: 約5分(note なので aims.mjs のキーも確かめる)。",
  "- B 直さない。",
  "おすすめ: A。次善との差が161なので「少し」は合わず、形勢は互角の範囲(v−B=19)。",
]);

// ---------------- D. 形勢の言葉 ----------------
const FM = (n, cid, ply, mv, field, quote, to, v, amount = "約5分") => dec(`形勢: ${cid} ${ply}手目 ${mv}`, () => [
  `章: ${cid} ${ply}手目 ${mv}`,
  `今: ${field} ${Q(cid, ply, mv, field, quote)}`,
  `D: ${EV(cid, ply, mv)}。${mv}のあとの先手から見た値 ${v}`,
  "案:",
  `- A 文を直す(案): ${to} 量: ${amount}。`,
  "- B 直さない。",
  "おすすめ: A。形勢の言葉は v−B(B=+37)で決めるため。",
]);
{
  const vv = (cid, ply, mv) => { const f = findBranch(cid, ply, mv); const m = lossOf2(cid, ply, mv); const t = f.node.sfen.split(" ")[1] === "w" ? "gote" : "sente"; const v = t === "sente" ? m.cp : -m.cp; return `${sgn(v)}(v−B=${sgn(v - B)})`; };
  FM(0, "nakabisha-vs-chousoku-kakukoukan--gote", 16, "△6二玉", "childComment", "先手が良い形勢です。", "「先手が少し良い形勢です。」(v−B が40〜150は「少し良い」、150以上が「良い」)", vv("nakabisha-vs-chousoku-kakukoukan--gote", 16, "△6二玉"));
  FM(0, "nakabisha-vs-hidarimino--gote", 19, "▲7八銀", "childComment", "形勢は先手が少し良い形です。", "「形勢は互角です。」", vv("nakabisha-vs-hidarimino--gote", 19, "▲7八銀"));
  FM(0, "nakabisha-vs-hidarimino--sente", 25, "▲3八飛", "childComment", "形勢は後手が良い形です。", "「形勢は後手が少し良い形です。」", vv("nakabisha-vs-hidarimino--sente", 25, "▲3八飛"));
  FM(0, "nakabisha-vs-ibisha--jikyusen", 37, "▲8六歩", "childComment", "形勢は後手が少し良い形です。", "「形勢は互角です。」(続く文はそのまま)", vv("nakabisha-vs-ibisha--jikyusen", 37, "▲8六歩"));
  FM(0, "sankenbisha-ishida--hidarimino", 21, "▲7七角", "childComment", "形勢は後手が少し良い形です。", "「形勢は後手が良い形です。」(この手は第2弾 決定28 の題材の例外)", vv("sankenbisha-ishida--hidarimino", 21, "▲7七角"));
  FM(0, "sankenbisha-ishida--aifuri-shiken", 6, "△4二飛", "childComment", "△4二飛のあと、形勢は互角です。", "「△4二飛のあと、形勢は先手が少し良い形です。」", vv("sankenbisha-ishida--aifuri-shiken", 6, "△4二飛"));
  FM(0, "sankenbisha-gote--migishiken", 30, "△4二飛", "childComment", "形勢は後手が少し良い形です。", `「形勢は互角です。」。この局面の comment ${Q("sankenbisha-gote--migishiken", 30, "△4二飛", "nodeComment", "形勢は先手が少し良い形です。")}も同じく「形勢は互角です。」に直す(この局面の評価は先手から+27、v−B=−10)。`, vv("sankenbisha-gote--migishiken", 30, "△4二飛"), "2文 約10分");
}

// ---------------- 文書を組み立てる ----------------
// 画面の文の点検(手の差の言葉・形勢の言葉)で合わなかった数(人が目で確かめた結果。局面+手 / 章×手 / 文)
const TXT = { 差: { pos: 15, ce: 23, sent: 27 }, 形勢: { pos: 7, ce: 7, sent: 8 } };
const kc = (k) => J.changed.filter((x) => x.kind === k);
const ce = (a) => a.reduce((p, x) => p + x.courses.length, 0);
const n100 = kc("100超"), nU = kc("唯一なのに次善との差100未満"), nUadd = kc("唯一でない文で差100以上"), nEx = kc("例外が不要に"), nP = kc("咎め300未満");
const nDec = D_.length;
const dv2 = deltas.filter((x) => x.delta != null);
const upC = dv2.filter((x) => x.old <= 100 && x.d > 100).length, downC = dv2.filter((x) => x.old > 100 && x.d <= 100).length;
const bk = (a) => { const o = [["0〜10", 0], ["11〜20", 0], ["21〜40", 0], ["41〜80", 0], ["81以上", 0]]; for (const x of a) { const v = Math.abs(x); o[v <= 10 ? 0 : v <= 20 ? 1 : v <= 40 ? 2 : v <= 80 ? 3 : 4][1]++; } return o; };
const excKeep = rows.filter((r) => r.os.every((o) => o.exc) && r.loss > 100);
const totalMin = 130 + 160;

P("# 測り直し D の結果に合わせた直しの案(第3弾・段階1)");
P();
P("作成: 2026-11-10。章のデータ(scripts/courses、src/data)はまだ変えていない。OK をもらった番号だけ、別に直す。");
P("元の資料: 境目の124局面を、置換表を毎回消す測り方(4000万ノード・Threads 1)で測り直した結果(scripts/lab-out/remeasure-D-stage1.jsonl)。まとめは `node scripts/remeasure-D-summary.mjs`(この文書もそれが書く。決定の中身は人が書いたもの)。");
P("基準: PLAN.md「エンジンと基準の数字(2026-11-08 改定)」と、画面の文の項目(数字・「エンジン」・出典名・作り方の説明は書かない、形勢の言葉は B=+37 を引いてから、手の差は ほぼ同じ30まで/少し劣る30〜100/唯一100以上)。作戦選びの例外は100以内の対象にしない。");
P("「今」に引いた文は、最新の src/data/joseki/*.json の文。「D」は evidence に残す値(手番側から見た評価、損は最善との差)。");
P();
P("## 先に結論");
P();
P(`- 判定が変わったもの: 局面+手で **${n100.length + nU.length + nUadd.length + nEx.length + TXT.差.pos + TXT.形勢.pos} か所**(章×手で ${ce(n100) + ce(nU) + ce(nUadd) + ce(nEx) + TXT.差.ce + TXT.形勢.ce})。内訳: 100超 ${n100.length}、唯一が崩れた ${nU.length}、唯一と書かず差100以上 ${nUadd.length}(参考)、例外が不要になった ${nEx.length}(参考)、手の差の言葉が合わない ${TXT.差.pos}、形勢の言葉が合わない ${TXT.形勢.pos}。咎めが300を割ったものは 0。`);
P(`- 決定は **${nDec} 件**。直さなくてよい参考扱いの2件(決定8・9)を除くと、実際に直すのは 29 件。`);
P(`- おすすめどおりの直す量(推測): **約 ${(totalMin / 60).toFixed(1)} 時間**。手順まで作り直すのは bogin 1か所(26手目から先の10手+枝3本、約1.5時間)だけ。ほかは一文の追加・書き換え(約 160 分)と、作戦選びの例外の一文(約 40 分)。`);
P(`- 古い測り方(置換表を消さない)とのずれ: 境目の値(124局面の123条件)で、中央値 ${out.stat.中央値}、平均 ${out.stat.平均絶対差}、最大 ${out.stat.最大}。20以内が約4割、41以上が約3割。線(100)をまたいだのは ${crossed.length}/${dv2.length} 件(100超になった ${upC}、100以内に戻った ${downC})。最善の手が旧の記録と違う局面は、条件単位で ${out.bestChanged} 件。`);
P("- 迷った点: 作戦選びの例外にするか枝を消すか(決定5・6)、bogin を最善と次善のどちらへ替えるか(決定4)。");
P();
P("## 答え方");
P();
P(`決定は 1〜${nDec} の${nDec}件。「1.OK 2.A 3.B…」のように番号で答えてください。OK は「おすすめどおり」。`);
P("- 1〜6: 基準の100を超えた手(作戦選びの例外にするか、替えるか、消すか)");
P("- 7〜9: 唯一の崩れ、唯一の書き足し、不要になった例外");
P("- 10〜24: 手の差の言葉が D の値と合わない文(15か所)");
P("- 25〜31: 形勢の言葉が D の値と合わない文(7か所)");
P();
P("## 1. 判定が変わったもの");
P();
P("基準は PLAN のとおり。手の差の言葉は「同じくらい=差30まで、少し劣る=30〜100、はっきり・はるかに=100以上」で見た。");
P();
P(`- **100超**(学ぶ側・相手の本線・枝の手が100以内でなくなった): ${n100.length} か所(章×手 ${ce(n100)})。決定1〜6。D の損: ${n100.map((x) => `${x.courses[0].replace(/^(nakabisha-vs-|sankenbisha-)/, "")}${x.courses.length > 1 ? "ほか" : ""} ${x.move} ${x.loss}`).join("、")}。旧の測り方ではどれも62〜96で、100以内だった。`);
P(`- **咎めが300を割った**: ${nP.length} か所(12か所の咎めはすべて300以上のまま)。`);
P(`- **唯一**: 書いた手の次善との差が100未満 ${nU.length} か所(決定7)。唯一と書いていないが差100以上 ${nUadd.length} か所(決定8。参考)。唯一と書いた手が最善でなくなったものは 0。`);
P(`- **例外が不要になった**(作戦選びの例外だが D で損100以内に入った): ${nEx.length} か所(決定9。参考)。`);
P(`- **手の差の言葉が合わない**: ${TXT.差.pos} か所(章×手 ${TXT.差.ce}、文 ${TXT.差.sent})。決定10〜24。`);
P(`- **形勢の言葉が合わない**: ${TXT.形勢.pos} か所(文 ${TXT.形勢.sent})。決定25〜31。境目(40・150)に近い値が中心。`);
P();
P("文の点検の範囲: D で確かめられる文(その局面の手の比べ、その手のあとの形勢、その局面の形勢)だけ。咎めの返しの手の「唯一」(bokin 26手目)、章の終わりの形勢、D の局面でない手の比べは、D では確かめられないので対象外。");
P();
P("## 2. 判定が変わらなかったもの");
P();
P("1つの手が複数の種類に数えられる(局面+手の数)。");
P();
for (const [k, v] of Object.entries(J.same)) P(`- ${k}: ${v}${k.startsWith("例外のまま") ? "(下の付録に D の値)" : ""}`);
P(`- 画面の文の点検(手の差・形勢の言葉): 候補 ${cands.length} 文を拾って目で照合し、D で確かめられて合わなかったのは ${TXT.差.sent + TXT.形勢.sent} 文(上の「合わない」)。残りは合っているか、D では確かめられない文。`);
P();
P("## 3. 古い測り方との差");
P();
P(`境目の対象(124局面)に付けた条件(旧の値が60〜140の損、または次善との差)${deltas.length} 件のうち、D で同じ条件が測れた ${dv2.length} 件の「D − 旧」。旧は、これまでの新エンジンの記録(置換表を消さない)。`);
P();
P(`- 全体: 中央値 ${out.stat.中央値}、平均 ${out.stat.平均絶対差}、最大 ${out.stat.最大}(絶対値)。D のほうが大きい ${out.stat.Dのほうが大きい}、小さい ${out.stat.Dのほうが小さい}、符号つき平均 ${out.stat.符号つき平均}(一定の向きの偏りは小さい)。`);
P("- 大きさの分布(絶対値):");
for (const [k, v] of bk(dv2.map((x) => x.delta))) P(`  - ${k}: ${v} 件(${Math.round((v / dv2.length) * 100)}%)`);
P("- 旧の記録の種類別:");
for (const [k, v] of Object.entries(out.statBySrc)) P(`  - ${k}: ${v.n} 件、中央値 ${v.中央値}、平均 ${v.平均絶対差}、最大 ${v.最大}`);
P(`- 線(100)をまたいだもの: ${crossed.length} 件(旧は100以内で D は超 ${upC}、旧は超で D は100以内 ${downC})。境目の局面では、置換表の有無だけで「超えた/超えない」が入れ替わりうる。`);
P(`- 最善手の評価値そのもの: 124局面で、中央値 ${(() => { const a = bestDeltas.map((x) => Math.abs(x.delta)).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; })()}、40超 ${bestDeltas.filter((x) => Math.abs(x.delta) > 40).length} 局面、最大 ${Math.max(...bestDeltas.map((x) => Math.abs(x.delta)))}。`);
P("- 読み方: 旧の4000万ノードの記録でもずれは中央値22と小さくない。置換表を消す測り方に統一するまで、境目(60〜140)の判定は±30ほどのぶれを見込む必要がある。D の値は1回の測定なので、100の近く(90〜110)の判定も同様。");
P();
P("## 決定");
P();
D_.forEach((d, i) => {
  P(`### ${i + 1}. ${d.title}`);
  P();
  for (const line of d.body()) P(line.startsWith("  ") || line.startsWith("- ") ? line : line === "案:" ? line : `- ${line}`);
  P();
});
P("## 付録: 例外のまま残る手の D の値(作戦選びの例外。evidence の更新用)");
P();
for (const r of excKeep) {
  const o = r.os[0]; const rec = dRecs.get(o.key);
  const cs = cases.find((c) => c.id === o.key); const old = cs?.reasons?.find((x) => x[1] === o.usi);
  P(`- ${r.os.map((x) => `${x.course} ${x.ply}手目`).join("・")} ${jp(o.sfen, o.usi)}: D の損 ${r.loss}、最善 ${jp(o.sfen, rec.best)}(${sgn(rec.bestCp)})${old ? `、旧 ${old[2]}` : ""}`);
}
P();
P("## 付録: 測り方");
P("- D の値は 4000万ノード・Threads 1・MultiPV 8・置換表を1局面ごとに消す。損は最善との差(手番側から)。上位8手に入らない手は、指した後を探索した値。MultiPV の並びはまれに最善の評価が最大でない(4局面、最大12)。");
P("- 章の手の分類: 本線(学ぶ側・相手)、枝、咎めの外れる手。咎めの枝の中の相手の手は、咎めを受けて指す手なので100以内の対象外。");
P("- 作戦選びの例外は、PLAN.md の項目(2026-11-09〜10)と、画面に「より良い手(…)もありますが」を持つ手。");
P("- 直す量は推測: 作戦選びの例外の一文 約5分、文1つの書き換え 約4〜5分、本線の差し替え 30分+3分×以降の手数+枝1本10分、枝を消す 約20分。実際は evidence の更新、ねらい(aims.mjs)のキー付け直し、ビルド・点検が加わる。");
fs.writeFileSync(path.join(root, "docs/fix-proposal-3.md"), L.join("\n") + "\n");
console.log("docs/fix-proposal-3.md を書いた。決定", nDec, "件");
