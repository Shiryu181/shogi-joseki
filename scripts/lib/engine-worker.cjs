/**
 * エンジン本体を載せる子プロセス。親(lib/engine.cjs)から {id,sfen,pv,ms} を受け取り、
 * MultiPV の結果 [{usi,cp}] を返す。落ちても親が作り直せるように、別プロセスにしてある。
 */
const factory = require("@mizarjp/yaneuraou.k-p");

let handler = () => {};
const orig = console.log;
console.log = (...a) => { for (const l of a.join(" ").split("\n")) handler(l); };

const sc = (t) => {
  const i = t.indexOf("score"); if (i < 0) return null;
  return t[i + 1] === "cp" ? Number(t[i + 2]) : (Number(t[i + 2]) > 0 ? 30000 : -30000);
};

(async () => {
  const mod = await factory({});
  const send = (c) => mod.postMessage(c);
  const once = (pred) => new Promise((res) => { handler = (l) => { if (pred(l)) { handler = () => {}; res(l); } }; });

  let p = once((l) => l === "usiok"); send("usi"); await p;
  p = once((l) => l === "readyok"); send("isready"); await p;
  process.send({ ready: true });

  process.on("message", (m) => {
    if (m.stop) { send("stop"); return; }
    const by = new Map();
    handler = (l) => {
      if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ")) {
        const t = l.split(/\s+/);
        const mi = t.indexOf("multipv"), pi = t.indexOf("pv");
        const cp = sc(t);
        if (cp !== null) by.set(mi >= 0 ? Number(t[mi + 1]) : 1, { usi: t[pi + 1], cp });
      } else if (l.startsWith("bestmove")) {
        handler = () => {};
        const ranked = [...by.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        process.send({ id: m.id, ranked, best: l.split(/\s+/)[1] });
      }
    };
    send(`setoption name MultiPV value ${m.pv}`);
    send(`position sfen ${m.sfen}`);
    send(`go movetime ${m.ms}`);
  });
})().catch((e) => { orig("worker failed", e && e.message); process.exit(1); });
