// 測り直し(A の範囲)の結果をまとめ、docs/remeasure-A-result.md を書く。章のデータは変えない。
// 使い方: node scripts/remeasure-A-summary.mjs
// 入力: scripts/lab-out/remeasure-A-cases.json / remeasure-A-stage1.jsonl / remeasure-A-stage2.jsonl(2段目がある局面は2段目で判定)
//       src/data/joseki/<章>.json(手の並びと文)、scripts/lab-out/*.json(旧エンジンの記録: 旧の値の表示用)
// 基準: 学ぶ側・相手の本線の手 = 最善との差 100以内 / 咎め手 = 相手の損 300以上 / 唯一 = 次善との差 100以上
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Position, parseUSIMove, formatMove } = require("tsshogi");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lab = path.join(root, "scripts/lab-out");
const key = (sfen) => sfen.split(" ").slice(0, 3).join(" ");
const turn = (sfen) => (sfen.split(" ")[1] === "w" ? "gote" : "sente");
const readJsonl = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const TH = { mistake: 100, punish: 300, unique: 100 };

// ---- 測定結果 ----
const s1 = new Map(readJsonl(path.join(lab, "remeasure-A-stage1.jsonl")).map((r) => [r.id, r]));
const s2 = new Map(readJsonl(path.join(lab, "remeasure-A-stage2.jsonl")).map((r) => [r.id, r]));
const cases = JSON.parse(fs.readFileSync(path.join(lab, "remeasure-A-cases.json"), "utf8"));
const final = new Map();
for (const [id, r] of s1) final.set(id, { ...r, stage: s2.has(id) ? 2 : 1, s1rec: r, rec: s2.get(id) || r });
const missing = cases.filter((c) => !final.has(c.id)).length;

