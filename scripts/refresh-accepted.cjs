/**
 * 指定した局面だけ、許容手を長めの探索で測り直して accepted-cache.json を上書きする開発用スクリプト。
 *
 * なぜ必要か: キャッシュは 2000ms の MultiPV で作っているため、評価のぶれで
 * 定跡手が許容手(最善から100点以内)からこぼれることがある(2026-10-09 の実測で、
 * 警告18件のうち14件は長い探索では差が2〜97点だった)。
 * そこで2回(ms と 1.5×ms)測り、どちらかで最善から100点以内に入った手を許容手とする。
 *
 * 使い方: node scripts/refresh-accepted.cjs [--ms 6000] <コースID>:<手数> ...
 *   手数はその定跡手の手数(1始まり)。その手を指す前の局面を測り直す。
 */
const fs = require("node:fs");
const path = require("node:path");
const { Position, parseUSIMove } = require("tsshogi");
const { createEngine } = require("./lib/engine.cjs");

const args = process.argv.slice(2);
const msIdx = args.indexOf("--ms");
const MS = msIdx >= 0 ? Number(args[msIdx + 1]) : 6000;
const targets = args.filter((a, i) => a.includes(":") && i !== msIdx + 1);
const TOL = 100, PV = 20, MAX_ACCEPTED = 20;
const CACHE = path.join(__dirname, "accepted-cache.json");
const key = (sfen) => sfen.split(" ").slice(0, 3).join(" ");

function mainLine(id) {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/data/joseki", `${id}.json`), "utf8"));
  const usis = [];
  let n = j.root;
  while (n) {
    const b = (n.branches || []).find((b) => b.kind === "main");
    if (!b) break;
    usis.push(b.usi);
    n = b.node || b.next || b.child;
  }
  return { sfen0: j.root.sfen, usis };
}

function sfenBefore(sfen0, usis, ply) {
  const p = Position.newBySFEN(sfen0);
  for (const u of usis.slice(0, ply - 1)) {
    const q = parseUSIMove(u);
    let m = p.createMove(q.from, q.to);
    if (q.promote) m = m.withPromote();
    if (!m || !p.doMove(m)) throw new Error(`不正な手 ${u}`);
  }
  return p.sfen;
}

(async () => {
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const engine = createEngine((s) => console.error(s));
  for (const t of targets) {
    const [id, plyStr] = t.split(":");
    const ply = Number(plyStr);
    const { sfen0, usis } = mainLine(id);
    const sfen = sfenBefore(sfen0, usis, ply);
    const book = usis[ply - 1];
    const runs = [];
    for (const ms of [MS, Math.round(MS * 1.5)]) {
      const r = await engine.search(sfen, PV, ms);
      if (r && r.length) runs.push(r);
    }
    if (runs.length === 0) { console.log(`${t}: 測れませんでした(飛ばします)`); continue; }
    const last = runs[runs.length - 1];
    const accepted = [];
    for (const r of runs) for (const c of r) if (r[0].cp - c.cp <= TOL && !accepted.includes(c.usi)) accepted.push(c.usi);
    const k = key(sfen);
    const old = cache.positions[k];
    cache.positions[k] = {
      best: last[0].usi,
      cp: last[0].cp,
      gap: last.length > 1 ? last[0].cp - last[1].cp : null,
      accepted: accepted.slice(0, MAX_ACCEPTED),
      courses: old ? old.courses : [id],
    };
    const bookCp = runs.map((r) => { const c = r.find((x) => x.usi === book); return c ? r[0].cp - c.cp : "圏外"; });
    console.log(`${t}: 定跡手 ${book} 最善との差 ${bookCp.join(" / ")} → ${accepted.includes(book) ? "許容手に入った" : "許容手に入らない"}`);
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n");
  }
  engine.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
