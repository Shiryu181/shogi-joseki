// 自分の手の解説(note)の集計と、判定用の抜き出し(読むだけ。章のデータは変えない)。
// 使い方:
//   node scripts/notes-stats.mjs stats            全件の集計(文の数・長さ・用語・形勢の言葉)
//   node scripts/notes-stats.mjs dump [出力先]     自分の手の note を JSON で出す(既定は標準出力)
//   node scripts/notes-stats.mjs sample N [seed]   戦法×手番ごとに均等に N/4 件を等間隔で抜き出す
//   node scripts/notes-stats.mjs chapter ID        その章の自分の手の note を手数順に出す
// 自分の手 = 局面の手番が章の mySide と同じ手(咎めの枝・変化の中も含む)。出典: src/data/joseki/*.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEntries, screenTexts } from "./count-screen-numbers.mjs";
import { AIM_BY_NOTE } from "./aims.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (id) => JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));

export const splitSentences = (t) => (t.match(/[^。!?!?]+[。!?!?]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

/** 章の全ての手(本線・枝)を { kind, ply, mine, note, aim, ... } で返す。ply は木の根からの深さ。 */
export function allMoves(course) {
  const out = [];
  const mine = course.mySide === "sente" ? "b" : "w";
  function walk(node, depth, trail) {
    const turn = node.sfen.split(" ")[1];
    for (const b of node.branches ?? []) {
      const ply = depth + 1;
      out.push({ kind: b.kind, ply, mine: turn === mine, usi: b.usi, note: b.note ?? "", aim: b.aim ?? null, trail, hasPunish: !!b.punishNote });
      if (b.child) walk(b.child, ply, trail + (b.kind === "main" ? "" : `${ply}${b.kind}/`));
    }
  }
  walk(course.root, 0, "");
  return out;
}

export function collect() {
  const rows = [];
  for (const e of listEntries()) {
    const c = load(e.id);
    const strat = e.strategy === "gokigen" ? "中飛車" : "三間飛車";
    const side = c.mySide === "sente" ? "先" : "後";
    for (const m of allMoves(c)) rows.push({ chapter: e.id, strat, side, group: `${strat}${side}`, ...m, aimKey: Object.prototype.hasOwnProperty.call(AIM_BY_NOTE, m.note) });
  }
  return rows;
}

// 形勢の言葉。先手から見た段階に直す(後手が良い = マイナス)。
// 段階: 互角0 / 少し(やや)良い±1 / 良い±2 / 大きく良い±3。「苦しい・悪い」は相手側が良いとして扱う。
export function shapeLevels(text) {
  const out = [];
  const re = /(先手|後手)が(大きく|少し|やや)?(良|よ|苦し|悪)|ほぼ互角|互角/g;
  let m;
  while ((m = re.exec(text))) {
    if (!m[1]) { out.push({ level: 0, word: m[0] }); continue; }
    const mag = m[2] === "大きく" ? 3 : m[2] ? 1 : 2;
    const good = m[3] === "良" || m[3] === "よ";
    const sign = (m[1] === "先手") === good ? 1 : -1;
    out.push({ level: sign * mag, word: m[0] });
  }
  return out;
}

/** 章ごとに、本線の手(note)と局面(comment)に出る形勢の言葉を、手数順に並べて段階の変わり目を数える。 */
export function shapeByChapter() {
  const res = [];
  for (const e of listEntries()) {
    const c = load(e.id);
    const seq = [];
    (function walk(node, depth) {
      if (typeof node.comment === "string") for (const l of shapeLevels(node.comment)) seq.push({ ply: depth, where: "局面", ...l });
      const b = (node.branches ?? []).find((x) => x.kind === "main") ?? node.branches?.[0];
      if (!b) return;
      for (const l of shapeLevels(b.note ?? "")) seq.push({ ply: depth + 1, where: "note", ...l });
      if (b.child) walk(b.child, depth + 1);
    })(c.root, 0);
    const levels = [...new Set(seq.map((x) => x.level))];
    let changes = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i].level !== seq[i - 1].level) changes++;
    const goal = shapeLevels(c.goalLabel ?? "");
    res.push({ chapter: e.id, mentions: seq.length, noteMentions: seq.filter((x) => x.where === "note").length, distinctLevels: levels.length, changes, goal: goal.map((g) => g.word), seq: seq.map((x) => `${x.ply}${x.where === "note" ? "n" : "c"}:${x.word}`) });
  }
  return res;
}