// ---- 旧エンジンの記録(表示用。cases と同じ読み方) ----
const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const oldGap = new Map(); const oldLoss = new Map();
for (const f of fs.readdirSync(lab).filter((f) => f.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(lab, f), "utf8")); } catch { continue; }
  if (!j || !Array.isArray(j.rows) || !Array.isArray(j.usi)) continue;
  const p = Position.newBySFEN(START); let ok = true;
  for (let i = 0; i < j.usi.length && ok; i++) {
    for (const pu of j.punishments || []) if (pu.ply === i + 1) {
      const add = (u, l) => { const k = `${key(p.sfen)}|${u}`; (oldLoss.get(k) || oldLoss.set(k, []).get(k)).push(l); };
      add(pu.badUsi, pu.loss); for (const a of pu.alts || []) add(a.badUsi, a.loss);
    }
    const r = j.rows.find((x) => x.ply === i + 1);
    if (r && typeof r.gap === "number" && r.usi === j.usi[i]) { const k = `${key(p.sfen)}|${r.usi}`; (oldGap.get(k) || oldGap.set(k, []).get(k)).push(r.gap); }
    const q = parseUSIMove(j.usi[i]); let m = q && p.createMove(q.from, q.to);
    if (m && q.promote) m = m.withPromote();
    if (!m || !p.doMove(m)) ok = false;
  }
}
const range = (a) => (a && a.length ? (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}〜${Math.max(...a)}`) : null);

// ---- 手の日本語表記 ----
function jp(sfen, usi) {
  try {
    const p = Position.newBySFEN(sfen); const q = parseUSIMove(usi);
    let m = q.from ? p.createMove(q.from, q.to) : p.createMove(q.piece, q.to);
    if (!m) return usi;
    if (q.promote) m = m.withPromote();
    return formatMove(p, m).replace("☗", "▲").replace("☖", "△");
  } catch { return usi; }
}
const posOf = (k) => k + " 1";

// ---- 章を歩いて、(章, 手数, 手, 種類) の一覧を作る(remeasure-cases.mjs と同じ分類) ----
const src = fs.readFileSync(path.join(root, "src/domain/josekiLoader.ts"), "utf8");
const body = src.slice(src.indexOf("export const COURSE_ENTRIES"));
const entries = [...body.matchAll(/id: "([^"]+)",\s*strategyId: ([^,]+),/g)]
  .map((m) => ({ id: m[1], strategy: m[2].replace(/"/g, "") })).filter((e) => e.strategy === "gokigen" || e.strategy === "sankenbisha");
const flagRe = /唯一/;
const occ = []; // {course, side, ply, key, usi, kind, mine, texts:[]}
const textStats = {}; // 章 -> {fields, withNum, ...}
const allTexts = []; // {course, ply, usi, field, text, key, kind?}
for (const e of entries) {
  const course = JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${e.id}.json`), "utf8"));
  const my = course.mySide;
  const add = (o) => occ.push({ course: e.id, side: my, ...o });
  (function walk(node, ctx, onTrunk, depth, parentKey, parentUsi, parentDepth) {
    const t = turn(node.sfen); const k = key(node.sfen);
    if (typeof node.comment === "string") allTexts.push({ course: e.id, ply: depth, key: parentKey, usi: parentUsi, field: "comment", text: node.comment });
    for (const b of node.branches) {
      const ply = depth + 1; const mine = t === my; const trunk = onTrunk && b.kind === "main";
      for (const f of ["note", "aim", "punishNote"]) if (typeof b[f] === "string") allTexts.push({ course: e.id, ply, key: k, usi: b.usi, field: f, text: b[f] });
      for (const field of ["note", "aim", "punishNote"]) {
        if (typeof b[field] === "string" && flagRe.test(b[field])) {
          if (field === "punishNote" && b.child) {
            const ck = key(b.child.sfen);
            for (const x of b.child.branches) add({ ply: ply + 1, key: ck, usi: x.usi, kind: "唯一(咎めの返し)", mine: turn(b.child.sfen) === my, text: b[field] });
          } else add({ ply, key: k, usi: b.usi, kind: "唯一", mine, text: b[field] });
        }
      }
      if (trunk) add({ ply, key: k, usi: b.usi, kind: "本線", mine });
      if (trunk) add({ ply, key: k, usi: b.usi, kind: "境目(本線)", mine });
      else if (b.kind === "deviation" && !b.variation) add({ ply, key: k, usi: b.usi, kind: "咎めの外れる手", mine, punishNote: b.punishNote });
      else if (b.kind === "deviation" && b.variation) add({ ply, key: k, usi: b.usi, kind: "変化の入口(相手の別の手)", mine });
      else if (ctx !== "trunk" || !onTrunk) add({ ply, key: k, usi: b.usi, kind: (ctx === "var" ? "変化の枝の中の" : "咎めの枝の中の") + (mine ? "自分の手" : "相手の手"), mine });
      if (b.child) {
        let nctx = ctx; const nt = onTrunk && b.kind === "main";
        if (b.kind === "deviation") nctx = b.variation ? "var" : "dev"; else if (!nt && ctx === "trunk") nctx = "dev";
        walk(b.child, nctx, nt, depth + 1, k, b.usi, depth);
      }
    }
    if (typeof node.comment === "string" && flagRe.test(node.comment))
      add({ ply: parentKey ? parentDepth + 1 : depth + 1, key: parentKey || k, usi: parentUsi || null, kind: "唯一(節のコメント)", mine: parentKey ? turn(posOf(parentKey)) === my : t === my, text: node.comment });
    // 注: ↑ 親の局面の手番は sfen から得る
  })(course.root, "trunk", true, 0, null, null, 0);
}
// 境目(本線)は、cases に載った(旧の記録で差60〜140だった)局面・手だけ
const caseMove = new Set(); for (const c of cases) for (const m of c.moves) if (m.kinds.includes("境目(本線)")) caseMove.add(`${c.id}|${m.usi}`);
const occs = occ.filter((o) => o.kind !== "本線" && (o.kind !== "境目(本線)" || caseMove.has(`${o.key}|${o.usi}`)));

// ---- 測定値をひもづける ----
function meas(o) {
  const f = final.get(o.key); if (!f) return null;
  const r = f.rec; const mv = r.moves.find((m) => m.usi === o.usi);
  if (!mv) return null;
  const s1m = f.s1rec.moves.find((m) => m.usi === o.usi);
  return { f, r, mv, stage: f.stage, s1loss: s1m?.loss, s1margin: s1m?.margin, best: r.best, bestCp: r.bestCp, second: r.top[1] };
}
const rows = occs.map((o) => ({ ...o, M: meas(o) })).filter((o) => o.M);
const sfenOf = (o) => posOf(o.key);
const label = (o) => `${o.side === "sente" ? "" : ""}${jp(sfenOf(o), o.usi)}`;
const bestJp = (o) => jp(sfenOf(o), o.M.best);
const lossOf = (o) => o.M.mv.loss;
const mark = (o) => (o.M.stage === 2 ? "*" : "");
const cnt = (a) => a.length;
const uniq = (a, f) => new Set(a.map(f)).size;
const byCourse = (a) => { const m = {}; for (const x of a) m[x.course] = (m[x.course] || 0) + 1; return m; };
const oldFor = (o, kind) => {
  const k = `${o.key}|${o.usi}`;
  if (kind === "punish") return range(oldLoss.get(k)) ?? null;
  return range(oldGap.get(k)) ?? null;
};
const sortC = (a) => a.sort((x, y) => x.course.localeCompare(y.course) || x.ply - y.ply);
const esc = (s) => String(s).replace(/\|/g, "/");

