/**
 * エンジン呼び出しの共通部品(course-lab.cjs 用)。
 * 子プロセスでエンジンを動かし、応答しない/落ちたときは作り直して1回だけやり直す。
 * それでも駄目なら null を返す(呼び出し側がその局面を SKIPPED にして続ける)。
 */
const { fork } = require("node:child_process");
const path = require("node:path");

function createEngine(log = () => {}) {
  let child = null, ready = null, pending = null, seq = 0;

  function start() {
    ready = new Promise((resolve) => {
      child = fork(path.join(__dirname, "engine-worker.cjs"), [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      const me = child;
      me.on("message", (m) => {
        if (m.ready) return resolve(true);
        if (pending && m.id === pending.id) { const p = pending; pending = null; p.resolve(m); }
      });
      me.on("exit", (code) => {
        if (child === me) { child = null; }
        if (pending && pending.proc === me) { const p = pending; pending = null; p.resolve({ crashed: `exit ${code}` }); }
        resolve(false);
      });
    });
  }

  function kill() {
    if (child) { const c = child; child = null; c.removeAllListeners("exit"); c.kill("SIGKILL"); }
    if (pending) { const p = pending; pending = null; p.resolve({ crashed: "killed" }); }
  }

  async function tryOnce(sfen, pv, ms) {
    if (!child) start();
    if (!(await ready) || !child) return null;
    const id = ++seq;
    const proc = child;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { log(`  (エンジンが ${Math.round((ms + 30000) / 1000)}秒 応答なし)`); kill(); resolve(null); }, ms + 30000);
      pending = { id, proc, resolve: (m) => { clearTimeout(timer); resolve(m.crashed ? null : m.ranked); } };
      proc.send({ id, sfen, pv, ms });
    });
  }

  /** 手番側から見た評価値つきの候補手 [{usi,cp}] を返す。失敗時は null。空配列は「合法手なし」。 */
  async function search(sfen, pv, ms) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await tryOnce(sfen, pv, ms);
      if (r) return r;
      kill();
      log(`  (エンジンを再起動して${attempt === 0 ? "やり直します" : "も失敗。この局面は飛ばします"}: ${sfen})`);
    }
    return null;
  }

  function close() { kill(); }
  return { search, close };
}

module.exports = { createEngine };