// 使う人が知らなそうな語(notes-survey の上位語に合わせた正規表現)
export const TERMS = [
  ["美濃囲い", /美濃/], ["位", /[1-9]の位|位を取|位を張|位取り|位を/], ["石田流", /石田流/], ["角交換", /角交換/],
  ["戦法名(超速・丸山・ゴキゲン・右四間・棒銀など)", /超速|丸山|ゴキゲン|右四間|棒銀|耀龍|端角|UFO|鬼殺し|嬉野|四間飛車|相掛かり|矢倉|急戦/],
  ["本線", /本線/], ["形を整える・組み替える", /形を整|整え|組み替/], ["早石田", /早石田/], ["突き出す", /突き出/],
  ["当てる・当たり", /当て(?:る|て|ます)|当たり|当たる/], ["穴熊", /穴熊/], ["利き", /利き|効き|効いて|効く/], ["逃げ道", /逃げ道/],
  ["厚み", /厚み|厚く|手厚/], ["飛車先", /飛車先/], ["筋違い", /筋違い/], ["仕掛け", /仕掛/], ["主導権", /主導権/], ["本組み", /本組み/],
  ["歩の交換", /歩の交換|歩を交換/], ["急所", /急所/], ["けん制", /けん制|牽制/], ["成り込み", /成り込/], ["垂らす", /垂らし|垂らす/], ["陣形", /陣形/],
  ["端攻め", /端攻め/], ["さばく", /さばく|捌/], ["紐", /紐/], ["拠点", /拠点/], ["戦型", /戦型/], ["受け止める", /受け止/],
  ["囲い", /囲い/], ["角道", /角道/], ["玉を寄せる", /玉を.{0,3}寄せ/], ["狙い", /狙い/],
];
const DEFINED_RE = /とは|のことです|という意味|のことで|と呼びます|という形|と言います|といいます/;