// ---- 分類 ----
const punish = sortC(rows.filter((o) => o.kind === "咎めの外れる手"));
const pDrop = punish.filter((o) => lossOf(o) < TH.punish);
const pKeep = punish.filter((o) => lossOf(o) >= TH.punish);
const pNear = pKeep.filter((o) => lossOf(o) < 400);
const devOwn = sortC(rows.filter((o) => o.kind === "咎めの枝の中の自分の手" && lossOf(o) > TH.mistake));
const devOpp = sortC(rows.filter((o) => o.kind === "咎めの枝の中の相手の手" && lossOf(o) > TH.mistake));
const negRe = /唯一(の手|の)?(では|じゃ)(ありません|ない)/;
const isNeg = (o) => !(o.text || "").replace(new RegExp(negRe.source, "g"), "").includes("唯一");
const uniqAll = sortC(rows.filter((o) => o.kind.startsWith("唯一")));
const uniqNeg = uniqAll.filter(isNeg); // 「唯一ではありません」と書いた文
const uniqRows = uniqAll.filter((o) => !isNeg(o));
const uNegBig = uniqNeg.filter((o) => lossOf(o) === 0 && o.M.mv.margin >= TH.unique);
const uBreak = uniqRows.filter((o) => lossOf(o) === 0 && o.M.mv.margin < TH.unique);
const uNotBest = uniqRows.filter((o) => lossOf(o) > 0);
const uKeep = uniqRows.filter((o) => lossOf(o) === 0 && o.M.mv.margin >= TH.unique);
// 唯一と書いていないが次善との差100以上(参考): 本線・枝の中の最善手
const taggedUniq = new Set(uniqAll.map((o) => `${o.course}|${o.ply}|${o.usi}`));
const untaggedU = sortC(rows.filter((o) => !o.kind.startsWith("唯一") && o.kind !== "咎めの外れる手" && lossOf(o) === 0 && o.M.mv.margin >= TH.unique && !taggedUniq.has(`${o.course}|${o.ply}|${o.usi}`)));
const varOwn = sortC(rows.filter((o) => o.kind === "変化の枝の中の自分の手" && lossOf(o) > TH.mistake));
const varOpp = sortC(rows.filter((o) => o.kind === "変化の枝の中の相手の手" && lossOf(o) > TH.mistake));
const varEntry = sortC(rows.filter((o) => o.kind === "変化の入口(相手の別の手)" && lossOf(o) > TH.mistake));
const border = sortC(rows.filter((o) => o.kind === "境目(本線)" && lossOf(o) > TH.mistake));
const borderOwn = border.filter((o) => o.mine); const borderOpp = border.filter((o) => !o.mine);
const borderAll = rows.filter((o) => o.kind === "境目(本線)");
// 5: 本線の手と唯一の手で、最善が入れ替わり差100超
const swapped = sortC([...border, ...uNotBest.filter((o) => lossOf(o) > TH.mistake && !border.includes(o))]);

