// note を直したあと、ねらい(aim)のキーを付け直す(scripts/aims.mjs は note の文をキーにしているので、直すと黙って外れる)。
// 使い方: node scripts/aims-rekey.mjs <基準のgit ref> <章ID ...>
//   基準の ref の JSON と今の JSON を手ごとに突き合わせ、aim が外れた手の新しい note を、前の aim で aims.mjs に足す。
//   足したあとに node scripts/courses.mjs を実行すると、JSON に aim が付く。足した件数と、衝突(同じ新 note に別々の aim)を報告する。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AIM_BY_NOTE } from "./aims.mjs";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ref, ...ids] = process.argv.slice(2);
const add = new Map(); let conflicts = 0, mismatched = 0;
for (const id of ids) {
  const rel = `src/data/joseki/${id}.json`;
  const old = JSON.parse(execFileSync("git", ["show", `${ref}:${rel}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }));
  const cur = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  (function walk(a, b, trail) {
    const ab = a.branches ?? [], bb = b.branches ?? [];
    if (ab.length !== bb.length) { mismatched++; console.log(`枝の数が違う ${id} ${trail}`); return; }
    ab.forEach((x, i) => {
      const y = bb[i];
      if (x.usi !== y.usi || x.kind !== y.kind) { mismatched++; console.log(`手が違う ${id} ${trail}`); return; }
      if (y.note && x.aim && !y.aim) {
        if (add.has(y.note) && add.get(y.note) !== x.aim) { conflicts++; console.log(`衝突 ${id} ${trail}${y.usi}: ${y.note.slice(0, 40)}`); }
        else add.set(y.note, x.aim);
      }
      if (x.child && y.child) walk(x.child, y.child, trail + y.usi + "/");
    });
  })(old.root, cur.root, "");
}
const p = path.join(root, "scripts/aims.mjs");
let s = fs.readFileSync(p, "utf8");
const fresh = [...add].filter(([k]) => !Object.prototype.hasOwnProperty.call(AIM_BY_NOTE, k));
const lines = fresh.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`).join("");
const at = s.lastIndexOf("};");
s = s.slice(0, at) + lines + s.slice(at);
fs.writeFileSync(p, s);
console.log(`aims.mjs に ${fresh.length} 件を足した(外れていた新 note ${add.size} 件のうち、すでにキーがあったのは ${add.size - fresh.length} 件)。衝突 ${conflicts}、突き合わせ不能 ${mismatched}。この後 node scripts/courses.mjs を実行すること`);
