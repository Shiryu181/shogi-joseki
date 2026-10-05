/**
 * 「許容手」をエンジンで列挙してキャッシュに貯める開発用スクリプト。
 *
 * なぜ必要か: 優勢な局面では良い手が複数あるため、正解を一手に限定すると
 * クイズが当てもの化する(実測: 優勢後の27手のうち63%は3通り以内だが、
 * 7〜10通りある局面も22%ある)。そこで各局面について
 *   - accepted : 最善手から TOL 点以内の手(= どれを指しても正解にする手)
 *   - gap      : 最善手と次善手の差(= 急所かどうかの指標)
 * を先に計算しておき、build-joseki.mjs が JSON に埋め込む。
 *
 * ビルド毎にエンジンを回すと遅いので、結果は SFEN をキーにしたキャッシュに貯める。
 * 局面はコース間で共有される(駒組みは同じ手順を通る)ため、
 * 982手ぶんの自分の手に対して実際の局面は798通りしかない。
 *
 * 使い方: node scripts/annotate-accepted.cjs [--ms 2000] [--tol 100] [--limit 0] [--force]
 *   --limit N : N 局面だけ処理して終わる(途中確認用)
 *   --force   : キャッシュ済みの局面も再計算する
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");

const args = process.argv.slice(2);
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const MS = num("--ms", 2000);
const TOL = num("--tol", 100);
const LIMIT = num("--limit", 0);
const FORCE = args.includes("--force");
const MAX_ACCEPTED = 12;   // これ以上並べても使い道が無いので切る

const DIR = path.join(__dirname, "..", "src", "data", "joseki");
const CACHE = path.join(__dirname, "accepted-cache.json");

/** SFEN から手数を落として、コース間で同じ局面を同じキーにする。 */
const key = (sfen) => sfen.split(" ").slice(0, 3).join(" ");

/** 全コースから「自分の手番の局面」を集める。 */
function collect() {
  const out = new Map();   // key -> { sfen, courses:Set }
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
    const myChar = c.mySide === "sente" ? "b" : "w";
    const walk = (node) => {
      if (node.sfen.split(" ")[1] === myChar && node.branches.length > 0) {
        const k = key(node.sfen);
        if (!out.has(k)) out.set(k, { sfen: node.sfen, courses: new Set() });
        out.get(k).courses.add(c.id);
      }
      for (const b of node.branches) if (b.child) walk(b.child);
    };
    walk(c.root);
  }
  return out;
}

const CAP = []; const orig = console.log;
const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
const unhook = () => { console.log = orig; };

(async () => {
  const positions = collect();
  const cache = fs.existsSync(CACHE)
    ? JSON.parse(fs.readFileSync(CACHE, "utf-8"))
    : { meta: {}, positions: {} };
  // 設定が変わったらキャッシュは使えない
  if (cache.meta.ms !== MS || cache.meta.tol !== TOL) {
    if (Object.keys(cache.positions).length > 0 && !FORCE) {
      console.log(`設定が違います(キャッシュ ms=${cache.meta.ms} tol=${cache.meta.tol} / 今回 ms=${MS} tol=${TOL})。`);
      console.log("同じ設定で続けるか、--force で作り直してください。");
      process.exit(1);
    }
    cache.positions = {};
  }

  const todo = [...positions.entries()].filter(([k]) => FORCE || !cache.positions[k]);
  console.log(`自分手番の局面 ${positions.size} 通り / 未計算 ${todo.length} 通り`);
  if (todo.length === 0) { console.log("すべて計算済みです。"); process.exit(0); }
  const plan = LIMIT > 0 ? todo.slice(0, LIMIT) : todo;
  const mins = Math.ceil((plan.length * (MS + 250)) / 60000);
  console.log(`今回 ${plan.length} 通りを ${MS}ms で計算します(目安 ${mins} 分)`);

  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const hit = CAP.find(pred);
      if (hit) { clearInterval(t); res(hit); }
      else if (Date.now() - t0 > ms) { clearInterval(t); rej(new Error("timeout")); }
    }, 30);
  });
  hook(); send("usi"); await waitFor((l) => l === "usiok", 30000);
  send("isready"); await waitFor((l) => l === "readyok", 60000); unhook();

  const sc = (tok) => {
    const i = tok.indexOf("score"); if (i < 0) return null;
    return tok[i + 1] === "cp" ? Number(tok[i + 2]) : (Number(tok[i + 2]) > 0 ? 30000 : -30000);
  };

  let done = 0;
  for (const [k, { sfen, courses }] of plan) {
    CAP.length = 0; hook();
    send("setoption name MultiPV value 20");
    send(`position sfen ${sfen}`); send(`go movetime ${MS}`);
    try { await waitFor((l) => l.startsWith("bestmove"), 60000); } catch { unhook(); console.log(`  ! timeout ${k}`); continue; }
    const lines = CAP.filter((l) => l.startsWith("info ") && l.includes(" multipv ") && l.includes(" pv "));
    unhook();

    const byRank = new Map();
    for (const l of lines) {
      const t = l.split(/\s+/);
      byRank.set(Number(t[t.indexOf("multipv") + 1]), { usi: t[t.indexOf("pv") + 1], cp: sc(t) });
    }
    const ranked = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    if (ranked.length === 0) { console.log(`  ! 候補なし ${k}`); continue; }

    const best = ranked[0];
    const accepted = ranked.filter((r) => best.cp - r.cp <= TOL).slice(0, MAX_ACCEPTED).map((r) => r.usi);
    cache.positions[k] = {
      best: best.usi,
      cp: best.cp,
      gap: ranked.length > 1 ? best.cp - ranked[1].cp : null,
      accepted,
      courses: [...courses].sort(),
    };
    done++;
    if (done % 20 === 0) {
      cache.meta = { ms: MS, tol: TOL, updated: new Date().toISOString().slice(0, 10) };
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n", "utf-8");
      console.log(`  ${done}/${plan.length} 完了`);
    }
  }
  cache.meta = { ms: MS, tol: TOL, updated: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n", "utf-8");
  console.log(`完了: ${done} 通りを追加。キャッシュ合計 ${Object.keys(cache.positions).length} 通り`);
  process.exit(0);
})();