// ---- 文の数字 (6) ----
const numRe = /(\d+)\s*点/;
const hasMeasure = (t) => /(d1[0-9]|d2[0-9]|深さ|差|損|評価|点)/.test(t) && /\d+\s*点|[+\-−]\d{2,}/.test(t);
const clean = (t) => t.replace(/\(d\d+・d\d+・d\d+\)/g, "").replace(/d\d+\s*/g, "").replace(/深さ[\d・、]+(?:の測定)?で?、?/g, "").replace(/\s+/g, "");
const parseList = (s) => s.split(/[・〜]/).map(Number);
function firstList(t, kind) {
  const c = clean(t);
  const re = kind === "margin" ? /次善[^0-9。]{0,14}?差は?[^0-9。+\-]{0,6}?(\d+(?:[・〜]\d+)*)点/ : kind === "loss" ? /損は[^0-9。+\-]{0,30}?(\d+(?:[・〜]\d+)*)点/ : /差は?[^0-9。+\-]{0,10}?(\d+(?:[・〜]\d+)*)点/;
  const m = c.match(re); return m ? parseList(m[1]) : null;
}
const textBy = new Map();
for (const t of allTexts) { const k = `${t.course}|${t.ply}|${t.usi}`; (textBy.get(k) || textBy.set(k, []).get(k)).push(t); }
const numTexts = allTexts.filter((t) => hasMeasure(t.text));
const numByCourse = {}; for (const t of numTexts) numByCourse[t.course] = (numByCourse[t.course] || 0) + 1;
const textsOfCourse = {}; for (const t of allTexts) textsOfCourse[t.course] = (textsOfCourse[t.course] || 0) + 1;
// 新しい測定のある手の文で、旧の数字の範囲から外れる(±30)もの
const mism = []; const checked = [];
const seen = new Set();
for (const o of rows) {
  const ts = textBy.get(`${o.course}|${o.ply}|${o.usi}`) || [];
  for (const t of ts) {
    const id = `${t.course}|${t.ply}|${t.usi}|${t.field}`; if (seen.has(id + o.kind)) continue; seen.add(id + o.kind);
    if (t.field === "comment" && t.ply !== o.ply) continue;
    let v, list, kind;
    if (o.kind === "咎めの外れる手" && t.field === "punishNote") { kind = "loss"; v = lossOf(o); list = firstList(t.text, "loss"); }
    else if (/次善/.test(t.text) && lossOf(o) === 0 && o.kind !== "咎めの外れる手") { kind = "margin"; v = o.M.mv.margin; list = firstList(t.text, "margin"); }
    else if (["note", "comment"].includes(t.field) && o.kind !== "咎めの外れる手") { kind = "gap"; v = lossOf(o); list = firstList(t.text.replace(/次善[^。]*?点/g, ""), "gap"); }
    else continue;
    if (!list) continue;
    checked.push(id);
    const lo = Math.min(...list), hi = Math.max(...list);
    if ((v < lo - 30 || v > hi + 30) && (v < lo * 0.75 || v > hi * 1.25)) mism.push({ ...t, kind, v, old: range(list), o });
  }
}
// 判定が変わって文の書き直しが要るもの(咎め消える/唯一外す/100超) -> 文のある手
const judgmentChanged = new Set([...pDrop, ...uBreak, ...uNotBest, ...devOwn, ...varOwn, ...varOpp, ...varEntry, ...border].map((o) => `${o.course}|${o.ply}|${o.usi}`));
const textsToFix = new Set();
for (const k of judgmentChanged) for (const t of textBy.get(k) || []) if (hasMeasure(t.text) || flagRe.test(t.text) || t.field === "punishNote") textsToFix.add(`${k}|${t.field}`);
const mismKeys = new Set(mism.map((m) => `${m.course}|${m.ply}|${m.usi}|${m.field}`));
const fixAll = new Set([...textsToFix, ...mismKeys]);
const fixByCourse = {}; for (const k of fixAll) { const c = k.split("|")[0]; fixByCourse[c] = (fixByCourse[c] || 0) + 1; }

// ---- 章ごとの集計 ----
const courses = entries.map((e) => e.id);
const tally = {};
for (const c of courses) tally[c] = { 咎め消: 0, 咎め残: 0, 咎め枝自: 0, 唯一外: 0, 唯一非最善: 0, 変化: 0, 境目: 0, 文: fixByCourse[c] || 0, 計: 0 };
for (const o of pDrop) tally[o.course].咎め消++; for (const o of pKeep) tally[o.course].咎め残++;
for (const o of devOwn) tally[o.course].咎め枝自++;
for (const o of uBreak) tally[o.course].唯一外++; for (const o of uNotBest) tally[o.course].唯一非最善++;
for (const o of [...varOwn, ...varOpp, ...varEntry]) tally[o.course].変化++;
for (const o of border) tally[o.course].境目++;
for (const c of courses) { const t = tally[c]; t.計 = t.咎め消 + t.咎め枝自 + t.唯一外 + t.唯一非最善 + t.変化 + t.境目; }

// ---- 出力 ----
const L = [];
const P = (s = "") => L.push(s);
const tbl = (head, rowsArr) => { if (!rowsArr.length) { P("(なし)"); P(); return; } P("| " + head.join(" | ") + " |"); P("|" + head.map(() => "---").join("|") + "|"); for (const r of rowsArr) P("| " + r.map(esc).join(" | ") + " |"); P(); };
// 同じ局面+手は章をまたいで1行にまとめる
const G = (a) => { const m = new Map(); for (const o of a) { const k = `${o.key}|${o.usi}`; (m.get(k) || m.set(k, []).get(k)).push(o); } return [...m.values()]; };
const cc = (g) => `${g[0].course} ${g[0].ply}手目` + (g.length > 1 ? ` ほか${g.length - 1}章` : "");
const kinds = (g) => [...new Set(g.map((o) => o.kind))].join("/");

const fixPunish = (o) => (lossOf(o) <= 100 ? "消す(ミスと言えない)。変化の枝へ付け替え可" : "消す、または文を「損◯◯の小さな悪手」に言い直して変化の枝へ");
const fixOwn = (o) => `差し替え(新の最善 ${bestJp(o)})、または枝ごと消す`;

