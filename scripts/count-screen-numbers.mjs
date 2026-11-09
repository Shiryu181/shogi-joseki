// 画面に出る文のうち、評価値などの数字か「エンジン」を含むものを数える(読むだけ。章のデータは変えない)。
// 使い方:
//   node scripts/count-screen-numbers.mjs              全42章(josekiLoader で strategyId が gokigen / sankenbisha)を章ごとに数える
//   node scripts/count-screen-numbers.mjs --dump ID    その章の該当する文を JSON 行で出す(手数・場所・文)
// 対象はビルド後の src/data/joseki/*.json の、画面に出る欄(note・aim・comment・punishNote・demos の title/text・goalLabel・goalFormation・title)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_RE = /エンジン|水匠|やねうら|つようら/;
// 評価値・損・差・深さ・ノード数の書き方。手の升(7五)や「3筋」のような普通の数字は含めない。
export const NUM_RE =
  /\d+点|差\s?-?\d|損\s?-?\d|[+\-−＋－]\s?\d{2,}|\bd\d{2}\b|d1[0-9]|d2[0-9]|深さ|ノード|評価値|実測|MultiPV|\d+\/\d+\/\d+|\d+・\d+・\d+|最善から\d|\d+以内|\d+以上|\d+未満/;

export function listEntries() {
  const src = fs.readFileSync(path.join(root, "src/domain/josekiLoader.ts"), "utf8");
  const body = src.slice(src.indexOf("export const COURSE_ENTRIES"));
  return [...body.matchAll(/id: "([^"]+)",\s*strategyId: ([^,]+),/g)]
    .map((m) => ({ id: m[1], strategy: m[2].replace(/"/g, "") }))
    .filter((e) => e.strategy === "gokigen" || e.strategy === "sankenbisha");
}

/** 章の画面に出る文をすべて { ply, where, text } で返す。ply は本線からの手数(変化の中は、その変化の中の手数も含めた局面の深さ)。 */
export function screenTexts(course) {
  const out = [];
  for (const f of ["title", "goalLabel", "goalFormation"]) if (typeof course[f] === "string") out.push({ ply: 0, where: f, text: course[f] });
  function walk(node, depth, trail) {
    if (typeof node.comment === "string" && depth > 0) out.push({ ply: depth, where: "comment(局面)", text: node.comment, trail });
    if (typeof node.comment === "string" && depth === 0) out.push({ ply: 0, where: "rootComment", text: node.comment, trail });
    for (const b of node.branches ?? []) {
      const ply = depth + 1;
      const kind = b.kind === "main" ? "" : `[${b.kind}]`;
      const tr = trail + (b.kind === "main" ? "" : `${ply}手目${b.usi}${kind}→`);
      for (const f of ["note", "aim", "punishNote"]) if (typeof b[f] === "string") out.push({ ply, where: f + kind, text: b[f], usi: b.usi, trail: tr });
      for (const d of b.demos ?? []) {
        if (typeof d.title === "string") out.push({ ply, where: "demos.title", text: d.title, usi: b.usi, trail: tr });
        if (typeof d.text === "string") out.push({ ply, where: "demos.text", text: d.text, usi: b.usi, trail: tr });
      }
      if (b.child) walk(b.child, ply, tr);
    }
  }
  walk(course.root, 0, "");
  return out;
}

export const hit = (t) => ENGINE_RE.test(t) || NUM_RE.test(t);

// 2026-11-09 追加: 出典の名前・「出典にない」と、章の作り方の説明(測り方・読み筋・「変化にしません」など)。
// 出典の名前は画面に書かない(検証メモ evidence へ)。SRC_RE / PROC_RE は目印で、文の意味で判断する(残った文は理由を書く)。
export const SRC_RE = /Wikibooks|Wikipedia|ウィキ|将棋大図書館|thirdfilerook|note「|出典にない|出典に[^。]{0,14}(?:ない|ありません)/;
export const PROC_RE = /変化にし|変化にはし|目安より|読み筋|探索|測定|測り|検証|確認済|点数|数字/;
export const hit2 = (t) => hit(t) || SRC_RE.test(t) || PROC_RE.test(t);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const load = (id) => JSON.parse(fs.readFileSync(path.join(root, "src/data/joseki", `${id}.json`), "utf8"));
  const dumpIdx = process.argv.indexOf("--dump");
  if (dumpIdx > 0) {
    const id = process.argv[dumpIdx + 1];
    const all2 = process.argv.includes("--all"); // --all: 出典の名前・作り方の説明も出す
    for (const s of screenTexts(load(id))) if (all2 ? hit2(s.text) : hit(s.text)) console.log(JSON.stringify({ ply: s.ply, where: s.where, trail: s.trail, eng: ENGINE_RE.test(s.text), num: NUM_RE.test(s.text), src: SRC_RE.test(s.text), proc: PROC_RE.test(s.text), text: s.text }));
  } else {
    const rows = [];
    let total = 0, tEng = 0, tNum = 0, tAll = 0, tSrc = 0, tProc = 0, tN2 = 0;
    for (const e of listEntries()) {
      const hits = screenTexts(load(e.id)).filter((s) => hit(s.text));
      const all = screenTexts(load(e.id)).length;
      const eng = hits.filter((s) => ENGINE_RE.test(s.text)).length;
      const num = hits.filter((s) => NUM_RE.test(s.text)).length;
      const texts = screenTexts(load(e.id));
      const src = texts.filter((s) => SRC_RE.test(s.text)).length;
      const proc = texts.filter((s) => PROC_RE.test(s.text)).length;
      const n2 = texts.filter((s) => hit2(s.text)).length;
      rows.push({ id: e.id, strategy: e.strategy, all, n: hits.length, eng, num, src, proc, n2 });
      tSrc += src; tProc += proc; tN2 += n2;
      total += hits.length; tEng += eng; tNum += num; tAll += all;
    }
    console.log(JSON.stringify({ total, tEng, tNum, tAll, tSrc, tProc, tN2, rows }, null, 1));
  }
}
