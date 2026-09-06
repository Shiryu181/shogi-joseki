/**
 * 出題(逸れ手＋咎めの手順)をエンジンで検証する開発用スクリプト。
 *
 * verify-joseki.cjs が本線を見るのに対し、こちらは分岐(kind:"deviation")だけを見る。
 * 出題として成立するには次の3つが必要で、そのすべてを機械に確かめさせる:
 *   1. 逸れ手が実際に損な手であること(そうでなければ咎める理由が無い)
 *   2. 咎めの手順で「自分が指す手」がエンジンの最善手であり、かつ次善手と
 *      はっきり差が付いていること。差が小さい局面を出題にすると、ユーザーが
 *      同じくらい良い別の手を指したときに「不正解」と表示してしまう
 *   3. 咎め終わった局面が自分から見て有利であること
 *
 * 使い方: node scripts/verify-deviations.cjs [コースid] [--ms 3000] [--slack 80]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove } = require("tsshogi");

const args = process.argv.slice(2);
// --ms 3000 のようなフラグの「値」をコースidと取り違えないよう、
// 直前が --flag の引数は候補から外す。
const only = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const MS = argVal("--ms", 3000);
const SLACK = argVal("--slack", 80);      // 咎め手が最善手より何点まで劣ってよいか
// 咎め手は次善手より最低これだけ良くないと、ユーザーの別解を誤って不正解にしてしまう。
// 2.5秒程度の探索では評価が±20点ほど揺れるため、40点を下限にしている。
// これを下回る手は出題手順から外し、解説文で触れる方針。
const UNIQUE_MIN = argVal("--unique", 40);
const DEV_MIN = argVal("--devmin", 120);  // 逸れ手が最低これだけ損でなければ出題する意味が無い

const dir = path.join(__dirname, "..", "src", "data", "joseki");
const files = fs.readdirSync(dir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .filter((f) => !only || f === `${only}.json`);

/** SFEN に1手指した局面の SFEN。 */
function after(sfen, usi) {
  const p = new Position();
  p.resetBySFEN(sfen);
  const parsed = parseUSIMove(usi);
  if (!parsed) return null;
  let move = p.createMove(parsed.from, parsed.to);
  if (!move) return null;
  if (parsed.promote) move = move.withPromote();
  if (!p.isValidMove(move) || !p.doMove(move)) return null;
  return p.sfen;
}
const sideToMove = (sfen) => (sfen.split(" ")[1] === "w" ? "gote" : "sente");
const mainOf = (node) => node.branches.find((b) => b.kind === "main");

/** 逸れ手を含む分岐点をすべて集める。 */
function collectQuizzes(course) {
  const out = [];
  let node = course.root;
  let moveNo = 1;
  while (node) {
    for (const b of node.branches) {
      if (b.kind === "deviation" && b.child) out.push({ moveNo, anchor: node, dev: b });
    }
    const next = mainOf(node);
    if (!next || !next.child) break;
    node = next.child;
    moveNo++;
  }
  return out;
}