const gN = (a) => G(a).length;
const total = {
  咎め消: pDrop.length, 咎め残: pKeep.length, 咎め枝自: devOwn.length, 咎め枝相: devOpp.length,
  唯一外: uBreak.length, 唯一非最善: uNotBest.length, 唯一残: uKeep.length, 唯一参考: untaggedU.length,
  変化自: varOwn.length, 変化相: varOpp.length, 変化入口: varEntry.length,
  境目自: borderOwn.length, 境目相: borderOpp.length, 境目計: borderAll.length,
};
const fixList = [...pDrop, ...devOwn, ...uBreak, ...uNotBest, ...varOwn, ...varOpp, ...varEntry, ...border];
const needFix = fixList.length;
const needFixG = gN(fixList);
const chBig = courses.map((c) => ({ c, n: tally[c].計 })).sort((a, b) => b.n - a.n);
// 共通の入口: 複数の章にまたがって100超になっている本線の手
const shared = G(border).filter((g) => g.length >= 3).sort((a, b) => b.length - a.length);
const sharedN = shared.reduce((a, g) => a + g.length, 0);
const swapG = G(swapped);

P("# 測り直し A の結果(2026-11-09)");
P();
P(`新エンジン(つようら王11mini)で、A の範囲 ${cases.length} 局面を測った結果。1段目 500万ノード(${s1.size}局面)、境目の ${s2.size} 局面は 2段目 4000万ノードの値で判定。章のデータは変えていない(まとめだけ)。再生成は \`node scripts/remeasure-A-summary.mjs\`。`);
P();
P("## 結論");
P();
P(`- **直しが要る項目: 局面+手で ${needFixG} か所(章×手で数えると ${needFix})。** 同じ局面は章をまたいで1行にまとめて表にした。`);
P(`- **咎めの枝**: 損が 300 未満に落ちた = **${gN(pDrop)}** か所(消す候補)。300 以上のまま ${gN(pKeep)}。枝の中の自分の手が 100 超 = **${gN(devOwn)}**。`);
P(`- **「唯一」**: 次善との差が 100 未満 = **${gN(uBreak)}**(「唯一」を外す候補)、書いた手が最善でなくなった = **${gN(uNotBest)}**。100 以上のまま ${gN(uKeep)}。逆に、唯一と書いていないが差 100 以上 = ${gN(untaggedU)}(参考)。「唯一ではありません」と書いた ${gN(uniqNeg)} か所のうち、実は差 100 以上 = ${gN(uNegBig)}。`);
P(`- **変化の枝**: 枝の中の自分の手 100 超 = **${gN(varOwn)}**、相手の手 100 超 = **${gN(varOpp)}**、入口(相手の別の手)100 超 = **${gN(varEntry)}**。`);
P(`- **境目の本線の手**(旧で差 60〜140 だった ${gN(borderAll)} か所): 100 超 = **${gN(border)}**(学ぶ側 ${gN(borderOwn)}・相手 ${gN(borderOpp)}。同じ局面でも章によって学ぶ側と相手が分かれるので合計は一致しない)。`);
P(`  - 多くの章に共通する入口の手が影響の大半: ${shared.map((g) => `${jp(sfenOf(g[0]), g[0].usi)}(${g[0].ply}手目、新の差 ${lossOf(g[0])}、新の最善 ${bestJp(g[0])}、${g.length}章)`).join("、")}。この ${shared.length} か所だけで章×手 ${sharedN} 件。`);
P(`- **文の数字**: 旧エンジンの数字(d16〜d22 の差・損・評価値)を書いた文は ${numTexts.length} 文(42 章の ${allTexts.length} 文中)。うち**書き直しが要る文 = ${fixAll.size}**(判定が変わった手の文 ${textsToFix.size}、新の測定と数字がずれる文 ${mism.length}、重なりは除く)。残りは新しい測定が無く、旧の数字のまま。`);
P();
P("### 直しの量の見込み(推測)");
P(`- 枝を消す・付け替える ${gN(pDrop) + gN(varEntry)} か所(咎め ${gN(pDrop)}・変化の入口 ${gN(varEntry)})、手の差し替え ${gN(devOwn) + gN(varOwn) + gN(varOpp) + gN(border)} か所(枝の中 ${gN(devOwn) + gN(varOwn) + gN(varOpp)}、境目の本線 ${gN(border)})、「唯一」の言い直し ${gN(uBreak) + gN(uNotBest)} か所、数字の書き直し ${fixAll.size} 文。`);
const hDel = (gN(pDrop) + gN(varEntry)) * 22 / 60, hSw = (gN(devOwn) + gN(varOwn) + gN(varOpp)) * 40 / 60, hBd = gN(border) * 45 / 60, hUq = (gN(uBreak) + gN(uNotBest)) * 5 / 60, hTx = fixAll.size * 4 / 60;
P(`- 所要の目安(推測): 枝を消す・付け替える 1か所 約22分、手の差し替え(枝の中) 約40分、境目の本線の差し替え 約45分(以降の作り直しと再測定を含む)、「唯一」の言い直し 約5分、数字の書き直し 1文 約4分で見ると、枝の削除 約${hDel.toFixed(0)}時間・枝の中の差し替え 約${hSw.toFixed(0)}時間・本線 約${hBd.toFixed(0)}時間・唯一 約${hUq.toFixed(0)}時間・数字 約${hTx.toFixed(0)}時間、**合計 約${(hDel + hSw + hBd + hUq + hTx).toFixed(0)}時間**。重複する直し(同じ文を数字と唯一で2回)があるので、実際はこれより少なめ。`);
P(`- **本線に手を入れる ${gN(border)} か所のうち、共通の入口 ${shared.length} か所(石田流 ▲7五歩・中飛車後手の △5四歩など)は章の骨格に関わる**。ここを先に決めないと、文の数字を直しても二度手間になる。残りの本線の手は章ごとに差し替えるか、100 超のまま『ミスではない』として扱うかを決める。`);
P(`- 大きく変わる章(直しの件数の多い順): ${chBig.slice(0, 8).map((x) => `${x.c}(${x.n})`).join("、")}。`);
P();
P("凡例: 数字は新エンジンの損(最善との差)または差。`*` は 2段目(4000万ノード)の値。「旧」は scripts/lab-out の旧エンジン記録(深さ違いは範囲)。無いときは `-`(旧の記録が lab-out に無い局面)。");
P();

