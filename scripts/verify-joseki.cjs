/**
 * 定石コースをエンジン(YaneuraOu)で検証する開発用スクリプト。
 *
 * 目的: tsshogi は「その手が指せるか(合法か)」しか見ないため、出典の写し間違いや
 * 明らかに損な手が混ざっていても素通りしてしまう。そこをエンジンで補う。
 *
 * やり方: 本線の各局面を1回ずつ評価し、評価値を常に先手視点へ正規化して並べる。
 * 健全な駒組みなら評価値はなだらかに推移するはずで、ある1手の前後で大きく跳ねたら
 * その手を疑う(先手の手で大きく下がる/後手の手で大きく上がる = その手が損)。
 *
 * 注意: これは「定跡として標準か」を判定するものではない(それは出典の役割)。
 * あくまで「明らかにおかしい手が紛れていないか」を機械的に炙り出すための検査。
 *
 * 使い方: node scripts/verify-joseki.cjs [--ms 800] [--threshold 150]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const MOVETIME_MS = argVal("--ms", 800);
const WARN_CP = argVal("--threshold", 150);
const SUSPECT_CP = WARN_CP * 2;

// --dir で検証対象ディレクトリを差し替えられる(検出器そのものの動作確認に使う)。
const dirArgIndex = args.indexOf("--dir");
const JOSEKI_DIR =
  dirArgIndex >= 0 && args[dirArgIndex + 1]
    ? path.resolve(args[dirArgIndex + 1])
    : path.join(__dirname, "..", "src", "data", "joseki");

/** 本線(kind:"main" 優先)を辿って、局面と手の列を作る。 */
function mainLine(course) {
  const nodes = [course.root];
  const moves = [];
  let cur = course.root;
  while (cur.branches.length > 0) {
    const mv = cur.branches.find((b) => b.kind === "main") ?? cur.branches[0];
    if (!mv || !mv.child) break;
    moves.push(mv);
    nodes.push(mv.child);
    cur = mv.child;
  }
  return { nodes, moves };
}

/** SFEN の手番("b"/"w")。評価値を先手視点へ揃えるのに使う。 */
function sideToMove(sfen) {
  return sfen.split(" ")[1] === "w" ? "gote" : "sente";
}

async function main() {
  // Emscripten の print はこのビルドでは効かないことがあるため console.log を捕まえる。
  const captured = [];
  const origLog = console.log;
  console.log = (...a) => captured.push(a.join(" "));
  const mod = await factory({});
  console.log = origLog;

  const send = (c) => mod.postMessage(c);
  /** 期待する行が出るまで待つ(捕捉した出力を監視する)。 */
  function waitFor(pred, timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = setInterval(() => {
        const hit = captured.find(pred);
        if (hit) { clearInterval(tick); resolve(hit); }
        else if (Date.now() - start > timeoutMs) { clearInterval(tick); reject(new Error("timeout")); }
      }, 30);
    });
  }

  console.log = (...a) => captured.push(a.join(" "));
  send("usi");
  await waitFor((l) => l === "usiok", 30000);
  send("setoption name USI_Hash value 64");
  send("setoption name Threads value 1");
  send("isready");
  await waitFor((l) => l === "readyok", 60000);
  console.log = origLog;
  console.log(`エンジン準備完了(1局面あたり ${MOVETIME_MS}ms で評価)\n`);

  /** 1局面を評価し、先手視点の評価値と最善手を返す。 */
  async function evaluate(sfen) {
    captured.length = 0;
    console.log = (...a) => captured.push(a.join(" "));
    send(`position sfen ${sfen}`);
    send(`go movetime ${MOVETIME_MS}`);
    const best = await waitFor((l) => l.startsWith("bestmove"), MOVETIME_MS + 20000);
    const infos = captured.filter((l) => l.startsWith("info ") && l.includes(" score "));
    console.log = origLog;
    let cp = null, mate = null;
    for (let i = infos.length - 1; i >= 0; i--) {
      const t = infos[i].split(/\s+/);
      const si = t.indexOf("score");
      if (si < 0) continue;
      if (t[si + 1] === "cp") { cp = Number(t[si + 2]); break; }
      if (t[si + 1] === "mate") { mate = Number(t[si + 2]); break; }
    }
    const flip = sideToMove(sfen) === "gote" ? -1 : 1; // 常に先手視点へ
    return { cp: cp === null ? null : cp * flip, mate, bestMove: best.split(/\s+/)[1] };
  }

  const files = fs.readdirSync(JOSEKI_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const problems = [];

  for (const file of files) {
    const course = JSON.parse(fs.readFileSync(path.join(JOSEKI_DIR, file), "utf-8"));
    const { nodes, moves } = mainLine(course);
    console.log(`■ ${course.title}  (${moves.length}手)`);

    const evals = [];
    for (const n of nodes) evals.push(await evaluate(n.sfen));

    for (let i = 0; i < moves.length; i++) {
      const before = evals[i], after = evals[i + 1];
      if (before.cp === null || after.cp === null) continue;
      const moverIsSente = sideToMove(nodes[i].sfen) === "sente";
      // 先手視点の評価値が、先手の手で下がる / 後手の手で上がる = その手が損をしている
      const loss = moverIsSente ? before.cp - after.cp : after.cp - before.cp;
      const label = `${i + 1}手目 ${moves[i].usi}`;
      if (loss >= SUSPECT_CP) {
        problems.push({ course: course.title, label, loss, best: before.bestMove, level: "疑わしい" });
        console.log(`   ✗ ${label}: ${loss}点の損 (エンジンの最善は ${before.bestMove})`);
      } else if (loss >= WARN_CP) {
        problems.push({ course: course.title, label, loss, best: before.bestMove, level: "要確認" });
        console.log(`   ! ${label}: ${loss}点の損 (エンジンの最善は ${before.bestMove})`);
      }
    }
    const cps = evals.map((e) => (e.cp === null ? "—" : e.cp));
    console.log(`   評価値の推移(先手視点): ${cps.join(" ")}`);
    console.log(`   → 指摘 ${problems.filter((p) => p.course === course.title).length} 件\n`);
  }

  console.log("=".repeat(60));
  if (problems.length === 0) {
    console.log(`指摘なし。全 ${files.length} コースで、${WARN_CP}点以上の損をする手は見つかりませんでした。`);
  } else {
    console.log(`指摘 ${problems.length} 件:`);
    for (const p of problems) console.log(`  [${p.level}] ${p.course} / ${p.label} : ${p.loss}点の損`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("検証に失敗:", e && e.message); process.exit(1); });