(async () => {
  const CAP = []; const orig = console.log;
  const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
  const unhook = () => { console.log = orig; };
  hook(); const mod = await factory({}); unhook();
  const send = (c) => mod.postMessage(c);
  const waitFor = (pred, ms) => new Promise((res, rej) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const hit = CAP.find(pred);
      if (hit) { clearInterval(timer); res(hit); }
      else if (Date.now() - start > ms) { clearInterval(timer); rej(new Error("timeout")); }
    }, 30);
  });
  hook(); send("usi"); await waitFor((l) => l === "usiok", 30000);
  send("setoption name Threads value 1"); send("isready");
  await waitFor((l) => l === "readyok", 60000); unhook();

  /** 手番側から見た評価値つき候補手リスト(MultiPV)。 */
  async function top(sfen, pv) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`);
    send(`go movetime ${MS}`);
    await waitFor((l) => l.startsWith("bestmove"), MS + 30000);
    // MultiPV が 1 のとき、エンジンは multipv トークンを付けずに出力する。
    // それを弾いてしまうと評価値が取れず「損が測れない = 出題に向かない」と誤判定する。
    const infos = CAP.filter((l) => l.startsWith("info ") && l.includes(" score cp ") && l.includes(" pv "));
    unhook();
    const m = new Map();
    for (const line of infos) {
      const t = line.split(/\s+/);
      const mi = t.indexOf("multipv"), si = t.indexOf("score"), pi = t.indexOf("pv");
      if (si < 0 || pi < 0 || t[si + 1] !== "cp") continue;
      m.set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp: Number(t[si + 2]) });
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  /**
   * ある手について「最善手より何点劣るか(loss)」と「次善手より何点良いか(margin)」を返す。
   * margin は、その手が最善手のときだけ意味を持つ(別解の有無を見るために使う)。
   */
  async function judge(sfen, usi) {
    const list = await top(sfen, 8);
    if (list.length === 0) return { loss: null, margin: null };
    const hit = list.find((c) => c.usi === usi);
    if (!hit) {
      const next = after(sfen, usi);
      if (!next) return { loss: null, margin: null };
      const reply = await top(next, 1);
      if (reply.length === 0) return { loss: null, margin: null };
      return { loss: list[0].cp + reply[0].cp, margin: null };
    }
    const loss = list[0].cp - hit.cp;
    const margin = list.length > 1 && loss === 0 ? list[0].cp - list[1].cp : null;
    return { loss, margin };
  }
  const lossOf = async (sfen, usi) => (await judge(sfen, usi)).loss;

  let ng = 0, total = 0;
  for (const file of files) {
    const course = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    const quizzes = collectQuizzes(course);
    if (quizzes.length === 0) continue;
    console.log(`\n=== ${course.title}`);
    for (const q of quizzes) {
      total++;
      const devLoss = await lossOf(q.anchor.sfen, q.dev.usi);
      const okDev = devLoss !== null && devLoss >= DEV_MIN;
      console.log(`  ${q.moveNo}手目 逸れ手 ${q.dev.usi}: 相手の損 ${devLoss}点 ${okDev ? "OK" : "← 損が小さい(出題に向かない)"}`);
      if (!okDev) ng++;

      // 咎めの手順を1手ずつたどり、自分が指す手だけを検証する。
      let node = q.dev.child;
      let bad = false;
      while (node) {
        const mv = mainOf(node);
        if (!mv || !mv.child) break;
        if (sideToMove(node.sfen) === course.mySide) {
          const { loss, margin } = await judge(node.sfen, mv.usi);
          const ok = loss !== null && loss <= SLACK;
          // 次善手と差が無い手を出題すると、ユーザーが別の好手を指したときに
          // 不正解と出てしまう。手順をそこで終える(または別の手順にする)必要がある。
          const unique = margin === null ? loss === 0 : margin >= UNIQUE_MIN;
          const note = !ok ? "← 要確認" : unique ? "OK" : `← 別解あり(次善手との差 ${margin}点)`;
          console.log(`      咎め手 ${mv.usi}: 最善手との差 ${loss}点 ${note}`);
          if (!ok || !unique) bad = true;
        }
        node = mv.child;
      }
      if (bad) ng++;

      // 咎め終わりの局面が自分から見て有利か。
      const list = await top(node.sfen, 1);
      if (list.length > 0) {
        const cp = sideToMove(node.sfen) === course.mySide ? list[0].cp : -list[0].cp;
        console.log(`      咎め終わりの評価 ${cp > 0 ? "+" : ""}${cp}(自分から見て)${cp > 0 ? "" : " ← 有利になっていない"}`);
        if (cp <= 0) ng++;
      }
    }
  }
  console.log(`\n検証した出題: ${total}件 / 要確認: ${ng}件`);
  process.exit(ng === 0 ? 0 : 1);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(1); });