P("## 章ごとの件数");
P();
P("章×手での数え方(共通の局面は各章に数える)。");
P();
tbl(["章", "咎め消", "咎め残", "咎め枝自100超", "唯一外す", "唯一非最善", "変化100超", "境目100超", "要直し文"],
  courses.map((c) => [c, tally[c].咎め消, tally[c].咎め残, tally[c].咎め枝自, tally[c].唯一外, tally[c].唯一非最善, tally[c].変化, tally[c].境目, tally[c].文]));
P(`合計(章×手): 咎め消 ${total.咎め消} / 咎め残 ${total.咎め残} / 咎め枝自 ${total.咎め枝自} / 唯一外 ${total.唯一外} / 唯一非最善 ${total.唯一非最善} / 変化 ${total.変化自 + total.変化相 + total.変化入口} / 境目 ${border.length} / 要直し文 ${fixAll.size}`);
P();

P("## 1. 咎めの枝");
P();
P(`咎めの外れる手 ${gN(punish)} 局面(章×手 ${punish.length})の損。基準は相手の損 300 以上。`);
P();
P(`### 1-a. 損が 300 未満になった(消える候補) ${gN(pDrop)}`);
P();
tbl(["章", "外れる手", "旧の損", "新の損", "新の最善", "どう直すか"], G(pDrop).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "punish") ?? "-", lossOf(o) + mark(o) + (o.M.stage === 2 ? `(1段目${o.M.s1loss})` : ""), bestJp(o), fixPunish(o)]; }));
P(`### 1-b. 300 以上のまま残る ${gN(pKeep)}`);
P();
const keepSorted = G(pKeep).sort((a, b) => lossOf(a[0]) - lossOf(b[0]));
P(`最小は ${lossOf(keepSorted[0][0])}。300〜399 は ${keepSorted.filter((g) => lossOf(g[0]) < 400).length}、400〜599 は ${keepSorted.filter((g) => lossOf(g[0]) >= 400 && lossOf(g[0]) < 600).length}、600 以上 ${keepSorted.filter((g) => lossOf(g[0]) >= 600).length}。薄い順に 8 か所:`);
P();
tbl(["章", "外れる手", "旧の損", "新の損"], keepSorted.slice(0, 8).map((g) => [cc(g), label(g[0]), oldFor(g[0], "punish") ?? "-", lossOf(g[0]) + mark(g[0])]));
P(`### 1-c. 咎めの枝の中の自分の手が最善との差 100 超 ${gN(devOwn)}`);
P();
tbl(["章", "自分の手", "旧の差", "新の差", "新の最善", "どう直すか"], G(devOwn).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), bestJp(o), fixOwn(o)]; }));
P(`参考: 咎めの枝の中の相手の手が 100 超 ${gN(devOpp)} か所(咎めの枝の相手の手は、咎めを受けて指す手なので基準の対象外。件数のみ)。`);
P();

