/**
 * 基準の換算の分析。calib-wasm.json(旧 d16/18/20)と calib-native-5M.json(新 5Mノード)を突き合わせる。
 *   node scripts/calib-analyze.cjs [新のファイル] > 結果の表(標準出力)
 * 値の定義
 *   値(咎め・100以内の手)= 最善との差 loss、値(唯一)= 次善との差 margin
 *   旧の代表値 = 3つの深さの中央値。旧の判定 = 3つの深さすべてで基準を満たすか(今の運用どおり)
 */
const fs = require("node:fs");
const lab = __dirname + "/lab-out/";
const newFile = process.argv[2] || "calib-native-5M.json";
// 本体 + 追加の咎め局面(calib-extra-*)があれば合わせる
const load = (f) => (fs.existsSync(lab + f) ? JSON.parse(fs.readFileSync(lab + f, "utf-8")).results : []);
const O = new Map([...load("calib-wasm.json"), ...load("calib-extra-wasm.json")].map((r) => [r.id, r]));
const N = new Map([...load(newFile), ...load(newFile.replace("calib-", "calib-extra-"))].map((r) => [r.id, r]));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const field = (kind) => (kind === "unique" ? "margin" : "loss");
const rows = [];
for (const [id, o] of O) {
  const n = N.get(id); if (!n) continue;
  const f = field(o.kind);
  const ov = [16, 18, 20].map((d) => o.depths[d]).filter(Boolean);
  const nv = n.depths.n;
  if (!nv) continue;
  const oVals = ov.map((x) => x[f]);
  const moveIsBestOld = ov.every((x) => x.best === o.move);
  if (oVals.some((v) => v == null)) { rows.push({ id, kind: o.kind, family: o.family, skip: "旧の値が欠けた" }); continue; }
  rows.push({ id, kind: o.kind, family: o.family, move: o.move, old: oVals, oldMed: med(oVals), oldMin: Math.min(...oVals), oldMax: Math.max(...oVals),
    nw: nv[f], nwBest: nv.best, nwBestIsMove: nv.best === o.move, oldBestAll: moveIsBestOld, nwDepth: n.reachedDepth, nwTop: nv.top, oldBest: ov.map((x) => x.best) });
}
const ok = rows.filter((r) => !r.skip && r.nw != null);
// 旧の判定
const oldPass = (r) => r.kind === "punish" ? r.oldMin >= 230 : r.kind === "unique" ? r.oldMin >= 100 && r.oldBestAll : r.oldMax <= 100;
// 新の判定(線 T)
const newPass = (r, T) => r.kind === "punish" ? r.nw >= T : r.kind === "unique" ? r.nw >= T && r.nwBestIsMove : r.nw <= T;
const out = { rows: ok, skipped: rows.filter((r) => r.skip) };
// 比
function ratioStats(sel) {
  const rs = sel.filter((r) => r.oldMed >= 20).map((r) => r.nw / r.oldMed);
  return rs.length ? { n: rs.length, med: med(rs), q1: q(rs, .25), q3: q(rs, .75), min: Math.min(...rs), max: Math.max(...rs) } : { n: 0 };
}
const bucket = (v) => v < 50 ? "<50" : v < 150 ? "50-150" : v < 400 ? "150-400" : "400+";
out.ratio = {};
for (const g of ["loss", "margin", "all"]) {
  const sel = ok.filter((r) => g === "all" || (g === "loss" ? r.kind !== "unique" : r.kind === "unique"));
  out.ratio[g] = { total: ratioStats(sel) };
  for (const b of ["50-150", "150-400", "400+"]) out.ratio[g][b] = ratioStats(sel.filter((r) => bucket(r.oldMed) === b));
}
// 線ごとの一致数(種類別)
out.sweep = {};
for (const [k, base] of [["punish", 230], ["unique", 100], ["near", 100]]) {
  const sel = ok.filter((r) => (k === "near" ? r.kind === "learner" || r.kind === "opp" : r.kind === k));
  const lines = [];
  for (let T = Math.round(base * 0.5); T <= base * 3; T += 10) {
    const mism = sel.filter((r) => oldPass(r) !== newPass(r, T));
    lines.push({ T, agree: sel.length - mism.length, of: sel.length });
  }
  out.sweep[k] = lines;
}
fs.writeFileSync(lab + "calib-analysis.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.ratio, null, 1));
for (const k of Object.keys(out.sweep)) { const L = out.sweep[k]; const best = Math.max(...L.map((x) => x.agree)); console.log(k, "最良一致", best, "/", L[0].of, "線:", L.filter((x) => x.agree === best).map((x) => x.T).join(",")); }
