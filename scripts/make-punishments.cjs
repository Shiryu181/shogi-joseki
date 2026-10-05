/**
 * 「相手のミスと、その咎め方」の枝を作るための候補を探す開発用スクリプト。
 *
 * PLAN.md の M2 で決めた基準に従う:
 *   - 枝を作るのは、相手のミスの損が LOSS_MIN(既定 230点)以上のときだけ。
 *     実測で、損が150〜190点のミスは咎めても +300 に届かないか25手以上かかった。
 *   - 候補は必ず「長い持ち時間で指し継いで、優勢が持続すること」を確認する。
 *     短い持ち時間の MultiPV は 900ms/1500ms/2000ms の3回とも外れたため
 *     (「損だ」と判定した手を進めると評価が戻る)、候補の洗い出しにしか使えない。
 *
 * 出力は courses.mjs にそのまま貼れる形(USI)で出す。人が駒種と升を書き写すと
 * 転記ミスが入るため、指し手は USI のままコースへ渡す。
 *
 * 使い方: node scripts/make-punishments.cjs <コースid...>
 *          [--ms 2000] [--verifyms 3000] [--lossmin 230] [--lossmax 900] [--plies 8]
 */
const fs = require("node:fs");
const path = require("node:path");
const factory = require("@mizarjp/yaneuraou.k-p");
const { Position, parseUSIMove, formatMove } = require("tsshogi");

const args = process.argv.slice(2);
const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const num = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? Number(args[i + 1]) : d; };
const MS = num("--ms", 2000);           // 候補の洗い出し
const VERIFY_MS = num("--verifyms", 3000); // 指し継いでの確認
const LOSS_MIN = num("--lossmin", 230);
const LOSS_MAX = num("--lossmax", 900);  // これを超える手は不自然(誰も指さない)
const PLIES = num("--plies", 8);
const KEEP_GAIN = num("--gain", 200);    // ミス直前から何点改善していれば採用か

const CAP = []; const orig = console.log;
const hook = () => { console.log = (...a) => CAP.push(a.join(" ")); };
const unhook = () => { console.log = orig; };

(async () => {
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

  const sc = (t) => { const i = t.indexOf("score"); if (i < 0) return null;
    return t[i + 1] === "cp" ? Number(t[i + 2]) : (Number(t[i + 2]) > 0 ? 30000 : -30000); };

  async function multi(sfen, pv, ms) {
    CAP.length = 0; hook();
    send(`setoption name MultiPV value ${pv}`);
    send(`position sfen ${sfen}`); send(`go movetime ${ms}`);
    await waitFor((l) => l.startsWith("bestmove"), 90000);
    const lines = CAP.filter((l) => l.startsWith("info ") && l.includes(" multipv ") && l.includes(" pv "));
    unhook();
    const by = new Map();
    for (const l of lines) { const t = l.split(/\s+/);
      by.set(Number(t[t.indexOf("multipv") + 1]), { usi: t[t.indexOf("pv") + 1], cp: sc(t) }); }
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  const mk = (p, u) => { const q = parseUSIMove(u); if (!q) return null;
    let m = p.createMove(q.from, q.to); if (m && q.promote) m = m.withPromote();
    return m && p.isValidMove(m) ? m : null; };

  for (const id of ids) {
    const file = path.join(__dirname, "..", "src", "data", "joseki", `${id}.json`);
    if (!fs.existsSync(file)) { console.log(`${id}: 見つかりません`); continue; }
    const course = JSON.parse(fs.readFileSync(file, "utf-8"));
    const iAmSente = course.mySide === "sente";
    const myChar = iAmSente ? "b" : "w";
    const line = []; let cur = course.root;
    while (true) { const m = cur.branches.find((b) => b.kind === "main");
      if (!m || !m.child) break; line.push({ sfen: cur.sfen, usi: m.usi, node: cur }); cur = m.child; }

    console.log(`\n■ ${course.title}  (本線 ${line.length}手)`);
    let found = 0;

    for (let i = 0; i < line.length; i++) {
      const { sfen, node } = line[i];
      if (sfen.split(" ")[1] === myChar) continue;              // 相手の手番だけ
      if (node.branches.some((b) => b.kind === "deviation")) continue; // 既に枝がある局面は飛ばす

      const cands = await multi(sfen, 14, MS);
      if (cands.length < 2) continue;
      const top = cands[0].cp;
      const bads = cands.slice(1).filter((c) => top - c.cp >= LOSS_MIN && top - c.cp <= LOSS_MAX);
      if (bads.length === 0) continue;

      for (const bad of bads) {
        const pos = new Position(); pos.resetBySFEN(sfen);
        const m0 = mk(pos, bad.usi); if (!m0) continue;
        const badText = formatMove(pos, m0);
        // ミス直前の自分視点の評価(手番は相手なので符号を反転する)
        const beforeMine = -top;
        pos.doMove(m0);

        // 長い持ち時間で指し継いで、優勢が持続するか確認する
        const seq = []; let peak = -99999, last = null, ok = true;
        for (let p = 0; p < PLIES; p++) {
          const r = await multi(pos.sfen, 2, VERIFY_MS);
          if (r.length === 0) { ok = false; break; }
          const sideIsSente = pos.sfen.split(" ")[1] === "b";
          const senteView = sideIsSente ? r[0].cp : -r[0].cp;
          const mine = iAmSente ? senteView : -senteView;
          if (p === 0 && mine < beforeMine + KEEP_GAIN) { ok = false; break; } // 咎める前から改善していない
          peak = Math.max(peak, mine); last = mine;
          const mv = mk(pos, r[0].usi); if (!mv) break;
          seq.push({ usi: r[0].usi, text: formatMove(pos, mv), mine });
          pos.doMove(mv);
        }
        if (!ok || last === null || last < beforeMine + KEEP_GAIN) continue;

        found++;
        console.log(`\n  ${i + 1}手目 相手が ${badText} (${bad.usi}) と間違えた場合  最善より ${top - bad.cp}点の損`);
        console.log(`    ミス直前の自分視点 ${beforeMine >= 0 ? "+" : ""}${beforeMine} → 咎めたあと ${last >= 0 ? "+" : ""}${last} (最高 ${peak >= 0 ? "+" : ""}${peak})`);
        console.log(`    咎めの手順: ${seq.map((x) => `${x.text}(${x.mine >= 0 ? "+" : ""}${x.mine})`).join(" ")}`);
        console.log(`    貼る用: usi:"${bad.usi}" / line: [${seq.map((x) => `"${x.usi}"`).join(", ")}]`);
      }
    }
    if (found === 0) console.log("  条件を満たす相手のミスは見つかりませんでした");
  }
  process.exit(0);
})();