P("## 2. 「唯一」");
P();
P(`「唯一」と書いた手 ${gN(uniqRows)} か所(章×手 ${uniqRows.length})を測った。`);
P();
P(`### 2-a. 次善との差が 100 未満(「唯一」を外す候補) ${gN(uBreak)}`);
P();
tbl(["章", "手", "種類", "旧(文の次善との差)", "新の次善との差", "次善", "どう直すか"], G(uBreak).map((g) => { const o = g[0]; return [cc(g), label(o), kinds(g), (firstList(o.text || "", "margin") || []).join("・") || "-", o.M.mv.margin + mark(o), jp(sfenOf(o), o.M.second?.usi), "文から「唯一」を外し、「次善との差◯◯」に言い直す"]; }));
P(`### 2-b. 唯一と書いた手が最善でなくなった ${gN(uNotBest)}`);
P();
tbl(["章", "手", "種類", "新の差", "新の最善", "どう直すか"], G(uNotBest).map((g) => { const o = g[0]; return [cc(g), label(o), kinds(g), lossOf(o) + mark(o), bestJp(o), lossOf(o) > TH.mistake ? "差し替え(新の最善へ)。文の「唯一」も直す" : "文から「唯一」を外し、新の最善との並びに言い直す(差は100以内)"]; }));
P(`### 2-c. 差 100 以上のまま ${gN(uKeep)}(変更なし)`);
P();
P(`### 2-d. 参考: 「唯一ではありません」と書いたが次善との差が 100 以上 ${gN(uNegBig)}`);
P();
tbl(["章", "手", "新の次善との差"], G(uNegBig).map((g) => [cc(g), label(g[0]), g[0].M.mv.margin + mark(g[0])]));
const unRef = untaggedU.filter((o) => !/^咎めの枝/.test(o.kind));
const unDev = untaggedU.filter((o) => /^咎めの枝/.test(o.kind));
P(`### 2-e. 参考: 「唯一」と書いていないが次善との差 100 以上 ${gN(untaggedU)}`);
P();
P(`測ったのは境目・枝の局面に限るので、これで全部ではない。咎めの枝の中は ${gN(unDev)} か所(咎めを受けた後の決まった返しで、差が大きいのは自然。書き足しは任意)。それ以外 ${gN(unRef)} か所を載せる(本線・変化の枝)。`);
P();
tbl(["章", "手", "種類", "次善との差"], G(unRef).map((g) => [cc(g), label(g[0]), kinds(g), g[0].M.mv.margin + mark(g[0])]));

P("## 3. 変化の枝");
P();
P(`### 3-a. 枝の中の自分の手が 100 超 ${gN(varOwn)}`);
P();
tbl(["章", "自分の手", "旧の差", "新の差", "新の最善", "どう直すか"], G(varOwn).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), bestJp(o), fixOwn(o)]; }));
P(`### 3-b. 枝の中の相手の手が 100 超 ${gN(varOpp)}`);
P();
tbl(["章", "相手の手", "旧の差", "新の差", "新の最善", "どう直すか"], G(varOpp).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), bestJp(o), `差し替え(新の最善 ${bestJp(o)})、またはミス側(咎めの枝)へ移す`]; }));
P(`### 3-c. 入口(相手の別の手)が 100 超 ${gN(varEntry)}`);
P();
tbl(["章", "入口の手", "旧の差", "新の差", "新の最善", "どう直すか"], G(varEntry).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), bestJp(o), "変化の枝を消す、または咎めの枝(損300以上か)に付け替える"]; }));

P("## 4. 境目の本線の手");
P();
P(`旧で差 60〜140 だった本線の手 ${gN(borderAll)} か所(章×手 ${borderAll.length})。新で 100 以内に収まった ${gN(borderAll) - gN(border)}、100 超になった ${gN(border)}(学ぶ側 ${gN(borderOwn)}・相手 ${gN(borderOpp)})。`);
P();
P("### 4-a. 学ぶ側の手が 100 超");
P();
tbl(["章", "手", "旧の差", "新の差", "新の最善(評価)", "どう直すか"], G(borderOwn).sort((a, b) => b.length - a.length || lossOf(b[0]) - lossOf(a[0])).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), `${bestJp(o)}(${o.M.bestCp})`, `差し替え(新の最善)。以降の本線を作り直し${g.length >= 3 ? "。共通の入口なので全章に効く" : ""}`]; }));
P("### 4-b. 相手の本線の手が 100 超");
P();
tbl(["章", "手", "旧の差", "新の差", "新の最善(評価)", "どう直すか"], G(borderOpp).sort((a, b) => b.length - a.length || lossOf(b[0]) - lossOf(a[0])).map((g) => { const o = g[0]; return [cc(g), label(o), oldFor(o, "gap") ?? "-", lossOf(o) + mark(o), `${bestJp(o)}(${o.M.bestCp})`, "相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す"]; }));

P("## 5. 最善手が入れ替わり、本線の手が最善でなくなったうち 100 超");
P();
P(`本線の手(4)と、唯一と書いた手(2-b)のうち、新で最善が別の手になり差が 100 超のもの ${swapG.length} か所(章×手 ${swapped.length})。4 と 2-b の再掲で、新の最善手の評価値を添え、差が大きい順に並べた。評価値は手番側から見た値。`);
P();
tbl(["章", "手", "学ぶ側", "新の差", "新の最善", "最善の評価"], swapG.sort((a, b) => lossOf(b[0]) - lossOf(a[0])).map((g) => [cc(g), label(g[0]), g[0].mine ? "自分" : "相手", lossOf(g[0]) + mark(g[0]), bestJp(g[0]), g[0].M.bestCp]));