function stats() {
  const rows = collect();
  const my = rows.filter((r) => r.mine);
  const opp = rows.filter((r) => !r.mine);
  const g = (arr, f) => arr.filter(f);
  const ns = (r) => splitSentences(r.note).length;
  const first2 = (r) => splitSentences(r.note).slice(0, 2).join("");
  const first1 = (r) => splitSentences(r.note)[0] ?? "";
  const rep = (label, a) => {
    const lens = a.map((r) => r.note.length), f2 = a.map((r) => first2(r).length), f1 = a.map((r) => first1(r).length);
    return { label, n: a.length, s1: g(a, (r) => ns(r) === 1).length, s2: g(a, (r) => ns(r) === 2).length, s3: g(a, (r) => ns(r) >= 3).length,
      lenMed: median(lens), len90: pct(lens, 0.9), lenMax: Math.max(0, ...lens), f1Med: median(f1), f190: pct(f1, 0.9), f2Med: median(f2), f290: pct(f2, 0.9), f2Max: Math.max(0, ...f2),
      over60: g(a, (r) => first2(r).length > 60).length, over80: g(a, (r) => first2(r).length > 80).length, empty: g(a, (r) => !r.note).length };
  };
  const groups = ["中飛車先", "中飛車後", "三間飛車先", "三間飛車後"];
  const table = [rep("自分の手 全体", my), ...groups.map((k) => rep(k, my.filter((r) => r.group === k))), rep("中飛車", my.filter((r) => r.strat === "中飛車")), rep("三間飛車", my.filter((r) => r.strat === "三間飛車")), rep("相手の手 全体", opp)];
  // 本線のみ・枝
  const kinds = {};
  for (const r of my) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  const aimMy = my.filter((r) => r.aim).length;
  const aimKeyed = my.filter((r) => r.aimKey).length;
  // 用語(最初の1〜2文、同じ note に定義の言い回しがないもの)
  const termCount = TERMS.map(([name, re]) => [name, my.filter((r) => re.test(first2(r)) && !DEFINED_RE.test(r.note)).length]).sort((a, b) => b[1] - a[1]);
  // 最初の1〜2文に出る測定など
  const meas = my.filter((r) => /エンジン|点|d\d\d|出典|推測|確かめ|第\d+章|の章/.test(first2(r))).length;
  const shape = shapeByChapter();
  // 最初の1〜2文の中身(重なりあり)
  const REASON = /ため|ので|から|ように|準備|守|囲|取る|取り|取れ|受け|防|ふさ|支え|狙|目指|固め|攻め|備え|形にし|作り|作る|心配|通り道|利きを|入れ|開け|動か/;
  const MOVE_QUALITY = /最善|同じくらい|近い手|唯一|少し劣|指せる|指せます|損をします/;
  const PROOF = /盤で確かめ|盤面から確かめ|推測|確かめていません|一般的な説明|出典|エンジン/;
  const REF = /本線と同じ|本線の\d+手目|第\d+章|の章/;
  const by = (re) => Object.fromEntries(["中飛車先", "中飛車後", "三間飛車先", "三間飛車後"].map((k) => [k, my.filter((r) => r.group === k && re(first2(r))).length]));
  const parts = {
    noReasonWord: by((t) => !REASON.test(t)),
    moveQuality: by((t) => MOVE_QUALITY.test(t)),
    proofOrGuess: by((t) => PROOF.test(t)),
    chapterRef: by((t) => REF.test(t)),
    onlyOneSentence: Object.fromEntries(["中飛車先", "中飛車後", "三間飛車先", "三間飛車後"].map((k) => [k, my.filter((r) => r.group === k && ns(r) === 1).length])),
    guessFlag: my.filter((r) => /推測です|確かめていません/.test(r.note)).length,
    boardChecked: my.filter((r) => /盤で確かめ|盤面から確かめ/.test(r.note)).length,
    srcWord: my.filter((r) => /出典/.test(r.note)).length,
  };
  const shapeWords = {};
  for (const [w, re] of [["ほぼ互角", /ほぼ互角/], ["互角", /(?<!ほぼ)互角/], ["少し良い/苦しい", /少し(?:良|苦し|悪)/], ["やや良い/苦しい", /やや(?:良|苦し|悪)/], ["良い(単独)", /が良い/], ["大きく", /大きく(?:良|苦し|悪)/]]) {
    let n = 0;
    for (const e of listEntries()) for (const t of screenTexts(load(e.id))) n += t.text.split(re).length - 1;
    shapeWords[w] = n;
  }
  return { table, kinds, aimMy, aimKeyed, termCount, meas, parts, shapeWords, shape };
}

const cmd = process.argv[2];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (cmd === "stats") console.log(JSON.stringify(stats(), null, 1));
  else if (cmd === "dump") {
    const out = JSON.stringify(collect().filter((r) => r.mine), null, 1);
    if (process.argv[3]) fs.writeFileSync(process.argv[3], out); else console.log(out);
  } else if (cmd === "sample") {
    const n = Number(process.argv[3] ?? 80);
    const per = Math.floor(n / 4);
    const my = collect().filter((r) => r.mine);
    const out = [];
    for (const k of ["中飛車先", "中飛車後", "三間飛車先", "三間飛車後"]) {
      const a = my.filter((r) => r.group === k);
      for (let i = 0; i < per; i++) out.push(a[Math.floor(((i + 0.5) * a.length) / per)]);
    }
    console.log(JSON.stringify(out, null, 1));
  } else if (cmd === "chapter") {
    for (const r of collect().filter((r) => r.mine && r.chapter === process.argv[3])) console.log(JSON.stringify(r));
  } else console.error("使い方は先頭のコメントを見てください");
}
