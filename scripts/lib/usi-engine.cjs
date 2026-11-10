/**
 * USI エンジンを「1行送る / 出力を1行ずつ受ける」だけの形に揃える部品。
 * ENGINE=wasm(既定。npm の @mizarjp/yaneuraou.k-p、水匠内蔵)
 * ENGINE=native(ネイティブの やねうら王 + つようら王11mini)
 *   YO_DIR  : 実行ファイルと eval/ があるフォルダ(既定 ../engines/yo-tuyo11mini)
 *   YO_EXE  : 実行ファイル名(既定 YaneuraOu-tuyo11mini)
 *   YO_THREADS(既定 1)・YO_HASH(MB、既定 256)
 * 使い方: const e = await createUsi(); e.setHandler(line => ...); e.send("usi");
 */
const path = require("node:path");

const kind = () => (process.env.ENGINE || "wasm").toLowerCase();

async function createUsi() {
  let handler = () => {};
  if (kind() === "native") {
    const { spawn } = require("node:child_process");
    const readline = require("node:readline");
    const dir = process.env.YO_DIR || path.resolve(__dirname, "..", "..", "..", "engines", "yo-tuyo11mini");
    const exe = path.join(dir, process.env.YO_EXE || "YaneuraOu-tuyo11mini");
    const child = spawn(exe, [], { cwd: dir, stdio: ["pipe", "pipe", process.env.YO_DEBUG ? "inherit" : "ignore"] });
    child.stdin.on("error", () => {});
    readline.createInterface({ input: child.stdout }).on("line", (l) => handler(l));
    const kill = () => { try { child.kill("SIGKILL"); } catch {} };
    process.on("exit", kill);
    child.on("exit", (code) => { if (!closing) { console.error("native engine exited", code); process.exit(1); } });
    let closing = false;
    return {
      kind: "native",
      send: (c) => child.stdin.write(c + "\n"),
      setHandler: (h) => { handler = h; },
      // usi を送る前に呼ぶ。評価関数の設定は USI の setoption で行う。
      initOptions: () => [
        "setoption name USI_OwnBook value false",
        `setoption name Threads value ${process.env.YO_THREADS || 1}`,
        `setoption name USI_Hash value ${process.env.YO_HASH || 256}`,
      ],
      close: () => { closing = true; try { child.stdin.write("quit\n"); } catch {} setTimeout(kill, 500).unref(); },
    };
  }
  const factory = require("@mizarjp/yaneuraou.k-p");
  const orig = console.log;
  console.log = (...a) => { for (const l of a.join(" ").split("\n")) handler(l); };
  const mod = await factory({});
  return {
    kind: "wasm",
    send: (c) => mod.postMessage(c),
    setHandler: (h) => { handler = h; },
    initOptions: () => [],
    close: () => { console.log = orig; },
  };
}

module.exports = { createUsi };