P("## 6. 文に書いた数字が新しい測定と合わなくなったもの");
P();
P(`- 対象 42 章の文(note・aim・punishNote・節の comment)${allTexts.length} 文のうち、測定の数字を書いたもの = **${numTexts.length}** 文。ほぼ全部が旧エンジン(水匠 d16〜d22)の測定。`);
P(`- **書き直しが要る文 = ${fixAll.size}**。内訳: 判定が変わった手の文 ${textsToFix.size}、新と数字がずれる文 ${mism.length}(新の値が旧の範囲から ±30 かつ ±25% の外。重なりは除く)。`);
P("- ずれの多くは大きな損(1000 超)。新エンジンは大きな差を約 1.5 倍、小さな差を約 0.8 倍にするため、数字を書いた文は『旧エンジンの測定』と明記するか、新の値に置き換えるかを決める必要がある。");
P(`- 数字入りの文のうち新の測定と照合できたのは ${checked.length} 文(照合できた = 同じ手の差・損・次善との差が文から取れたもの)。評価値(+◯◯、-◯◯)や指し継ぎの値(『20手指し継いで +3068 以上』など)は今回の A では測っていないので、旧の数字のまま(数も上の ${numTexts.length} 文に含む)。`);
P();
P("章ごとの数(『全文』は note・aim・punishNote・節の comment の合計):");
P();
tbl(["章", "数字入りの文", "全文", "要直し文"], courses.map((c) => [c, numByCourse[c] || 0, textsOfCourse[c] || 0, tally[c].文]));
P("### ずれの例(新の値が旧の範囲から大きく外れる、新が小さい順→差の大きい例)");
P();
const ex = [...mism].sort((a, b) => Math.abs(b.v - Number((b.old || "0").split("〜")[0])) - Math.abs(a.v - Number((a.old || "0").split("〜")[0])));
const exSmall = ex.filter((m) => m.v < 1000 && Number((m.old || "0").split("〜")[0]) < 1000).slice(0, 10);
const exBig = ex.filter((m) => !exSmall.includes(m)).slice(0, 6);
P(`小さな差・損のずれ(1000 未満)${mism.filter((m) => m.v < 1000 && Number((m.old || "0").split("〜")[0]) < 1000).length} 文のうち 10 件、大きな損のずれ 6 件。`);
P();
tbl(["章", "手", "文の種類", "旧(文)", "新", "文の抜粋"], [...exSmall, ...exBig].map((m) => [`${m.course} ${m.ply}手目`, jp(posOf(m.o.key), m.usi), m.field + "/" + m.kind, m.old, m.v + (m.o.M.stage === 2 ? "*" : ""), m.text.replace(/\n/g, " ").slice(0, 50)]));

P("## 付録: まとめ方");
P("- 判定は 2段目がある局面は 2段目の値、ほかは 1段目。損は最善との差(手番側)。候補外の手は指した後を探索した値(via:child)。");
P("- 表は同じ局面+手を1行にまとめ、『ほかN章』と書いた。章×手の数は章ごとの直しの数を見るときに使う。");
P("- 「自分の手/相手の手」は、章の mySide と局面の手番で決めた。『境目(本線)』は旧の記録で差 60〜140 だった本線の手に限る(cases.json と同じ)。");
P("- 『唯一(節のコメント)』は、手を指した後の局面の comment に『唯一』とあるものを、その手の判定として扱った。comment が次の手を指している場合は対象の手がずれうるので、直す前に確かめる。");
P("- 「唯一ではありません」と書いた文は『唯一』の判定から外し、2-d に分けた。");
P("- 「要直し文」は、(判定が変わった手の)数字入りの文・『唯一』を含む文・咎めの punishNote と、数字ずれの文の和集合。機械の目安で、直す前に章ごとに目で確かめる。");
P(`- 測定が無かった対象: ${missing} 局面。`);
fs.writeFileSync(path.join(root, "docs/remeasure-A-result.md"), L.join("\n") + "\n");
console.log({ needFix, needFixG, mism: mism.length, textsToFix: textsToFix.size, fixAll: fixAll.size, numTexts: numTexts.length, checked: checked.length, shared: shared.length, sharedN, neg: uniqNeg.length, negBig: uNegBig.length, g: { pDrop: gN(pDrop), devOwn: gN(devOwn), uBreak: gN(uBreak), uNotBest: gN(uNotBest), uKeep: gN(uKeep), var: gN(varOwn) + gN(varOpp) + gN(varEntry), border: gN(border) } });
